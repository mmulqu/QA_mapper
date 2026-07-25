import assert from 'node:assert/strict'
import test from 'node:test'
import { cases } from '../src/data/cases.js'
import {
  authorReviewerSkillMemory,
  buildReviewerRationale,
  compactQaInvestigationPacketForModel,
  createFixtureDraft,
  createPublisherHandoff,
  createThinkingTagDecoder,
  buildProposalLineage,
  getProposalAuditInfo,
  getQaIssueRecordPage,
  getQaRecordMapPreview,
  getReviewerFeedback,
  getSkillIndex,
  finalizeAgentReply,
  loadSkill,
  normalizeLmStudioDelta,
  openProposalAuditInFileExplorer,
  recordReviewerRejection,
  runCaseAgent,
  validateDraft,
} from './agent-server.mjs'

test('reports the fixed local proposal audit CSV without accepting a client path', () => {
  const info = getProposalAuditInfo()

  assert.equal(info.kind, 'mad-proposal-audit-csv')
  assert.equal(info.relativePath, '.runtime\\proposal-history.csv')
  assert.match(info.path, /[\\/]\.runtime[\\/]proposal-history\.csv$/)
  assert.equal(Number.isInteger(info.eventCount), true)
})

test('does not launch a desktop file manager on unsupported platforms', async () => {
  let launched = false
  const result = await openProposalAuditInFileExplorer({
    platform: 'linux',
    spawnProcess: () => { launched = true },
  })

  assert.equal(launched, false)
  assert.equal(result.opened, false)
  assert.match(result.message, /Open .*proposal-history\.csv/)
})

test('loads a bounded pre-agent map through the selected QA row relationship', async () => {
  const preview = await getQaRecordMapPreview(
    'MADV_QA_ASL_DUPES',
    'MADV_QA_ASL_DUPES-252-M-272655-933812',
  )
  const loadedCount = preview.extract.layers.reduce((sum, layer) => sum + layer.count, 0)

  assert.equal(preview.kind, 'mad-qa-map-preview')
  assert.equal(preview.extract.kind, 'mad-qa-map-preview-extract')
  assert.equal(preview.extract.metadata.preAgent, true)
  assert.equal(preview.limits.bufferMeters, 120)
  assert.ok(loadedCount > 0)
  assert.ok(loadedCount <= preview.limits.maxTotalFeatures)
  assert.ok(preview.records['addresses:M_272655_933812'])
  assert.equal(preview.selectedFeatureKey, 'structures:272643_933827')
  assert.deepEqual(preview.relation.anchorFeatureKeys, [
    'structures:272643_933827',
  ])
  assert.deepEqual(preview.relation.path, [{
    from: 'MAD_ADDPT_STRUCT_LUT.STRUCTURE_ID',
    to: 'MAD_STRUCTURES_POLY.STRUCTURE_ID',
  }])
})

test('loads a controlled Rockport fault as a real previewable QA row', async () => {
  const page = await getQaIssueRecordPage('MADV_QA_AP_DOM_PTTYPE')
  const row = page.rows.find((candidate) => !candidate.mock)
  const preview = await getQaRecordMapPreview(page.view.id, row.id)
  const point = preview.records['addresses:M_272497_934767']
  const pointType = point.attributes.find((attribute) => attribute.sourceField === 'POINT_TYPE')

  assert.equal(page.statewideCount, 3)
  assert.equal(row.sourceLabel, 'Rockport controlled fault')
  assert.equal(row.mapPreview.status, 'available')
  assert.equal(preview.selectedFeatureKey, 'addresses:M_272497_934767')
  assert.equal(pointType.value, 'ROOFTOP')
  assert.equal(preview.caseItem.publishEligible, false)
  assert.match(preview.caseItem.publishBlocker, /pre-agent map preview/)
})

test('keeps skill instructions out of the default skill index', () => {
  const skills = getSkillIndex()
  const skill = skills.find((item) => item.id === 'qa-evidence-brief')

  assert.equal(skills.length, 14)
  assert.equal(skill.id, 'qa-evidence-brief')
  assert.equal(skills.some((item) => item.id === 'mad-qa-asl'), true)
  assert.equal(skills.some((item) => item.id === 'mad-qa-brv'), true)
  assert.equal('instructions' in skill, false)
})

