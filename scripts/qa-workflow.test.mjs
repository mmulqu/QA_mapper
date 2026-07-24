import assert from 'node:assert/strict'
import test from 'node:test'
import { findQaIssue, loadQaCatalog, parseQaReport } from './qa-workflow.mjs'

test('parses only non-zero QA checks and preserves their report groups', () => {
  const catalog = parseQaReport(`
(1) MASTER_ADDRESS CHECKS
#1-1 Duplicate address records...
>>   Querying MADV_QA_MA_DUPES...
**** NUMBER OF DUPLICATED MASTER ADDRESS RECORDS: 8
----
#1-2 No missing address records...
>>   Querying MADV_QA_MA_MISSING...
No missing records were found.
----
`)

  assert.equal(catalog.groups.length, 1)
  assert.equal(catalog.groups[0].label, 'Master addresses')
  assert.equal(catalog.groups[0].issues.length, 1)
  assert.equal(catalog.groups[0].issues[0].id, 'MADV_QA_MA_DUPES')
  assert.equal(catalog.groups[0].issues[0].count, 8)
})

test('loads the Rockport-supported duplicate lookup issue from the supplied report', () => {
  const catalog = loadQaCatalog()
  const issue = findQaIssue('MADV_QA_ASL_DUPES', catalog)

  assert.equal(issue.count, 181)
  assert.equal(issue.group.label, 'Point–structure lookups')
  assert.equal(issue.localFixture.town, 'Rockport')
  assert.equal(catalog.summary.issueCount, 75)
})
