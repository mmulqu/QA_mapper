import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { REVIEWER_SESSION_STORAGE_KEY } from './lib/reviewerSession'

vi.mock('./components/MapWorkspace', () => ({
  default: ({
    caseItem,
    highlightedFeatureKey,
    onQueryFeatures,
    onSelectFeature,
    onShowAgent,
    onShowDiff,
    onBackToQaRows,
    onRunQaPreview,
    publicSnapshot,
    qaPreview,
    townExtract,
  }) => (
    <section data-testid="map-workspace">
      {townExtract
        ? qaPreview
          ? `Pre-agent map preview for ${caseItem.municipality}`
          : `Town extract workspace for ${caseItem.municipality}`
        : publicSnapshot
          ? 'Public MAD workspace for Brookline'
          : `Leaflet workspace for ${caseItem.address}`}
      <button
        type="button"
        onClick={() => onSelectFeature(
          townExtract
            ? `addresses:${caseItem.records.addressPoint.id}`
            : publicSnapshot
              ? 'public-address-point:3315676'
              : 'address-point',
        )}
      >
        {townExtract ? 'Open town address point' : publicSnapshot ? 'Open public address point' : 'Open address point'}
      </button>
      {townExtract && (
        <>
          <button
            type="button"
            onClick={() => onQueryFeatures({
              latlng: [42.6514, -70.6139],
              results: [
                {
                  key: 'addresses:M_272655_933812',
                  id: 'M_272655_933812',
                  label: '8 ALPACA COURT',
                  layerId: 'addresses',
                  layerLabel: 'Address points',
                  geometryType: 'Point',
                },
                {
                  key: 'structures:272643_933827',
                  id: '272643_933827',
                  label: 'Structure 272643_933827',
                  layerId: 'structures',
                  layerLabel: 'MAD structures',
                  geometryType: 'Polygon',
                },
                {
                  key: 'communities:270',
                  id: '270',
                  label: 'ROCKPORT',
                  layerId: 'communities',
                  layerLabel: 'MSAG communities',
                  geometryType: 'MultiPolygon',
                },
              ],
            })}
          >
            Query overlapping town features
          </button>
          <span>Highlighted feature: {highlightedFeatureKey || 'none'}</span>
        </>
      )}
      {!publicSnapshot && <button type="button" onClick={() => onSelectFeature('structure')}>Open structure</button>}
      {qaPreview ? (
        <>
          <span>Mapped before agent run</span>
          <span>{qaPreview.relation.description}</span>
          <button type="button" onClick={onBackToQaRows}>Back to rows</button>
          <button type="button" onClick={onRunQaPreview}>Run agent on this issue</button>
        </>
      ) : (
        <>
          {!publicSnapshot && <button type="button" onClick={onShowDiff}>Show agent diff</button>}
          {!publicSnapshot && <button type="button" onClick={onShowAgent}>Open local agent</button>}
        </>
      )}
    </section>
  ),
}))

