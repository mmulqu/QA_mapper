const layerPriority = {
  addresses: 10,
  centroids: 20,
  structures: 30,
  roads: 40,
  parcels: 50,
  communities: 60,
}

function coordinateBounds(geometry) {
  if (!geometry?.coordinates) return null
  const bounds = [Infinity, Infinity, -Infinity, -Infinity]

  const visit = (coordinates) => {
    if (!Array.isArray(coordinates)) return
    if (
      coordinates.length >= 2
      && typeof coordinates[0] === 'number'
      && typeof coordinates[1] === 'number'
    ) {
      bounds[0] = Math.min(bounds[0], coordinates[0])
      bounds[1] = Math.min(bounds[1], coordinates[1])
      bounds[2] = Math.max(bounds[2], coordinates[0])
      bounds[3] = Math.max(bounds[3], coordinates[1])
      return
    }
    coordinates.forEach(visit)
  }

  visit(geometry.coordinates)
  return Number.isFinite(bounds[0]) ? bounds : null
}

export function buildTownFeatureIndex(extract) {
  return (extract?.layers ?? []).flatMap((layer) => (
    (layer.geojson?.features ?? []).map((feature) => ({
      feature,
      layerId: layer.id,
      layerLabel: layer.label,
      bounds: coordinateBounds(feature.geometry),
      priority: layerPriority[layer.id] ?? 100,
    }))
  ))
}

function pointOnSegment(point, start, end, epsilon = 1e-10) {
  const squaredLength = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2
  if (squaredLength <= epsilon) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2 <= epsilon
  }
  const cross = (point[1] - start[1]) * (end[0] - start[0])
    - (point[0] - start[0]) * (end[1] - start[1])
  if (Math.abs(cross) > epsilon) return false
  const dot = (point[0] - start[0]) * (end[0] - start[0])
    + (point[1] - start[1]) * (end[1] - start[1])
  if (dot < 0) return false
  return dot <= squaredLength
}

function pointInRing(point, ring) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const start = ring[previous]
    const end = ring[index]
    if (pointOnSegment(point, start, end)) return true
    const intersects = ((end[1] > point[1]) !== (start[1] > point[1]))
      && point[0] < ((start[0] - end[0]) * (point[1] - end[1])) / (start[1] - end[1]) + end[0]
    if (intersects) inside = !inside
  }
  return inside
}

function pointInPolygon(point, rings) {
  if (!rings?.length || !pointInRing(point, rings[0])) return false
  return !rings.slice(1).some((hole) => pointInRing(point, hole))
}

function pixelPoint(map, coordinate) {
  return map.latLngToContainerPoint([coordinate[1], coordinate[0]])
}

function pixelDistance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (!dx && !dy) return pixelDistance(point, start)
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx ** 2 + dy ** 2)))
  return pixelDistance(point, { x: start.x + ratio * dx, y: start.y + ratio * dy })
}

function lineHitsClick(coordinates, clickPoint, map, tolerance) {
  for (let index = 1; index < coordinates.length; index += 1) {
    if (
      distanceToSegment(
        clickPoint,
        pixelPoint(map, coordinates[index - 1]),
        pixelPoint(map, coordinates[index]),
      ) <= tolerance
    ) return true
  }
  return false
}

function boundsContain(bounds, point) {
  return !bounds || (
    point[0] >= bounds[0]
    && point[0] <= bounds[2]
    && point[1] >= bounds[1]
    && point[1] <= bounds[3]
  )
}

export function geometryHitsMapClick(geometry, point, map, {
  pointTolerance = 12,
  lineTolerance = 8,
} = {}) {
  if (!geometry) return false
  const clickPoint = map.latLngToContainerPoint([point[1], point[0]])

  switch (geometry.type) {
    case 'Point':
      return pixelDistance(clickPoint, pixelPoint(map, geometry.coordinates)) <= pointTolerance
    case 'MultiPoint':
      return geometry.coordinates.some((coordinate) => (
        pixelDistance(clickPoint, pixelPoint(map, coordinate)) <= pointTolerance
      ))
    case 'LineString':
      return lineHitsClick(geometry.coordinates, clickPoint, map, lineTolerance)
    case 'MultiLineString':
      return geometry.coordinates.some((line) => lineHitsClick(line, clickPoint, map, lineTolerance))
    case 'Polygon':
      return pointInPolygon(point, geometry.coordinates)
    case 'MultiPolygon':
      return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon))
    case 'GeometryCollection':
      return geometry.geometries?.some((child) => geometryHitsMapClick(child, point, map, {
        pointTolerance,
        lineTolerance,
      })) ?? false
    default:
      return false
  }
}

function featureLabel(properties) {
  return properties.LABEL_TEXT
    || properties.SITE_ADDR
    || properties.COMMUNITY1
    || properties.STREET_N_1
    || properties.FULL_STREET_NAME
    || properties.__id
    || 'Unnamed feature'
}

export function queryTownFeaturesAtLatLng({
  featureIndex,
  visibleLayers,
  latlng,
  map,
}) {
  const point = [latlng.lng, latlng.lat]
  const visible = new Set(visibleLayers)
  const matches = []
  const seen = new Set()

  for (const entry of featureIndex) {
    if (!visible.has(entry.layerId)) continue
    const { feature } = entry
    const key = feature.properties?.__recordKey
    if (!key || seen.has(key)) continue
    if (
      ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)
      && !boundsContain(entry.bounds, point)
    ) continue
    if (!geometryHitsMapClick(feature.geometry, point, map)) continue

    seen.add(key)
    matches.push({
      key,
      id: feature.properties.__id,
      label: featureLabel(feature.properties),
      layerId: entry.layerId,
      layerLabel: entry.layerLabel,
      geometryType: feature.geometry?.type || 'Geometry',
      priority: entry.priority,
    })
  }

  return matches.sort((left, right) => (
    left.priority - right.priority
    || left.layerLabel.localeCompare(right.layerLabel)
    || String(left.label).localeCompare(String(right.label), undefined, { numeric: true })
  ))
}
