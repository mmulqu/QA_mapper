import { formatCoordinate } from './geometry'

export function getCaseChanges(caseItem) {
  return caseItem?.changes ?? []
}

export function countChangedFields(changes) {
  return changes.reduce((count, change) => count + change.fields.length, 0)
}

export function formatDiffValue(value, type) {
  if (value === null || value === undefined || value === '') return '—'
  if (type === 'geometry') {
    const [latitude, longitude] = value
    return `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`
  }
  return String(value)
}
