import { createServer } from 'node:http'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { cases } from '../src/data/cases.js'
import { getFeatureRecords, relatedKeys } from '../src/lib/featureRecords.js'

const DEFAULT_LM_STUDIO_URL = 'http://127.0.0.1:1234/v1'
const DEFAULT_MODEL = 'qwen3-4b-thinking-2507'
const MAX_AGENT_TURNS = 5
const MAX_REQUEST_BYTES = 24 * 1024
const MAX_REVIEWER_COMMENT = 1200
const PUBLISHER_TIMEOUT_MS = 15_000
const PROJECT_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)))
const SKILL_DIRECTORY = resolve(fileURLToPath(new URL('../agent-skills/', import.meta.url)))
const PUBLISHER_SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'arcpy_publish.py')
const PUBLISHER_JOB_DIRECTORY = resolve(PROJECT_ROOT, '.runtime', 'mad-publisher-jobs')
const PROPOSAL_HISTORY_PATH = resolve(PROJECT_ROOT, '.runtime', 'proposal-history.csv')
const PROPOSAL_HISTORY_FIELDS = [
  'event_id',
  'recorded_at',
  'event_type',
  'proposal_id',
  'parent_proposal_id',
  'root_proposal_id',
  'case_id',
  'status',
  'category',
  'summary',
  'reviewer_feedback',
  'agent_provider',
  'model_id',
]
const ALLOWED_OPERATION_TYPES = new Set([
  'create_address_point',
  'move_address_point',
  'link_address_to_point',
  'link_point_to_structure',
])

const SKILL_CATALOG = [
  {
    id: 'qa-evidence-brief',
    name: 'QA Evidence Brief',
    description: 'Produce a short evidence-based field brief for one QA case.',
    triggers: ['QA Evidence Brief', 'field evidence brief', 'use the QA evidence brief skill'],
    file: 'qa-evidence-brief/SKILL.md',
  },
]

const stagedDrafts = new Map()
const reviewerFeedback = new Map()

function compactText(value, maxLength) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.slice(0, maxLength)
}

function csvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function parseCsvLine(line) {
  const values = []
  let value = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      values.push(value)
      value = ''
    } else {
      value += character
    }
  }
  values.push(value)
  return values
}

function readProposalEvents(caseId) {
  if (!existsSync(PROPOSAL_HISTORY_PATH)) return []
  const lines = readFileSync(PROPOSAL_HISTORY_PATH, 'utf8').split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const fields = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(fields.map((field, index) => [field, values[index] ?? '']))
  }).filter((event) => !caseId || event.case_id === caseId)
}

function appendProposalEvent({
  eventType,
  proposalId,
  parentProposalId = '',
  rootProposalId = '',
  caseId,
  status,
  category = '',
  summary = '',
  reviewerComment = '',
  provider = 'lm-studio-local',
  modelId = DEFAULT_MODEL,
}) {
  mkdirSync(resolve(PROJECT_ROOT, '.runtime'), { recursive: true })
  if (!existsSync(PROPOSAL_HISTORY_PATH)) {
    writeFileSync(PROPOSAL_HISTORY_PATH, `${PROPOSAL_HISTORY_FIELDS.join(',')}\n`, 'utf8')
  }
  const event = {
    event_id: `event-${randomUUID()}`,
    recorded_at: new Date().toISOString(),
    event_type: eventType,
    proposal_id: proposalId,
    parent_proposal_id: parentProposalId,
    root_proposal_id: rootProposalId,
    case_id: caseId,
    status,
    category: compactText(category, 120),
    summary: compactText(summary, 320),
    reviewer_feedback: compactText(reviewerComment, MAX_REVIEWER_COMMENT),
    agent_provider: provider,
    model_id: compactText(modelId, 200),
  }
  appendFileSync(PROPOSAL_HISTORY_PATH, `${PROPOSAL_HISTORY_FIELDS.map((field) => csvValue(event[field])).join(',')}\n`, 'utf8')
  return event
}

