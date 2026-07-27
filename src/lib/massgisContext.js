export const MASSGIS_CONTEXT_BUFFER_METERS = 250

export const MASSGIS_CONTEXT_LAYER_OPTIONS = Object.freeze([
  Object.freeze({ id: 'parcels', label: 'L3 parcels' }),
  Object.freeze({ id: 'structures', label: 'Structures' }),
  Object.freeze({ id: 'addresses', label: 'Address points' }),
])

export function buildIssueContextBbox(center, bufferMeters = MASSGIS_CONTEXT_BUFFER_METERS) {
  if (
    !Array.isArray(center)
    || center.length !== 2
    || !center.every(Number.isFinite)
    || !Number.isFinite(bufferMeters)
    || bufferMeters <= 0
  ) {
    throw new Error('A valid issue center and positive context buffer are required.')
  }

  const [longitude, latitude] = center
  const latitudeDelta = bufferMeters / 111_320
  const longitudeDelta = bufferMeters / (111_320 * Math.cos(latitude * Math.PI / 180))
  return [
    longitude - longitudeDelta,
    latitude - latitudeDelta,
    longitude + longitudeDelta,
    latitude + latitudeDelta,
  ].map((coordinate) => Number(coordinate.toFixed(6)))
}

export function summarizeMassgisContext(context) {
  if (!context?.layers?.length) return 'No public reference features returned'
  return context.layers
    .map((layer) => `${layer.featureCount.toLocaleString()} ${layer.label.replace(/^MassGIS\s+/i, '')}`)
    .join(' · ')
}
