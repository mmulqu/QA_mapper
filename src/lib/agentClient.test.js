import { afterEach, describe, expect, it, vi } from 'vitest'
import { acceptCaseDraft, askLocalAgent, getProposalLineage, rejectCaseDraft } from './agentClient'

describe('local agent client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends a case-scoped message to the local bridge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: 'Case reviewed.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(askLocalAgent('MAD-2026-1842', 'Why was this flagged?')).resolves.toEqual({ reply: 'Case reviewed.' })
    expect(fetchMock).toHaveBeenCalledWith('/api/cases/MAD-2026-1842/agent', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ message: 'Why was this flagged?' }),
    }))
  })

  it('uses distinct protected endpoints for approval and reviewer feedback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await acceptCaseDraft('MAD-2026-1842')
    await rejectCaseDraft('MAD-2026-1842', 'Use the driveway instead of the east entrance.')

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/cases/MAD-2026-1842/accept', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ reviewerNote: '' }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/cases/MAD-2026-1842/reject', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ comment: 'Use the driveway instead of the east entrance.' }),
    }))
  })

  it('loads case-scoped proposal history from the local registry', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ proposals: [{ id: 'proposal-1' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(getProposalLineage('MAD-2026-1842')).resolves.toEqual([{ id: 'proposal-1' }])
    expect(fetchMock).toHaveBeenCalledWith('/api/cases/MAD-2026-1842/proposals')
  })
})
