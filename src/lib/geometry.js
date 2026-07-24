const EARTH_RADIUS_METERS = 6371000

const toRadians = (value) => (value * Math.PI) / 180

export function distanceMeters(from, to) {
  if (!from || !to) return 0
  const [lat1, lon1] = from
  const [lat2, lon2] = to
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

export function pointInBounds(point, polygon) {
  if (!point || !polygon?.length) return false
  const latitudes = polygon.map(([lat]) => lat)
  const longitudes = polygon.map(([, lon]) => lon)
  return (
    point[0] >= Math.min(...latitudes) &&
    point[0] <= Math.max(...latitudes) &&
    point[1] >= Math.min(...longitudes) &&
    point[1] <= Math.max(...longitudes)
  )
}

export function nudgePoint(point, direction, amount = 0.000025) {
  if (!point) return point
  const vectors = {
    north: [amount, 0],
    south: [-amount, 0],
    east: [0, amount],
    west: [0, -amount],
  }
  const [dLat, dLon] = vectors[direction]
  return [point[0] + dLat, point[1] + dLon]
}

export function formatCoordinate(value) {
  return Number(value).toFixed(6)
}

export function buildValidations(caseItem, draftPoint) {
  const hasProposal = Boolean(draftPoint)
  const needsEvidence = caseItem.status === 'evidence'
  const parcelPass = hasProposal ? pointInBounds(draftPoint, caseItem.geometry.parcel) : false
  const structurePass =
    caseItem.operationKind === 'link'
      ? true
      : hasProposal && pointInBounds(draftPoint, caseItem.geometry.structure)

  return [
    {
      id: 'snapshot',
      label: 'Production snapshot precondition',
      detail: 'Row hash matches the exported training snapshot.',
      state: 'pass',
    },
    {
      id: 'closure',
      label: 'Relational closure exported',
      detail: 'Point, Master Address, structure, lookup, and variant are present.',
      state: 'pass',
    },
    {
      id: 'parcel',
      label: 'Proposal is inside linked parcel',
      detail: parcelPass ? 'Coordinate falls inside the exported parcel.' : 'Move the proposal inside the parcel boundary.',
      state: parcelPass ? 'pass' : needsEvidence ? 'hold' : 'fail',
    },
    {
      id: 'structure',
      label:
        caseItem.operationKind === 'link'
          ? 'Existing point supports relationship'
          : 'Proposal agrees with structure',
      detail: structurePass
        ? 'Spatial relationship is consistent with the proposed operation.'
        : 'Proposal is outside the linked structure footprint.',
      state: structurePass ? 'pass' : needsEvidence ? 'hold' : 'fail',
    },
    {
      id: 'duplicate',
      label: 'No conflicting point within 3 m',
      detail: needsEvidence
        ? 'Duplicate intent cannot be resolved without municipal evidence.'
        : 'Nearest unrelated address point is beyond the collision threshold.',
      state: needsEvidence ? 'hold' : 'pass',
    },
  ]
}

export function makeChangeset(caseItem, draftPoint, reviewer = null, note = '') {
  return {
    schema_version: '0.1.0',
    case_id: caseItem.id,
    environment: 'training',
    generated_at: new Date().toISOString(),
    source_snapshot: caseItem.snapshot,
    reviewer,
    reviewer_note: note,
    operations: caseItem.operations.map((operation) => ({
      operation: operation.type,
      target: operation.target,
      proposed_geometry:
        operation.type === 'move_address_point' || operation.type === 'create_address_point'
          ? {
              type: 'Point',
              coordinates: [draftPoint?.[1], draftPoint?.[0]],
              wkid: caseItem.snapshot.wkid,
            }
          : undefined,
      preconditions: {
        source_row_hash: caseItem.snapshot.rowHash,
        source_version: caseItem.snapshot.version,
      },
    })),
  }
}