test('loads the full allow-listed skill only on request', () => {
  const evidenceSkill = loadSkill('qa-evidence-brief')
  const apSkill = loadSkill('mad-qa-ap')
  const aslSkill = loadSkill('mad-qa-asl')
  const schemaSkill = loadSkill('mad-schema-intelligence')
  const geoServerSkill = loadSkill('massgis-geoserver')

  assert.equal(evidenceSkill.name, 'QA Evidence Brief')
  assert.match(evidenceSkill.instructions, /Required evidence/)
  assert.match(evidenceSkill.instructions, /stage_fixture_draft/)
  assert.match(apSkill.instructions, /POINT_TYPE/)
  assert.equal(aslSkill.memory.skillId, 'mad-qa-asl')
  assert.match(aslSkill.memory.memoryFile, /mad-qa-asl\\references\\reviewer-memory\.md$/)
  assert.match(schemaSkill.instructions, /relationship-aware/)
  assert.match(geoServerSkill.instructions, /GeoServer/)
})

test('requires the local model to author one structured category memory tool call', async () => {
  const draft = createFixtureDraft(cases[0], 'Initial point placement proposal.')
  let modelRequest
  const proposalContext = {
    proposalId: draft.id,
    caseId: cases[0].id,
    model: 'local-test-model',
    userPrompt: 'Review the point placement and stage a safe proposal.',
    finalResponse: 'I moved the point to the east entrance after checking the structure.',
    toolEvents: [{ name: 'get_feature', summary: 'Read address point AP-100294' }],
    toolTranscript: [{
      role: 'tool',
      name: 'get_feature',
      arguments: '{"feature_key":"address-point"}',
      result: { id: 'AP-100294', attributes: { POINT_TYPE: 'BEP' } },
    }],
  }
  const memory = await authorReviewerSkillMemory({
    caseItem: cases[0],
    draft,
    reviewerFeedback: 'Use the verified driveway access rather than guessing an entrance from the footprint.',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'local-test-model',
    proposalContext,
    requestModel: async (request) => {
      modelRequest = request
      return {
        tool_calls: [{
          id: 'memory-call-1',
          type: 'function',
          function: {
            name: 'write_category_skill_memory',
            arguments: JSON.stringify({
              title: 'Verify access geometry before moving a point',
              lesson: 'Use observed access evidence when choosing between a driveway and a footprint-derived entrance.',
              applies_when: ['A proposed point move depends on selecting an entrance or access location.'],
              required_checks: ['Inspect the available imagery and vector access evidence before selecting geometry.'],
              avoid: 'Do not infer an entrance from the building footprint alone.',
              confidence: 'medium',
            }),
          },
        }],
      }
    },
  })

  assert.equal(modelRequest.toolChoice, 'required')
  assert.equal(modelRequest.tools.length, 1)
  assert.match(modelRequest.messages[1].content, /verified driveway access/)
  assert.match(modelRequest.messages[1].content, /I moved the point to the east entrance/)
  assert.match(modelRequest.messages[1].content, /"POINT_TYPE": "BEP"/)
  assert.match(modelRequest.messages[1].content, new RegExp(draft.sourceSnapshot.rowHash))
  assert.equal(memory.skillId, 'mad-qa-ap')
  assert.equal(memory.modelId, 'local-test-model')
  assert.deepEqual(memory.proposalContext, {
    available: true,
    proposalId: draft.id,
    finalResponseAvailable: true,
    toolCallCount: 1,
  })
  assert.match(memory.agentEntry.lesson, /observed access evidence/)
})

test('normalizes reasoning and output without depending on a model name', () => {
  assert.deepEqual(
    normalizeLmStudioDelta({
      reasoning_content: 'Checking the relationship.',
      content: 'The duplicate is confirmed.',
    }),
    {
      reasoning: 'Checking the relationship.',
      content: 'The duplicate is confirmed.',
    },
  )
  assert.deepEqual(
    normalizeLmStudioDelta({
      content: [
        { type: 'thinking', text: 'Inspecting rows.' },
        { type: 'text', text: 'Ready for review.' },
      ],
    }),
    {
      reasoning: 'Inspecting rows.',
      content: 'Ready for review.',
    },
  )
})

