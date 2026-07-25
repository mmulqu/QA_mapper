const EARTH_RADIUS_METERS = 6_371_000
const GEOMETRY_TOLERANCE_METERS = 0.05

function toRadians(value) {
  return (value * Math.PI) / 180
}

function isLatLng(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]))
}

function cleanLatLng(value) {
  if (!isLatLng(value)) return null
  return [Number(value[0]), Number(value[1])]
}

function cleanLine(values) {
  return (Array.isArray(values) ? values : []).map(cleanLatLng).filter(Boolean)
}

function closedRing(values) {
  const ring = cleanLine(values)
  if (ring.length < 3) return []
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first])
  return ring
}

function pointGeometry(point) {
  const coordinate = cleanLatLng(point)
  return coordinate ? { type: 'Point', coordinates: coordinate } : null
}

function polygonGeometry(ring) {
  const coordinates = closedRing(ring)
  return coordinates.length ? { type: 'Polygon', coordinates } : null
}

function lineGeometry(line) {
  const coordinates = cleanLine(line)
  return coordinates.length >= 2 ? { type: 'LineString', coordinates } : null
}

function geometryCoordinates(geometry) {
  if (!geometry) return []
  return geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates
}

function geometrySegments(geometry) {
  const coordinates = geometryCoordinates(geometry)
  if (geometry?.type === 'Point') return []
  const segments = []
  for (let index = 1; index < coordinates.length; index += 1) {
    segments.push([coordinates[index - 1], coordinates[index]])
  }
  return segments
}

function referenceOrigin(first, second) {
  const coordinates = [...geometryCoordinates(first), ...geometryCoordinates(second)]
  const [lat, lon] = coordinates[0] || [0, 0]
  return [lat, lon]
}

function toLocalMeters(point, origin) {
  const [lat, lon] = point
  const [originLat, originLon] = origin
  return [
    toRadians(lon - originLon) * EARTH_RADIUS_METERS * Math.cos(toRadians(originLat)),
    toRadians(lat - originLat) * EARTH_RADIUS_METERS,
  ]
}

function squaredDistance(first, second) {
  const deltaX = first[0] - second[0]
  const deltaY = first[1] - second[1]
  return deltaX * deltaX + deltaY * deltaY
}

function pointToSegmentDistanceMeters(point, segmentStart, segmentEnd, origin) {
  const current = toLocalMeters(point, origin)
  const start = toLocalMeters(segmentStart, origin)
  const end = toLocalMeters(segmentEnd, origin)
  const segmentX = end[0] - start[0]
  const segmentY = end[1] - start[1]
  const segmentLength = segmentX * segmentX + segmentY * segmentY
  if (!segmentLength) return Math.sqrt(squaredDistance(current, start))
  const ratio = Math.max(0, Math.min(1, ((current[0] - start[0]) * segmentX + (current[1] - start[1]) * segmentY) / segmentLength))
  return Math.sqrt(squaredDistance(current, [start[0] + ratio * segmentX, start[1] + ratio * segmentY]))
}

function orientation(first, second, third) {
  const value = (second[1] - first[1]) * (third[0] - second[0]) - (second[0] - first[0]) * (third[1] - second[1])
  if (Math.abs(value) < 1e-9) return 0
  return value > 0 ? 1 : -1
}

function onSegment(first, second, point) {
  return point[0] <= Math.max(first[0], second[0]) + 1e-9
    && point[0] >= Math.min(first[0], second[0]) - 1e-9
    && point[1] <= Math.max(first[1], second[1]) + 1e-9
    && point[1] >= Math.min(first[1], second[1]) - 1e-9
}

function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd, origin) {
  const firstA = toLocalMeters(firstStart, origin)
  const firstB = toLocalMeters(firstEnd, origin)
  const secondA = toLocalMeters(secondStart, origin)
  const secondB = toLocalMeters(secondEnd, origin)
  const one = orientation(firstA, firstB, secondA)
  const two = orientation(firstA, firstB, secondB)
  const three = orientation(secondA, secondB, firstA)
  const four = orientation(secondA, secondB, firstB)
  if (one !== two && three !== four) return true
  return (one === 0 && onSegment(firstA, firstB, secondA))
    || (two === 0 && onSegment(firstA, firstB, secondB))
    || (three === 0 && onSegment(secondA, secondB, firstA))
    || (four === 0 && onSegment(secondA, secondB, firstB))
}

