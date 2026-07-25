import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { MAP_SERVICES } from '../src/config/mapServices.js'

export const MAP_EVIDENCE_MODEL_CONTEXT = Symbol('map-evidence-model-context')

const TILE_SIZE = 256
const IMAGE_SIZE = 768
const MIN_ZOOM = 15
const MAX_ZOOM = 20
const TARGET_FILL_RATIO = 0.62
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878
const MAP_SERVICE_BY_ID = new Map(
  Object.values(MAP_SERVICES).map((service) => [service.id, service]),
)

function boundedNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, parsed))
}

function safeSegment(value, fallback = 'evidence') {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || fallback
}

function isLatLng(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]))
}

function latLng(value) {
  return [Number(value[0]), Number(value[1])]
}

function latLngs(value) {
  if (!Array.isArray(value)) return []
  return value.filter(isLatLng).map(latLng)
}

function clampLatitude(latitude) {
  return Math.min(WEB_MERCATOR_MAX_LATITUDE, Math.max(-WEB_MERCATOR_MAX_LATITUDE, latitude))
}

export function latLngToWorldPixel(position, zoom) {
  const [latitudeValue, longitudeValue] = latLng(position)
  const latitude = clampLatitude(latitudeValue)
  const scale = TILE_SIZE * (2 ** zoom)
  const sinLatitude = Math.sin(latitude * Math.PI / 180)
  return {
    x: ((longitudeValue + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale,
  }
}

export function worldPixelToLatLng(point, zoom) {
  const scale = TILE_SIZE * (2 ** zoom)
  const longitude = (point.x / scale) * 360 - 180
  const n = Math.PI - (2 * Math.PI * point.y) / scale
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(n))
  return [latitude, longitude]
}

function addressPointCoordinates(caseItem, geometryState) {
  const geometry = caseItem.geometry ?? {}
  if (geometryState === 'proposed' && isLatLng(geometry.proposed)) return [latLng(geometry.proposed)]
  if (geometryState === 'current') {
    const parts = latLngs(geometry.currentParts)
    if (parts.length) return parts
    if (isLatLng(geometry.current)) return [latLng(geometry.current)]
  }
  if (isLatLng(geometry.current)) return [latLng(geometry.current)]
  if (isLatLng(geometry.proposed)) return [latLng(geometry.proposed)]
  return []
}

function featureDefinition(caseItem, featureKey, geometryState) {
  const geometry = caseItem.geometry ?? {}
  if (featureKey === 'address-point') {
    return {
      featureKey,
      featureId: caseItem.records?.addressPoint?.id ?? 'address-point',
      label: geometryState === 'proposed' ? 'Proposed address point' : 'Current address point',
      coordinates: addressPointCoordinates(caseItem, geometryState),
      geometryType: 'point',
    }
  }
  if (featureKey === 'structure') {
    return {
      featureKey,
      featureId: caseItem.records?.structure?.id ?? 'structure',
      label: 'MAD structure',
      coordinates: latLngs(geometry.structure),
      geometryType: 'polygon',
    }
  }
  if (featureKey === 'road') {
    return {
      featureKey,
      featureId: caseItem.records?.road?.id ?? 'nearest-road-segment',
      label: 'Road segment',
      coordinates: latLngs(geometry.road),
      geometryType: 'polyline',
    }
  }
  throw new Error(`Unsupported map evidence feature: ${featureKey}`)
}

function targetCenter(coordinates, zoom) {
  const pixels = coordinates.map((position) => latLngToWorldPixel(position, zoom))
  const xs = pixels.map((point) => point.x)
  const ys = pixels.map((point) => point.y)
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  }
}

function targetFits(coordinates, zoom) {
  if (coordinates.length <= 1) return true
  const pixels = coordinates.map((position) => latLngToWorldPixel(position, zoom))
  const width = Math.max(...pixels.map((point) => point.x)) - Math.min(...pixels.map((point) => point.x))
  const height = Math.max(...pixels.map((point) => point.y)) - Math.min(...pixels.map((point) => point.y))
  return width <= IMAGE_SIZE * TARGET_FILL_RATIO && height <= IMAGE_SIZE * TARGET_FILL_RATIO
}

