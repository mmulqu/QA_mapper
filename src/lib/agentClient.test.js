import { afterEach, describe, expect, it, vi } from 'vitest'
import { askLocalAgent } from './agentClient'

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
})
