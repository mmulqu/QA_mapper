import assert from 'node:assert/strict'
import test from 'node:test'
import { listCaseGeometries, runCaseGeospatialOperator } from './case-geospatial.mjs'

const caseItem = {
  geometry: {
    current: [42.0, -70.0],
    proposed: [42.0004, -70.0004],
    structure: [
      [41.9998, -70.0002],
      [41.9998, -69.9998],
      [42.0002, -69.9998],
      [42.0002, -70.0002],
      [41.9998, -70.0002],
    ],
    parcel: [
      [41.9995, -70.0005],
      [41.9995, -69.9995],
      [42.0005, -69.9995],
      [42.0005, -70.0005],
      [41.9995, -70.0005],
    ],
    road: [
      [41.9996, -70.0006],
      [42.0004, -69.9994],
    ],
    nearby: [{ id: 'AP-NEARBY', position: [42.0007, -70.0] }],
  },
}

test('lists only case-scoped geometries for the local agent', () => {
  const features = listCaseGeometries(caseItem)

  assert.deepEqual(features.map((feature) => feature.key), [
    'address-point', 'structure', 'parcel', 'road', 'nearby:AP-NEARBY',
  ])
  assert.equal(features.find((feature) => feature.key === 'structure').geometryType, 'Polygon')
})

test('evaluates point-polygon relationships and distances with explicit selected features', () => {
  const intersects = runCaseGeospatialOperator(caseItem, {
    operation: 'intersects',
    subject_feature_key: 'address-point',
    comparison_feature_keys: ['structure', 'parcel'],
  })
  const distance = runCaseGeospatialOperator(caseItem, {
    operation: 'within_distance',
    subject_feature_key: 'address-point',
    comparison_feature_keys: ['nearby:AP-NEARBY'],
    distance_meters: 100,
  })

  assert.equal(intersects.comparisons[0].matches, true)
  assert.equal(intersects.comparisons[1].matches, true)
  assert.equal(distance.comparisons[0].matches, true)
  assert.ok(distance.comparisons[0].distanceMeters > 0)
  assert.ok(distance.comparisons[0].distanceMeters < 100)
})

test('does not accept unknown or duplicated case features', () => {
  assert.throws(() => runCaseGeospatialOperator(caseItem, {
    operation: 'intersects',
    subject_feature_key: 'address-point',
    comparison_feature_keys: ['not-in-case'],
  }), /not available/)
  assert.throws(() => runCaseGeospatialOperator(caseItem, {
    operation: 'intersects',
    subject_feature_key: 'address-point',
    comparison_feature_keys: ['structure', 'structure'],
  }), /unique/)
})
