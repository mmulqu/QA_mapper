import { describe, expect, it } from 'vitest'
import { cases } from '../data/cases'
import { getFeatureRecords, relatedKeys } from './featureRecords'

describe('feature record preset relates', () => {
  it('builds readable attributes for the selected address point', () => {
    const records = getFeatureRecords(cases[0], cases[0].geometry.proposed)
    const point = records['address-point']

    expect(point.label).toBe('Address point')
    expect(point.attributes.find((item) => item.field === 'ADDRESS_POINT_ID')?.value).toBe('AP-100294')
    expect(relatedKeys(point)).toContain('master-address')
    expect(relatedKeys(point)).toContain('structure')
  })

  it('creates click-ready records for neighboring address points', () => {
    const records = getFeatureRecords(cases[0], cases[0].geometry.proposed)
    expect(records['nearby:AP-100291'].attributes.find((item) => item.field === 'FULL_ADDRESS')?.value).toBe('143 Brookline St')
  })
})
