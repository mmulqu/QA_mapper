import assert from 'node:assert/strict'
import test from 'node:test'
import { cases } from '../src/data/cases.js'
import { createFixtureDraft, validateDraft } from './agent-server.mjs'

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
