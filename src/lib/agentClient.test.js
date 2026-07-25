import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acceptCaseDraft,
  askLocalAgent,
  getProposalAuditInfo,
  getProposalLineage,
  getQaIssueRecords,
  investigateQaIssue,
  openProposalAuditInFileExplorer,
  readAgentEventStream,
  rejectCaseDraft,
} from './agentClient'

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

  it('loads and opens the fixed local proposal audit through protected endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ relativePath: '.runtime\\proposal-history.csv' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ opened: true }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(getProposalAuditInfo()).resolves.toEqual({ relativePath: '.runtime\\proposal-history.csv' })
    await expect(openProposalAuditInFileExplorer()).resolves.toEqual({ opened: true })
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/audit/proposal-history')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/audit/proposal-history/open', {
      method: 'POST',
      headers: { 'x-mad-local-action': 'open-proposal-audit' },
    })
  })

  it('reads model-agnostic activity and the final result from an event stream', async () => {
    const encoder = new TextEncoder()
    const chunks = [
      'event: activity\ndata: {"id":"reasoning-1","type":"reasoning_delta","text":"Checking rows."}\n\n',
      'event: activity\ndata: {"id":"skill-1","type":"skill","phase":"completed","name":"load_skill"}\n\n',
      'event: complete\ndata: {"reply":"Duplicate confirmed.","model":"local-model"}\n\n',
    ]
    const response = {
      body: new ReadableStream({
        start(controller) {
          chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
          controller.close()
        },
      }),
    }
    const activity = []

    await expect(readAgentEventStream(response, (event) => activity.push(event))).resolves.toEqual({
      reply: 'Duplicate confirmed.',
      model: 'local-model',
    })
    expect(activity.map((event) => event.type)).toEqual(['reasoning_delta', 'skill'])
  })

  it('loads a bounded QA row preview before investigating one selected record', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ statewideCount: 1716, loadedCount: 12, rows: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: 'Selected row reviewed.' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await getQaIssueRecords('MADV_QA_ASL_DUPES')
    await investigateQaIssue('MADV_QA_ASL_DUPES', { recordId: 'QA-ROW-17' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/qa/issues/MADV_QA_ASL_DUPES/records',
      { signal: undefined },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/qa/issues/MADV_QA_ASL_DUPES/investigate-stream',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ recordId: 'QA-ROW-17' }),
      }),
    )
  })
})
