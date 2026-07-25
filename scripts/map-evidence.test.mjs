import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { cases } from '../src/data/cases.js'
import {
  buildCaseMapViewport,
  captureCaseMapEvidence,
  MAP_EVIDENCE_MODEL_CONTEXT,
} from './map-evidence.mjs'

test('builds a bounded viewport around only the requested case feature', () => {
  const viewport = buildCaseMapViewport(cases[0], {
    featureKey: 'structure',
    geometryState: 'current',
    zoom: 20,
  })

  assert.equal(viewport.feature.featureId, 'STR-44108')
  assert.equal(viewport.width, 768)
  assert.equal(viewport.height, 768)
  assert.ok(viewport.zoom >= 15 && viewport.zoom <= 20)
  assert.equal(viewport.bbox.length, 4)
  assert.ok(viewport.bbox[0] < viewport.bbox[2])
  assert.ok(viewport.bbox[1] < viewport.bbox[3])
})

test('renders case vectors over tiles and creates a provider-neutral image message', async () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'mad-map-evidence-'))
  const resolvedTemporaryDirectory = resolve(temporaryDirectory)
  const tile = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 92, g: 112, b: 121 },
    },
  }).jpeg().toBuffer()
  const requestedTiles = []

  try {
    const result = await captureCaseMapEvidence(cases[0], {
      featureKey: 'road',
      geometryState: 'current',
      basemapId: 'massgis-basemap',
      zoom: 18,
      outputDirectory: resolvedTemporaryDirectory,
      relativeDirectory: '.runtime\\map-evidence-test',
      fetchImpl: async (url) => {
        requestedTiles.push(url)
        return new Response(tile, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        })
      },
    })
    const modelMessage = result[MAP_EVIDENCE_MODEL_CONTEXT]

    assert.ok(requestedTiles.length >= 9)
    assert.ok(requestedTiles.every((url) => /\/tile\/\d+\/\d+\/\d+$/.test(url)))
    assert.equal(result.contextAttached, true)
    assert.equal(result.feature.key, 'road')
    assert.equal(existsSync(result.absolutePath), true)
    assert.deepEqual(modelMessage.content.map((part) => part.type), ['text', 'image_url'])
    assert.match(modelMessage.content[1].image_url.url, /^data:image\/png;base64,/)
    assert.equal(JSON.stringify(result).includes('data:image/png'), false)
    assert.equal(JSON.stringify(result).includes(resolvedTemporaryDirectory), false)

    const metadata = await sharp(result.absolutePath).metadata()
    assert.deepEqual([metadata.width, metadata.height, metadata.format], [768, 768, 'png'])
  } finally {
    if (!resolvedTemporaryDirectory.startsWith(resolve(tmpdir()))) {
      throw new Error('Refusing to clean a map-evidence test directory outside the system temp folder.')
    }
    rmSync(resolvedTemporaryDirectory, { recursive: true, force: true })
  }
})