export function buildCaseMapViewport(caseItem, {
  featureKey,
  geometryState = 'current',
  zoom: requestedZoom,
} = {}) {
  const feature = featureDefinition(caseItem, featureKey, geometryState)
  if (!feature.coordinates.length) {
    throw new Error(`${feature.label} has no case-scoped WGS84 geometry to capture.`)
  }

  const defaultZoom = feature.geometryType === 'polyline' ? 18 : 19
  let zoom = Math.round(boundedNumber(requestedZoom, MIN_ZOOM, MAX_ZOOM, defaultZoom))
  while (zoom > MIN_ZOOM && !targetFits(feature.coordinates, zoom)) zoom -= 1

  const centerWorld = targetCenter(feature.coordinates, zoom)
  const desiredLeft = centerWorld.x - IMAGE_SIZE / 2
  const desiredTop = centerWorld.y - IMAGE_SIZE / 2
  const minTileX = Math.floor(desiredLeft / TILE_SIZE)
  const minTileY = Math.floor(desiredTop / TILE_SIZE)
  const cropLeft = Math.round(desiredLeft - minTileX * TILE_SIZE)
  const cropTop = Math.round(desiredTop - minTileY * TILE_SIZE)
  const originWorld = {
    x: minTileX * TILE_SIZE + cropLeft,
    y: minTileY * TILE_SIZE + cropTop,
  }
  const maxTileX = Math.floor((originWorld.x + IMAGE_SIZE - 1) / TILE_SIZE)
  const maxTileY = Math.floor((originWorld.y + IMAGE_SIZE - 1) / TILE_SIZE)
  const northwest = worldPixelToLatLng(originWorld, zoom)
  const southeast = worldPixelToLatLng({
    x: originWorld.x + IMAGE_SIZE,
    y: originWorld.y + IMAGE_SIZE,
  }, zoom)

  return {
    feature,
    zoom,
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    center: worldPixelToLatLng({
      x: originWorld.x + IMAGE_SIZE / 2,
      y: originWorld.y + IMAGE_SIZE / 2,
    }, zoom),
    bbox: [northwest[1], southeast[0], southeast[1], northwest[0]],
    originWorld,
    tileGrid: {
      minX: minTileX,
      minY: minTileY,
      maxX: maxTileX,
      maxY: maxTileY,
      cropLeft,
      cropTop,
    },
  }
}

