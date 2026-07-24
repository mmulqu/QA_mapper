import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

vi.mock('./components/MapWorkspace', () => ({
  default: ({ caseItem, onSelectFeature }) => (
    <section data-testid="map-workspace">
      Leaflet workspace for {caseItem.address}
      <button type="button" onClick={() => onSelectFeature('address-point')}>Open address point</button>
      <button type="button" onClick={() => onSelectFeature('structure')}>Open structure</button>
    </section>
  ),
}))

describe('MAD QA feature explorer', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('opens on the map and keeps the case list visible without a dense inspector', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'MAD QA' })).toBeInTheDocument()
    expect(screen.getByText('Leaflet workspace for 147 Brookline Street')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Attributes' })).not.toBeInTheDocument()
  })

  it('opens an attribute table and follows preset relationships', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Open address point' }))
    expect(screen.getByRole('heading', { name: 'Attributes' })).toBeInTheDocument()
    expect(screen.getByText('ADDRESS_POINT_ID')).toBeInTheDocument()
    expect(screen.getAllByText('AP-100294').length).toBeGreaterThan(1)
    expect(screen.getByText('Preset relate')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Master Address MA-778452/ }))
    expect(screen.getByText('MASTER_ADDRESS_ID')).toBeInTheDocument()
    expect(screen.getAllByText('MA-778452').length).toBeGreaterThan(0)
  })

  it('keeps the one approval action inside the selected address point', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Open address point' }))
    await user.click(screen.getByRole('button', { name: 'Accept proposed change' }))

    expect(screen.getByText('Proposal accepted in training')).toBeInTheDocument()
  })

  it('withholds the approval action for a case awaiting municipal evidence', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /211 Union Street/ }))
    await user.click(screen.getByRole('button', { name: 'Open address point' }))

    expect(screen.getByText('No edit proposal')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept proposed change' })).not.toBeInTheDocument()
  })
})
