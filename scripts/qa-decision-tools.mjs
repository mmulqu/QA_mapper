import { runCaseGeospatialOperator } from './case-geospatial.mjs'

const TRACE_FIELDS = new Set([
  'ADDRESS_VA', 'ADDRESS_PO', 'MASTER_ADD', 'LOC_ID', 'STRUCTURE_', 'STRUCTURE1',
  'BASE_RANGE', 'BASE_SEGME', 'PARITY_LEF', 'PARITY_RIG', 'FROM_ADD_L', 'TO_ADD_L',
  'FROM_ADD_R', 'TO_ADD_R', 'FULL_NUMBE', 'STREET_NAM', 'STREET_N_1', 'ADDRESS_ST',
  'ADDRESS_TO', 'GEOGRAPHIC', 'COMMUNITY_', 'POINT_TYPE', 'BUILDING_C', 'ADDRESS_STATUS',
])

const RULE_DEFINITIONS = {
  MADV_QA_AV_APID_MISMATCH: {
    predicate: 'MAD_ADDRESS_VARIANTS.ADDRESS_POINT_ID must agree with the ADDRESS_POINT_ID on its parent MAD_MASTER_ADDRESS record.',
    expectedSource: 'Parent MAD_MASTER_ADDRESS relationship',
  },
  MADV_QA_AP_NO_STRUCT_LUT: {
    predicate: 'A building-associated address point requires at least one MAD_ADDPT_STRUCT_LUT row that links it to a supported structure polygon.',
    expectedSource: 'MAD_ADDRESS_POINTM → MAD_ADDPT_STRUCT_LUT → MAD_STRUCTURES_POLY',
  },
  MADV_QA_AP_DOM_PTTYPE: {
    predicate: 'MAD_ADDRESS_POINTM.POINT_TYPE must be one of the approved address-point domain values.',
    expectedSource: 'MAD metadata domain for MAD_ADDRESS_POINTM.POINT_TYPE',
  },
  MADV_QA_MA_DOM_ADDRSTAT: {
    predicate: 'MAD_MASTER_ADDRESS.ADDRESS_STATUS must be one of the approved Master Address domain values.',
    expectedSource: 'MAD metadata domain for MAD_MASTER_ADDRESS.ADDRESS_STATUS',
  },
  MADV_QA_ASL_BAD_TOWN_ID: {
    predicate: 'MAD_ADDPT_STRUCT_LUT.STRUCTURE_TOWN_ID must agree with the linked structure and address-point town context.',
    expectedSource: 'MAD_ADDPT_STRUCT_LUT → MAD_STRUCTURES_POLY and MAD_ADDRESS_POINTM town fields',
  },
  MADV_QA_BRV_PARITY_EOM: {
    predicate: 'A populated base-range side must have parity consistent with its from/to address numbers.',
    expectedSource: 'MAD_BASE_RANGE_VARIANTS range values and parity field',
  },
  MADV_QA_ASL_DUPES: {
    predicate: 'MAD_ADDPT_STRUCT_LUT must not contain duplicate rows for the same address point, parcel, structure, and structure-town relationship.',
    expectedSource: 'MAD_ADDPT_STRUCT_LUT composite relationship key',
  },
}

function asString(value) {
  return value === null || value === undefined || value === '' ? null : String(value)
}

function humanText(value) {
  return String(value)
}

function pickTraceFields(record) {
  if (!record || typeof record !== 'object') return null
  return Object.fromEntries(
    Object.entries(record).filter(([field, value]) => TRACE_FIELDS.has(field) && value !== null && value !== undefined && value !== ''),
  )
}

function compactRecords(records, limit = 12) {
  return (Array.isArray(records) ? records : []).slice(0, limit).map(pickTraceFields)
}

function featureId(caseItem, key) {
  const recordIds = {
    'address-point': caseItem.records?.addressPoint?.id,
    'master-address': caseItem.records?.masterAddress?.id,
    'address-variant': caseItem.records?.variant?.id,
    structure: caseItem.records?.structure?.id,
    'structure-lookup': caseItem.records?.structure?.id
      ? `${caseItem.records.addressPoint?.id ?? 'unknown'} → ${caseItem.records.structure.id}`
      : null,
    parcel: caseItem.qaEvidence?.relationshipEvidence?.addressPoint?.LOC_ID,
    road: caseItem.qaEvidence?.relationshipEvidence?.baseRangeVariants?.[0]?.BASE_SEGME,
  }
  const id = asString(recordIds[key])
  return id ? humanText(id) : null
}

