const MASSACHUSETTS_EXTENT = Object.freeze({
  west: -73.6,
  south: 41,
  east: -69.7,
  north: 43.1,
})

const MAX_BBOX_WIDTH_DEGREES = 0.08
const MAX_BBOX_HEIGHT_DEGREES = 0.06
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 15_000

export const MASSGIS_CONTEXT_LAYERS = Object.freeze({
  parcels: Object.freeze({
    id: 'parcels',
    label: 'MassGIS L3 parcels',
    sourceLabel: 'MassGIS Massachusetts Property Tax Parcels',
    sourceUrl: 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0',
    queryUrl: 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0/query',
    objectIdField: 'OBJECTID',
    fields: [
      'OBJECTID',
      'MAP_PAR_ID',
      'LOC_ID',
      'POLY_TYPE',
      'MAP_NO',
      'SOURCE',
      'PLAN_ID',
      'LAST_EDIT',
      'TOWN_ID',
      'PROP_ID',
      'BLDG_VAL',
      'LAND_VAL',
      'OTHER_VAL',
      'TOTAL_VAL',
      'FY',
      'LOT_SIZE',
      'LS_DATE',
      'LS_PRICE',
      'USE_CODE',
      'SITE_ADDR',
      'ADDR_NUM',
      'FULL_STR',
      'LOCATION',
      'CITY',
      'ZIP',
      'YEAR_BUILT',
      'BLD_AREA',
      'UNITS',
      'USE_DESC',
    ],
    minZoom: 15,
    maxFeatures: 750,
  }),
  structures: Object.freeze({
    id: 'structures',
    label: 'MassGIS structures',
    sourceLabel: 'MassGIS Building Structures (2D)',
    sourceUrl: 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Building_Structures/FeatureServer/0',
    queryUrl: 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Building_Structures/FeatureServer/0/query',
    objectIdField: 'OBJECTID',
    fields: [
      'OBJECTID',
      'STRUCT_ID',
      'TOWN_ID',
      'AREA_SQ_FT',
      'SOURCE',
      'SOURCETYPE',
      'SOURCEDATE',
      'SOURCEDATA',
      'MOVED',
      'LOCAL_ID',
      'ARCHIVED',
      'ARCHIVEDATE',
      'EDIT_DATE',
      'EDIT_BY',
      'COMMENTS',
    ],
    minZoom: 16,
    maxFeatures: 750,
  }),
  addresses: Object.freeze({
    id: 'addresses',
    label: 'MassGIS address points',
    sourceLabel: 'MassGIS Master Address Points',
    sourceUrl: 'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/MassGIS_Master_Address_Points/FeatureServer/0',
    queryUrl: 'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/MassGIS_Master_Address_Points/FeatureServer/0/query',
    objectIdField: 'OBJECTID',
    fields: [
      'OBJECTID',
      'MASTER_ADDRESS_ID',
      'FULL_NUMBER_STANDARDIZED',
      'ADDRESS_NUMBER_PREFIX',
      'ADDRESS_NUMBER',
      'ADDRESS_NUMBER_SUFFIX',
      'ADDRESS_NUMBER_2_PREFIX',
      'ADDRESS_NUMBER_2',
      'ADDRESS_NUMBER_2_SUFFIX',
      'STREET_NAME',
      'FLOOR',
      'UNIT',
      'BUILDING_NAME',
      'REL_LOC',
      'GEOGRAPHIC_TOWN_ID',
      'COMMUNITY_ID',
      'GEOGRAPHIC_TOWN',
      'COMMUNITY_NAME',
      'PC_NAME',
      'POSTCODE',
      'COUNTY',
      'STATE',
      'CENTROID_ID',
      'STREET_NAME_ID',
      'SITE_ID',
      'PRE_MOD',
      'PRE_DIR',
      'PRE_TYPE',
      'STR_NAME_BASE',
      'POST_TYPE',
      'POST_DIR',
      'POST_MOD',
      'UNIT_TYPE',
      'POINT_TYPE',
    ],
    minZoom: 17,
    maxFeatures: 750,
  }),
})

function requestError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function finiteCoordinate(value) {
  const coordinate = Number(value)
  return Number.isFinite(coordinate) ? coordinate : null
}

