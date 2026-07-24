import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { cases } from '../src/data/cases.js'
import { getFeatureRecords, relatedKeys } from '../src/lib/featureRecords.js'

const DEFAULT_LM_STUDIO_URL = 'http://127.0.0.1:1234/v1'
const DEFAULT_MODEL = 'qwen3-4b-thinking-2507'
const MAX_AGENT_TURNS = 5
const MAX_REQUEST_BYTES = 24 * 1024

const stagedDrafts = new Map()

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

export function createFixtureDraft(caseItem, reason) {
  const draft = {
    id: `draft-${caseItem.id.toLowerCase()}`,
    caseId: caseItem.id,
    provider: 'lm-studio-local',
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

function agentTools() {
  return [
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

function executeTool(call, caseItem) {
  const args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
  switch (call.function.name) {
    case 'get_case':
      return summarizeCase(caseItem)
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
      const draft = createFixtureDraft(caseItem, args.reason)
      stagedDrafts.set(caseItem.id, draft)
      return {
        staged: true,
        draftId: draft.id,
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
  if (name === 'get_case') return 'Read case snapshot'
  if (name === 'get_feature') return `Read ${result.label} ${result.id}`
  if (name === 'get_related') return `Read related records for ${result.feature.id}`
  if (name === 'stage_fixture_draft') return result.staged ? 'Staged controlled training draft' : 'Withheld draft'
  if (name === 'validate_draft') return result.passed ? 'Validated staged draft' : 'Draft validation needs attention'
  return name
}

function agentInstructions(caseItem) {
  return [
    'You are the local MAD QA training agent for one case only.',
    `The active case ID is ${caseItem.id}. Do not discuss other cases or invent data.`,
    'Use the case tools before making factual claims. Keep answers concise and cite the data source by name when available.',
    'You may stage only the controlled training draft using stage_fixture_draft. It never edits MAD, never publishes, and always requires human review.',
    'If case status is evidence, withhold any edit draft and explain what evidence is missing.',
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
  const messages = [
    { role: 'system', content: agentInstructions(caseItem) },
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
      }
    }

    for (const call of toolCalls) {
      let result
      try {
        result = executeTool(call, caseItem)
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

      if (pathParts[0] === 'api' && pathParts[1] === 'cases' && pathParts[2]) {
        const caseItem = getCase(pathParts[2])
        if (!caseItem) return sendJson(response, 404, { error: 'Unknown case.' })

        if (request.method === 'GET' && pathParts[3] === 'draft') {
          return sendJson(response, 200, { draft: stagedDrafts.get(caseItem.id) ?? null })
        }

        if (request.method === 'POST' && pathParts[3] === 'reset-draft') {
          stagedDrafts.delete(caseItem.id)
          return sendJson(response, 200, { reset: true })
        }

        if (request.method === 'POST' && pathParts[3] === 'agent') {
          const body = await readJson(request)
          const prompt = typeof body.message === 'string' ? body.message.trim() : ''
          if (!prompt) return sendJson(response, 400, { error: 'A non-empty message is required.' })

          const result = await runCaseAgent({ caseItem, prompt, baseUrl, model })
          return sendJson(response, 200, { caseId: caseItem.id, provider: 'LM Studio', model, ...result })
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
