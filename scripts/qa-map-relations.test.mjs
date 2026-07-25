import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildQaMapPreviewDescriptor,
  getQaMapRelationRule,
} from './qa-map-relations.mjs'

test('maps nonspatial BRV rows to base street arcs through BASE_SEGMENT_ID', () => {
  const rule = getQaMapRelationRule('BASE_RANGE_VARIANT')

  assert.equal(rule.qaEntity, 'MAD_BASE_RANGE_VARIANTS')
  assert.equal(rule.anchorEntity, 'MAD_BASE_STREET_ARC')
  assert.equal(rule.anchorLayer, 'roads')
  assert.deepEqual(rule.path, [{
    from: 'MAD_BASE_RANGE_VARIANTS.BASE_SEGMENT_ID',
    to: 'MAD_BASE_STREET_ARC.BASE_SEGMENT_ID',
  }])
  assert.deepEqual(rule.relevantLayers, ['roads', 'addresses', 'centroids'])
})

test('maps ASL rows to structure polygons through STRUCTURE_ID only', () => {
  const rule = getQaMapRelationRule('ADDPT_STRUCT_LUT')

  assert.equal(rule.anchorEntity, 'MAD_STRUCTURES_POLY')
  assert.equal(rule.anchorLayer, 'structures')
  assert.equal(rule.anchorLabel, 'structure polygon')
  assert.deepEqual(rule.requiredFields, ['STRUCTURE_ID'])
  assert.deepEqual(rule.path, [{
    from: 'MAD_ADDPT_STRUCT_LUT.STRUCTURE_ID',
    to: 'MAD_STRUCTURES_POLY.STRUCTURE_ID',
  }])
})

test('advertises a map only when a bounded row has real geometry and relationship keys', () => {
  const issue = {
    group: { id: 'ADDPT_STRUCT_LUT' },
  }
  const descriptor = buildQaMapPreviewDescriptor(issue, {
    center: [42.65, -70.61],
    geometry: { current: [42.65, -70.61] },
  })
  const mockDescriptor = buildQaMapPreviewDescriptor(issue, null, { mock: true })

  assert.equal(descriptor.status, 'available')
  assert.equal(descriptor.limits.bufferMeters, 120)
  assert.equal(descriptor.limits.maxTotalFeatures, 200)
  assert.equal(mockDescriptor.status, 'awaiting-record-geometry')
  assert.match(mockDescriptor.reason, /no authoritative relationship keys or geometry/)
})