function relationPaths(caseItem) {
  const qaPath = caseItem.qaEvidence?.mapRelation?.path ?? []
  const standard = [
    { from: 'MAD_ADDRESS_POINTM.ADDRESS_POINT_ID', to: 'MAD_MASTER_ADDRESS.ADDRESS_POINT_ID', type: 'one-to-many' },
    { from: 'MAD_MASTER_ADDRESS.MASTER_ADDRESS_ID', to: 'MAD_ADDRESS_VARIANTS.MASTER_ADDRESS_ID', type: 'one-to-many' },
    { from: 'MAD_ADDRESS_POINTM.ADDRESS_POINT_ID', to: 'MAD_ADDPT_STRUCT_LUT.ADDRESS_POINT_ID', type: 'one-to-many' },
    { from: 'MAD_ADDPT_STRUCT_LUT.STRUCTURE_ID', to: 'MAD_STRUCTURES_POLY.STRUCTURE_ID', type: 'one-to-many' },
    { from: 'MAD_ADDRESS_POINTM.LOC_ID', to: 'L3_TAXPAR_POLY_ASSESS.LOC_ID', type: 'one-to-many' },
  ]
  const combined = [...qaPath, ...standard]
  const seen = new Set()
  return combined.filter((path) => {
    const key = `${path.from}|${path.to}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function changeObservations(caseItem) {
  return (caseItem.changes ?? []).flatMap((change) => (change.fields ?? []).map((field) => ({
    entity: change.entityLabel,
    entityId: change.entityId,
    field: field.field,
    observed: field.before ?? null,
    expected: field.after ?? null,
  })))
}

export function buildQaRuleTrace(caseItem) {
  const qa = caseItem.qaEvidence ?? {}
  const definition = RULE_DEFINITIONS[qa.viewId || caseItem.issueCode] ?? {
    predicate: qa.viewPurpose || caseItem.rationale || 'Refer to the production QA view definition for this case.',
    expectedSource: 'Production QA view definition',
  }
  const relationshipEvidence = qa.relationshipEvidence ?? {}

  return {
    kind: 'mad-qa-rule-trace',
    source: qa.controlledFault ? 'Controlled Rockport QA fixture rule definition' : 'Case QA evidence and production QA-view metadata',
    viewId: qa.viewId || caseItem.issueCode,
    ruleName: qa.viewPurpose || caseItem.issueType,
    predicate: definition.predicate,
    expectedSource: humanText(definition.expectedSource),
    status: caseItem.status === 'evidence' ? 'insufficient-evidence' : 'failed',
    selectedRecord: {
      caseId: caseItem.id,
      address: caseItem.address,
      municipality: caseItem.municipality,
      recordId: qa.selectedRecordId || featureId(caseItem, 'address-point'),
    },
    observedComparisons: changeObservations(caseItem),
    currentQaRecord: pickTraceFields(qa.currentQaRecord),
    observations: [...new Set([
      ...(qa.observations ?? []),
      ...(caseItem.evidence ?? []).map((evidence) => evidence.detail).filter(Boolean),
    ])].slice(0, 8),
    relationshipPath: relationPaths(caseItem),
    traceLimitation: qa.controlledFault
      ? 'This trace comes from a reversible training fixture. A production adapter must source the predicate and values from the live QA view.'
      : 'The trace is limited to the case snapshot and supplied QA-view evidence.',
  }
}

export function getCaseRelationshipClosure(caseItem, { anchor_feature_key: anchorFeatureKey = 'address-point' } = {}) {
  const supportedAnchors = new Set(['address-point', 'master-address', 'address-variant', 'structure', 'structure-lookup', 'parcel', 'road'])
  if (!supportedAnchors.has(anchorFeatureKey)) throw new Error('Choose a supported anchor feature from the case workspace.')
  const qa = caseItem.qaEvidence ?? {}
  const evidence = qa.relationshipEvidence ?? {}
  const variants = compactRecords(evidence.addressVariants)
  const masterAddresses = compactRecords(evidence.masterAddresses)
  const masterStreet = compactRecords(evidence.masterAddressStreet)
  const structureLookups = compactRecords(evidence.structureLookups)

  return {
    kind: 'mad-case-relationship-closure',
    source: 'Case-scoped relational export',
    anchor: {
      key: anchorFeatureKey,
      id: featureId(caseItem, anchorFeatureKey),
      address: caseItem.address,
    },
    cardinalities: {
      masterAddressCount: masterAddresses.length,
      addressVariantCount: variants.length,
      structureLookupCount: structureLookups.length,
      conflictingPointMasterCount: (evidence.conflictingPointMasters ?? []).length,
    },
    records: {
      addressPoint: pickTraceFields(evidence.addressPoint),
      masterAddresses,
      masterAddressStreet: masterStreet,
      flaggedVariant: pickTraceFields(evidence.flaggedVariant),
      addressVariants: variants,
      structureLookups,
      structure: pickTraceFields(evidence.structure),
      conflictingPointMasters: compactRecords(evidence.conflictingPointMasters),
      conflictingPointMasterStreet: compactRecords(evidence.conflictingPointMasterStreet),
      baseRangeVariants: compactRecords(evidence.baseRangeVariants),
    },
    relationshipPath: relationPaths(caseItem),
    directIssue: buildQaRuleTrace(caseItem).observedComparisons,
    limitation: 'This is relational closure for the bounded case only. It does not search or edit production MAD.',
  }
}

function addressLabel(record) {
  return [record?.FULL_NUMBE, record?.STREET_N_1].filter(Boolean).join(' ').trim()
}

function candidateScore({ positive = [], negative = [] }) {
  return Math.max(0, Math.min(100, positive.reduce((sum, item) => sum + item.weight, 0) - negative.reduce((sum, item) => sum + item.weight, 0)))
}

function addressPointCandidates(caseItem) {
  const evidence = caseItem.qaEvidence?.relationshipEvidence ?? {}
  const change = (caseItem.changes ?? []).flatMap((item) => item.fields ?? [])
    .find((field) => field.field === 'ADDRESS_POINT_ID')
  const master = evidence.masterAddressStreet?.[0] ?? evidence.masterAddresses?.[0] ?? {}
  const flagged = evidence.flaggedVariant ?? caseItem.qaEvidence?.currentQaRecord ?? {}
  const conflicting = evidence.conflictingPointMasterStreet?.[0] ?? evidence.conflictingPointMasters?.[0] ?? {}
  const expectedPoint = change?.after ?? master.ADDRESS_PO
  const observedPoint = change?.before ?? flagged.ADDRESS_PO
  const parentAddress = addressLabel(master) || caseItem.address
  const conflictingAddress = addressLabel(conflicting)

  const candidates = []
  if (expectedPoint) {
    const positive = [
      { label: `Matches parent Master Address ${master.MASTER_ADD ?? caseItem.records?.masterAddress?.id}`, weight: 70 },
      { label: `Parent address is ${parentAddress}`, weight: 30 },
    ]
    candidates.push({
      key: `address-point:${expectedPoint}`,
      candidateType: 'address-point',
      id: expectedPoint,
      score: candidateScore({ positive }),
      evidence: positive.map((item) => item.label),
      rejected: false,
    })
  }
  if (observedPoint && observedPoint !== expectedPoint) {
    const negative = [{ label: `Resolves to Master Address ${conflicting.MASTER_ADD ?? 'unknown'}${conflictingAddress ? ` (${conflictingAddress})` : ''}`, weight: 100 }]
    candidates.push({
      key: `address-point:${observedPoint}`,
      candidateType: 'address-point',
      id: observedPoint,
      score: candidateScore({ negative }),
      evidence: negative.map((item) => item.label),
      rejected: true,
    })
  }
  return candidates
}

function structureCandidates(caseItem) {
  const structureId = caseItem.records?.structure?.id
  if (!structureId) return []
  const spatial = runCaseGeospatialOperator(caseItem, {
    operation: 'intersects',
    subject_feature_key: 'address-point',
    comparison_feature_keys: ['structure', 'parcel'],
  })
  const structureResult = spatial.comparisons.find((comparison) => comparison.feature.key === 'structure')
  const parcelResult = spatial.comparisons.find((comparison) => comparison.feature.key === 'parcel')
  const lookupCount = (caseItem.qaEvidence?.relationshipEvidence?.structureLookups ?? []).length
  const positive = [
    ...(structureResult?.matches ? [{ label: 'Address point intersects the candidate structure polygon', weight: 60 }] : []),
    ...(parcelResult?.matches ? [{ label: 'Address point is inside the case parcel', weight: 20 }] : []),
    ...(lookupCount === 0 ? [{ label: 'No current lookup row exists for this point-to-structure relationship', weight: 20 }] : []),
  ]
  const negative = structureResult?.matches ? [] : [{ label: 'Address point does not intersect the candidate structure polygon', weight: 100 }]
  return [{
    key: `structure:${structureId}`,
    candidateType: 'structure',
    id: structureId,
    score: candidateScore({ positive, negative }),
    evidence: [...positive, ...negative].map((item) => item.label),
    rejected: Boolean(negative.length),
    spatialEvidence: spatial,
  }]
}

export function compareCaseCandidates(caseItem, { candidate_type: candidateType } = {}) {
  if (!['address-point', 'structure'].includes(candidateType)) {
    throw new Error('Candidate type must be address-point or structure for the current bounded case workspace.')
  }
  const candidates = candidateType === 'address-point'
    ? addressPointCandidates(caseItem)
    : structureCandidates(caseItem)
  const ranked = [...candidates].sort((left, right) => right.score - left.score)

  return {
    kind: 'mad-case-candidate-comparison',
    source: 'Case-scoped relational and vector evidence',
    candidateType,
    candidates: ranked,
    recommendedCandidate: ranked.find((candidate) => !candidate.rejected) ?? null,
    limitation: 'Candidates are limited to the bounded case closure. A production implementation should add an AOI-backed candidate search before using this as a statewide decision service.',
  }
}
