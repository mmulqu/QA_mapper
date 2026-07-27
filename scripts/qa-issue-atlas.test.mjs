import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  buildQaAtlasFeature,
  buildQaIssueAtlas,
} from './qa-issue-atlas.mjs'

const issue = {
  id: 'MADV_QA_AP_TEST',
  count: 4,
  group: { id: 'ADDRESS_POINTM', label: 'Address points' },
}

test('buildQaAtlasFeature converts Leaflet point coordinates to GeoJSON order', () => {
  const feature = buildQaAtlasFeature(issue, {
    id: 'CASE-1',
    address: '10 Railroad Avenue',
    municipality: 'Rockport',
    priority: 'High',
    center: [42.65, -70.62],
    geometry: { current: [42.655, -70.624] },
    qaEvidence: {
      mapRelation: {
        anchorLayer: 'addresses',
        description: 'MAD_ADDRESS_POINTM supplies its own geometry.',
      },
    },
  })

  assert.deepEqual(feature.geometry, {
    type: 'Point',
    coordinates: [-70.624, 42.655],
  })
  assert.equal(feature.properties.record_id, 'CASE-1')
  assert.equal(feature.properties.geometry_kind, 'point')
})

test('buildQaAtlasFeature uses the related structure polygon when it is the QA anchor', () => {
  const feature = buildQaAtlasFeature(issue, {
    id: 'CASE-STRUCTURE',
    address: '1 Main Street',
    municipality: 'Rockport',
    geometry: {
      structure: [
        [42.0, -70.0],
        [42.0, -70.1],
        [42.1, -70.1],
        [42.0, -70.0],
      ],
    },
    qaEvidence: { mapRelation: { anchorLayer: 'structures' } },
  })

  assert.equal(feature.geometry.type, 'Polygon')
  assert.deepEqual(feature.geometry.coordinates[0][0], [-70, 42])
  assert.equal(feature.properties.anchor_layer, 'structures')
})

test('buildQaIssueAtlas writes versioned GeoJSON and a reviewer manifest', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mad-qa-atlas-'))
  try {
    const manifest = await buildQaIssueAtlas({
      outputDirectory: directory,
      now: new Date('2026-07-26T16:20:30.123Z'),
      catalog: {
        source: 'qa.txt',
        generatedAt: '2026-07-26T15:00:00Z',
        groups: [{
          id: 'ADDRESS_POINTM',
          label: 'Address points',
          ordinal: 1,
          issues: [{ ...issue, group: undefined, localFixture: { town: 'Rockport' } }],
        }],
      },
      loadCases: async () => [{
        id: 'CASE-1',
        address: '10 Railroad Avenue',
        municipality: 'Rockport',
        priority: 'High',
        publishEligible: false,
        center: [42.655, -70.624],
        geometry: { current: [42.655, -70.624] },
        qaEvidence: { mapRelation: { anchorLayer: 'addresses' } },
      }],
    })

    assert.equal(manifest.version, '20260726162030123')
    assert.equal(manifest.featureCount, 1)
    assert.equal(manifest.issueCount, 1)
    assert.equal(manifest.dataFormat, 'geojson')
    assert.equal(manifest.featureCollection.features.length, 1)
    assert.equal(manifest.items[0].record_id, 'CASE-1')
    assert.deepEqual(manifest.bounds, [-70.624, 42.655, -70.624, 42.655])
    assert.equal(readFileSync(join(directory, 'issues-20260726162030123.geojson'), 'utf8').includes('CASE-1'), true)
    assert.equal(readFileSync(join(directory, 'manifest.json'), 'utf8').includes('"dataFormat": "geojson"'), true)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('buildQaIssueAtlas writes an empty feature collection when the refreshed QA source is clean', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mad-qa-atlas-empty-'))
  try {
    const manifest = await buildQaIssueAtlas({
      outputDirectory: directory,
      now: new Date('2026-07-26T17:00:00.000Z'),
      catalog: {
        source: 'qa.txt',
        generatedAt: '2026-07-26T17:00:00Z',
        groups: [],
      },
    })

    assert.equal(manifest.featureCount, 0)
    assert.equal(manifest.issueCount, 0)
    assert.equal(manifest.bounds, null)
    assert.deepEqual(manifest.items, [])
    assert.deepEqual(manifest.featureCollection.features, [])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
