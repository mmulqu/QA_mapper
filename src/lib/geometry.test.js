import { describe, expect, it } from 'vitest'
import { cases } from '../data/cases'
import {
  buildValidations,
  distanceMeters,
  makeChangeset,
  nudgePoint,
  pointInBounds,
} from './geometry'

describe('MAD geometry and validation helpers', () => {
  const moveCase = cases[0]

  it('recognizes the agent proposal as spatially valid', () => {
    expect(pointInBounds(moveCase.geometry.proposed, moveCase.geometry.parcel)).toBe(true)
    expect(pointInBounds(moveCase.geometry.proposed, moveCase.geometry.structure)).toBe(true)
    expect(buildValidations(moveCase, moveCase.geometry.proposed).every((rule) => rule.state === 'pass')).toBe(true)
  })

  it('blocks a proposal moved outside its exported context', () => {
    const outside = [42.27, -71.81]
    const validations = buildValidations(moveCase, outside)
    expect(validations.find((rule) => rule.id === 'parcel')?.state).toBe('fail')
    expect(validations.find((rule) => rule.id === 'structure')?.state).toBe('fail')
  })

  it('nudges a point deterministically and calculates a real displacement', () => {
    const north = nudgePoint(moveCase.geometry.proposed, 'north')
    expect(north[0]).toBeGreaterThan(moveCase.geometry.proposed[0])
    expect(distanceMeters(moveCase.geometry.current, moveCase.geometry.proposed)).toBeGreaterThan(1)
  })

  it('serializes only controlled operations with source preconditions', () => {
    const changeset = makeChangeset(moveCase, moveCase.geometry.proposed, 'Test Reviewer', 'Verified')
    expect(changeset.environment).toBe('training')
    expect(changeset.operations).toHaveLength(2)
    expect(changeset.operations[0].operation).toBe('move_address_point')
    expect(changeset.operations[0].proposed_geometry.coordinates).toEqual([
      moveCase.geometry.proposed[1],
      moveCase.geometry.proposed[0],
    ])
    expect(changeset.operations[0].preconditions.source_row_hash).toBe(moveCase.snapshot.rowHash)
  })
})