vi.mock('./components/QaIssueAtlas', () => ({
  default: ({ manifest, onRefresh, onOpenIssue, onRunIssue }) => (
    <section aria-label="QA issue map">
      <h1>Affected feature atlas</h1>
      <span>{manifest ? `${manifest.featureCount} mapped features` : 'Loading atlas'}</span>
      <button type="button" onClick={onRefresh}>Refresh QA map</button>
      {manifest?.items?.[0] ? (
        <>
          <button type="button" onClick={() => onOpenIssue(manifest.items[0])}>Review atlas issue</button>
          <button type="button" onClick={() => onRunIssue(manifest.items[0])}>Run atlas issue</button>
        </>
      ) : null}
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

const qaCatalog = {
  kind: 'mad-qa-category-catalog',
  summary: { groupCount: 1, issueCount: 1, recordCount: 181 },
  groups: [{
    id: 'ADDPT_STRUCT_LUT',
    label: 'Point–structure lookups',
    issueCount: 1,
    recordCount: 181,
    issues: [{
      id: 'MADV_QA_ASL_DUPES',
      description: 'Structure lookup records that are functionally duplicative',
      count: 181,
      localFixture: { town: 'Rockport', townId: 252, status: 'available' },
    }],
  }],
}

const rockportQaCase = {
  id: 'MADV_QA_ASL_DUPES-252-M-272655-933812',
  address: '8 Alpaca Court',
  municipality: 'Rockport',
  issueType: 'Duplicate structure lookup',
  issueCode: 'MADV_QA_ASL_DUPES',
  status: 'ready',
  publishEligible: false,
  publishBlocker: 'The source export omitted the lookup OBJECTID.',
  operationKind: 'remove-duplicate',
  recommendation: 'Delete one duplicate lookup row.',
  rationale: 'Two lookup rows have identical relationship fields.',
  center: [42.6514, -70.6139],
  zoom: 19,
  geometry: { current: [42.6514, -70.6139], proposed: null, parcel: [], structure: [], road: [], nearby: [] },
  records: {
    addressPoint: { id: 'M_272655_933812', globalId: 'Unavailable' },
    masterAddress: { id: '4242779', globalId: 'Unavailable' },
    structure: { id: '272643_933827', globalId: 'Unavailable' },
    variant: { id: 'variant-1', value: '8 ALPACA COURT' },
  },
  operations: [{ id: 'OP-1', type: 'remove_duplicate_structure_lookup', target: 'duplicate row' }],
  changes: [{
    id: 'CHG-1',
    entityLabel: 'Structure lookup relationship',
    entityId: 'M_272655_933812 → 272643_933827',
    mapTarget: 'addresses:M_272655_933812',
    summary: 'Reduce two identical rows to one',
    fields: [{ field: 'MATCHING_RELATIONSHIP_ROWS', before: 2, after: 1 }],
  }],
  evidence: [],
  snapshot: { source: 'Rockport export', version: 'test', rowHash: 'sha256:test', exportedAt: '2026-07-24', wkid: 26986 },
  townExtractSummary: { town: 'Rockport', townId: 252, communityId: 270 },
}

const qaRecordPage = {
  kind: 'mad-qa-issue-record-page',
  view: {
    id: 'MADV_QA_ASL_DUPES',
    description: 'Structure lookup records that are functionally duplicative',
    categoryId: 'ADDPT_STRUCT_LUT',
    category: 'Point–structure lookups',
  },
  statewideCount: 181,
  loadedCount: 2,
  hasMore: true,
  selectionLimit: 10,
  containsMockRows: true,
  rows: [
    {
      id: rockportQaCase.id,
      caseId: rockportQaCase.id,
      viewId: 'MADV_QA_ASL_DUPES',
      address: '8 Alpaca Court',
      municipality: 'Rockport',
      affectedRecordId: 'M_272655_933812',
      issueDetail: 'Two lookup rows repeat the same relationship.',
      severity: 'Review',
      sourceLabel: 'Rockport MAD extract',
      mock: false,
      mapPreview: {
        status: 'available',
        relation: {
          anchorLabel: 'structure polygon',
          description: 'The nonspatial lookup row is mapped through STRUCTURE_ID to its structure polygon.',
        },
      },
    },
    {
      id: 'MADV_QA_ASL_DUPES-MOCK-0002',
      caseId: null,
      viewId: 'MADV_QA_ASL_DUPES',
      address: '27 Sample Road',
      municipality: 'Worcester',
      affectedRecordId: 'MOCK-ASL-000027',
      issueDetail: 'Demonstration row awaiting the production SQL view connector.',
      severity: 'Medium',
      sourceLabel: 'Mock QA view row',
      mock: true,
      mapPreview: {
        status: 'awaiting-record-geometry',
        reason: 'This mock row has no authoritative relationship keys or geometry.',
        relation: { anchorLabel: 'structure polygon' },
      },
    },
  ],
}

const emptyQaBatchDashboard = {
  kind: 'mad-qa-batch-dashboard',
  storage: { relativePath: '.runtime\\qa-batch-jobs.json', persistent: true },
  worker: { concurrency: 1, active: false, model: 'qwen3-4b-thinking-2507' },
  jobs: [],
  inbox: {
    counts: { ready: 0, withheld: 0, failed: 0, accepted: 0, rejected: 0 },
    items: [],
  },
}

const qaAtlasManifest = {
  kind: 'mad-qa-issue-atlas',
  version: '20260726162030123',
  featureCount: 1,
  issueCount: 1,
  items: [{
    issue_id: rockportQaCase.id,
    view_id: 'MADV_QA_ASL_DUPES',
    record_id: rockportQaCase.id,
    address: '8 Alpaca Court',
  }],
}

const qaBatchDashboard = {
  ...emptyQaBatchDashboard,
  worker: { concurrency: 1, active: true, model: 'qwen3-4b-thinking-2507' },
  jobs: [{
    id: 'BATCH-20260725-TEST0001',
    viewId: 'MADV_QA_ASL_DUPES',
    issue: {
      id: 'MADV_QA_ASL_DUPES',
      description: 'Structure lookup records that are functionally duplicative',
      category: 'Point–structure lookups',
    },
    model: 'qwen3-4b-thinking-2507',
    status: 'running',
    total: 2,
    completed: 1,
    counts: {
      queued: 0,
      running: 1,
      ready: 1,
      withheld: 0,
      failed: 0,
      accepted: 0,
      rejected: 0,
      cancelled: 0,
    },
    current: {
      itemId: 'BATCH-20260725-TEST0001-002',
      recordId: qaRecordPage.rows[1].id,
      address: qaRecordPage.rows[1].address,
      municipality: qaRecordPage.rows[1].municipality,
      activity: { title: 'Read combined QA evidence' },
    },
  }],
  inbox: {
    counts: { ready: 1, withheld: 0, failed: 0, accepted: 0, rejected: 0 },
    items: [{
      id: 'BATCH-20260725-TEST0001-001',
      jobId: 'BATCH-20260725-TEST0001',
      viewId: 'MADV_QA_ASL_DUPES',
      issue: {
        id: 'MADV_QA_ASL_DUPES',
        description: 'Structure lookup records that are functionally duplicative',
      },
      model: 'qwen3-4b-thinking-2507',
      status: 'ready',
      recordId: rockportQaCase.id,
      record: qaRecordPage.rows[0],
      caseId: rockportQaCase.id,
      proposalId: 'proposal-rockport',
      changeCount: 1,
      summary: 'Delete one functionally duplicate structure lookup row.',
      canOpen: true,
    }],
  },
}

async function selectTrainingCase(user, name = '147 Brookline Street') {
  await user.click(screen.getByText('Training examples'))
  await user.click(screen.getByRole('button', { name: new RegExp(name) }))
}

describe('MAD QA feature explorer', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(REVIEWER_SESSION_STORAGE_KEY, JSON.stringify({
      id: 'reviewer-test',
      name: 'TR',
    }))
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/api/qa/issues') {
        return Promise.resolve({ ok: true, json: async () => qaCatalog })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    }))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('requires compact reviewer initials before opening the shared workbench', async () => {
    window.localStorage.clear()
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Identify your review session' })).toBeInTheDocument()
    const initials = screen.getByRole('textbox', { name: 'Reviewer initials' })
    await user.type(initials, 'm1m')
    expect(initials).toHaveValue('MM')
    await user.click(screen.getByRole('button', { name: 'Enter workbench' }))

    expect(screen.getByRole('heading', { name: 'MAD QA' })).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem(REVIEWER_SESSION_STORAGE_KEY)).name).toBe('MM')
  })

  it('opens on the non-zero QA queue without a dense inspector', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'MAD QA' })).toBeInTheDocument()
    expect(await screen.findByText('Current QA issues')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Select a non-zero QA check' })).toBeInTheDocument()
    expect(screen.getByText('Structure lookup records that are functionally duplicative')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Attributes' })).not.toBeInTheDocument()
  })

  it('opens the issue atlas from the start page and queues its exact QA row', async () => {
    const fetchMock = vi.fn((url, options = {}) => {
      if (url === '/api/qa/issues') {
        return Promise.resolve({ ok: true, json: async () => qaCatalog })
      }
      if (url === '/api/qa/atlas') {
        return Promise.resolve({ ok: true, json: async () => qaAtlasManifest })
      }
      if (url === '/api/qa/batches' && options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ dashboard: qaBatchDashboard }),
        })
      }
      if (url === '/api/qa/batches') {
        return Promise.resolve({ ok: true, json: async () => emptyQaBatchDashboard })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /view affected features/i }))
    expect(await screen.findByRole('heading', { name: 'Affected feature atlas' })).toBeInTheDocument()
    expect(screen.getByText('1 mapped features')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Run atlas issue' }))
    expect(await screen.findByRole('heading', { name: 'Batch queue' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/qa/batches', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        viewId: 'MADV_QA_ASL_DUPES',
        recordIds: [rockportQaCase.id],
        recordPrompts: {},
      }),
    }))
  })

  it('sends selected QA rows to the persistent bridge queue', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url === '/api/qa/issues') return Promise.resolve({ ok: true, json: async () => qaCatalog })
      if (url === '/api/qa/batches' && options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ job: qaBatchDashboard.jobs[0], dashboard: qaBatchDashboard }),
        })
      }
      if (url === '/api/qa/batches') {
        return Promise.resolve({ ok: true, json: async () => emptyQaBatchDashboard })
      }
      if (url === '/api/qa/issues/MADV_QA_ASL_DUPES/records') {
        return Promise.resolve({ ok: true, json: async () => qaRecordPage })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Structure lookup records that are functionally duplicative/ }))
    await user.click(await screen.findByRole('button', { name: 'Select first 2' }))
    await user.click(screen.getByRole('button', { name: 'Queue 2 selected' }))

    expect(await screen.findByRole('heading', { name: 'Batch queue' })).toBeInTheDocument()
    expect(screen.getByText('Queued work continues while this browser is closed.')).toBeInTheDocument()
    expect(screen.getByText('BATCH-20260725-TEST0001')).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/qa/batches', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        viewId: 'MADV_QA_ASL_DUPES',
        recordIds: [rockportQaCase.id, 'MADV_QA_ASL_DUPES-MOCK-0002'],
        recordPrompts: {},
      }),
    }))
  })

  it('attaches reviewer context to only the selected QA record before it is queued', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url === '/api/qa/issues') return Promise.resolve({ ok: true, json: async () => qaCatalog })
      if (url === '/api/qa/batches' && options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ job: qaBatchDashboard.jobs[0], dashboard: qaBatchDashboard }),
        })
      }
      if (url === '/api/qa/batches') return Promise.resolve({ ok: true, json: async () => emptyQaBatchDashboard })
      if (url === '/api/qa/issues/MADV_QA_ASL_DUPES/records') {
        return Promise.resolve({ ok: true, json: async () => qaRecordPage })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Structure lookup records that are functionally duplicative/ }))
    await user.click(await screen.findByRole('button', { name: /Add agent context for 8 Alpaca Court, Rockport/ }))
    await user.type(screen.getByLabelText('Context for the agent'), 'Check the municipal source before staging a change.')
    await user.click(screen.getByRole('button', { name: 'Save context' }))
    expect(screen.getByRole('button', { name: /Edit agent context for 8 Alpaca Court, Rockport/ })).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Select 8 Alpaca Court, Rockport/ }))
    await user.click(screen.getByRole('button', { name: 'Queue 1 selected' }))

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/qa/batches', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        viewId: 'MADV_QA_ASL_DUPES',
        recordIds: [rockportQaCase.id],
        recordPrompts: {
          [rockportQaCase.id]: 'Check the municipal source before staging a change.',
        },
      }),
    }))
  })

  it('opens the persistent review inbox while a batch continues', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/api/qa/issues') return Promise.resolve({ ok: true, json: async () => qaCatalog })
      if (url === '/api/qa/batches') {
        return Promise.resolve({ ok: true, json: async () => qaBatchDashboard })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Review inbox/ }))

    expect(await screen.findByRole('heading', { name: 'Review inbox' })).toBeInTheDocument()
    expect(screen.getByText('Completed investigations arrive here while remaining batches continue.')).toBeInTheDocument()
    expect(screen.getByText('Delete one functionally duplicate structure lookup row.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Claim & review/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 active' })).toBeInTheDocument()
  })

  it('opens the current queued record with its persisted agent transcript', async () => {
    const batchJob = {
      ...qaBatchDashboard.jobs[0],
      items: [
        {
          id: 'BATCH-20260725-TEST0001-001',
          status: 'ready',
          record: qaRecordPage.rows[0],
          transcript: [],
        },
        {
          id: 'BATCH-20260725-TEST0001-002',
          status: 'running',
          record: qaRecordPage.rows[1],
          transcript: [
            { id: 'model-1', type: 'model', phase: 'completed', turn: 1, title: 'Model turn 1' },
            { id: 'reasoning-1', type: 'reasoning_delta', turn: 1, text: 'Checking the address relationship.' },
            { id: 'skill-1', type: 'skill', phase: 'completed', name: 'load_skill', title: 'Skill loaded on demand' },
          ],
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/api/qa/issues') return Promise.resolve({ ok: true, json: async () => qaCatalog })
      if (url === '/api/qa/batches') return Promise.resolve({ ok: true, json: async () => qaBatchDashboard })
      if (url === '/api/qa/batches/BATCH-20260725-TEST0001') {
        return Promise.resolve({ ok: true, json: async () => ({ job: batchJob }) })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Batch queue/ }))
    await user.click(screen.getByRole('button', { name: /View live agent output for/ }))

    expect(await screen.findByRole('heading', { name: 'Structure lookup records that are functionally duplicative' })).toBeInTheDocument()
    expect(screen.getByText('Checking the address relationship.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to batch queue' })).toBeInTheDocument()
  })

  it('previews a bounded related-feature map before starting the agent', async () => {
    const mapPreviewUrl = `/api/qa/issues/MADV_QA_ASL_DUPES/records/${rockportQaCase.id}/map-preview`
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/api/qa/issues') return Promise.resolve({ ok: true, json: async () => qaCatalog })
      if (url === '/test-data/brookline-mad-snapshot.json') return Promise.resolve({ ok: false, json: async () => ({}) })
      if (url === '/api/qa/issues/MADV_QA_ASL_DUPES/records') {
        return Promise.resolve({ ok: true, json: async () => qaRecordPage })
      }
      if (url === mapPreviewUrl) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            kind: 'mad-qa-map-preview',
            caseItem: {
              ...rockportQaCase,
              status: 'preview',
              operations: [],
              changes: [],
            },
            extract: {
              kind: 'mad-qa-map-preview-extract',
              town: { name: 'Rockport', addressTownId: 252, communityIds: [270] },
              bounds: [-70.6156, 42.6502, -70.6123, 42.6528],
              center: [42.6515, -70.614],
              zoom: 18,
              layers: [],
              metadata: { readOnly: true, preAgent: true, loadedFeatureCount: 38 },
            },
            records: {
              'addresses:M_272655_933812': {
                key: 'addresses:M_272655_933812',
                label: 'Address point',
                id: 'M_272655_933812',
                attributes: [{ field: 'ADDRESS_POINT_ID', value: 'M_272655_933812' }],
                related: ['structure-lookup:duplicate'],
              },
              'structure-lookup:duplicate': {
                key: 'structure-lookup:duplicate',
                label: 'Structure lookup',
                id: 'duplicate',
                attributes: [{ field: 'STRUCTURE_ID', value: '272643_933827' }],
                related: ['addresses:M_272655_933812'],
              },
            },
            selectedFeatureKey: 'structures:272643_933827',
            relation: {
              anchorFeatureKeys: ['structures:272643_933827'],
              description: 'The nonspatial lookup row is mapped through STRUCTURE_ID to its structure polygon.',
            },
            limits: { bufferMeters: 120, maxFeaturesPerLayer: 50, maxTotalFeatures: 200 },
          }),
        })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Structure lookup records that are functionally duplicative/ }))
    await user.click(await screen.findByRole('button', { name: 'Preview map for 8 Alpaca Court, Rockport' }))

    expect(await screen.findByText('Pre-agent map preview for Rockport')).toBeInTheDocument()
    expect(screen.getByText('Mapped before agent run')).toBeInTheDocument()
    expect(screen.getByText(/mapped through STRUCTURE_ID to its structure polygon/)).toBeInTheDocument()
    expect(screen.getByText('Highlighted feature: structures:272643_933827')).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith(mapPreviewUrl, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      '/api/qa/issues/MADV_QA_ASL_DUPES/investigate-stream',
      expect.anything(),
    )

    await user.click(screen.getByRole('button', { name: 'Open town address point' }))
    expect(await screen.findByText('ADDRESS_POINT_ID')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close attributes' }))
    await user.click(screen.getByRole('button', { name: 'Back to rows' }))
    expect(await screen.findByRole('button', { name: 'Run selected' })).toBeDisabled()
  })

  it('shows the local proposal audit path and opens it through the protected bridge action', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/api/qa/issues') {
        return Promise.resolve({ ok: true, json: async () => qaCatalog })
      }
      if (url === '/api/audit/proposal-history') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            kind: 'mad-proposal-audit-csv',
            relativePath: '.runtime\\proposal-history.csv',
            path: 'C:\\workspace\\.runtime\\proposal-history.csv',
            eventCount: 7,
          }),
        })
      }
      if (url === '/api/audit/proposal-history/open') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            opened: true,
            message: 'Proposal audit CSV opened in Windows File Explorer.',
            relativePath: '.runtime\\proposal-history.csv',
            eventCount: 7,
          }),
        })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    }))
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByText('.runtime\\proposal-history.csv')).toBeInTheDocument()
    expect(screen.getByText('7 events recorded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Open proposal audit in Windows File Explorer/ }))

    expect(await screen.findByText('Proposal audit CSV opened in Windows File Explorer.')).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/audit/proposal-history/open', {
      method: 'POST',
      headers: { 'x-mad-local-action': 'open-proposal-audit' },
    })
  })

  it('investigates a selected QA check, loads its town extract, and opens real attributes', async () => {
    let finishInvestigation
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/api/qa/issues') {
        return Promise.resolve({ ok: true, json: async () => qaCatalog })
      }
      if (url === '/test-data/brookline-mad-snapshot.json') {
        return Promise.resolve({ ok: false, json: async () => ({}) })
      }
      if (url === '/api/qa/issues/MADV_QA_ASL_DUPES/records') {
        return Promise.resolve({ ok: true, json: async () => qaRecordPage })
      }
      if (url === '/api/qa/issues/MADV_QA_ASL_DUPES/investigate-stream') {
        return new Promise((resolve) => { finishInvestigation = resolve })
      }
      if (url === '/api/towns/252/extract') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            kind: 'mad-town-extract',
            town: { name: 'Rockport', addressTownId: 252, communityIds: [270] },
            bounds: [-70.64, 42.62, -70.56, 42.69],
            center: [42.65, -70.61],
            zoom: 14,
            layers: [],
            metadata: { readOnly: true, stableIdsRetained: false },
          }),
        })
      }
      if (String(url).startsWith('/api/towns/252/records?')) {
        const key = new URL(String(url), 'http://localhost').searchParams.get('key')
        if (key === 'structures:272643_933827') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              selectedKey: key,
              records: {
                [key]: {
                  key,
                  label: 'MAD structure',
                  id: '272643_933827',
                  attributes: [{ field: 'STRUCTURE_ID', value: '272643_933827' }],
                  related: ['addresses:M_272655_933812'],
                },
              },
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            selectedKey: 'addresses:M_272655_933812',
            records: {
              'addresses:M_272655_933812': {
                key: 'addresses:M_272655_933812',
                label: 'Address point',
                id: 'M_272655_933812',
                attributes: [{ field: 'ADDRESS_POINT_ID', value: 'M_272655_933812' }],
                related: ['master-address:4242779'],
              },
              'master-address:4242779': {
                key: 'master-address:4242779',
                label: 'Master Address',
                id: '4242779',
                attributes: [{ field: 'MASTER_ADDRESS_ID', value: 4242779 }],
                related: ['addresses:M_272655_933812'],
              },
            },
          }),
        })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Structure lookup records that are functionally duplicative/ }))
    expect(await screen.findByText('Showing 2 of 181 issues')).toBeInTheDocument()
    expect(screen.queryByText('Local agent investigation')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Select 8 Alpaca Court, Rockport/ }))
    await user.click(screen.getByRole('button', { name: 'Run 1 selected' }))
    expect(screen.getByText('Local agent investigation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop agent' })).toBeInTheDocument()

    finishInvestigation({
      ok: true,
      json: async () => ({
        issue: qaCatalog.groups[0].issues[0],
        caseItem: rockportQaCase,
        townExtractUrl: '/api/towns/252/extract',
        reply: 'I found one duplicate lookup relationship at **8 Alpaca Court**.',
        toolEvents: [{ name: 'get_qa_issue_evidence', summary: 'Read record-level QA evidence' }],
        draft: {
          id: 'proposal-rockport',
          changes: rockportQaCase.changes,
          validation: { passed: true },
        },
        proposals: [],
      }),
    })

    expect(await screen.findByText('Town extract workspace for Rockport')).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/qa/issues/MADV_QA_ASL_DUPES/investigate-stream',
      expect.objectContaining({ body: JSON.stringify({ recordId: rockportQaCase.id, reviewerContext: '' }) }),
    )
    expect(await screen.findByText('8 Alpaca Court')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))
    expect(screen.getByText('Reviewable, not publishable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stable row ID required' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Close changes' }))
    await user.click(screen.getByRole('button', { name: 'Open town address point' }))
    expect(await screen.findByRole('heading', { name: 'Attributes' })).toBeInTheDocument()
    expect(screen.getByText('ADDRESS_POINT_ID')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Master Address 4242779/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close attributes' }))

    await user.click(screen.getByRole('button', { name: 'Query overlapping town features' }))
    expect(screen.getByRole('heading', { name: '3 features' })).toBeInTheDocument()
    expect(screen.getByText('Choose a record')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /MAD structures.*Structure 272643_933827/ }))
    expect(await screen.findByText('STRUCTURE_ID')).toBeInTheDocument()
    expect(screen.getByText('Highlighted feature: structures:272643_933827')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to previous selection' }))
    expect(screen.getByRole('heading', { name: '3 features' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Address points.*8 ALPACA COURT/ }))
    expect(await screen.findByText('ADDRESS_POINT_ID')).toBeInTheDocument()
    expect(screen.getByText('Highlighted feature: addresses:M_272655_933812')).toBeInTheDocument()
  })

  it('streams model thinking, skill loads, tool calls, and output through the center workspace', async () => {
    const encoder = new TextEncoder()
    let streamController
    const streamResponse = {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          streamController = controller
        },
      }),
    }
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/api/qa/issues') return Promise.resolve({ ok: true, json: async () => qaCatalog })
      if (url === '/test-data/brookline-mad-snapshot.json') return Promise.resolve({ ok: false, json: async () => ({}) })
      if (url === '/api/qa/issues/MADV_QA_ASL_DUPES/records') {
        return Promise.resolve({ ok: true, json: async () => qaRecordPage })
      }
      if (url === '/api/qa/issues/MADV_QA_ASL_DUPES/investigate-stream') return Promise.resolve(streamResponse)
      return Promise.resolve({ ok: false, json: async () => ({}) })
    }))
    const sendEvent = (event, payload) => {
      streamController.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`))
    }
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Structure lookup records that are functionally duplicative/ }))
    await user.click(await screen.findByRole('checkbox', { name: /Select 8 Alpaca Court, Rockport/ }))
    await user.click(screen.getByRole('button', { name: 'Run 1 selected' }))
    sendEvent('activity', {
      id: 'model-1', type: 'model', phase: 'started', turn: 1, model: 'another-local-model',
      title: 'Model turn 1', detail: 'Reading the case.',
    })
    sendEvent('activity', {
      id: 'reasoning-1', type: 'reasoning_delta', turn: 1, text: 'Comparing lookup relationships.',
    })
    sendEvent('activity', {
      id: 'skill-call', type: 'skill', phase: 'completed', name: 'load_skill',
      title: 'Skill loaded on demand', detail: 'Loaded skill: MAD Schema Intelligence',
    })
    sendEvent('activity', {
      id: 'tool-call', type: 'tool', phase: 'completed', name: 'get_qa_investigation_packet',
      title: 'get_qa_investigation_packet', detail: 'Read combined QA evidence and Rockport town context',
    })
    sendEvent('activity', {
      id: 'output-1', type: 'output_delta', turn: 1, text: '**Duplicate confirmed** and staged for review.',
    })

    expect(await screen.findByText('Comparing lookup relationships.')).toBeInTheDocument()
    expect(screen.getByText('load_skill')).toBeInTheDocument()
    expect(screen.getAllByText('get_qa_investigation_packet')).toHaveLength(2)
    expect(screen.getByText('Duplicate confirmed').tagName).toBe('STRONG')
    expect(screen.getByText('another-local-model')).toBeInTheDocument()

    sendEvent('complete', {
      issue: qaCatalog.groups[0].issues[0],
      caseItem: { ...rockportQaCase, status: 'evidence', townExtractSummary: null },
      townExtractUrl: null,
      model: 'another-local-model',
      reply: 'No change staged.',
      toolEvents: [],
      draft: null,
      proposals: [],
    })
    streamController.close()
    expect(await screen.findByText('Production view connection required')).toBeInTheDocument()
  })

  it('runs only the selected QA rows and returns a review list for a multi-row batch', async () => {
    const investigationCalls = []
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url === '/api/qa/issues') return Promise.resolve({ ok: true, json: async () => qaCatalog })
      if (url === '/test-data/brookline-mad-snapshot.json') return Promise.resolve({ ok: false, json: async () => ({}) })
      if (url === '/api/qa/issues/MADV_QA_ASL_DUPES/records') {
        return Promise.resolve({ ok: true, json: async () => qaRecordPage })
      }
      if (url === '/api/qa/issues/MADV_QA_ASL_DUPES/investigate-stream') {
        const { recordId } = JSON.parse(options.body)
        investigationCalls.push(recordId)
        return Promise.resolve({
          ok: true,
          json: async () => ({
            issue: qaCatalog.groups[0].issues[0],
            selectedRecord: qaRecordPage.rows.find((row) => row.id === recordId),
            caseItem: {
              ...rockportQaCase,
              id: `${recordId}-case`,
              status: 'evidence',
              townExtractSummary: null,
            },
            townExtractUrl: null,
            model: 'local-batch-model',
            reply: `Reviewed ${recordId}.`,
            toolEvents: [],
            draft: null,
            proposals: [],
          }),
        })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Structure lookup records that are functionally duplicative/ }))
    await user.click(await screen.findByRole('button', { name: 'Select first 2' }))
    await user.click(screen.getByRole('button', { name: 'Run 2 selected' }))

    expect(await screen.findByText('Selected issue run complete')).toBeInTheDocument()
    expect(screen.getByText('2 reviewed')).toBeInTheDocument()
    expect(investigationCalls).toEqual([
      rockportQaCase.id,
      'MADV_QA_ASL_DUPES-MOCK-0002',
    ])
  })

  it('stops the active model request and leaves remaining selected rows unrun', async () => {
    const startedRows = []
    let investigationSignal
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url === '/api/qa/issues') return Promise.resolve({ ok: true, json: async () => qaCatalog })
      if (url === '/test-data/brookline-mad-snapshot.json') return Promise.resolve({ ok: false, json: async () => ({}) })
      if (url === '/api/qa/issues/MADV_QA_ASL_DUPES/records') {
        return Promise.resolve({ ok: true, json: async () => qaRecordPage })
      }
      if (url === '/api/qa/issues/MADV_QA_ASL_DUPES/investigate-stream') {
        const { recordId } = JSON.parse(options.body)
        startedRows.push(recordId)
        investigationSignal = options.signal
        return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true })
        })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    }))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /Structure lookup records that are functionally duplicative/ }))
    await user.click(await screen.findByRole('button', { name: 'Select first 2' }))
    await user.click(screen.getByRole('button', { name: 'Run 2 selected' }))
    await user.click(await screen.findByRole('button', { name: 'Stop agent' }))

    expect(investigationSignal.aborted).toBe(true)
    expect(startedRows).toEqual([rockportQaCase.id])
    expect((await screen.findAllByText('Stopped by reviewer')).length).toBeGreaterThan(0)
    expect(screen.getByText(/No remaining selected rows will start/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to issues' }))
    expect(screen.getByRole('button', { name: 'Run 2 selected' })).toBeInTheDocument()
  })

  it('opens an attribute table and follows preset relationships', async () => {
    const user = userEvent.setup()
    render(<App />)
    await selectTrainingCase(user)

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
    await selectTrainingCase(user)

    await user.click(screen.getByRole('button', { name: 'Open address point' }))
    expect(screen.queryByRole('button', { name: 'Accept and send to publisher' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))

    expect(screen.getByRole('button', { name: 'Accept and send to publisher' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject and add feedback' })).toBeInTheDocument()
  })

  it('shows every changed source and draft value in the agent diff', async () => {
    const user = userEvent.setup()
    render(<App />)
    await selectTrainingCase(user)

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
    await selectTrainingCase(user)

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

    await selectTrainingCase(user, '8 Harbor Lane')
    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))

    expect(screen.getAllByText('new-point-1').some((node) => node.closest('.diff-value')?.classList.contains('after'))).toBe(true)
    expect(screen.getAllByText('New').length).toBeGreaterThan(1)
    expect(screen.queryByText('Current')).not.toBeInTheDocument()
  })

  it('renders a blank prior relationship as an explicit red source value', async () => {
    const user = userEvent.setup()
    render(<App />)

    await selectTrainingCase(user, '62 Alder Road')
    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))

    expect(screen.getByText((content, element) => (
      element?.tagName === 'STRONG' && content.charCodeAt(0) === 8212
    )).closest('.diff-value')).toHaveClass('before')
    expect(screen.getByText('AP-884102').closest('.diff-value')).toHaveClass('after')
  })

  it('makes clear when an evidence-only case has no agent edits', async () => {
    const user = userEvent.setup()
    render(<App />)

    await selectTrainingCase(user, '211 Union Street')
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
    await selectTrainingCase(user)

    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))
    await user.click(screen.getByRole('button', { name: 'Accept and send to publisher' }))

    expect(await screen.findByText('Publisher handoff created')).toBeInTheDocument()
    expect(screen.getByText(/Validate mode made no MAD edit/)).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/cases/MAD-2026-1842/accept', expect.objectContaining({ method: 'POST' }))
  })

  it('collects a rejection comment and places it in the local agent revision context', async () => {
    let finishReject
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/test-data/brookline-mad-snapshot.json') return Promise.resolve({ ok: false })
      return new Promise((resolve) => { finishReject = resolve })
    }))
    const user = userEvent.setup()
    render(<App />)
    await selectTrainingCase(user)

    await user.click(screen.getByRole('button', { name: 'Show agent diff' }))
    await user.click(screen.getByRole('button', { name: 'Reject and add feedback' }))
    expect(screen.getByRole('heading', { name: 'What needs to change?' })).toBeInTheDocument()
    expect(screen.getByText('AP agent memory target')).toBeInTheDocument()
    expect(screen.getByText('agent-skills\\mad-qa-ap\\SKILL.md')).toBeInTheDocument()
    expect(screen.getByText('agent-skills\\mad-qa-ap\\references\\reviewer-memory.md')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Reviewer feedback' }), 'Use the driveway access point instead of the east entrance.')
    await user.click(screen.getByRole('button', { name: 'Reject and teach agent' }))
    expect(screen.getByText('Local agent is authoring AP memory')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agent authoring AP memory…' })).toBeDisabled()

    await act(async () => {
      finishReject({
        ok: true,
        json: async () => ({
          rejection: {
            id: 'reject-test',
            status: 'active',
            comment: 'Use the driveway access point instead of the east entrance.',
            memoryUpdate: {
              written: true,
              status: 'written',
              categoryCode: 'AP',
              memoryFile: 'agent-skills\\mad-qa-ap\\references\\reviewer-memory.md',
              agentEntry: {
                title: 'Verify driveway access before moving a point',
                lesson: 'Use imagery-confirmed access evidence rather than inferring an entrance from the footprint.',
              },
            },
          },
        }),
      })
    })

    expect(await screen.findByText('Reviewer feedback is in context')).toBeInTheDocument()
    expect(screen.getByText('Use the driveway access point instead of the east entrance.')).toBeInTheDocument()
    expect(screen.getByText('AP lesson authored and written')).toBeInTheDocument()
    expect(screen.getByText('Verify driveway access before moving a point')).toBeInTheDocument()
    expect(screen.getByText(/Use imagery-confirmed access evidence/)).toBeInTheDocument()
    expect(screen.getByText('agent-skills\\mad-qa-ap\\references\\reviewer-memory.md')).toBeInTheDocument()
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
    await selectTrainingCase(user)

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
      if (url === '/api/qa/issues') return Promise.resolve({ ok: true, json: async () => qaCatalog })
      return new Promise((resolve) => { resolveAgentRequest = resolve })
    }))
    const user = userEvent.setup()
    render(<App />)
    await selectTrainingCase(user)

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

    await selectTrainingCase(user, '211 Union Street')
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