export function parseMassgisBbox(value) {
  const coordinates = String(value ?? '').split(',').map(finiteCoordinate)
  if (coordinates.length !== 4 || coordinates.some((coordinate) => coordinate === null)) {
    throw requestError('bbox must contain west,south,east,north WGS84 coordinates.')
  }

  const [west, south, east, north] = coordinates
  if (west >= east || south >= north) {
    throw requestError('bbox west/south coordinates must be smaller than east/north coordinates.')
  }
  if (
    west < MASSACHUSETTS_EXTENT.west
    || east > MASSACHUSETTS_EXTENT.east
    || south < MASSACHUSETTS_EXTENT.south
    || north > MASSACHUSETTS_EXTENT.north
  ) {
    throw requestError('bbox must stay within the Massachusetts service extent.')
  }
  if (east - west > MAX_BBOX_WIDTH_DEGREES || north - south > MAX_BBOX_HEIGHT_DEGREES) {
    throw requestError('bbox is too large. Open one issue to request a bounded MassGIS evidence window.')
  }

  return coordinates.map((coordinate) => Number(coordinate.toFixed(6)))
}

export function parseMassgisContextRequest(searchParams) {
  const bbox = parseMassgisBbox(searchParams.get('bbox'))
  const zoom = Number(searchParams.get('zoom') ?? 18)
  if (!Number.isInteger(zoom) || zoom < 15 || zoom > 22) {
    throw requestError('zoom must be an integer from 15 through 22.')
  }

  const requestedLayers = String(searchParams.get('layers') ?? Object.keys(MASSGIS_CONTEXT_LAYERS).join(','))
    .split(',')
    .map((layer) => layer.trim())
    .filter(Boolean)
  const layerIds = [...new Set(requestedLayers)]
  if (!layerIds.length) throw requestError('Choose at least one MassGIS context layer.')
  const unknown = layerIds.filter((layerId) => !MASSGIS_CONTEXT_LAYERS[layerId])
  if (unknown.length) throw requestError(`Unsupported MassGIS context layer: ${unknown.join(', ')}.`)

  return { bbox, zoom, layerIds }
}

export function buildMassgisQueryUrl(layer, bbox) {
  const params = new URLSearchParams({
    f: 'geojson',
    where: '1=1',
    geometry: bbox.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: layer.fields.join(','),
    returnGeometry: 'true',
    resultRecordCount: String(layer.maxFeatures + 1),
    orderByFields: layer.objectIdField,
    geometryPrecision: '6',
  })
  return `${layer.queryUrl}?${params}`
}

function cacheKey(layerId, bbox, zoom) {
  return `${layerId}:${bbox.join(',')}:${zoom}`
}

function publicLayerResult(layer, payload, { cacheHit = false } = {}) {
  const features = payload.features.slice(0, layer.maxFeatures)
  return {
    id: layer.id,
    label: layer.label,
    sourceLabel: layer.sourceLabel,
    sourceUrl: layer.sourceUrl,
    minZoom: layer.minZoom,
    featureCount: features.length,
    truncated: payload.features.length > layer.maxFeatures,
    cacheHit,
    geojson: {
      type: 'FeatureCollection',
      features,
    },
  }
}

export function createMassgisContextService({
  fetchImpl = fetch,
  now = () => Date.now(),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const cache = new Map()

  async function loadLayer(layer, bbox, zoom) {
    if (zoom < layer.minZoom) {
      return {
        id: layer.id,
        label: layer.label,
        sourceLabel: layer.sourceLabel,
        sourceUrl: layer.sourceUrl,
        minZoom: layer.minZoom,
        featureCount: 0,
        truncated: false,
        cacheHit: false,
        status: 'zoom-required',
        geojson: { type: 'FeatureCollection', features: [] },
      }
    }

    const key = cacheKey(layer.id, bbox, zoom)
    const cached = cache.get(key)
    if (cached && cached.expiresAt > now()) {
      return { ...cached.value, cacheHit: true }
    }

    const response = await fetchImpl(buildMassgisQueryUrl(layer, bbox), {
      headers: { accept: 'application/geo+json, application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload.error) {
      const detail = payload.error?.message || `HTTP ${response.status}`
      throw requestError(`${layer.label} service failed: ${detail}`, 502)
    }
    if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
      throw requestError(`${layer.label} returned an invalid GeoJSON response.`, 502)
    }

    const value = publicLayerResult(layer, payload)
    cache.set(key, { value, expiresAt: now() + cacheTtlMs })
    return value
  }

  return {
    async getContext({ bbox, zoom, layerIds }) {
      const requestedAt = new Date(now()).toISOString()
      const settled = await Promise.allSettled(
        layerIds.map((layerId) => loadLayer(MASSGIS_CONTEXT_LAYERS[layerId], bbox, zoom)),
      )
      const layers = []
      const errors = []
      settled.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          layers.push(result.value)
        } else {
          errors.push({
            layerId: layerIds[index],
            message: result.reason?.message || 'The MassGIS service request failed.',
          })
        }
      })
      return {
        kind: 'massgis-public-context',
        requestedAt,
        bbox,
        zoom,
        cacheTtlSeconds: Math.round(cacheTtlMs / 1000),
        layers,
        errors,
      }
    },
  }
}