function pointInPolygon(point, polygon, origin) {
  const ring = polygon.coordinates
  const localPoint = toLocalMeters(point, origin)
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const currentPoint = toLocalMeters(ring[current], origin)
    const previousPoint = toLocalMeters(ring[previous], origin)
    if (pointToSegmentDistanceMeters(point, ring[previous], ring[current], origin) <= GEOMETRY_TOLERANCE_METERS) return true
    const crosses = (currentPoint[1] > localPoint[1]) !== (previousPoint[1] > localPoint[1])
      && localPoint[0] < ((previousPoint[0] - currentPoint[0]) * (localPoint[1] - currentPoint[1])) / (previousPoint[1] - currentPoint[1]) + currentPoint[0]
    if (crosses) inside = !inside
  }
  return inside
}

function pointOnGeometry(point, geometry, origin) {
  if (geometry.type === 'Point') return Math.sqrt(squaredDistance(toLocalMeters(point, origin), toLocalMeters(geometry.coordinates, origin))) <= GEOMETRY_TOLERANCE_METERS
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry, origin)
  return geometrySegments(geometry).some(([start, end]) => pointToSegmentDistanceMeters(point, start, end, origin) <= GEOMETRY_TOLERANCE_METERS)
}

function geometriesIntersect(first, second) {
  const origin = referenceOrigin(first, second)
  if (first.type === 'Point') return pointOnGeometry(first.coordinates, second, origin)
  if (second.type === 'Point') return pointOnGeometry(second.coordinates, first, origin)
  const firstSegments = geometrySegments(first)
  const secondSegments = geometrySegments(second)
  if (firstSegments.some(([start, end]) => secondSegments.some(([otherStart, otherEnd]) => segmentsIntersect(start, end, otherStart, otherEnd, origin)))) return true
  if (first.type === 'Polygon' && pointInPolygon(second.coordinates[0], first, origin)) return true
  if (second.type === 'Polygon' && pointInPolygon(first.coordinates[0], second, origin)) return true
  return false
}

function geometryWithin(subject, target) {
  const origin = referenceOrigin(subject, target)
  if (subject.type === 'Point') return pointOnGeometry(subject.coordinates, target, origin)
  if (target.type !== 'Polygon') return false
  return geometryCoordinates(subject).every((point) => pointInPolygon(point, target, origin))
}

function minimumDistanceMeters(first, second) {
  if (geometriesIntersect(first, second)) return 0
  const origin = referenceOrigin(first, second)
  const firstPoints = geometryCoordinates(first)
  const secondPoints = geometryCoordinates(second)
  const firstSegments = geometrySegments(first)
  const secondSegments = geometrySegments(second)
  let minimum = Infinity

  for (const point of firstPoints) {
    for (const other of secondPoints) minimum = Math.min(minimum, Math.sqrt(squaredDistance(toLocalMeters(point, origin), toLocalMeters(other, origin))))
    for (const [start, end] of secondSegments) minimum = Math.min(minimum, pointToSegmentDistanceMeters(point, start, end, origin))
  }
  for (const point of secondPoints) {
    for (const [start, end] of firstSegments) minimum = Math.min(minimum, pointToSegmentDistanceMeters(point, start, end, origin))
  }
  return Number.isFinite(minimum) ? minimum : 0
}

function caseFeature(key, label, source, geometry) {
  return geometry ? { key, label, source, geometry } : null
}

export function listCaseGeometries(caseItem, { addressPointState = 'current' } = {}) {
  const point = addressPointState === 'proposed'
    ? pointGeometry(caseItem.geometry?.proposed)
    : pointGeometry(caseItem.geometry?.current)
  const features = [
    caseFeature('address-point', addressPointState === 'proposed' ? 'Proposed address point' : 'Current address point', 'MAD_ADDRESS_POINTM', point),
    caseFeature('structure', 'MAD structure', 'MAD_STRUCTURES_POLY', polygonGeometry(caseItem.geometry?.structure)),
    caseFeature('parcel', 'L3 parcel', 'L3_TAXPAR_POLY_ASSESS', polygonGeometry(caseItem.geometry?.parcel)),
    caseFeature('road', 'Base street arc', 'MAD_BASE_STREET_ARC', lineGeometry(caseItem.geometry?.road)),
    ...(caseItem.geometry?.nearby ?? []).map((nearby) => caseFeature(
      `nearby:${nearby.id}`,
      `Nearby address point ${nearby.id}`,
      'MAD_ADDRESS_POINTM',
      pointGeometry(nearby.position),
    )),
  ].filter(Boolean)

  return features.map(({ key, label, source, geometry }) => ({
    key,
    label,
    source,
    geometryType: geometry.type,
    coordinateCount: geometryCoordinates(geometry).length,
  }))
}

