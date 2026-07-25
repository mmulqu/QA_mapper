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

test('marks the controlled Rockport fault views without changing statewide counts', () => {
  const catalog = loadQaCatalog()
  const controlled = catalog.groups
    .flatMap((group) => group.issues)
    .filter((issue) => issue.localFixture?.status === 'controlled-fault')
  const pointType = findQaIssue('MADV_QA_AP_DOM_PTTYPE', catalog)

  assert.equal(controlled.length, 6)
  assert.equal(pointType.count, 3)
  assert.equal(pointType.localFixture.scenarioId, 'rockport-ap-invalid-point-type')
  assert.match(pointType.localFixture.note, /original Rockport export remains unchanged/)
})

test('hides controlled fault fixtures when the reversible overlay is disabled', () => {
  const previous = process.env.MAD_ROCKPORT_FAULTS
  process.env.MAD_ROCKPORT_FAULTS = 'disabled'
  try {
    const catalog = loadQaCatalog()
    const pointType = findQaIssue('MADV_QA_AP_DOM_PTTYPE', catalog)
    const sourceDuplicate = findQaIssue('MADV_QA_ASL_DUPES', catalog)

    assert.equal(pointType.localFixture, null)
    assert.equal(sourceDuplicate.localFixture.status, 'available')
  } finally {
    if (previous === undefined) delete process.env.MAD_ROCKPORT_FAULTS
    else process.env.MAD_ROCKPORT_FAULTS = previous
  }
})
