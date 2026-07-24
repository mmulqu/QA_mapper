import { describe, expect, it } from 'vitest'
import { getPublicMadRecords } from './publicMadRecords'

const snapshot = {
  features: [
    {
      key: 'public-address-point:3315676',
      id: 'M_230601_899373',
      addressId: 3315676,
      attributes: { ADDR_PT_ID: 'M_230601_899373', ADDRESS_ID: 3315676, POINT_TYPE: 'BC' },
      advancedAddress: { ADDRESS_ID: 3315676, ADDRESS: '12 FULLER STREET', STATUS: 'ACTIVE' },
    },
  ],
}

describe('public MAD records', () => {
  it('makes the public point and advanced address record inspectable through ADDRESS_ID', () => {
    const records = getPublicMadRecords(snapshot)

    expect(records['public-address-point:3315676'].id).toBe('M_230601_899373')
    expect(records['public-address-point:3315676'].related).toEqual(['public-advanced-address:3315676'])
    expect(records['public-advanced-address:3315676'].attributes).toContainEqual({
      field: 'STATUS',
      value: 'ACTIVE',
    })
    expect(records['public-advanced-address:3315676'].related).toEqual(['public-address-point:3315676'])
  })
})