function resolveCaseFeature(caseItem, featureKey, addressPointState) {
  const point = addressPointState === 'proposed'
    ? pointGeometry(caseItem.geometry?.proposed)
    : pointGeometry(caseItem.geometry?.current)
  const nearby = (caseItem.geometry?.nearby ?? []).find((candidate) => `nearby:${candidate.id}` === featureKey)
  const candidates = new Map([
    ['address-point', caseFeature('address-point', addressPointState === 'proposed' ? 'Proposed address point' : 'Current address point', 'MAD_ADDRESS_POINTM', point)],
    ['structure', caseFeature('structure', 'MAD structure', 'MAD_STRUCTURES_POLY', polygonGeometry(caseItem.geometry?.structure))],
    ['parcel', caseFeature('parcel', 'L3 parcel', 'L3_TAXPAR_POLY_ASSESS', polygonGeometry(caseItem.geometry?.parcel))],
    ['road', caseFeature('road', 'Base street arc', 'MAD_BASE_STREET_ARC', lineGeometry(caseItem.geometry?.road))],
    ...(nearby ? [[featureKey, caseFeature(featureKey, `Nearby address point ${nearby.id}`, 'MAD_ADDRESS_POINTM', pointGeometry(nearby.position))]] : []),
  ])
  const feature = candidates.get(featureKey)
  if (!feature?.geometry) throw new Error(`Feature ${featureKey} is not available in this case workspace.`)
  return feature
}

function summarizeFeature(feature) {
  return {
    key: feature.key,
    label: feature.label,
    source: feature.source,
    geometryType: feature.geometry.type,
  }
}

export function runCaseGeospatialOperator(caseItem, {
  operation,
  subject_feature_key: subjectFeatureKey,
  comparison_feature_keys: comparisonFeatureKeys,
  distance_meters: distanceMeters,
  address_point_state: addressPointState = 'current',
}) {
  const supportedOperations = new Set(['intersects', 'within', 'contains', 'distance', 'within_distance'])
  if (!supportedOperations.has(operation)) throw new Error('Spatial operation must be intersects, within, contains, distance, or within_distance.')
  if (!Array.isArray(comparisonFeatureKeys) || comparisonFeatureKeys.length < 1 || comparisonFeatureKeys.length > 8) {
    throw new Error('Choose between 1 and 8 comparison features from the case workspace.')
  }
  if (new Set(comparisonFeatureKeys).size !== comparisonFeatureKeys.length) throw new Error('Comparison feature keys must be unique.')
  if (comparisonFeatureKeys.includes(subjectFeatureKey)) throw new Error('The subject cannot also be a comparison feature.')
  if (addressPointState !== 'current' && addressPointState !== 'proposed') throw new Error('Address point state must be current or proposed.')
  const threshold = Number(distanceMeters)
  if (operation === 'within_distance' && (!Number.isFinite(threshold) || threshold <= 0 || threshold > 10_000)) {
    throw new Error('within_distance requires distance_meters greater than 0 and no more than 10,000.')
  }

  const subject = resolveCaseFeature(caseItem, subjectFeatureKey, addressPointState)
  const comparisons = comparisonFeatureKeys.map((key) => resolveCaseFeature(caseItem, key, addressPointState))
  const results = comparisons.map((comparison) => {
    const distance = minimumDistanceMeters(subject.geometry, comparison.geometry)
    const intersects = distance === 0
    const value = operation === 'intersects'
      ? intersects
      : operation === 'within'
        ? geometryWithin(subject.geometry, comparison.geometry)
        : operation === 'contains'
          ? geometryWithin(comparison.geometry, subject.geometry)
          : operation === 'within_distance'
            ? distance <= threshold
            : distance
    return {
      feature: summarizeFeature(comparison),
      ...(operation === 'distance'
        ? { distanceMeters: Number(distance.toFixed(2)), intersects }
        : operation === 'within_distance'
          ? { matches: value, distanceMeters: Number(distance.toFixed(2)), thresholdMeters: threshold, intersects }
          : { matches: value, distanceMeters: Number(distance.toFixed(2)), intersects }),
    }
  })

  return {
    kind: 'mad-case-geospatial-operator',
    source: 'Case-scoped exported vectors in WGS84',
    operation,
    subject: summarizeFeature(subject),
    comparisons: results,
    summary: operation === 'distance'
      ? `Measured distance from ${subject.label} to ${results.length} selected case feature${results.length === 1 ? '' : 's'}.`
      : `${results.filter((result) => result.matches).length} of ${results.length} selected case feature${results.length === 1 ? '' : 's'} matched ${operation}.`,
    limitation: 'This evaluates only vectors already included in the bounded case workspace. It does not query production MAD or create an edit.',
  }
}
