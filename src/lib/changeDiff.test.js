import { describe, expect, it } from 'vitest'
import { cases } from '../data/cases'
import { countChangedFields, formatDiffValue, getCaseChanges } from './changeDiff'

describe('agent change diff', () => {
  it('returns each declared proposed change and its changed fields', () => {
    const changes = getCaseChanges(cases[0])

    expect(changes).toHaveLength(1)
    expect(countChangedFields(changes)).toBe(2)
    expect(changes[0].fields[0]).toMatchObject({ field: 'GEOMETRY', type: 'geometry' })
  })

  it('formats geometry and empty source values for an explicit before/after review', () => {
    expect(formatDiffValue([42.26618, -71.80366], 'geometry')).toBe('42.266180, -71.803660')
    expect(formatDiffValue(null)).toBe('—')
  })

  it('marks an added address point as new instead of fabricating a red source record', () => {
    const newPointChange = getCaseChanges(cases[2])[0]

    expect(newPointChange.isNew).toBe(true)
    expect(newPointChange.fields.every((field) => field.before === null)).toBe(true)
  })
})
