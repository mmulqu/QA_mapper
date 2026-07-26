import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { loadQaCatalog } from './qa-workflow.mjs'

const PROJECT_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)))
export const QA_ATLAS_DIRECTORY = resolve(PROJECT_ROOT, '.runtime', 'qa-atlas')
export const QA_ATLAS_MANIFEST_PATH = resolve(QA_ATLAS_DIRECTORY, 'manifest.json')
const FIXTURE_ADAPTER = resolve(PROJECT_ROOT, 'scripts', 'mad_fixture_adapter.py')
const SOURCE_LAYER = 'qa_issues'

function runProcess(command, args, { cwd = PROJECT_ROOT } = {}) {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolveProcess({ stdout, stderr })
        return
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}.`))
    })
  })
}

async function loadFixtureCases(viewId) {
  const python = process.env.MAD_AGENT_PYTHON || 'python'
  const { stdout } = await runProcess(python, [
    FIXTURE_ADAPTER,
    'investigate',
    '--view-id',
    viewId,
  ])
  const payload = JSON.parse(stdout.trim())
  if (!payload.ok) throw new Error(payload.error || `Could not load ${viewId}.`)
  return payload.result?.cases ?? []
}

function latLngToGeoJson(position) {
  return [Number(position[1]), Number(position[0])]
}

function validPosition(position) {
  return Array.isArray(position)
    && position.length >= 2
    && Number.isFinite(Number(position[0]))
    && Number.isFinite(Number(position[1]))
}

function geometryForCase(caseItem) {
  const geometry = caseItem.geometry ?? {}
  const anchorLayer = caseItem.qaEvidence?.mapRelation?.anchorLayer ?? 'addresses'

  if (anchorLayer === 'structures' && Array.isArray(geometry.structure) && geometry.structure.length >= 4) {
    return {
      geometry: {
        type: 'Polygon',
        coordinates: [geometry.structure.filter(validPosition).map(latLngToGeoJson)],
      },
      kind: 'polygon',
      anchorLayer,
    }
  }

  if (anchorLayer === 'parcels' && Array.isArray(geometry.parcel) && geometry.parcel.length >= 4) {
    return {
      geometry: {
        type: 'Polygon',
        coordinates: [geometry.parcel.filter(validPosition).map(latLngToGeoJson)],
      },
      kind: 'polygon',
      anchorLayer,
    }
  }

  if (anchorLayer === 'roads' && Array.isArray(geometry.road) && geometry.road.length >= 2) {
    return {
      geometry: {
        type: 'LineString',
        coordinates: geometry.road.filter(validPosition).map(latLngToGeoJson),
      },
      kind: 'line',
      anchorLayer,
    }
  }

  const points = Array.isArray(geometry.currentParts)
    ? geometry.currentParts.filter(validPosition)
    : []
  if (points.length > 1) {
    return {
      geometry: { type: 'MultiPoint', coordinates: points.map(latLngToGeoJson) },
      kind: 'point',
      anchorLayer,
    }
  }

  const point = validPosition(geometry.current)
    ? geometry.current
    : validPosition(caseItem.center)
      ? caseItem.center
      : null
  if (!point) return null
  return {
    geometry: { type: 'Point', coordinates: latLngToGeoJson(point) },
    kind: 'point',
    anchorLayer,
  }
}

function flattenCoordinates(coordinates, output = []) {
  if (
    Array.isArray(coordinates)
    && coordinates.length >= 2
    && Number.isFinite(coordinates[0])
    && Number.isFinite(coordinates[1])
  ) {
    output.push(coordinates)
    return output
  }
  for (const child of coordinates ?? []) flattenCoordinates(child, output)
  return output
}

function representativePoint(geometry) {
  const coordinates = flattenCoordinates(geometry.coordinates)
  if (!coordinates.length) return null
  const sums = coordinates.reduce(
    (current, coordinate) => [current[0] + coordinate[0], current[1] + coordinate[1]],
    [0, 0],
  )
  return [sums[0] / coordinates.length, sums[1] / coordinates.length]
}

export function buildQaAtlasFeature(issue, caseItem) {
  const resolved = geometryForCase(caseItem)
  if (!resolved) return null
  const relationship = caseItem.qaEvidence?.mapRelation?.description
    || caseItem.qaEvidence?.mapRelation?.path?.map((step) => `${step.from} → ${step.to}`).join(' · ')
    || 'QA record geometry'
  return {
    type: 'Feature',
    id: caseItem.id,
    geometry: resolved.geometry,
    properties: {
      issue_id: caseItem.id,
      view_id: issue.id,
      record_id: caseItem.id,
      category: issue.group.label,
      category_id: issue.group.id,
      description: issue.description,
      address: caseItem.address,
      municipality: caseItem.municipality,
      severity: caseItem.priority || 'Review',
      source_label: caseItem.reportedBy || 'MAD QA source',
      anchor_layer: resolved.anchorLayer,
      geometry_kind: resolved.kind,
      relationship,
      statewide_count: issue.count,
      runnable: 1,
      publish_eligible: caseItem.publishEligible ? 1 : 0,
    },
  }
}

function calculateBounds(features) {
  const coordinates = features.flatMap((feature) => flattenCoordinates(feature.geometry.coordinates))
  if (!coordinates.length) return null
  return coordinates.reduce(
    (bounds, coordinate) => [
      Math.min(bounds[0], coordinate[0]),
      Math.min(bounds[1], coordinate[1]),
      Math.max(bounds[2], coordinate[0]),
      Math.max(bounds[3], coordinate[1]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
}

function buildVersion(date) {
  return date.toISOString().replaceAll(/[-:.TZ]/g, '')
}

export async function buildQaIssueAtlas({
  outputDirectory = QA_ATLAS_DIRECTORY,
  catalog = loadQaCatalog(),
  loadCases = loadFixtureCases,
  now = new Date(),
} = {}) {
  mkdirSync(outputDirectory, { recursive: true })
  const issues = catalog.groups.flatMap((group) => (
    group.issues.map((issue) => ({
      ...issue,
      group: { id: group.id, label: group.label, ordinal: group.ordinal },
    }))
  ))
  const supportedIssues = issues.filter((issue) => issue.localFixture)
  const features = []
  for (const issue of supportedIssues) {
    const cases = await loadCases(issue.id)
    for (const caseItem of cases) {
      const feature = buildQaAtlasFeature(issue, caseItem)
      if (feature) features.push(feature)
    }
  }

  const version = buildVersion(now)
  const geoJsonName = `issues-${version}.geojson`
  const geoJsonPath = resolve(outputDirectory, geoJsonName)
  const temporaryGeoJsonPath = `${geoJsonPath}.tmp`
  const featureCollection = { type: 'FeatureCollection', features }
  writeFileSync(temporaryGeoJsonPath, JSON.stringify(featureCollection))
  renameSync(temporaryGeoJsonPath, geoJsonPath)

  const categoryCounts = Object.fromEntries(
    [...new Set(features.map((feature) => feature.properties.category))].map((category) => [
      category,
      features.filter((feature) => feature.properties.category === category).length,
    ]),
  )
  const manifest = {
    kind: 'mad-qa-issue-atlas',
    version,
    generatedAt: now.toISOString(),
    sourceGeneratedAt: catalog.generatedAt,
    source: catalog.source,
    provider: 'rockport-fixture',
    sourceLayer: SOURCE_LAYER,
    dataFormat: 'geojson',
    dataFile: geoJsonName,
    dataBytes: statSync(geoJsonPath).size,
    featureCollection,
    featureCount: features.length,
    issueCount: new Set(features.map((feature) => feature.properties.view_id)).size,
    categoryCounts,
    bounds: calculateBounds(features),
    scopeNote: 'This local atlas contains only Rockport QA rows backed by the current extract and controlled fault fixtures. Production refreshes will read the live QA SQL views.',
    refreshNote: 'A proposal remains visible until the refreshed authoritative QA source no longer returns its record.',
    items: features.slice(0, 250).map((feature) => ({
      ...feature.properties,
      center: representativePoint(feature.geometry),
    })),
  }
  const manifestTemporaryPath = resolve(outputDirectory, 'manifest.json.tmp')
  writeFileSync(manifestTemporaryPath, JSON.stringify(manifest, null, 2))
  renameSync(manifestTemporaryPath, resolve(outputDirectory, 'manifest.json'))
  return manifest
}

export function readQaIssueAtlasManifest() {
  if (!existsSync(QA_ATLAS_MANIFEST_PATH)) return null
  return JSON.parse(readFileSync(QA_ATLAS_MANIFEST_PATH, 'utf8'))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildQaIssueAtlas()
    .then((manifest) => process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`)
      process.exitCode = 1
    })
}
