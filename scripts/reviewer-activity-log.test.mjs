import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { ReviewerActivityLog } from './reviewer-activity-log.mjs'

test('persists exact follow-up prompts and summarizes proposal recoveries by initials', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mad-reviewer-activity-'))
  const path = resolve(directory, 'reviewer-agent-activity.jsonl')
  const clock = () => new Date('2026-07-26T12:00:00.000Z')
  const log = new ReviewerActivityLog({ path, clock })

  try {
    const actor = { id: 'reviewer-bb', name: 'BB' }
    log.record({
      type: 'followup_prompt_queued',
      actor,
      caseId: 'CASE-1',
      prompt: 'Compare the AP and master-address relationship before revising.',
    })
    log.record({ type: 'followup_completed', actor, caseId: 'CASE-1' })
    log.record({ type: 'followup_revision_staged', actor, caseId: 'CASE-1' })
    log.record({ type: 'proposal_recovered', actor, caseId: 'CASE-1' })

    const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/).map(JSON.parse)
    assert.equal(
      lines[0].prompt,
      'Compare the AP and master-address relationship before revising.',
    )
    assert.equal(lines[0].actor.initials, 'BB')

    const info = log.info()
    assert.equal(info.eventCount, 4)
    assert.deepEqual(info.reviewers[0], {
      initials: 'BB',
      issuesQueued: 0,
      issuesClaimed: 0,
      followUps: 1,
      followUpsCompleted: 1,
      revisionsStaged: 1,
      decisionsAccepted: 0,
      decisionsRejected: 0,
      recoveredProposals: 1,
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