export function buildProposalLineage(events) {
  const proposals = new Map()
  for (const event of events) {
    if (!event.proposal_id) continue
    const existing = proposals.get(event.proposal_id) || {
      id: event.proposal_id,
      caseId: event.case_id,
      parentProposalId: event.parent_proposal_id || null,
      rootProposalId: event.root_proposal_id || event.proposal_id,
      category: event.category,
      summary: event.summary,
      provider: event.agent_provider,
      model: event.model_id,
      createdAt: event.recorded_at,
      status: 'staged',
      reviewerFeedback: '',
    }
    if (event.event_type === 'staged') {
      existing.parentProposalId = event.parent_proposal_id || null
      existing.rootProposalId = event.root_proposal_id || event.proposal_id
      existing.category = event.category || existing.category
      existing.summary = event.summary || existing.summary
      existing.provider = event.agent_provider || existing.provider
      existing.model = event.model_id || existing.model
      existing.createdAt = event.recorded_at || existing.createdAt
    }
    if (event.status) existing.status = event.status
    if (event.reviewer_feedback) existing.reviewerFeedback = event.reviewer_feedback
    existing.updatedAt = event.recorded_at
    proposals.set(existing.id, existing)
  }

  const lineage = [...proposals.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  const byId = new Map(lineage.map((proposal) => [proposal.id, proposal]))
  return lineage.map((proposal) => {
    let depth = 0
    let ancestor = proposal.parentProposalId ? byId.get(proposal.parentProposalId) : null
    const seen = new Set([proposal.id])
    while (ancestor && !seen.has(ancestor.id)) {
      seen.add(ancestor.id)
      depth += 1
      ancestor = ancestor.parentProposalId ? byId.get(ancestor.parentProposalId) : null
    }
    return { ...proposal, depth }
  })
}

export function getProposalLineage(caseId) {
  return buildProposalLineage(readProposalEvents(caseId))
}

function getPublisherMode() {
  return process.env.MAD_PUBLISH_MODE === 'apply' ? 'apply' : 'validate'
}

function normalizedComment(value, label = 'Reviewer comment') {
  const comment = typeof value === 'string' ? value.trim() : ''
  if (comment.length < 5) throw new Error(`${label} must be at least 5 characters.`)
  if (comment.length > MAX_REVIEWER_COMMENT) throw new Error(`${label} must be ${MAX_REVIEWER_COMMENT} characters or fewer.`)
  return comment
}

export function getReviewerFeedback(caseId) {
  const feedback = reviewerFeedback.get(caseId)
  return feedback ? { ...feedback } : null
}

export function recordReviewerRejection(caseItem, draft, comment, { persist = false } = {}) {
  const feedback = {
    id: `reject-${randomUUID()}`,
    caseId: caseItem.id,
    comment: normalizedComment(comment),
    status: 'active',
    rejectedAt: new Date().toISOString(),
    rejectedProposalId: draft?.id ?? null,
    rootProposalId: draft?.rootProposalId ?? draft?.id ?? null,
  }
  reviewerFeedback.set(caseItem.id, feedback)
  if (persist && draft?.id) {
    appendProposalEvent({
      eventType: 'rejected',
      proposalId: draft.id,
      parentProposalId: draft.parentProposalId,
      rootProposalId: draft.rootProposalId,
      caseId: caseItem.id,
      status: 'rejected',
      category: draft.category,
      summary: draft.summary,
      reviewerComment: feedback.comment,
      provider: draft.provider,
      modelId: draft.model,
    })
  }
  return { ...feedback }
}

export function createPublisherHandoff(caseItem, draft, reviewerNote = '') {
  if (!draft?.validation?.passed) throw new Error('A passed draft validation is required before approval.')
  if (!draft.sourceSnapshot?.rowHash) throw new Error('The draft has no source snapshot precondition.')
  if (!draft.operations?.length) throw new Error('The draft has no controlled operations to publish.')

  const unsupported = draft.operations.find((operation) => !ALLOWED_OPERATION_TYPES.has(operation.type))
  if (unsupported) throw new Error(`Operation ${unsupported.type} is not approved for the publisher handoff.`)

  const note = reviewerNote ? normalizedComment(reviewerNote, 'Reviewer note') : null
  const acceptedAt = new Date().toISOString()
  const jobId = `pub-${randomUUID()}`

  return {
    kind: 'mad-qa-publisher-handoff',
    schemaVersion: '0.1.0',
    jobId,
    caseId: caseItem.id,
    createdAt: acceptedAt,
    decision: {
      type: 'accept',
      approvalId: `approve-${randomUUID()}`,
      acceptedAt,
      reviewerNote: note,
    },
    draft: {
      id: draft.id,
      parentProposalId: draft.parentProposalId,
      rootProposalId: draft.rootProposalId,
      category: draft.category,
      summary: draft.summary,
      provider: draft.provider,
      model: draft.model,
      stagedAt: draft.stagedAt,
      reason: draft.reason,
      validation: draft.validation,
    },
    sourceSnapshot: { ...draft.sourceSnapshot },
    operations: draft.operations.map((operation) => ({ ...operation })),
    changes: draft.changes.map((change) => ({
      ...change,
      fields: change.fields.map((field) => ({ ...field })),
    })),
    productionApplied: false,
  }
}

function persistPublisherHandoff(handoff) {
  mkdirSync(PUBLISHER_JOB_DIRECTORY, { recursive: true })
  const path = resolve(PUBLISHER_JOB_DIRECTORY, `${handoff.jobId}.json`)
  writeFileSync(path, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return path
}

function runProcess(command, args) {
  return new Promise((resolveProcess) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn(command, args, { cwd: PROJECT_ROOT, shell: false, windowsHide: true })
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, PUBLISHER_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      clearTimeout(timeout)
      resolveProcess({ ok: false, error: error.message, stdout, stderr, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      resolveProcess({ ok: code === 0 && !timedOut, code, stdout, stderr, timedOut })
    })
  })
}

async function validatePublisherHandoff(handoffPath, mode) {
  const python = process.env.MAD_ARCPY_PYTHON || 'python'
  const result = await runProcess(python, [PUBLISHER_SCRIPT, '--handoff', handoffPath, '--mode', mode])
  const output = result.stdout.trim()
  let publisherResult = null
  try {
    publisherResult = output ? JSON.parse(output) : null
  } catch {
    publisherResult = null
  }

  if (!result.ok) {
    return {
      status: publisherResult?.status || 'queued',
      mode,
      productionApplied: false,
      message: publisherResult?.message || result.error || result.stderr.trim() || 'Publisher handoff was saved but could not be preflighted.',
    }
  }

  return {
    status: publisherResult?.status || (mode === 'apply' ? 'published' : 'validated-handoff'),
    mode,
    productionApplied: Boolean(publisherResult?.productionApplied),
    message: publisherResult?.message || 'Publisher handoff validated. No production edit was applied.',
  }
}

export function getSkillIndex() {
  return SKILL_CATALOG.map(({ id, name, description, triggers }) => ({ id, name, description, triggers }))
}

export function loadSkill(skillId) {
  const skill = SKILL_CATALOG.find((item) => item.id === skillId)
  if (!skill) throw new Error(`Unknown skill: ${skillId}`)

  const skillPath = resolve(SKILL_DIRECTORY, skill.file)
  if (!skillPath.startsWith(SKILL_DIRECTORY)) throw new Error('Skill path is outside the approved skill directory.')

  return {
    id: skill.id,
    name: skill.name,
    instructions: readFileSync(skillPath, 'utf8'),
  }
}

function getCase(caseId) {
  return cases.find((caseItem) => caseItem.id === caseId)
}

function summarizeCase(caseItem) {
  return {
    id: caseItem.id,
    address: caseItem.address,
    municipality: caseItem.municipality,
    issueType: caseItem.issueType,
    issueCode: caseItem.issueCode,
    priority: caseItem.priority,
    confidence: caseItem.confidence,
    status: caseItem.status,
    recommendation: caseItem.recommendation,
    rationale: caseItem.rationale,
    evidence: caseItem.evidence.map(({ source, date, detail }) => ({ source, date, detail })),
    availableRecords: ['address-point', 'master-address', 'structure', 'structure-lookup', 'address-variant', 'parcel', 'road'],
    draftAllowed: caseItem.status === 'ready' && Boolean(caseItem.changes?.length),
  }
}

function readFeature(caseItem, featureKey) {
  const records = getFeatureRecords(caseItem, caseItem.geometry.proposed)
  const record = records[featureKey]
  if (!record) throw new Error(`Unknown case feature: ${featureKey}`)

  return {
    key: record.key,
    label: record.label,
    id: record.id,
    attributes: record.attributes,
    related: relatedKeys(record).map((key) => {
      const related = records[key]
      return related ? { key: related.key, label: related.label, id: related.id } : null
    }).filter(Boolean),
  }
}

export function validateDraft(caseItem, draft) {
  const errors = []
  if (!draft?.changes?.length) errors.push('The draft contains no field changes.')
  if (caseItem.status !== 'ready') errors.push('This case is held for evidence and cannot receive a draft.')
  if (!caseItem.snapshot?.rowHash) errors.push('The case snapshot has no source row hash.')

  return {
    passed: errors.length === 0,
    checks: [
      { name: 'Case status', passed: caseItem.status === 'ready' },
      { name: 'Source snapshot', passed: Boolean(caseItem.snapshot?.rowHash) },
      { name: 'Declared field changes', passed: Boolean(draft?.changes?.length) },
    ],
    errors,
  }
}

export function createFixtureDraft(caseItem, reason, metadata = {}) {
  const proposalId = `proposal-${caseItem.id.toLowerCase()}-${randomUUID()}`
  const parentProposalId = metadata.parentProposalId || null
  const rootProposalId = metadata.rootProposalId || parentProposalId || proposalId
  const draft = {
    id: proposalId,
    caseId: caseItem.id,
    parentProposalId,
    rootProposalId,
    category: compactText(metadata.category, 120) || caseItem.issueType,
    summary: compactText(metadata.summary, 320) || caseItem.recommendation,
    provider: 'lm-studio-local',
    model: metadata.model || DEFAULT_MODEL,
    stagedAt: new Date().toISOString(),
    reason: reason?.trim() || 'Agent staged the controlled fixture proposal after reviewing case evidence.',
    operations: caseItem.operations,
    changes: caseItem.changes ?? [],
    sourceSnapshot: {
      version: caseItem.snapshot.version,
      rowHash: caseItem.snapshot.rowHash,
      exportedAt: caseItem.snapshot.exportedAt,
    },
  }
  draft.validation = validateDraft(caseItem, draft)
  return draft
}

function stageFixtureProposal(caseItem, reason, metadata = {}) {
  const feedback = reviewerFeedback.get(caseItem.id)
  const draft = createFixtureDraft(caseItem, reason, {
    ...metadata,
    parentProposalId: metadata.parentProposalId || feedback?.rejectedProposalId || null,
    rootProposalId: metadata.rootProposalId || feedback?.rootProposalId || null,
  })
  stagedDrafts.set(caseItem.id, draft)
  appendProposalEvent({
    eventType: 'staged',
    proposalId: draft.id,
    parentProposalId: draft.parentProposalId,
    rootProposalId: draft.rootProposalId,
    caseId: caseItem.id,
    status: 'staged',
    category: draft.category,
    summary: draft.summary,
    provider: draft.provider,
    modelId: draft.model,
  })
  return draft
}

function recordProposalAcceptance(caseItem, draft) {
  appendProposalEvent({
    eventType: 'accepted',
    proposalId: draft.id,
    parentProposalId: draft.parentProposalId,
    rootProposalId: draft.rootProposalId,
    caseId: caseItem.id,
    status: 'accepted',
    category: draft.category,
    summary: draft.summary,
    provider: draft.provider,
    modelId: draft.model,
  })
}

function agentTools() {
  return [
    {
      type: 'function',
      function: {
        name: 'load_skill',
        description: 'Load the full instructions for one on-demand, allow-listed skill. Call only when the user explicitly names a listed skill or the request clearly matches its trigger.',
        parameters: {
          type: 'object',
          properties: {
            skill_id: { type: 'string', enum: SKILL_CATALOG.map((skill) => skill.id) },
          },
          required: ['skill_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_case',
        description: 'Read the current QA case summary, its issue, recommendation, evidence, and draft eligibility.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_proposal_lineage',
        description: 'Read prior staged proposals and human decisions for this case. Use before revising a rejected proposal.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_feature',
        description: 'Read a feature and its preset case-scoped relationships. Use this before making a spatial or relationship claim.',
        parameters: {
          type: 'object',
          properties: {
            feature_key: {
              type: 'string',
              enum: ['address-point', 'master-address', 'structure', 'structure-lookup', 'address-variant', 'parcel', 'road'],
            },
          },
          required: ['feature_key'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_related',
        description: 'Read only the preset related records for a feature in this case.',
        parameters: {
          type: 'object',
          properties: {
            feature_key: {
              type: 'string',
              enum: ['address-point', 'master-address', 'structure', 'structure-lookup', 'address-variant', 'parcel', 'road'],
            },
          },
          required: ['feature_key'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'stage_fixture_draft',
        description: 'Stage the case’s controlled training proposal for human review. This never writes MAD or publishes anything. Call only after inspecting the case and only if the case is eligible for a draft.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Short evidence-based reason for staging the draft.' },
            summary: { type: 'string', description: 'One concise sentence describing the edit for a human reviewer.' },
            category: { type: 'string', description: 'Short edit category, such as address point movement or relationship link.' },
          },
          required: ['reason'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'validate_draft',
        description: 'Validate the currently staged case draft before telling the reviewer it is ready for review.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
  ]
}

function executeTool(call, caseItem, model) {
  const args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
  switch (call.function.name) {
    case 'load_skill':
      return loadSkill(args.skill_id)
    case 'get_case':
      return summarizeCase(caseItem)
    case 'get_proposal_lineage':
      return { proposals: getProposalLineage(caseItem.id) }
    case 'get_feature':
      return readFeature(caseItem, args.feature_key)
    case 'get_related': {
      const feature = readFeature(caseItem, args.feature_key)
      return { feature: { key: feature.key, label: feature.label, id: feature.id }, related: feature.related }
    }
    case 'stage_fixture_draft': {
      if (caseItem.status !== 'ready' || !caseItem.changes?.length) {
        return { staged: false, reason: 'This case is held for evidence. No draft was staged.' }
      }
      const draft = stageFixtureProposal(caseItem, args.reason, {
        summary: args.summary,
        category: args.category,
        model,
      })
      const feedback = reviewerFeedback.get(caseItem.id)
      if (feedback?.status === 'active') {
        reviewerFeedback.set(caseItem.id, {
          ...feedback,
          status: 'addressed',
          addressedAt: new Date().toISOString(),
          addressedDraftId: draft.id,
        })
      }
      return {
        staged: true,
        proposalId: draft.id,
        parentProposalId: draft.parentProposalId,
        category: draft.category,
        summary: draft.summary,
        validation: draft.validation,
        changeCount: draft.changes.reduce((count, change) => count + change.fields.length, 0),
      }
    }
    case 'validate_draft': {
      const draft = stagedDrafts.get(caseItem.id)
      return draft
        ? { draftId: draft.id, ...validateDraft(caseItem, draft) }
        : { passed: false, errors: ['No draft is staged for this case.'] }
    }
    default:
      throw new Error(`Tool is not allow-listed: ${call.function.name}`)
  }
}

function toolSummary(name, result) {
  if (result?.error) return `${name} could not complete`
  if (name === 'load_skill') return `Loaded skill: ${result.name}`
  if (name === 'get_case') return 'Read case snapshot'
  if (name === 'get_proposal_lineage') return 'Read proposal lineage'
  if (name === 'get_feature') return `Read ${result.label} ${result.id}`
  if (name === 'get_related') return `Read related records for ${result.feature.id}`
  if (name === 'stage_fixture_draft') return result.staged ? `Staged proposal ${result.proposalId}` : 'Withheld draft'
  if (name === 'validate_draft') return result.passed ? 'Validated staged draft' : 'Draft validation needs attention'
  return name
}

function agentInstructions(caseItem) {
  const skillIndex = getSkillIndex()
    .map((skill) => `${skill.id}: ${skill.description} Triggers: ${skill.triggers.join(', ')}.`)
    .join(' ')

  return [
    'You are the local MAD QA training agent for one case only.',
    `The active case ID is ${caseItem.id}. Do not discuss other cases or invent data.`,
    'Use the case tools before making factual claims. Keep answers concise and cite the data source by name when available.',
    'You may stage only the controlled training draft using stage_fixture_draft. It never edits MAD, never publishes, and always requires human review.',
    'When staging a draft, provide a concise human-readable summary and category in the tool call; they become the proposal registry entry.',
    'If case status is evidence, withhold any edit draft and explain what evidence is missing.',
    `On-demand skill index (full instructions are not preloaded): ${skillIndex}`,
    'Load a skill only when the user explicitly names it or the request clearly matches one of its triggers. After loading it, follow its instructions; otherwise do not load a skill.',
    'Never claim an edit was applied, accepted, or published. Say “staged for review” only after the tool confirms it.',
  ].join(' ')
}

async function callLmStudio({ baseUrl, model, messages, tools }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0, stream: false }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `LM Studio returned ${response.status}.`)
  }
  const message = payload?.choices?.[0]?.message
  if (!message) throw new Error('LM Studio returned no assistant message.')
  return message
}

export async function runCaseAgent({ caseItem, prompt, baseUrl, model }) {
  const feedback = getReviewerFeedback(caseItem.id)
  const messages = [
    { role: 'system', content: agentInstructions(caseItem) },
    ...(feedback?.status === 'active' ? [{
      role: 'system',
      content: `A human reviewer rejected proposal ${feedback.rejectedProposalId}. Their feedback is: ${JSON.stringify(feedback.comment)}. Treat this as required context: first read get_proposal_lineage, then inspect the case again, do not repeat the rejected reasoning, and stage a replacement only when the evidence supports one.`,
    }] : []),
    { role: 'user', content: prompt },
  ]
  const toolEvents = []
  const tools = agentTools()

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn += 1) {
    const message = await callLmStudio({ baseUrl, model, messages, tools })
    const toolCalls = message.tool_calls ?? []
    messages.push({
      role: 'assistant',
      content: message.content ?? '',
      tool_calls: toolCalls,
    })

    if (!toolCalls.length) {
      return {
        reply: message.content?.trim() || 'I inspected the case but did not return a narrative response.',
        toolEvents,
        draft: stagedDrafts.get(caseItem.id) ?? null,
        reviewerFeedback: getReviewerFeedback(caseItem.id),
      }
    }

    for (const call of toolCalls) {
      let result
      try {
        result = executeTool(call, caseItem, model)
      } catch (error) {
        result = { error: error.message }
      }
      toolEvents.push({ name: call.function.name, summary: toolSummary(call.function.name, result) })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }

  throw new Error('The local agent exceeded its five-tool-turn limit.')
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload))
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let received = 0
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      received += Buffer.byteLength(chunk)
      if (received > MAX_REQUEST_BYTES) {
        reject(new Error('Request body is too large.'))
        request.destroy()
        return
      }
      body += chunk
    })
    request.on('end', () => {
      try {
        resolveBody(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Request body must be valid JSON.'))
      }
    })
    request.on('error', reject)
  })
}