function tileUrl(service, zoom, x, y) {
  return service.url
    .replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

async function fetchTile(service, zoom, x, y, fetchImpl, signal) {
  const response = await fetchImpl(tileUrl(service, zoom, x, y), { signal })
  const contentType = response.headers.get('content-type') || ''
  const buffer = Buffer.from(await response.arrayBuffer())
  const recognizedImage = contentType.startsWith('image/')
    || buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))
    || buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    || (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP')
  if (!response.ok || !recognizedImage) {
    throw new Error(`${service.label} tile ${zoom}/${x}/${y} returned ${response.status}.`)
  }
  return buffer
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function projectedPoints(coordinates, viewport) {
  return coordinates.map((position) => {
    const point = latLngToWorldPixel(position, viewport.zoom)
    return [
      Math.round((point.x - viewport.originWorld.x) * 10) / 10,
      Math.round((point.y - viewport.originWorld.y) * 10) / 10,
    ]
  })
}

function svgPath(coordinates, viewport, close = false) {
  const points = projectedPoints(coordinates, viewport)
  if (!points.length) return ''
  const path = points
    .map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`)
    .join(' ')
  return close ? `${path} Z` : path
}

function pointCircle(position, viewport, { fill, stroke, radius = 8, width = 3, opacity = 1 }) {
  if (!isLatLng(position)) return ''
  const [[x, y]] = projectedPoints([latLng(position)], viewport)
  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${width}" />`
}

export function buildMapEvidenceOverlay(caseItem, viewport, service) {
  const geometry = caseItem.geometry ?? {}
  const target = viewport.feature
  const title = `${target.label}: ${target.featureId}`
  const subtitle = `${caseItem.address}, ${caseItem.municipality}`
  const parcelPath = svgPath(latLngs(geometry.parcel), viewport, true)
  const structurePath = svgPath(latLngs(geometry.structure), viewport, true)
  const roadPath = svgPath(latLngs(geometry.road), viewport)
  const targetPath = svgPath(target.coordinates, viewport, target.geometryType === 'polygon')
  const nearby = Array.isArray(geometry.nearby) ? geometry.nearby : []
  const currentPoints = latLngs(geometry.currentParts).length
    ? latLngs(geometry.currentParts)
    : (isLatLng(geometry.current) ? [latLng(geometry.current)] : [])

  const contextShapes = [
    parcelPath
      ? `<path d="${parcelPath}" fill="#e3bb5b" fill-opacity=".07" stroke="#e3bb5b" stroke-opacity=".8" stroke-width="2" stroke-dasharray="8 6" />`
      : '',
    roadPath
      ? `<path d="${roadPath}" fill="none" stroke="#54a8d8" stroke-opacity=".8" stroke-width="5" />`
      : '',
    structurePath
      ? `<path d="${structurePath}" fill="#53c5a8" fill-opacity=".10" stroke="#53c5a8" stroke-opacity=".9" stroke-width="3" />`
      : '',
    ...nearby.map((item) => pointCircle(item.position, viewport, {
      fill: '#f7fafb',
      stroke: '#173341',
      radius: 5,
      width: 2,
      opacity: 0.9,
    })),
    ...currentPoints.map((position) => pointCircle(position, viewport, {
      fill: '#dc493f',
      stroke: '#ffffff',
      radius: 8,
      width: 3,
      opacity: 0.95,
    })),
    pointCircle(geometry.proposed, viewport, {
      fill: '#27b36a',
      stroke: '#ffffff',
      radius: 8,
      width: 3,
      opacity: 0.95,
    }),
  ].join('')

  const targetShape = target.geometryType === 'point'
    ? target.coordinates.map((position) => pointCircle(position, viewport, {
        fill: '#ffd166',
        stroke: '#1d2830',
        radius: 13,
        width: 4,
        opacity: 0.35,
      })).join('')
    : `<path d="${targetPath}" fill="${target.geometryType === 'polygon' ? '#ffd166' : 'none'}" fill-opacity=".12" stroke="#ffd166" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" />`

  return Buffer.from(`
    <svg width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}" xmlns="http://www.w3.org/2000/svg">
      ${contextShapes}
      ${targetShape}
      <g font-family="Arial, Helvetica, sans-serif">
        <rect x="16" y="16" width="500" height="70" rx="8" fill="#102630" fill-opacity=".88" />
        <text x="32" y="45" font-size="19" font-weight="700" fill="#ffffff">${escapeXml(title)}</text>
        <text x="32" y="69" font-size="15" fill="#dce9ee">${escapeXml(subtitle)}</text>
        <rect x="16" y="${viewport.height - 48}" width="600" height="32" rx="7" fill="#102630" fill-opacity=".86" />
        <circle cx="34" cy="${viewport.height - 32}" r="6" fill="#dc493f" stroke="#fff" stroke-width="1.5" />
        <text x="47" y="${viewport.height - 27}" font-size="13" fill="#ffffff">current</text>
        <circle cx="113" cy="${viewport.height - 32}" r="6" fill="#27b36a" stroke="#fff" stroke-width="1.5" />
        <text x="126" y="${viewport.height - 27}" font-size="13" fill="#ffffff">proposed</text>
        <circle cx="210" cy="${viewport.height - 32}" r="7" fill="#ffd166" fill-opacity=".5" stroke="#1d2830" stroke-width="2" />
        <text x="224" y="${viewport.height - 27}" font-size="13" fill="#ffffff">selected feature</text>
        <text x="350" y="${viewport.height - 27}" font-size="13" fill="#dce9ee">${escapeXml(service.label)} · z${viewport.zoom}</text>
      </g>
    </svg>
  `)
}

function publicAttribution(service) {
  return service.id === MAP_SERVICES.massgis2025Imagery.id
    ? 'MassGIS 2025 aerial imagery'
    : 'MassGIS basemap'
}

export function createMapEvidenceModelMessage({ publicResult, dataUrl }) {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: [
          `Controlled visual evidence for active case ${publicResult.caseId}.`,
          `The attached ${publicResult.basemap.label} snapshot is centered on ${publicResult.feature.label} ${publicResult.feature.id}.`,
          'Inspect the image as supporting visual evidence only. Vector records and relationship tools remain authoritative for identifiers, geometry coordinates, and edits; never estimate an edit coordinate from pixels.',
          `Saved evidence record: ${publicResult.image.relativePath}.`,
        ].join(' '),
      },
      {
        type: 'image_url',
        image_url: { url: dataUrl },
      },
    ],
  }
}