test('supplies a reviewer-readable evidence chain when an AV agent reply is blank', () => {
  const avCase = {
    ...cases[0],
    id: 'MADV_QA_AV_APID_MISMATCH-FAULT-AV-POINT-LINK-MISMATCH',
    address: '1 Ridgewood Road',
    municipality: 'Rockport',
    issueType: 'Address Variant point-link mismatch',
    issueCode: 'MADV_QA_AV_APID_MISMATCH',
    publishEligible: false,
    publishBlocker: 'Controlled Rockport fault scenarios are training overlays and can never be published.',
    changes: [{
      entityLabel: 'Address Variant',
      entityId: '{7A29EAB9-D607-4AAE-935F-091247BB5DE8}',
      fields: [{
        field: 'ADDRESS_POINT_ID',
        before: 'M_273925_934533',
        after: 'M_273118_932155',
      }],
    }],
    qaEvidence: {
      observations: ['The Address Variant points to M_273925_934533.'],
      mapRelation: {
        path: [
          { from: 'MAD_ADDRESS_VARIANTS.MASTER_ADDRESS_ID', to: 'MAD_MASTER_ADDRESS.MASTER_ADDRESS_ID' },
          { from: 'MAD_MASTER_ADDRESS.ADDRESS_POINT_ID', to: 'MAD_ADDRESS_POINTM.ADDRESS_POINT_ID' },
        ],
      },
      relationshipEvidence: {
        flaggedVariant: { MASTER_ADD: 17933, ADDRESS_PO: 'M_273925_934533' },
        masterAddressStreet: [{
          MASTER_ADD: 17933,
          ADDRESS_PO: 'M_273118_932155',
          FULL_NUMBE: '1',
          STREET_N_1: 'RIDGEWOOD ROAD',
        }],
        conflictingPointMasterStreet: [{
          MASTER_ADD: 18975,
          ADDRESS_PO: 'M_273925_934533',
          FULL_NUMBE: '33',
          STREET_N_1: 'STRAITSMOUTH WAY',
        }],
      },
    },
  }

  const rationale = buildReviewerRationale(avCase)
  const fallback = finalizeAgentReply({ caseItem: avCase, reply: '', draft: null })

  assert.match(rationale, /Master Address `17933`/)
  assert.match(rationale, /1 RIDGEWOOD ROAD/)
  assert.match(rationale, /Master Address `18975` \(33 STRAITSMOUTH WAY\)/)
  assert.match(rationale, /M_273925_934533/)
  assert.match(rationale, /M_273118_932155/)
  assert.match(rationale, /training overlays and can never be published/)
  assert.match(fallback, /^### Verified review rationale/)

  const withNarrative = finalizeAgentReply({
    caseItem: avCase,
    reply: 'The local model made this separate claim.',
    draft: null,
  })
  assert.match(withNarrative, /^### Verified review rationale/)
  assert.match(withNarrative, /### Local-model narrative \(unverified\)/)
  assert.match(withNarrative, /The local model made this separate claim/)
})

test('compacts the full QA packet before it enters a local model context', () => {
  const packet = {
    case: { id: 'case-1', address: '1 Ridgewood Road' },
    evidence: {
      viewId: 'MADV_QA_AV_APID_MISMATCH',
      currentQaRecord: {
        ADDRESS_VA: '{variant}',
        ADDRESS_PO: 'M_273925_934533',
        MASTER_ADD: 17933,
        CUSTOMER_OWNER_NAME: 'This field is not needed to decide the point link.',
      },
      observations: ['The variant and parent point link disagree.'],
      relationshipEvidence: {
        addressVariants: Array.from({ length: 20 }, (_, index) => ({
          ADDRESS_VA: `{variant-${index}}`,
          ADDRESS_PO: 'M_273118_932155',
          MASTER_ADD: 17933,
          COMMENTS: 'Unneeded free text that should not consume model context.',
        })),
        conflictingPointMasterStreet: [{
          MASTER_ADD: 18975,
          ADDRESS_PO: 'M_273925_934533',
          FULL_NUMBE: '33',
          STREET_N_1: 'STRAITSMOUTH WAY',
        }],
      },
    },
    schema: {
      source: 'schema reference',
      subject: 'master-address-relationships',
      tables: [{ table: 'MAD.MAD_MASTER_ADDRESS', definition: 'x'.repeat(2_000) }],
      relationships: ['master relationship'],
    },
  }

  const compact = compactQaInvestigationPacketForModel(packet)
  const serialized = JSON.stringify(compact)

  assert.equal(compact.evidence.currentQaRecord.CUSTOMER_OWNER_NAME, undefined)
  assert.equal(compact.evidence.relationshipEvidence.addressVariants.length, 6)
  assert.equal(compact.evidence.relationshipEvidence.addressVariants[0].COMMENTS, undefined)
  assert.equal(compact.evidence.relationshipEvidence.conflictingPointMasterStreet[0].STREET_N_1, 'STRAITSMOUTH WAY')
  assert.equal(compact.schema.tables[0].definition.length, 700)
  assert.ok(serialized.length < 4_000)
})

test('recognizes split thinking tags used by local model templates', () => {
  const decoder = createThinkingTagDecoder()
  const parts = [
    ...decoder.push('<thi'),
    ...decoder.push('nk>Compare two rows.</think>Final'),
    ...decoder.push(' answer.'),
    ...decoder.flush(),
  ]

  assert.deepEqual(parts, [
    { type: 'reasoning', text: 'Compare two rows.' },
    { type: 'content', text: 'Final' },
    { type: 'content', text: ' answer.' },
  ])
})

test('streams generic model output and tags on-demand skill calls', async () => {
  const originalFetch = globalThis.fetch
  const encoder = new TextEncoder()
  const streamedResponse = (events) => new Response(new ReadableStream({
    start(controller) {
      events.forEach((payload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      })
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  }), { headers: { 'content-type': 'text/event-stream' } })
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    if (requestCount === 1) {
      return streamedResponse([
        { choices: [{ delta: { reasoning_content: 'Checking which runbook applies.' } }] },
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call-skill',
                type: 'function',
                function: { name: 'load_skill', arguments: '{"skill_id":"qa-evidence-brief"}' },
              }],
            },
          }],
        },
      ])
    }
    return streamedResponse([
      { choices: [{ delta: { content: '**Skill ready.**' } }] },
    ])
  }

  try {
    const activity = []
    const result = await runCaseAgent({
      caseItem: cases[0],
      prompt: 'Use the QA Evidence Brief skill.',
      baseUrl: 'http://local-model.test/v1',
      model: 'different-local-model',
      onEvent: (event) => activity.push(event),
    })

    assert.equal(result.reply, '**Skill ready.**')
    assert.equal(result.toolEvents[0].name, 'load_skill')
    assert.ok(activity.some((event) => event.type === 'reasoning_delta'))
    assert.ok(activity.some((event) => event.type === 'output_delta'))
    assert.ok(activity.some((event) => event.type === 'skill' && event.phase === 'started'))
    assert.ok(activity.some((event) => event.type === 'skill' && event.phase === 'completed'))
    assert.ok(activity.every((event) => !event.model || event.model === 'different-local-model'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('withholds an AP structure-link draft until the model supplies vector intersection evidence', async () => {
  const originalFetch = globalThis.fetch
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    const message = requestCount === 1
      ? {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'stage-without-spatial-proof',
            type: 'function',
            function: {
              name: 'stage_fixture_draft',
              arguments: JSON.stringify({ reason: 'The point should be linked to the structure.' }),
            },
          }],
        }
      : { role: 'assistant', content: 'No draft was staged.' }
    return new Response(JSON.stringify({ choices: [{ message }] }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  const addressStructureCase = {
    ...cases[0],
    id: 'MADV_QA_AP_NO_STRUCT_LUT-TEST-SPATIAL-GATE',
    issueCode: 'MADV_QA_AP_NO_STRUCT_LUT',
    operationKind: 'link_point_to_structure',
    operations: [{ type: 'link_point_to_structure', target: 'AP-100294 → STR-44108' }],
    qaEvidence: {
      viewId: 'MADV_QA_AP_NO_STRUCT_LUT',
      observations: ['The selected point requires an explicit vector intersection check.'],
    },
  }

  try {
    const result = await runCaseAgent({
      caseItem: addressStructureCase,
      prompt: 'Investigate the missing structure lookup.',
      baseUrl: 'http://local-model.test/v1',
      model: 'different-local-model',
    })

    assert.equal(result.draft, null)
    assert.equal(result.toolEvents[0].name, 'stage_fixture_draft')
    assert.equal(result.toolEvents[0].summary, 'Withheld draft')
    assert.match(result.reply, /Verified review rationale/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('creates a review-only fixture draft with source preconditions', () => {
  const draft = createFixtureDraft(cases[0], 'Verified structure and parcel evidence.')

  assert.equal(draft.caseId, 'MAD-2026-1842')
  assert.equal(draft.changes.length, 1)
  assert.equal(draft.validation.passed, true)
  assert.equal(draft.sourceSnapshot.rowHash, cases[0].snapshot.rowHash)
})

test('blocks drafts for evidence-only cases', () => {
  const draft = createFixtureDraft(cases[3], 'Attempted draft.')
  const validation = validateDraft(cases[3], draft)

  assert.equal(validation.passed, false)
  assert.match(validation.errors.join(' '), /held for evidence/)
})

test('freezes only allow-listed operations into an approved publisher handoff', () => {
  const draft = createFixtureDraft(cases[0], 'Verified the mapped entrance and structure relationship.')
  const handoff = createPublisherHandoff(cases[0], draft, 'Approved after visual review.')

  assert.equal(handoff.kind, 'mad-qa-publisher-handoff')
  assert.equal(handoff.decision.type, 'accept')
  assert.equal(handoff.sourceSnapshot.rowHash, cases[0].snapshot.rowHash)
  assert.deepEqual(handoff.operations.map((operation) => operation.type), ['move_address_point', 'link_point_to_structure'])
  assert.equal(handoff.productionApplied, false)
})

test('keeps a logical proposal reviewable when its source extract cannot target a safe publish', () => {
  const reviewOnlyCase = {
    ...cases[0],
    publishEligible: false,
    publishBlocker: 'The source export omitted the lookup OBJECTID.',
  }
  const draft = createFixtureDraft(reviewOnlyCase, 'The duplicate relationship is confirmed.')

  assert.equal(draft.validation.passed, true)
  assert.throws(
    () => createPublisherHandoff(reviewOnlyCase, draft),
    /omitted the lookup OBJECTID/,
  )
})

test('stores human rejection feedback for the next local-agent turn', () => {
  const draft = createFixtureDraft(cases[1], 'Initial relationship proposal.')
  const feedback = recordReviewerRejection(cases[1], draft, 'The rooftop point belongs to the adjacent parcel; inspect the building again.')

  assert.equal(feedback.status, 'active')
  assert.equal(feedback.rejectedProposalId, draft.id)
  assert.equal(getReviewerFeedback(cases[1].id).comment, feedback.comment)
})

test('builds a descendant proposal lineage with the model and reviewer feedback preserved', () => {
  const lineage = buildProposalLineage([
    {
      event_type: 'staged', proposal_id: 'proposal-1', parent_proposal_id: '', root_proposal_id: 'proposal-1',
      case_id: cases[0].id, status: 'staged', category: 'Address point movement', summary: 'Move to the east entrance.',
      reviewer_feedback: '', agent_provider: 'lm-studio-local', model_id: 'qwen3-4b-thinking-2507', recorded_at: '2026-07-24T12:00:00.000Z',
    },
    {
      event_type: 'rejected', proposal_id: 'proposal-1', parent_proposal_id: '', root_proposal_id: 'proposal-1',
      case_id: cases[0].id, status: 'rejected', category: 'Address point movement', summary: 'Move to the east entrance.',
      reviewer_feedback: 'Use the driveway instead.', agent_provider: 'lm-studio-local', model_id: 'qwen3-4b-thinking-2507', recorded_at: '2026-07-24T12:01:00.000Z',
    },
    {
      event_type: 'staged', proposal_id: 'proposal-2', parent_proposal_id: 'proposal-1', root_proposal_id: 'proposal-1',
      case_id: cases[0].id, status: 'staged', category: 'Address point movement', summary: 'Move to the verified driveway access.',
      reviewer_feedback: '', agent_provider: 'lm-studio-local', model_id: 'qwen3-4b-thinking-2507', recorded_at: '2026-07-24T12:02:00.000Z',
    },
  ])

  assert.equal(lineage.length, 2)
  assert.equal(lineage[0].status, 'rejected')
  assert.equal(lineage[0].reviewerFeedback, 'Use the driveway instead.')
  assert.equal(lineage[0].model, 'qwen3-4b-thinking-2507')
  assert.equal(lineage[1].parentProposalId, 'proposal-1')
  assert.equal(lineage[1].depth, 1)
})
