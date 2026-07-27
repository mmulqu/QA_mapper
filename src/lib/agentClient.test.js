import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acceptCaseDraft,
  askLocalAgent,
  controlQaBatch,
  createQaBatch,
  getProposalAuditInfo,
  getProposalLineage,
  getQaBatchDashboard,
  getQaBatchJob,
  getQaBatchItem,
  getQaIssueAtlas,
  getQaIssueRecords,
  getQaRecordMapPreview,
  investigateQaIssue,
  openProposalAuditInFileExplorer,
  readAgentEventStream,
  refreshQaIssueAtlas,
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
      'event: queue\ndata: {"id":"AGENT-1","status":"queued","queue":{"position":3,"total":4,"ahead":2}}\n\n',
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
    const queueUpdates = []

    await expect(readAgentEventStream(
      response,
      (event) => activity.push(event),
      (request) => queueUpdates.push(request),
    )).resolves.toEqual({
      reply: 'Duplicate confirmed.',
      model: 'local-model',
    })
    expect(activity.map((event) => event.type)).toEqual(['reasoning_delta', 'skill'])
    expect(queueUpdates[0].queue).toEqual({ position: 3, total: 4, ahead: 2 })
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
    await investigateQaIssue('MADV_QA_ASL_DUPES', {
      recordId: 'QA-ROW-17',
      reviewerContext: 'Check the driveway evidence before staging.',
    })

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
        body: JSON.stringify({
          recordId: 'QA-ROW-17',
          reviewerContext: 'Check the driveway evidence before staging.',
        }),
      }),
    )
  })

  it('loads one row map preview without starting an agent request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ kind: 'mad-qa-map-preview', limits: { bufferMeters: 120 } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(getQaRecordMapPreview('MADV_QA_BRV_NO_BSA', 'BRV-17')).resolves.toEqual({
      kind: 'mad-qa-map-preview',
      limits: { bufferMeters: 120 },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/qa/issues/MADV_QA_BRV_NO_BSA/records/BRV-17/map-preview',
      { signal: undefined },
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/qa/issues/MADV_QA_BRV_NO_BSA/investigate-stream',
      expect.anything(),
    )
  })

  it('loads and explicitly refreshes the versioned QA issue atlas', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ kind: 'mad-qa-issue-atlas', version: '20260726162030123' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await getQaIssueAtlas()
    await refreshQaIssueAtlas()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/qa/atlas', { signal: undefined })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/qa/atlas/refresh', {
      method: 'POST',
      headers: { 'x-mad-local-action': 'refresh-qa-atlas' },
      signal: undefined,
    })
  })

  it('creates, controls, and reopens persistent QA batch work', async () => {
    const dashboard = { kind: 'mad-qa-batch-dashboard', jobs: [], inbox: { items: [] } }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => dashboard })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ job: { id: 'BATCH-1' }, dashboard }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ job: { id: 'BATCH-1', status: 'paused' }, dashboard }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ job: { id: 'BATCH-1', status: 'running', items: [] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ item: { id: 'BATCH-1-001', result: {} } }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(getQaBatchDashboard()).resolves.toEqual(dashboard)
    await createQaBatch('MADV_QA_ASL_DUPES', ['ROW-1', 'ROW-2'], {
      'ROW-1': 'Check the municipal source note.',
    })
    await controlQaBatch('BATCH-1', 'pause')
    await expect(getQaBatchJob('BATCH-1')).resolves.toEqual({ id: 'BATCH-1', status: 'running', items: [] })
    await expect(getQaBatchItem('BATCH-1-001')).resolves.toEqual({
      id: 'BATCH-1-001',
      result: {},
    })

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/qa/batches', expect.objectContaining({
      signal: undefined,
      headers: expect.objectContaining({ 'x-mad-reviewer-id': 'reviewer-test' }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/qa/batches', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        viewId: 'MADV_QA_ASL_DUPES',
        recordIds: ['ROW-1', 'ROW-2'],
        recordPrompts: { 'ROW-1': 'Check the municipal source note.' },
      }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/qa/batches/BATCH-1/pause', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-mad-reviewer-id': 'reviewer-test' }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/qa/batches/BATCH-1', { signal: undefined })
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/qa/review-inbox/BATCH-1-001', { signal: undefined })
  })
})