export async function captureCaseMapEvidence(caseItem, {
  featureKey,
  geometryState = 'current',
  basemapId = MAP_SERVICES.massgis2025Imagery.id,
  zoom,
  outputDirectory,
  relativeDirectory = '.runtime\\map-evidence',
  fetchImpl = fetch,
  signal,
} = {}) {
  const service = MAP_SERVICE_BY_ID.get(basemapId)
  if (!service) throw new Error(`Unsupported map evidence background: ${basemapId}`)
  if (!outputDirectory) throw new Error('A controlled map-evidence output directory is required.')

  const viewport = buildCaseMapViewport(caseItem, { featureKey, geometryState, zoom })
  const { tileGrid } = viewport
  const tileRequests = []
  for (let y = tileGrid.minY; y <= tileGrid.maxY; y += 1) {
    for (let x = tileGrid.minX; x <= tileGrid.maxX; x += 1) {
      tileRequests.push({ x, y })
    }
  }
  const tiles = await Promise.all(tileRequests.map(async ({ x, y }) => ({
    x,
    y,
    input: await fetchTile(service, viewport.zoom, x, y, fetchImpl, signal),
  })))

  const mosaicWidth = (tileGrid.maxX - tileGrid.minX + 1) * TILE_SIZE
  const mosaicHeight = (tileGrid.maxY - tileGrid.minY + 1) * TILE_SIZE
  const mosaic = await sharp({
    create: {
      width: mosaicWidth,
      height: mosaicHeight,
      channels: 4,
      background: { r: 227, g: 234, b: 237, alpha: 1 },
    },
  })
    .composite(tiles.map((tile) => ({
      input: tile.input,
      left: (tile.x - tileGrid.minX) * TILE_SIZE,
      top: (tile.y - tileGrid.minY) * TILE_SIZE,
    })))
    .png()
    .toBuffer()

  const overlay = buildMapEvidenceOverlay(caseItem, viewport, service)
  const image = await sharp(mosaic)
    .extract({
      left: tileGrid.cropLeft,
      top: tileGrid.cropTop,
      width: viewport.width,
      height: viewport.height,
    })
    .composite([{ input: overlay, left: 0, top: 0 }])
    .png()
    .toBuffer()

  mkdirSync(outputDirectory, { recursive: true })
  const filename = [
    safeSegment(caseItem.id, 'case'),
    safeSegment(featureKey, 'feature'),
    safeSegment(geometryState, 'state'),
    safeSegment(service.id, 'map'),
    new Date().toISOString().replaceAll(':', '').replaceAll('.', ''),
  ].join('_') + '.png'
  const absolutePath = join(outputDirectory, filename)
  writeFileSync(absolutePath, image)
  const relativePath = `${relativeDirectory}\\${filename}`
  const publicResult = {
    kind: 'mad-map-evidence',
    caseId: caseItem.id,
    feature: {
      key: viewport.feature.featureKey,
      id: viewport.feature.featureId,
      label: viewport.feature.label,
      geometryState,
    },
    basemap: {
      id: service.id,
      label: publicAttribution(service),
    },
    viewport: {
      center: viewport.center,
      bbox: viewport.bbox,
      zoom: viewport.zoom,
      wkid: 4326,
    },
    image: {
      mimeType: 'image/png',
      width: viewport.width,
      height: viewport.height,
      byteLength: image.byteLength,
      relativePath,
    },
    contextAttached: true,
    caution: 'Use the image for visual interpretation; use case vector records for exact geometry and identifiers.',
  }
  const result = { ...publicResult }
  Object.defineProperty(result, MAP_EVIDENCE_MODEL_CONTEXT, {
    value: createMapEvidenceModelMessage({
      publicResult,
      dataUrl: `data:image/png;base64,${image.toString('base64')}`,
    }),
    enumerable: false,
  })
  Object.defineProperty(result, 'absolutePath', {
    value: absolutePath,
    enumerable: false,
  })
  return result
}
