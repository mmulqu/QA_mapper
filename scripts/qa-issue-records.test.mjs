import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMockQaCase, buildQaIssueRecordPage, QA_SELECTION_LIMIT } from './qa-issue-records.mjs'

const issue = {
  id: 'MADV_QA_ASL_DUPES',
  description: 'Structure lookup records that are functionally duplicative',
  count: 1716,
  group: { id: 'ADDPT_STRUCT_LUT', label: 'Point–structure lookups' },
}

const realCase = {
  id: 'MADV_QA_ASL_DUPES-252-M-272655-933812',
  address: '8 Alpaca Court',
  municipality: 'Rockport',
  priority: 'Review',
  rationale: 'Two lookup rows repeat the same relationship.',
  records: { addressPoint: { id: 'M_272655_933812' } },
}

test('builds a bounded QA preview without treating the statewide count as a work batch', () => {
  const page = buildQaIssueRecordPage(issue, [realCase])

  assert.equal(page.statewideCount, 1716)
  assert.equal(page.loadedCount, 50)
  assert.equal(page.hasMore, true)
  assert.equal(page.selectionLimit, QA_SELECTION_LIMIT)
  assert.equal(page.rows[0].mock, false)
  assert.equal(page.rows[0].caseId, realCase.id)
  assert.equal(page.rows[0].mapPreview.status, 'awaiting-record-geometry')
  assert.equal(page.rows[1].mock, true)
  assert.equal(page.rows[1].mapPreview.status, 'awaiting-record-geometry')
  assert.match(page.rows[1].sourceLabel, /Mock/)
})

test('turns a selected mock row into non-publishable evidence only', () => {
  const page = buildQaIssueRecordPage(issue)
  const mockCase = buildMockQaCase(issue, page.rows[0])

  assert.equal(mockCase.status, 'evidence')
  assert.equal(mockCase.publishEligible, false)
  assert.match(mockCase.publishBlocker, /never be published/)
  assert.equal(mockCase.qaEvidence.selectedRecordId, page.rows[0].id)
  assert.equal(mockCase.changes.length, 0)
})
