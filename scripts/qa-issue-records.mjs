import { buildQaMapPreviewDescriptor } from './qa-map-relations.mjs'

const DEFAULT_PREVIEW_SIZE = 12
export const QA_SELECTION_LIMIT = 10

const MOCK_ROWS = [
  { address: '12 TEST STREET', municipality: 'BOSTON', recordId: 'MOCK-MA-000012' },
  { address: '27 SAMPLE ROAD', municipality: 'WORCESTER', recordId: 'MOCK-AP-000027' },
  { address: '104 QA AVENUE', municipality: 'SPRINGFIELD', recordId: 'MOCK-ASL-000104' },
  { address: '8 REVIEW LANE', municipality: 'PITTSFIELD', recordId: 'MOCK-AV-000008' },
  { address: '61 CHECK COURT', municipality: 'NEW BEDFORD', recordId: 'MOCK-BRV-000061' },
  { address: '203 VERIFY WAY', municipality: 'LOWELL', recordId: 'MOCK-APC-000203' },
  { address: '44 FIXTURE DRIVE', municipality: 'CAMBRIDGE', recordId: 'MOCK-MA-000044' },
  { address: '91 CONTROL PLACE', municipality: 'QUINCY', recordId: 'MOCK-ASL-000091' },
  { address: '16 AUDIT TERRACE', municipality: 'LYNN', recordId: 'MOCK-AV-000016' },
  { address: '305 QUEUE STREET', municipality: 'BROCKTON', recordId: 'MOCK-BRV-000305' },
  { address: '72 AGENT ROAD', municipality: 'SALEM', recordId: 'MOCK-AP-000072' },
  { address: '119 REVIEWER CIRCLE', municipality: 'TAUNTON', recordId: 'MOCK-APC-000119' },
]

function cleanIssue(issue) {
  if (!issue?.id || !Number.isFinite(issue.count) || issue.count < 1) {
    throw new Error('A non-zero QA issue is required to build issue rows.')
  }
  return issue
}

function recordFromCase(issue, caseItem, index) {
  const affectedRecordId = caseItem.records?.addressPoint?.id
    || caseItem.records?.masterAddress?.id
    || caseItem.id
  return {
    id: caseItem.id,
    caseId: caseItem.id,
    viewId: issue.id,
    rowNumber: index + 1,
    address: caseItem.address,
    municipality: caseItem.municipality,
    affectedRecordId,
    issueDetail: caseItem.rationale || issue.description,
    severity: caseItem.priority || 'Review',
    sourceLabel: 'Rockport MAD extract',
    mock: false,
    runnable: true,
    mapPreview: buildQaMapPreviewDescriptor(issue, caseItem),
    attributes: {
      QA_ROW_ID: caseItem.id,
      QA_VIEW: issue.id,
      AFFECTED_RECORD_ID: affectedRecordId,
      ADDRESS: caseItem.address,
      MUNICIPALITY: caseItem.municipality,
      ISSUE_DETAIL: caseItem.rationale || issue.description,
      SOURCE: 'Rockport MAD extract',
    },
  }
}

function mockRecord(issue, row, index) {
  const id = `${issue.id}-MOCK-${String(index + 1).padStart(4, '0')}`
  const issueDetail = `${issue.description}. Demonstration row awaiting the production SQL view connector.`
  return {
    id,
    caseId: null,
    viewId: issue.id,
    rowNumber: index + 1,
    address: row.address,
    municipality: row.municipality,
    affectedRecordId: row.recordId,
    issueDetail,
    severity: index % 3 === 0 ? 'High' : index % 3 === 1 ? 'Medium' : 'Review',
    sourceLabel: 'Mock QA view row',
    mock: true,
    runnable: true,
    mapPreview: buildQaMapPreviewDescriptor(issue, null, { mock: true }),
    attributes: {
      QA_ROW_ID: id,
      QA_VIEW: issue.id,
      AFFECTED_RECORD_ID: row.recordId,
      ADDRESS: row.address,
      MUNICIPALITY: row.municipality,
      ISSUE_DETAIL: issueDetail,
      SOURCE: 'Mock QA view row',
    },
  }
}

export function buildQaIssueRecordPage(issueInput, realCases = [], {
  previewSize = DEFAULT_PREVIEW_SIZE,
  selectionLimit = QA_SELECTION_LIMIT,
} = {}) {
  const issue = cleanIssue(issueInput)
  const boundedPreviewSize = Math.max(1, Math.min(DEFAULT_PREVIEW_SIZE, Math.trunc(previewSize)))
  const rows = realCases.slice(0, boundedPreviewSize).map((caseItem, index) => (
    recordFromCase(issue, caseItem, index)
  ))

  const desiredCount = Math.min(issue.count, boundedPreviewSize)
  while (rows.length < desiredCount) {
    const index = rows.length
    rows.push(mockRecord(issue, MOCK_ROWS[index % MOCK_ROWS.length], index))
  }

  return {
    kind: 'mad-qa-issue-record-page',
    view: {
      id: issue.id,
      description: issue.description,
      categoryId: issue.group.id,
      category: issue.group.label,
    },
    statewideCount: issue.count,
    loadedCount: rows.length,
    hasMore: issue.count > rows.length,
    selectionLimit: Math.max(1, Math.min(QA_SELECTION_LIMIT, Math.trunc(selectionLimit))),
    containsMockRows: rows.some((row) => row.mock),
    rows,
  }
}

export function buildMockQaCase(issueInput, row) {
  const issue = cleanIssue(issueInput)
  if (!row?.mock || row.viewId !== issue.id) {
    throw new Error('A mock row from the selected QA view is required.')
  }

  return {
    id: `${row.id}-EVIDENCE`,
    address: row.address,
    municipality: row.municipality,
    issueType: issue.group.label,
    issueCode: issue.id,
    status: 'evidence',
    priority: row.severity,
    confidence: 0,
    operationKind: 'investigate',
    recommendation: 'Connect this row to the production QA SQL view before proposing a MAD correction.',
    rationale: 'This is a visible mock QA row for testing selection and batch control. It does not contain authoritative MAD relationships or geometry.',
    publishEligible: false,
    publishBlocker: 'Mock QA rows can never be published.',
    center: [42.36, -71.06],
    zoom: 12,
    geometry: {
      current: null,
      proposed: null,
      parcel: [],
      structure: [],
      road: [],
      nearby: [],
    },
    records: {
      addressPoint: { id: row.affectedRecordId, globalId: 'Unavailable in mock row' },
      masterAddress: { id: 'Unavailable in mock row', globalId: 'Unavailable in mock row' },
      structure: { id: 'Unavailable in mock row', globalId: 'Unavailable in mock row' },
      variant: { id: 'Unavailable in mock row', value: row.address },
    },
    evidence: [{
      source: row.sourceLabel,
      date: '2026-07-24',
      detail: `${row.affectedRecordId} was selected from the preview for workflow testing.`,
    }],
    operations: [],
    changes: [],
    snapshot: {
      exportedAt: '2026-07-24T06:00:04-04:00',
      source: row.sourceLabel,
      version: 'mock.qa-view.preview.2026.07',
      rowHash: `mock:${row.id}`,
      wkid: null,
    },
    qaEvidence: {
      viewId: issue.id,
      categoryId: issue.group.id,
      category: issue.group.label,
      statewideCount: issue.count,
      selectedRecordId: row.id,
      selectedRecord: row.attributes,
      localAdapterSupported: false,
      limitation: 'The selected row is mock data and has no authoritative MAD relationship closure.',
    },
    townExtractSummary: null,
  }
}