async function health(baseUrl, model) {
  const response = await fetch(`${baseUrl}/models`)
  const payload = await response.json().catch(() => ({ data: [] }))
  const models = payload.data?.map((item) => item.id) ?? []
  return { provider: 'LM Studio', baseUrl, model, available: response.ok && models.includes(model), models }
}

export function createAgentServer({ baseUrl = process.env.LM_STUDIO_URL || DEFAULT_LM_STUDIO_URL, model = process.env.LM_STUDIO_MODEL || DEFAULT_MODEL } = {}) {
  return createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`)
    const pathParts = url.pathname.split('/').filter(Boolean)

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(response, 200, await health(baseUrl, model))
      }

      if (request.method === 'GET' && url.pathname === '/api/skills') {
        return sendJson(response, 200, { skills: getSkillIndex() })
      }

      if (pathParts[0] === 'api' && pathParts[1] === 'cases' && pathParts[2]) {
        const caseItem = getCase(pathParts[2])
        if (!caseItem) return sendJson(response, 404, { error: 'Unknown case.' })

        if (request.method === 'GET' && pathParts[3] === 'draft') {
          return sendJson(response, 200, {
            draft: stagedDrafts.get(caseItem.id) ?? null,
            reviewerFeedback: getReviewerFeedback(caseItem.id),
          })
        }

        if (request.method === 'GET' && pathParts[3] === 'proposals') {
          return sendJson(response, 200, { caseId: caseItem.id, proposals: getProposalLineage(caseItem.id) })
        }

        if (request.method === 'POST' && pathParts[3] === 'reset-draft') {
          stagedDrafts.delete(caseItem.id)
          reviewerFeedback.delete(caseItem.id)
          return sendJson(response, 200, { reset: true })
        }

        if (request.method === 'POST' && pathParts[3] === 'reject') {
          const body = await readJson(request)
          const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
          if (comment.length < 5 || comment.length > MAX_REVIEWER_COMMENT) {
            return sendJson(response, 400, {
              error: `Describe what needs to change in 5 to ${MAX_REVIEWER_COMMENT} characters.`,
            })
          }

          const draft = stagedDrafts.get(caseItem.id) ?? stageFixtureProposal(
            caseItem,
            'Baseline fixture proposal recorded for reviewer feedback.',
            { summary: caseItem.recommendation, category: caseItem.issueType, model: DEFAULT_MODEL },
          )
          const feedback = recordReviewerRejection(caseItem, draft, comment, { persist: true })
          return sendJson(response, 200, {
            caseId: caseItem.id,
            rejection: feedback,
            proposals: getProposalLineage(caseItem.id),
            message: 'Feedback saved for the local agent. Ask it to revise the proposal when ready.',
          })
        }

        if (request.method === 'POST' && pathParts[3] === 'accept') {
          const feedback = getReviewerFeedback(caseItem.id)
          if (feedback?.status === 'active') {
            return sendJson(response, 409, {
              error: 'This proposal was rejected. Ask the agent to stage a revised draft before approving it.',
            })
          }

          const body = await readJson(request)
          const reviewerNote = typeof body.reviewerNote === 'string' ? body.reviewerNote.trim() : ''
          if (reviewerNote.length > MAX_REVIEWER_COMMENT) {
            return sendJson(response, 400, { error: `Reviewer note must be ${MAX_REVIEWER_COMMENT} characters or fewer.` })
          }

          const draft = stagedDrafts.get(caseItem.id) ?? stageFixtureProposal(
            caseItem,
            'Baseline fixture proposal recorded for approval.',
            { summary: caseItem.recommendation, category: caseItem.issueType, model: DEFAULT_MODEL },
          )
          const validation = validateDraft(caseItem, draft)
          if (!validation.passed) return sendJson(response, 409, { error: validation.errors.join(' ') })

          draft.validation = validation
          const handoff = createPublisherHandoff(caseItem, draft, reviewerNote)
          recordProposalAcceptance(caseItem, draft)
          const handoffPath = persistPublisherHandoff(handoff)
          const publisher = await validatePublisherHandoff(handoffPath, getPublisherMode())
          return sendJson(response, 200, {
            caseId: caseItem.id,
            approval: handoff.decision,
            job: { id: handoff.jobId, status: publisher.status },
            publisher,
            proposals: getProposalLineage(caseItem.id),
          })
        }

        if (request.method === 'POST' && pathParts[3] === 'agent') {
          const body = await readJson(request)
          const prompt = typeof body.message === 'string' ? body.message.trim() : ''
          if (!prompt) return sendJson(response, 400, { error: 'A non-empty message is required.' })

          const result = await runCaseAgent({ caseItem, prompt, baseUrl, model })
          return sendJson(response, 200, {
            caseId: caseItem.id,
            provider: 'LM Studio',
            model,
            ...result,
            proposals: getProposalLineage(caseItem.id),
          })
        }
      }

      return sendJson(response, 404, { error: 'Not found.' })
    } catch (error) {
      return sendJson(response, 502, { error: error.message || 'Local agent request failed.' })
    }
  })
}

export function startAgentServer(options = {}) {
  const host = options.host || process.env.MAD_AGENT_HOST || '127.0.0.1'
  const port = Number(options.port || process.env.MAD_AGENT_PORT || 8787)
  const server = createAgentServer(options)
  server.listen(port, host, () => {
    console.log(`MAD local agent bridge listening at http://${host}:${port}`)
  })
  return server
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startAgentServer()
}
