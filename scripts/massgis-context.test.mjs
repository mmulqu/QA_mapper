import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMassgisQueryUrl,
  createMassgisContextService,
  MASSGIS_CONTEXT_LAYERS,
  parseMassgisContextRequest,
} from './massgis-context.mjs'

test('accepts only bounded Massachusetts context requests and allow-listed layers', () => {
  const request = parseMassgisContextRequest(new URLSearchParams({
    bbox: '-70.630,42.650,-70.615,42.662',
    zoom: '18',
    layers: 'parcels,structures,addresses,parcels',
  }))

  assert.deepEqual(request, {
    bbox: [-70.63, 42.65, -70.615, 42.662],
    zoom: 18,
    layerIds: ['parcels', 'structures', 'addresses'],
  })
  assert.throws(
    () => parseMassgisContextRequest(new URLSearchParams({
      bbox: '-71.4,41.5,-70.5,42.5',
      zoom: '18',
    })),
    /bbox is too large/,
  )
  assert.throws(
    () => parseMassgisContextRequest(new URLSearchParams({
      bbox: '-70.630,42.650,-70.615,42.662',
      zoom: '18',
      layers: 'client-supplied-url',
    })),
    /Unsupported MassGIS context layer/,
  )
})

test('builds a fixed ArcGIS envelope query with allow-listed fields and a bounded result count', () => {
  const url = new URL(buildMassgisQueryUrl(
    MASSGIS_CONTEXT_LAYERS.parcels,
    [-70.63, 42.65, -70.615, 42.662],
  ))

  assert.equal(url.origin, 'https://services1.arcgis.com')
  assert.equal(url.searchParams.get('geometryType'), 'esriGeometryEnvelope')
  assert.equal(url.searchParams.get('inSR'), '4326')
  assert.equal(url.searchParams.get('outSR'), '4326')
  assert.equal(url.searchParams.get('resultRecordCount'), '751')
  assert.equal(
    url.searchParams.get('outFields'),
    MASSGIS_CONTEXT_LAYERS.parcels.fields.join(','),
  )
  assert.match(url.searchParams.get('outFields'), /FULL_STR/)
  assert.doesNotMatch(url.searchParams.get('outFields'), /OWNER1|OWN_ADDR/)
})

test('shares cached bounded results and reports truncation without returning more than the cap', async () => {
  let calls = 0
  const service = createMassgisContextService({
    now: () => Date.parse('2026-07-26T18:00:00.000Z'),
    fetchImpl: async () => {
      calls += 1
      return {
        ok: true,
        status: 200,
        json: async () => ({
          type: 'FeatureCollection',
          features: Array.from({ length: 751 }, (_, index) => ({
            type: 'Feature',
            id: index + 1,
            geometry: { type: 'Point', coordinates: [-70.62, 42.656] },
            properties: { OBJECTID: index + 1 },
          })),
        }),
      }
    },
  })
  const request = {
    bbox: [-70.63, 42.65, -70.615, 42.662],
    zoom: 18,
    layerIds: ['parcels'],
  }

  const first = await service.getContext(request)
  const second = await service.getContext(request)

  assert.equal(calls, 1)
  assert.equal(first.layers[0].featureCount, 750)
  assert.equal(first.layers[0].truncated, true)
  assert.equal(first.layers[0].cacheHit, false)
  assert.equal(second.layers[0].cacheHit, true)
})

test('returns successful layers when one public service is temporarily unavailable', async () => {
  const service = createMassgisContextService({
    fetchImpl: async (url) => {
      if (url.includes('Building_Structures')) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { message: 'maintenance' } }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ type: 'FeatureCollection', features: [] }),
      }
    },
  })

  const result = await service.getContext({
    bbox: [-70.63, 42.65, -70.615, 42.662],
    zoom: 18,
    layerIds: ['parcels', 'structures', 'addresses'],
  })

  assert.deepEqual(result.layers.map((layer) => layer.id), ['parcels', 'addresses'])
  assert.deepEqual(result.errors, [{
    layerId: 'structures',
    message: 'MassGIS structures service failed: maintenance',
  }])
})
