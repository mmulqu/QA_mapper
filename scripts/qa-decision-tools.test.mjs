import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildQaRuleTrace,
  compareCaseCandidates,
  getCaseRelationshipClosure,
} from './qa-decision-tools.mjs'

const avCase = {
  id: 'MADV_QA_AV_APID_MISMATCH-FAULT-AV-POINT-LINK-MISMATCH',
  address: '1 Ridgewood Road',
  municipality: 'Rockport',
  issueCode: 'MADV_QA_AV_APID_MISMATCH',
  issueType: 'Address Variant point-link mismatch',
  status: 'ready',
  changes: [{
    entityLabel: 'Address Variant',
    entityId: '{7A29EAB9-D607-4AAE-935F-091247BB5DE8}',
    fields: [{
      field: 'ADDRESS_POINT_ID',
      before: 'M_273925_934533',
      after: 'M_273118_932155',
    }],
  }],
  records: {
    addressPoint: { id: 'M_273118_932155' },
    masterAddress: { id: '17933' },
    variant: { id: '{7A29EAB9-D607-4AAE-935F-091247BB5DE8}' },
  },
  qaEvidence: {
    viewId: 'MADV_QA_AV_APID_MISMATCH',
    controlledFault: true,
    selectedRecordId: '{7A29EAB9-D607-4AAE-935F-091247BB5DE8}',
    observations: ['The variant ADDRESS_POINT_ID differs from the parent Master Address point.'],
    currentQaRecord: { ADDRESS_VA: '{7A29EAB9-D607-4AAE-935F-091247BB5DE8}', MASTER_ADD: 17933, ADDRESS_PO: 'M_273925_934533' },
    mapRelation: {
      path: [
        { from: 'MAD_ADDRESS_VARIANTS.MASTER_ADDRESS_ID', to: 'MAD_MASTER_ADDRESS.MASTER_ADDRESS_ID' },
        { from: 'MAD_MASTER_ADDRESS.ADDRESS_POINT_ID', to: 'MAD_ADDRESS_POINTM.ADDRESS_POINT_ID' },
      ],
    },
    relationshipEvidence: {
      flaggedVariant: { MASTER_ADD: 17933, ADDRESS_PO: 'M_273925_934533' },
      masterAddresses: [{ MASTER_ADD: 17933, ADDRESS_PO: 'M_273118_932155' }],
      masterAddressStreet: [{ MASTER_ADD: 17933, ADDRESS_PO: 'M_273118_932155', FULL_NUMBE: '1', STREET_N_1: 'RIDGEWOOD ROAD' }],
      conflictingPointMasters: [{ MASTER_ADD: 18975, ADDRESS_PO: 'M_273925_934533' }],
      conflictingPointMasterStreet: [{ MASTER_ADD: 18975, ADDRESS_PO: 'M_273925_934533', FULL_NUMBE: '33', STREET_N_1: 'STRAITSMOUTH WAY' }],
      addressVariants: [{ ADDRESS_VA: '{7A29EAB9-D607-4AAE-935F-091247BB5DE8}', MASTER_ADD: 17933, ADDRESS_PO: 'M_273925_934533' }],
    },
  },
}

const apCase = {
  id: 'MADV_QA_AP_NO_STRUCT_LUT-FAULT-AP-MISSING-STRUCTURE-LOOKUP',
  address: '10 Railroad Avenue',
  municipality: 'Rockport',
  issueCode: 'MADV_QA_AP_NO_STRUCT_LUT',
  issueType: 'Building address point missing its structure lookup',
  status: 'ready',
  records: {
    addressPoint: { id: 'M_271811_934261' },
    structure: { id: '271811_934261' },
    masterAddress: { id: '18001' },
  },
  geometry: {
    current: [42.0, -70.0],
    structure: [
      [41.9998, -70.0002], [41.9998, -69.9998], [42.0002, -69.9998],
      [42.0002, -70.0002], [41.9998, -70.0002],
    ],
    parcel: [
      [41.9995, -70.0005], [41.9995, -69.9995], [42.0005, -69.9995],
      [42.0005, -70.0005], [41.9995, -70.0005],
    ],
  },
  qaEvidence: {
    viewId: 'MADV_QA_AP_NO_STRUCT_LUT',
    relationshipEvidence: {
      addressPoint: { ADDRESS_PO: 'M_271811_934261', BUILDING_C: 1, LOC_ID: 'ROCKPORT-10-RAILROAD' },
      masterAddresses: [{ MASTER_ADD: 18001, ADDRESS_PO: 'M_271811_934261', FULL_NUMBE: '10', STREET_N_1: 'RAILROAD AVENUE' }],
      structureLookups: [],
      structure: { STRUCTURE_: '271811_934261', LOC_ID: 'ROCKPORT-10-RAILROAD' },
    },
  },
}

test('traces the AV predicate and reports exact observed and expected point identifiers', () => {
  const trace = buildQaRuleTrace(avCase)

  assert.equal(trace.kind, 'mad-qa-rule-trace')
  assert.match(trace.predicate, /ADDRESS_POINT_ID must agree/)
  assert.deepEqual(trace.observedComparisons, [{
    entity: 'Address Variant',
    entityId: '{7A29EAB9-D607-4AAE-935F-091247BB5DE8}',
    field: 'ADDRESS_POINT_ID',
    observed: 'M_273925_934533',
    expected: 'M_273118_932155',
  }])
  assert.equal(trace.currentQaRecord.ADDRESS_PO, 'M_273925_934533')
  assert.ok(trace.relationshipPath.some((path) => path.from === 'MAD_ADDRESS_VARIANTS.MASTER_ADDRESS_ID'))
})

test('returns bounded relational closure instead of a statewide relationship search', () => {
  const closure = getCaseRelationshipClosure(avCase, { anchor_feature_key: 'address-variant' })

  assert.equal(closure.anchor.id, '{7A29EAB9-D607-4AAE-935F-091247BB5DE8}')
  assert.equal(closure.cardinalities.masterAddressCount, 1)
  assert.equal(closure.cardinalities.conflictingPointMasterCount, 1)
  assert.equal(closure.records.conflictingPointMasterStreet[0].STREET_N_1, 'STRAITSMOUTH WAY')
  assert.match(closure.limitation, /bounded case only/)
})

test('ranks the parent address point above the conflicting point for an AV mismatch', () => {
  const comparison = compareCaseCandidates(avCase, { candidate_type: 'address-point' })

  assert.equal(comparison.recommendedCandidate.id, 'M_273118_932155')
  assert.equal(comparison.recommendedCandidate.score, 100)
  assert.equal(comparison.candidates[1].id, 'M_273925_934533')
  assert.equal(comparison.candidates[1].rejected, true)
  assert.match(comparison.candidates[1].evidence[0], /18975/)
})

test('uses the vector operator when ranking the AP structure candidate', () => {
  const comparison = compareCaseCandidates(apCase, { candidate_type: 'structure' })
  const candidate = comparison.recommendedCandidate

  assert.equal(candidate.id, '271811_934261')
  assert.equal(candidate.score, 100)
  assert.equal(candidate.spatialEvidence.comparisons.find((item) => item.feature.key === 'structure').matches, true)
  assert.equal(candidate.spatialEvidence.comparisons.find((item) => item.feature.key === 'parcel').matches, true)
})
