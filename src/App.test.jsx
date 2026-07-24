import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

vi.mock('./components/MapWorkspace', () => ({
  default: ({ caseItem, onSelectFeature, onShowAgent, onShowDiff, publicSnapshot }) => (
    <section data-testid="map-workspace">
      {publicSnapshot ? 'Public MAD workspace for Brookline' : `Leaflet workspace for ${caseItem.address}`}
      <button
        type="button"
        onClick={() => onSelectFeature(publicSnapshot ? 'public-address-point:3315676' : 'address-point')}
      >
        {publicSnapshot ? 'Open public address point' : 'Open address point'}
      </button>
      {!publicSnapshot && <button type="button" onClick={() => onSelectFeature('structure')}>Open structure</button>}
      {!publicSnapshot && <button type="button" onClick={onShowDiff}>Show agent diff</button>}
      {!publicSnapshot && <button type="button" onClick={onShowAgent}>Open local agent</button>}
    </section>
  ),
}))

const publicMadSnapshot = {
  kind: 'public-mad-test-snapshot',
  metadata: { fixturePointCount: 1, advancedJoinCount: 1 },
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

describe('MAD QA feature explorer', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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

  it('keeps acceptance in the complete red-and-green review sheet, not an attribute table', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Open address point' }))
    expect(screen.queryByRole('button', { name: 'Accept and send to publisher' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))

    expect(screen.getByRole('button', { name: 'Accept and send to publisher' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject and add feedback' })).toBeInTheDocument()
  })

  it('shows every changed source and draft value in the agent diff', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))

    expect(screen.getByText('Agent proposed changes')).toBeInTheDocument()
    expect(screen.getAllByText('Current')).toHaveLength(2)
    expect(screen.getAllByText('Proposed')).toHaveLength(2)
    expect(screen.getByText('Building centroid')).toBeInTheDocument()
    expect(screen.getByText('Building entrance')).toBeInTheDocument()
    expect(screen.getByText('Building centroid').closest('.diff-value')).toHaveClass('before')
    expect(screen.getByText('Building entrance').closest('.diff-value')).toHaveClass('after')
    expect(screen.queryByRole('button', { name: 'Accept proposed change' })).not.toBeInTheDocument()
  })

  it('shows parent and revised proposal IDs, summaries, and model IDs in the diff lineage', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/test-data/brookline-mad-snapshot.json') return Promise.resolve({ ok: false })
      if (url === '/api/cases/MAD-2026-1842/proposals') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            proposals: [
              {
                id: 'proposal-parent', depth: 0, status: 'rejected', category: 'Address point movement',
                summary: 'Move to the east entrance.', reviewerFeedback: 'Use the driveway instead.', model: 'qwen3-4b-thinking-2507',
              },
              {
                id: 'proposal-revision', depth: 1, status: 'staged', parentProposalId: 'proposal-parent', category: 'Address point movement',
                summary: 'Move to the verified driveway access.', reviewerFeedback: '', model: 'qwen3-4b-thinking-2507',
              },
            ],
          }),
        })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))

    expect(await screen.findByText('Proposal lineage')).toBeInTheDocument()
    expect(screen.getByText('proposal-parent')).toBeInTheDocument()
    expect(screen.getAllByText('proposal-revision').length).toBe(2)
    expect(screen.getByText(/Use the driveway instead/)).toBeInTheDocument()
    expect(screen.getAllByText(/qwen3-4b-thinking-2507/).length).toBe(2)
  })

  it('renders a new address point as green additions without a fabricated red source', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /8 Harbor Lane/ }))
    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))

    expect(screen.getAllByText('new-point-1').some((node) => node.closest('.diff-value')?.classList.contains('after'))).toBe(true)
    expect(screen.getAllByText('New').length).toBeGreaterThan(1)
    expect(screen.queryByText('Current')).not.toBeInTheDocument()
  })

  it('renders a blank prior relationship as an explicit red source value', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /62 Alder Road/ }))
    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))

    expect(screen.getByText((content, element) => (
      element?.tagName === 'STRONG' && content.charCodeAt(0) === 8212
    )).closest('.diff-value')).toHaveClass('before')
    expect(screen.getByText('AP-884102').closest('.diff-value')).toHaveClass('after')
  })

  it('makes clear when an evidence-only case has no agent edits', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /211 Union Street/ }))
    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))

    expect(screen.getByText('No agent changes to review')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept and send to publisher' })).not.toBeInTheDocument()
  })

  it('sends an accepted draft to the protected publisher handoff and reports its status', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/test-data/brookline-mad-snapshot.json') return Promise.resolve({ ok: false })
      return Promise.resolve({
        ok: true,
        json: async () => ({
          publisher: {
            status: 'validated-handoff',
            productionApplied: false,
            message: 'Publisher handoff is structurally valid. Validate mode made no MAD edit.',
          },
          job: { id: 'pub-test', status: 'validated-handoff' },
        }),
      })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))
    await user.click(screen.getByRole('button', { name: 'Accept and send to publisher' }))

    expect(await screen.findByText('Publisher handoff created')).toBeInTheDocument()
    expect(screen.getByText(/Validate mode made no MAD edit/)).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/cases/MAD-2026-1842/accept', expect.objectContaining({ method: 'POST' }))
  })

  it('collects a rejection comment and places it in the local agent revision context', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/test-data/brookline-mad-snapshot.json') return Promise.resolve({ ok: false })
      return Promise.resolve({
        ok: true,
        json: async () => ({
          rejection: {
            id: 'reject-test',
            status: 'active',
            comment: 'Use the driveway access point instead of the east entrance.',
          },
        }),
      })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))
    await user.click(screen.getByRole('button', { name: 'Reject and add feedback' }))
    expect(screen.getByRole('heading', { name: 'What needs to change?' })).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Reviewer feedback' }), 'Use the driveway access point instead of the east entrance.')
    await user.click(screen.getByRole('button', { name: 'Reject and request revision' }))

    expect(await screen.findByText('Reviewer feedback is in context')).toBeInTheDocument()
    expect(screen.getByText('Use the driveway access point instead of the east entrance.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Review the reviewer feedback and propose a revised draft/ })).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/cases/MAD-2026-1842/reject', expect.objectContaining({ method: 'POST' }))
  })

  it('sends a case-scoped question to the local agent bridge', async () => {
    const agentReply = {
      reply: '### Evidence\n\nThe **linked parcel** supports `AP-100294`.\n\n- Parcel boundary\n- Structure footprint',
      toolEvents: [{ name: 'get_case', summary: 'Read case snapshot' }],
    }
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/test-data/brookline-mad-snapshot.json') return Promise.resolve({ ok: false })
      return Promise.resolve({ ok: true, json: async () => agentReply })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Open local agent' }))
    await user.click(screen.getByRole('button', { name: 'Why was this case flagged?' }))

    expect(await screen.findByRole('heading', { name: 'Evidence', level: 3 })).toBeInTheDocument()
    expect(screen.getByText('linked parcel').tagName).toBe('STRONG')
    expect(screen.getByText('AP-100294').tagName).toBe('CODE')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Read case snapshot')).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/cases/MAD-2026-1842/agent', expect.objectContaining({ method: 'POST' }))
  })

  it('shows a spinner while the local agent is processing', async () => {
    let resolveAgentRequest
    const agentReply = { reply: 'The case was reviewed.', toolEvents: [] }
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/test-data/brookline-mad-snapshot.json') return Promise.resolve({ ok: false })
      return new Promise((resolve) => { resolveAgentRequest = resolve })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Open local agent' }))
    await user.click(screen.getByRole('button', { name: 'Why was this case flagged?' }))

    expect(screen.getByRole('status')).toHaveTextContent('Agent is working')
    expect(screen.getByText(/Reviewing case evidence/)).toBeInTheDocument()

    resolveAgentRequest({ ok: true, json: async () => agentReply })
    expect(await screen.findByText(agentReply.reply)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not show a publisher action inside a case feature table', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /211 Union Street/ }))
    await user.click(screen.getByRole('button', { name: 'Open address point' }))

    expect(screen.queryByRole('button', { name: 'Accept and send to publisher' })).not.toBeInTheDocument()
  })

  it('loads the optional public MAD fixture as a no-edit map view with an ADDRESS_ID relate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => publicMadSnapshot,
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Brookline MAD snapshot/ }))
    expect(screen.getByText('Public MAD workspace for Brookline')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open public address point' }))
    expect(screen.getByText('ADDR_PT_ID')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Advanced address record 3315676/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept and send to publisher' })).not.toBeInTheDocument()
  })
})
