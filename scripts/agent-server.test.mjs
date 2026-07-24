import assert from 'node:assert/strict'
import test from 'node:test'
import { cases } from '../src/data/cases.js'
import {
  createFixtureDraft,
  createPublisherHandoff,
  buildProposalLineage,
  getReviewerFeedback,
  getSkillIndex,
  loadSkill,
  recordReviewerRejection,
  validateDraft,
} from './agent-server.mjs'

test('keeps skill instructions out of the default skill index', () => {
  const skills = getSkillIndex()
  const skill = skills.find((item) => item.id === 'qa-evidence-brief')

  assert.equal(skills.length, 4)
  assert.equal(skill.id, 'qa-evidence-brief')
  assert.equal('instructions' in skill, false)
})

test('loads the full allow-listed skill only on request', () => {
  const evidenceSkill = loadSkill('qa-evidence-brief')
  const apSkill = loadSkill('mad-qa-ap')
  const schemaSkill = loadSkill('mad-schema-intelligence')
  const geoServerSkill = loadSkill('massgis-geoserver')

  assert.equal(evidenceSkill.name, 'QA Evidence Brief')
  assert.match(evidenceSkill.instructions, /Required evidence/)
  assert.match(evidenceSkill.instructions, /stage_fixture_draft/)
  assert.match(apSkill.instructions, /POINT_TYPE/)
  assert.match(schemaSkill.instructions, /relationship-aware/)
  assert.match(geoServerSkill.instructions, /GeoServer/)
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
