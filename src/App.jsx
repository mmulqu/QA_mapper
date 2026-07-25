/*
THESIS: A reviewer should be able to map a QA row before invoking an agent, then inspect its MAD features and known relationships.
OWN-WORLD: Survey evidence dossier—cool drafting paper, blueprint ink, simple vectors, and full-size usable type.
STORY: Choose a QA check, preview one bounded row on the map, inspect attributes and relates, then decide whether the agent should run.
FIRST VIEWPORT: A permanent left QA docket and one large Leaflet workspace; row selection precedes a bounded pre-agent map.
FORM: Map-first feature explorer with progressive disclosure; no persistent evidence folio.
*/

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  CircleDot,
  Database,
  FileText,
  Layers3,
  Link2,
  LoaderCircle,
  MapPin,
  MapPinned,
  PanelLeftClose,
  Play,
  Search,
  X,
} from 'lucide-react'
import AgentPanel from './components/AgentPanel'
import AgentActivityStream from './components/AgentActivityStream'
import ChangeDiffInspector from './components/ChangeDiffInspector'
import MapWorkspace from './components/MapWorkspace'
import ProposalAuditControl from './components/ProposalAuditControl'
import RejectDraftDialog from './components/RejectDraftDialog'
import { MAP_SERVICES } from './config/mapServices'
import { cases } from './data/cases'
import { getFeatureRecords, relatedKeys } from './lib/featureRecords'
import { countChangedFields, getCaseChanges } from './lib/changeDiff'
import { getPublicMadRecords } from './lib/publicMadRecords'
import {
  acceptCaseDraft,
  getProposalLineage,
  getQaIssueCatalog,
  getQaIssueRecords,
  getQaRecordMapPreview,
  getTownExtract,
  getTownRecordBundle,
  investigateQaIssue,
  rejectCaseDraft,
} from './lib/agentClient'

const featureIcons = {
  'address-point': MapPin,
  'master-address': Database,
  structure: Database,
  'structure-lookup': Link2,
  'address-variant': FileText,
  parcel: Database,
  road: Database,
}

function mergeAgentActivity(current, incoming) {
  const isDelta = incoming.type === 'reasoning_delta' || incoming.type === 'output_delta'
  const type = incoming.type === 'reasoning_delta'
    ? 'reasoning'
    : incoming.type === 'output_delta'
      ? 'output'
      : incoming.type
  let next = current

  if (incoming.type === 'model' && incoming.phase === 'completed') {
    next = current.map((event) => (
      event.turn === incoming.turn && ['reasoning', 'output'].includes(event.type)
        ? { ...event, phase: 'completed' }
        : event
    ))
  }

  const normalized = {
    ...incoming,
    type,
    phase: incoming.phase || (isDelta ? 'started' : undefined),
    title: incoming.title || (type === 'reasoning' ? 'Model reasoning' : type === 'output' ? 'Model response' : undefined),
  }
  const index = next.findIndex((event) => event.id === normalized.id)
  if (index >= 0) {
    const existing = next[index]
    const text = isDelta ? `${existing.text || ''}${normalized.text || ''}` : (normalized.text ?? existing.text)
    const boundedText = text?.length > 24_000 ? `…${text.slice(-24_000)}` : text
    const updated = [...next]
    updated[index] = { ...existing, ...normalized, ...(boundedText ? { text: boundedText } : {}) }
    return updated.slice(-80)
  }

  return [...next, normalized].slice(-80)
}

const townSpatialLayers = new Set([
  'addresses',
  'centroids',
  'structures',
  'parcels',
  'roads',
  'communities',
])

function isTownSpatialFeature(featureKey) {
  return townSpatialLayers.has(featureKey?.split(':', 1)[0])
}

function FeatureIcon({ featureKey, size = 18 }) {
  const Icon = featureKey.startsWith('nearby:')
    || featureKey.startsWith('public-address-point:')
    || featureKey.startsWith('addresses:')
    || featureKey.startsWith('centroids:')
    ? MapPin
    : featureKey.startsWith('public-advanced-address:')
      || featureKey.startsWith('address-variant:')
      ? FileText
      : featureIcons[featureKey] || Database
  return <Icon size={size} aria-hidden="true" />
}

function CaseDocket({
  qaCatalog,
  qaCatalogStatus,
  qaCatalogError,
  activeIssueId,
  investigationStatus,
  onSelectQaIssue,
  activeCaseId,
  activeDataView,
  onSelectCase,
  onSelectPublicSnapshot,
  publicSnapshot,
  collapsed,
  onToggle,
}) {
  const [openQaGroups, setOpenQaGroups] = useState(() => new Set())

  useEffect(() => {
    const fixtureGroups = new Set(
      (qaCatalog?.groups ?? [])
        .filter((group) => group.issues.some((issue) => issue.localFixture))
        .map((group) => group.id),
    )
    setOpenQaGroups((current) => current.size ? current : fixtureGroups)
  }, [qaCatalog])

  return (
    <aside className={collapsed ? 'case-docket is-collapsed' : 'case-docket'} aria-label="QA cases">
      <header className="docket-header">
        <div>
          <span className="app-kicker">MassGIS</span>
          <h1>MAD QA</h1>
          <p>Feature review queue</p>
        </div>
        <button type="button" className="docket-close" onClick={onToggle} aria-label="Hide case list">
          <PanelLeftClose size={20} />
        </button>
      </header>

      <div className="docket-case-list">
        <section className="qa-queue" aria-labelledby="qa-queue-heading">
          <header className="qa-queue-header">
            <div>
              <span id="qa-queue-heading">Current QA issues</span>
              <small>Non-zero checks only</small>
            </div>
            {qaCatalog?.summary ? <strong>{qaCatalog.summary.issueCount}</strong> : null}
          </header>

          {qaCatalogStatus === 'loading' ? (
            <div className="qa-queue-state" role="status">
              <LoaderCircle className="agent-spinner" size={18} />
              <span>Reading daily QA report…</span>
            </div>
          ) : qaCatalogError ? (
            <div className="qa-queue-state is-error" role="alert">
              <AlertTriangle size={17} />
              <span>{qaCatalogError}</span>
            </div>
          ) : (
            <div className="qa-group-list">
              {(qaCatalog?.groups ?? []).map((group) => (
                <details
                  className="qa-group"
                  key={group.id}
                  open={openQaGroups.has(group.id)}
                  onToggle={(event) => {
                    const nextOpen = event.currentTarget.open
                    setOpenQaGroups((current) => {
                      const alreadyOpen = current.has(group.id)
                      if (alreadyOpen === nextOpen) return current
                      const next = new Set(current)
                      if (nextOpen) next.add(group.id)
                      else next.delete(group.id)
                      return next
                    })
                  }}
                >
                  <summary>
                    <span>
                      <strong>{group.label}</strong>
                      <small>{group.issueCount} checks · {group.recordCount.toLocaleString()} results</small>
                    </span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </summary>
                  <div className="qa-issue-list">
                    {group.issues.map((issue) => {
                      const active = activeDataView === 'qa' && issue.id === activeIssueId
                      const working = active && investigationStatus === 'working'
                      return (
                        <button
                          type="button"
                          key={issue.id}
                          className={active ? 'qa-issue active' : 'qa-issue'}
                          onClick={() => onSelectQaIssue(issue)}
                          aria-current={active ? 'true' : undefined}
                        >
                          <span className="qa-issue-count">{issue.count.toLocaleString()}</span>
                          <span className="qa-issue-copy">
                            <strong>{issue.description}</strong>
                            <small>{issue.id}</small>
                            {issue.localFixture ? (
                              <em>
                                {issue.localFixture.status === 'controlled-fault'
                                  ? 'Rockport controlled fault available'
                                  : 'Rockport test data available'}
                              </em>
                            ) : null}
                          </span>
                          {working ? <LoaderCircle className="agent-spinner" size={17} /> : <ChevronRight size={17} />}
                        </button>
                      )
                    })}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>

        {publicSnapshot && (
          <div className="public-data-source">
            <span>Loaded test data</span>
            <button
              type="button"
              className={activeDataView === 'public' ? 'case-item public-data active' : 'case-item public-data'}
              onClick={onSelectPublicSnapshot}
              aria-current={activeDataView === 'public' ? 'page' : undefined}
            >
              <span className="case-dot public" />
              <span className="case-item-copy">
                <strong>Brookline MAD snapshot</strong>
                <span>{publicSnapshot.metadata.fixturePointCount.toLocaleString()} public address points</span>
                <small>Read-only · Basic Points ↔ Advanced List</small>
              </span>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
        <details className="training-case-group">
          <summary>
            <span>
              <strong>Training examples</strong>
              <small>{cases.length} synthetic cases</small>
            </span>
            <ChevronRight size={17} />
          </summary>
          {cases.map((caseItem) => {
            const active = activeDataView === 'cases' && caseItem.id === activeCaseId
            return (
              <button
                type="button"
                key={caseItem.id}
                className={active ? 'case-item active' : 'case-item'}
                onClick={() => onSelectCase(caseItem.id)}
                aria-current={active ? 'page' : undefined}
              >
                <span className={caseItem.status === 'evidence' ? 'case-dot hold' : 'case-dot'} />
                <span className="case-item-copy">
                  <strong>{caseItem.address}</strong>
                  <span>{caseItem.municipality}</span>
                  <small>{caseItem.issueType}</small>
                </span>
                <ChevronRight size={18} />
              </button>
            )
          })}
        </details>
      </div>

      <footer className="docket-footer">
        <div className="docket-workspace-status">
          <CircleDot size={15} />
          <span>
            {activeDataView === 'qa'
              ? 'QA report · town extracts are read-only'
              : activeDataView === 'public'
                ? 'Public export · no edit actions'
                : 'Training workspace · vector export'}
          </span>
        </div>
        <ProposalAuditControl />
      </footer>
    </aside>
  )
}

function FeatureInspector({
  records,
  featureKey,
  onSelectFeature,
  onBack,
  onClose,
}) {
  const record = records[featureKey]
  if (!record) return null
  const relations = relatedKeys(record)

  return (
    <aside className="feature-inspector" aria-label="Selected feature attributes">
      <header className={onBack ? 'inspector-header has-back' : 'inspector-header'}>
        {onBack ? (
          <button type="button" className="inspector-back" onClick={onBack} aria-label="Back to previous selection" title="Back">
            <ArrowLeft size={20} />
          </button>
        ) : null}
        <span className="inspector-feature-icon"><FeatureIcon featureKey={record.key} size={21} /></span>
        <div>
          <span>{record.label}</span>
          <h2>{record.id}</h2>
        </div>
        <button type="button" className="inspector-close" onClick={onClose} aria-label="Close attributes">
          <X size={20} />
        </button>
      </header>

      <section className="attribute-section" aria-labelledby="attribute-heading">
        <h3 id="attribute-heading">Attributes</h3>
        <dl className="attribute-table">
          {record.attributes.map((attribute) => (
            <div key={attribute.field}>
              <dt>{attribute.field}</dt>
              <dd>{attribute.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="relation-section" aria-labelledby="relations-heading">
        <div className="relation-heading">
          <h3 id="relations-heading">Related records</h3>
          <span>Preset relate</span>
        </div>
        <div className="relation-list">
          {relations.map((key) => {
            const related = records[key]
            if (!related) return null
            return (
              <button type="button" key={key} onClick={() => onSelectFeature(key)}>
                <FeatureIcon featureKey={key} size={17} />
                <span>
                  <strong>{related.label}</strong>
                  <small>{related.id}</small>
                </span>
                <ChevronRight size={17} />
              </button>
            )
          })}
        </div>
      </section>
    </aside>
  )
}

function MapHitInspector({
  query,
  onSelectFeature,
  onClose,
}) {
  const count = query.results.length

  return (
    <aside className="feature-inspector map-hit-inspector" aria-label="Features at map click">
      <header className="inspector-header">
        <span className="inspector-feature-icon"><Layers3 size={21} /></span>
        <div>
          <span>Visible layers at click</span>
          <h2>{count} {count === 1 ? 'feature' : 'features'}</h2>
        </div>
        <button type="button" className="inspector-close" onClick={onClose} aria-label="Close map results">
          <X size={20} />
        </button>
      </header>

      <section className="map-hit-section" aria-labelledby="map-hit-heading">
        <div className="map-hit-heading">
          <div>
            <h3 id="map-hit-heading">Choose a record</h3>
            <p>Every enabled vector layer was queried at this location.</p>
          </div>
          <code>{query.latlng[0].toFixed(5)}, {query.latlng[1].toFixed(5)}</code>
        </div>

        {count ? (
          <div className="map-hit-list">
            {query.results.map((result) => (
              <button type="button" key={result.key} onClick={() => onSelectFeature(result.key)}>
                <FeatureIcon featureKey={result.key} size={18} />
                <span>
                  <strong>{result.layerLabel}</strong>
                  <span>{result.label}</span>
                  <small>{result.id} · {result.geometryType}</small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <div className="map-hit-empty">
            <Layers3 size={24} />
            <strong>No enabled features at this location</strong>
            <p>Turn on another vector layer, zoom in, or click a different location.</p>
          </div>
        )}
      </section>
    </aside>
  )
}

function QaIssueSelector({
  issue,
  recordPage,
  status,
  error,
  selectedIds,
  mapPreviewState,
  onToggle,
  onPreview,
  onSelectPreview,
  onClear,
  onRun,
  onRetry,
}) {
  const loading = status === 'loading-records'
  const selectionLimit = recordPage?.selectionLimit ?? 10
  const selectedCount = selectedIds.length
  const sheetClassName = [
    'qa-record-sheet',
    recordPage?.containsMockRows ? 'has-mock-notice' : '',
    mapPreviewState?.status === 'error' ? 'has-preview-error' : '',
  ].filter(Boolean).join(' ')

  return (
    <section className="map-workspace qa-queue-workspace" aria-label="QA issue record selection">
      <div className={sheetClassName}>
        <header className="qa-record-header">
          <div>
            <span>QA view rows</span>
            <h2>{issue?.description || 'Choose issue records'}</h2>
            <p>{issue?.id}</p>
          </div>
          {recordPage ? (
            <div className="qa-record-tally" aria-label={`${selectedCount} of ${selectionLimit} rows selected`}>
              <strong>{selectedCount}</strong>
              <span>of {selectionLimit} selected</span>
            </div>
          ) : null}
        </header>

        {loading ? (
          <div className="qa-record-state" role="status">
            <LoaderCircle className="agent-spinner" size={24} />
            <div>
              <strong>Reading the QA view preview</strong>
              <span>Loading record-level issues without starting the agent.</span>
            </div>
          </div>
        ) : error ? (
          <div className="qa-record-state is-error" role="alert">
            <AlertTriangle size={22} />
            <div>
              <strong>QA rows could not be loaded</strong>
              <span>{error}</span>
            </div>
            <button type="button" onClick={onRetry}>Try again</button>
          </div>
        ) : recordPage ? (
          <>
            <div className="qa-record-toolbar">
              <div>
                <strong>
                  Showing {recordPage.loadedCount.toLocaleString()} of {recordPage.statewideCount.toLocaleString()} issues
                </strong>
                <span>
                  {recordPage.hasMore
                    ? 'This preview is deliberately bounded. Production will page and filter the SQL view.'
                    : 'All reported issues are loaded.'}
                  {' '}Map preview loads only the approved related geometry and its bounded surroundings; it does not start the agent.
                </span>
              </div>
              <div className="qa-record-actions">
                <button type="button" onClick={onSelectPreview}>
                  Select first {Math.min(recordPage.loadedCount, selectionLimit)}
                </button>
                <button type="button" onClick={onClear} disabled={!selectedCount}>Clear</button>
              </div>
            </div>

            {recordPage.containsMockRows ? (
              <p className="qa-mock-notice">
                <AlertTriangle size={16} aria-hidden="true" />
                Mock rows are visibly labeled and can exercise the agent workflow, but cannot be accepted or published.
              </p>
            ) : null}

            {mapPreviewState?.status === 'error' ? (
              <p className="qa-map-preview-error" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <span><strong>Map preview could not be loaded.</strong> {mapPreviewState.error}</span>
              </p>
            ) : null}

            <div className="qa-record-table-wrap">
              <table className="qa-record-table">
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Select</span></th>
                    <th scope="col">Issue address</th>
                    <th scope="col">Municipality</th>
                    <th scope="col">Affected record</th>
                    <th scope="col">Map</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {recordPage.rows.map((row) => {
                    const checked = selectedIds.includes(row.id)
                    const disabled = !checked && selectedCount >= selectionLimit
                    const previewAvailable = row.mapPreview?.status === 'available'
                    const previewLoading = mapPreviewState?.status === 'loading' && mapPreviewState.record?.id === row.id
                    const anchorLabel = row.mapPreview?.relation?.anchorLabel
                    return (
                      <tr key={row.id} className={checked ? 'is-selected' : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => onToggle(row.id)}
                            aria-label={`Select ${row.address}, ${row.municipality}`}
                          />
                        </td>
                        <td>
                          <div className="qa-record-primary">
                            <strong>{row.address}</strong>
                            <span>{row.issueDetail}</span>
                          </div>
                        </td>
                        <td>{row.municipality}</td>
                        <td><code>{row.affectedRecordId}</code></td>
                        <td className="qa-map-cell">
                          <button
                            type="button"
                            className="qa-map-preview-button"
                            disabled={!previewAvailable || previewLoading}
                            onClick={() => onPreview(row)}
                            aria-label={previewAvailable
                              ? `Preview map for ${row.address}, ${row.municipality}`
                              : `Map unavailable for ${row.address}, ${row.municipality}`}
                            title={row.mapPreview?.reason || `Map through ${anchorLabel}`}
                          >
                            {previewLoading
                              ? <LoaderCircle className="agent-spinner" size={15} />
                              : <MapPinned size={15} />}
                            {previewLoading ? 'Loading' : previewAvailable ? 'View map' : 'Needs keys'}
                          </button>
                          <small>{anchorLabel ? `Via ${anchorLabel}` : 'No map relate'}</small>
                        </td>
                        <td>
                          <span className={row.mock ? 'qa-row-source is-mock' : 'qa-row-source'}>
                            {row.mock ? 'Mock' : 'Fixture'}
                          </span>
                          <small>{row.sourceLabel}</small>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <footer className="qa-record-footer">
              <span>
                The agent will process selected rows one at a time. Stop cancels the current row and leaves the rest unrun.
              </span>
              <button type="button" className="qa-run-button" onClick={onRun} disabled={!selectedCount}>
                <Play size={17} fill="currentColor" aria-hidden="true" />
                Run {selectedCount || ''} selected
              </button>
            </footer>
          </>
        ) : null}
      </div>
    </section>
  )
}

function QaBatchSummary({ issue, batch, onOpenResult, onBack }) {
  const completed = batch.results.filter((item) => item.status === 'complete').length
  const failed = batch.results.filter((item) => item.status === 'error').length

  return (
    <section className="map-workspace qa-queue-workspace" aria-label="QA batch results">
      <div className="qa-batch-sheet">
        <header>
          <div>
            <span>Selected issue run complete</span>
            <h2>{issue.description}</h2>
            <p>{completed} reviewed{failed ? ` · ${failed} could not complete` : ''}</p>
          </div>
          <button type="button" onClick={onBack}><ArrowLeft size={17} /> Back to issues</button>
        </header>
        <div className="qa-batch-results">
          {batch.results.map((item, index) => (
            <article key={item.record.id} className={item.status === 'error' ? 'is-error' : undefined}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{item.record.address}</strong>
                <small>{item.record.municipality} · {item.record.affectedRecordId}</small>
                <p>
                  {item.status === 'error'
                    ? item.error
                    : item.result.caseItem?.recommendation || 'Investigation complete.'}
                </p>
              </div>
              {item.status === 'complete' ? (
                <button type="button" onClick={() => onOpenResult(item)}>Open review</button>
              ) : <strong>Needs retry</strong>}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function QaQueueWorkspace({ issue, status, error, caseItem }) {
  const working = status === 'working' || status === 'loading-town'
  const evidenceOnly = caseItem?.status === 'evidence'

  return (
    <section className="map-workspace qa-queue-workspace" aria-label="QA investigation workspace">
      <div className="qa-workspace-sheet" role={working ? 'status' : undefined}>
        <span className="qa-workspace-mark">
          {working ? <LoaderCircle className="agent-spinner" size={28} /> : evidenceOnly ? <AlertTriangle size={28} /> : <Search size={28} />}
        </span>
        {working ? (
          <>
            <span>{status === 'loading-town' ? 'Town extract loading' : 'Local agent investigation'}</span>
            <h2>{issue.description}</h2>
            <p>
              {status === 'loading-town'
                ? 'The agent selected the issue town. The workbench is preparing its vector layers and related records for review.'
                : 'The agent is narrowing the QA view to issue records, resolving the town, and checking whether a controlled correction is safe to stage.'}
            </p>
            <div className="qa-investigation-steps" aria-label="Investigation steps">
              <span className={status === 'working' ? 'is-active' : ''}>Read QA evidence</span>
              <span className={status === 'working' ? '' : 'is-complete'}>Resolve town IDs</span>
              <span className={status === 'loading-town' ? 'is-active' : ''}>Load town extract</span>
              <span>Stage proposed fix</span>
            </div>
          </>
        ) : error ? (
          <>
            <span>Investigation could not complete</span>
            <h2>{issue?.id || 'QA category'}</h2>
            <p className="qa-workspace-error">{error}</p>
          </>
        ) : evidenceOnly ? (
          <>
            <span>Production view connection required</span>
            <h2>{issue.description}</h2>
            <p>{caseItem.rationale}</p>
            <small>{issue.count.toLocaleString()} statewide records are reported. This selected row remains review-only until authoritative IDs and relationship closure are available.</small>
          </>
        ) : (
          <>
            <span>Current QA report</span>
            <h2>Select a non-zero QA check</h2>
            <p>Open a check to see its record-level issues, select a bounded batch, and run the agent only on those rows.</p>
            <small>Rockport fixture coverage is marked in the queue. Mock preview rows are labeled and cannot be published.</small>
          </>
        )}
      </div>
    </section>
  )
}

export default function App() {
  const [activeCaseId, setActiveCaseId] = useState(cases[0].id)
  const [selectedFeatureKey, setSelectedFeatureKey] = useState(null)
  const [highlightedFeatureKey, setHighlightedFeatureKey] = useState(null)
  const [mapQuery, setMapQuery] = useState(null)
  const [showMapQuery, setShowMapQuery] = useState(false)
  const [selectionHistory, setSelectionHistory] = useState([])
  const [docketCollapsed, setDocketCollapsed] = useState(false)
  const [visibleLayers, setVisibleLayers] = useState(['addresses', 'structures', 'parcels', 'roads'])
  const [baseMap, setBaseMap] = useState(MAP_SERVICES.massgisBasemap.id)
  const [activeDataView, setActiveDataView] = useState('qa')
  const [publicSnapshot, setPublicSnapshot] = useState(null)
  const [qaCatalog, setQaCatalog] = useState(null)
  const [qaCatalogStatus, setQaCatalogStatus] = useState('loading')
  const [qaCatalogError, setQaCatalogError] = useState('')
  const [activeQaIssue, setActiveQaIssue] = useState(null)
  const [qaIssueRecords, setQaIssueRecords] = useState({ status: 'idle', error: '', page: null })
  const [qaMapPreview, setQaMapPreview] = useState({ status: 'idle', error: '', record: null, result: null })
  const [selectedQaRecordIds, setSelectedQaRecordIds] = useState([])
  const [qaBatch, setQaBatch] = useState({ status: 'idle', currentIndex: 0, total: 0, results: [] })
  const [qaCase, setQaCase] = useState(null)
  const [qaInvestigation, setQaInvestigation] = useState({ status: 'idle', error: '', result: null })
  const [qaActivity, setQaActivity] = useState([])
  const [qaModel, setQaModel] = useState('')
  const [townExtract, setTownExtract] = useState(null)
  const [townRecords, setTownRecords] = useState({})
  const [townRecordStatus, setTownRecordStatus] = useState({ key: null, status: 'idle', error: '' })
  const [showChangeDiff, setShowChangeDiff] = useState(false)
  const [showAgent, setShowAgent] = useState(false)
  const [agentDrafts, setAgentDrafts] = useState({})
  const [reviewDecisions, setReviewDecisions] = useState({})
  const [reviewerFeedback, setReviewerFeedback] = useState({})
  const [proposalLineages, setProposalLineages] = useState({})
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectState, setRejectState] = useState({ submitting: false, error: '' })
  const qaRequestRef = useRef(null)

  useEffect(() => {
    if (typeof globalThis.fetch !== 'function') return undefined
    let cancelled = false

    globalThis.fetch('/test-data/brookline-mad-snapshot.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((snapshot) => {
        if (!cancelled && snapshot?.kind === 'public-mad-test-snapshot') setPublicSnapshot(snapshot)
      })
      .catch(() => {
        // The public fixture is optional and is generated locally from a dated export.
      })

    return () => { cancelled = true }
  }, [])

  useEffect(() => () => qaRequestRef.current?.abort(), [])

  useEffect(() => {
    if (typeof globalThis.fetch !== 'function') return undefined
    let cancelled = false
    setQaCatalogStatus('loading')

    getQaIssueCatalog()
      .then((catalog) => {
        if (cancelled) return
        setQaCatalog(catalog)
        setQaCatalogStatus('ready')
        setQaCatalogError('')
      })
      .catch((error) => {
        if (cancelled) return
        setQaCatalogStatus('error')
        setQaCatalogError(error.message)
      })

    return () => { cancelled = true }
  }, [])

  const caseItem = useMemo(
    () => activeDataView === 'qa'
      ? qaCase ?? qaMapPreview.result?.caseItem ?? null
      : cases.find((item) => item.id === activeCaseId),
    [activeCaseId, activeDataView, qaCase, qaMapPreview.result],
  )
  const activeTownExtract = activeDataView === 'qa'
    ? qaMapPreview.result?.extract ?? townExtract
    : null
  const records = useMemo(
    () => activeDataView === 'qa'
      ? townRecords
      : activeDataView === 'public'
      ? getPublicMadRecords(publicSnapshot)
      : getFeatureRecords(caseItem, caseItem.geometry.proposed),
    [activeDataView, caseItem, publicSnapshot, townRecords],
  )
  const activeAgentDraft = caseItem ? agentDrafts[caseItem.id] : null
  const activeChanges = activeAgentDraft?.changes ?? getCaseChanges(caseItem)
  const changeCount = useMemo(() => countChangedFields(activeChanges), [activeChanges])
  const activeDecision = caseItem ? reviewDecisions[caseItem.id] : null
  const activeFeedback = caseItem ? reviewerFeedback[caseItem.id] : null
  const activeProposalLineage = caseItem ? proposalLineages[caseItem.id] ?? [] : []
  const activeProposal = activeAgentDraft ?? [...activeProposalLineage].reverse().find((proposal) => proposal.status === 'staged')
  const currentQaRecord = useMemo(() => {
    if (!qaIssueRecords.page || !qaBatch.currentIndex) return null
    const selectedRows = qaIssueRecords.page.rows.filter((row) => selectedQaRecordIds.includes(row.id))
    return selectedRows[qaBatch.currentIndex - 1] ?? null
  }, [qaBatch.currentIndex, qaIssueRecords.page, selectedQaRecordIds])

  const loadProposalLineage = async (caseId) => {
    try {
      const proposals = await getProposalLineage(caseId)
      setProposalLineages((current) => ({ ...current, [caseId]: proposals }))
    } catch {
      // History is supplemental to the review sheet; the draft remains usable if it is unavailable.
    }
  }

  const clearFeatureSelection = () => {
    setSelectedFeatureKey(null)
    setHighlightedFeatureKey(null)
    setMapQuery(null)
    setShowMapQuery(false)
    setSelectionHistory([])
    setTownRecordStatus({ key: null, status: 'idle', error: '' })
  }

  const selectFeature = (featureKey, { remember = true } = {}) => {
    const currentView = showMapQuery && mapQuery
      ? { type: 'query' }
      : selectedFeatureKey
        ? {
            type: 'feature',
            featureKey: selectedFeatureKey,
            highlightedFeatureKey,
          }
        : null
    if (remember && currentView) {
      setSelectionHistory((current) => [...current, currentView].slice(-30))
    }

    setShowChangeDiff(false)
    setShowAgent(false)
    setShowRejectDialog(false)
    setShowMapQuery(false)
    setSelectedFeatureKey(featureKey)
    if (isTownSpatialFeature(featureKey)) setHighlightedFeatureKey(featureKey)

    if (
      activeDataView === 'qa'
      && caseItem?.townExtractSummary?.townId
      && !townRecords[featureKey]
      && featureKey.includes(':')
    ) {
      setTownRecordStatus({ key: featureKey, status: 'loading', error: '' })
      getTownRecordBundle(caseItem.townExtractSummary.townId, featureKey)
        .then((bundle) => {
          setTownRecords((current) => ({ ...current, ...bundle.records }))
          setTownRecordStatus((current) => (
            current.key === featureKey
              ? { key: featureKey, status: 'ready', error: '' }
              : current
          ))
        })
        .catch((error) => {
          setTownRecordStatus((current) => (
            current.key === featureKey
              ? { key: featureKey, status: 'error', error: error.message }
              : current
          ))
        })
    }
  }

  const queryMapFeatures = (query) => {
    setShowChangeDiff(false)
    setShowAgent(false)
    setShowRejectDialog(false)
    setSelectedFeatureKey(null)
    setHighlightedFeatureKey(null)
    setMapQuery(query)
    setShowMapQuery(true)
    setSelectionHistory([])
    setTownRecordStatus({ key: null, status: 'idle', error: '' })
  }

  const goBackSelection = () => {
    const previous = selectionHistory[selectionHistory.length - 1]
    if (!previous) return
    setSelectionHistory((current) => current.slice(0, -1))
    setTownRecordStatus({ key: null, status: 'idle', error: '' })

    if (previous.type === 'query') {
      setSelectedFeatureKey(null)
      setHighlightedFeatureKey(null)
      setShowMapQuery(true)
      return
    }

    setShowMapQuery(false)
    setSelectedFeatureKey(previous.featureKey)
    setHighlightedFeatureKey(previous.highlightedFeatureKey)
  }

  const resetQaReviewWorkspace = () => {
    setQaCase(null)
    setQaMapPreview({ status: 'idle', error: '', record: null, result: null })
    setTownExtract(null)
    setTownRecords({})
    setTownRecordStatus({ key: null, status: 'idle', error: '' })
    clearFeatureSelection()
    setShowChangeDiff(false)
    setShowAgent(false)
    setShowRejectDialog(false)
  }

  const selectQaIssue = async (issue) => {
    qaRequestRef.current?.abort()
    const requestController = new AbortController()
    qaRequestRef.current = requestController
    setActiveDataView('qa')
    setActiveQaIssue(issue)
    resetQaReviewWorkspace()
    setDocketCollapsed(false)
    setQaActivity([])
    setQaModel('')
    setSelectedQaRecordIds([])
    setQaBatch({ status: 'idle', currentIndex: 0, total: 0, results: [] })
    setQaIssueRecords({ status: 'loading', error: '', page: null })
    setQaInvestigation({ status: 'loading-records', error: '', result: null })

    try {
      const page = await getQaIssueRecords(issue.id, { signal: requestController.signal })
      setQaIssueRecords({ status: 'ready', error: '', page })
      setQaInvestigation({ status: 'selecting', error: '', result: null })
    } catch (error) {
      if (error.name === 'AbortError') return
      setQaIssueRecords({ status: 'error', error: error.message, page: null })
      setQaInvestigation({ status: 'selecting', error: error.message, result: null })
    } finally {
      if (qaRequestRef.current === requestController) qaRequestRef.current = null
    }
  }

  const toggleQaRecord = (recordId) => {
    const selectionLimit = qaIssueRecords.page?.selectionLimit ?? 10
    setSelectedQaRecordIds((current) => {
      if (current.includes(recordId)) return current.filter((id) => id !== recordId)
      if (current.length >= selectionLimit) return current
      return [...current, recordId]
    })
  }

  const selectQaPreview = () => {
    const page = qaIssueRecords.page
    if (!page) return
    setSelectedQaRecordIds(page.rows.slice(0, page.selectionLimit).map((row) => row.id))
  }

  const previewQaRecordOnMap = async (row) => {
    if (!activeQaIssue || row.mapPreview?.status !== 'available') return
    qaRequestRef.current?.abort()
    const requestController = new AbortController()
    qaRequestRef.current = requestController
    resetQaReviewWorkspace()
    setQaMapPreview({ status: 'loading', error: '', record: row, result: null })

    try {
      const result = await getQaRecordMapPreview(activeQaIssue.id, row.id, {
        signal: requestController.signal,
      })
      setTownRecords(result.records ?? {})
      setVisibleLayers(result.extract?.layers?.map((layer) => layer.id) ?? [])
      setHighlightedFeatureKey(result.selectedFeatureKey ?? null)
      setQaMapPreview({ status: 'ready', error: '', record: row, result })
    } catch (error) {
      if (error.name === 'AbortError') return
      setQaMapPreview({ status: 'error', error: error.message, record: row, result: null })
    } finally {
      if (qaRequestRef.current === requestController) qaRequestRef.current = null
    }
  }

  const returnFromQaMapPreview = () => {
    qaRequestRef.current?.abort()
    qaRequestRef.current = null
    resetQaReviewWorkspace()
    setQaInvestigation({ status: 'selecting', error: '', result: null })
  }

  const loadQaResultForReview = async (result, signal) => {
    setQaMapPreview({ status: 'idle', error: '', record: null, result: null })
    setQaCase(result.caseItem)
    setQaModel(result.model || '')
    setQaInvestigation({
      status: result.townExtractUrl ? 'loading-town' : 'ready',
      error: '',
      result,
    })
    if (result.draft?.changes?.length) {
      setAgentDrafts((current) => ({ ...current, [result.caseItem.id]: result.draft }))
      setReviewDecisions((current) => ({ ...current, [result.caseItem.id]: { status: 'ready' } }))
    }
    if (result.proposals) {
      setProposalLineages((current) => ({ ...current, [result.caseItem.id]: result.proposals }))
    }

    if (result.townExtractUrl) {
      setQaActivity((current) => mergeAgentActivity(current, {
        id: `${result.caseItem.id}:town-extract-load`,
        type: 'status',
        phase: 'started',
        title: `Load ${result.caseItem.municipality} town extract`,
        detail: 'Preparing vector layers and preset related records.',
      }))
      const extract = await getTownExtract(result.townExtractUrl, { signal })
      setTownExtract(extract)
      setVisibleLayers(['addresses', 'structures', 'roads', 'communities'])
      setQaActivity((current) => mergeAgentActivity(current, {
        id: `${result.caseItem.id}:town-extract-load`,
        type: 'status',
        phase: 'completed',
        title: `${result.caseItem.municipality} town extract ready`,
        detail: 'Opening the map review workspace.',
      }))
    }
    setShowAgent(true)
    setQaInvestigation({ status: 'ready', error: '', result })
  }

  const runSelectedQaRecords = async (recordIdsOverride = null) => {
    const page = qaIssueRecords.page
    if (!page || !activeQaIssue) return
    const recordIds = Array.isArray(recordIdsOverride) ? recordIdsOverride : selectedQaRecordIds
    const selectedRows = page.rows.filter((row) => recordIds.includes(row.id))
    if (!selectedRows.length) return

    qaRequestRef.current?.abort()
    const requestController = new AbortController()
    qaRequestRef.current = requestController
    resetQaReviewWorkspace()
    setQaActivity([])
    setQaModel('')
    setQaBatch({ status: 'working', currentIndex: 0, total: selectedRows.length, results: [] })
    setQaInvestigation({ status: 'working', error: '', result: null })
    const completedResults = []

    try {
      for (let index = 0; index < selectedRows.length; index += 1) {
        const row = selectedRows[index]
        setQaBatch((current) => ({ ...current, currentIndex: index + 1 }))
        setQaActivity((current) => mergeAgentActivity(current, {
          id: `${row.id}:queue`,
          type: 'status',
          phase: 'started',
          title: `Issue ${index + 1} of ${selectedRows.length}`,
          detail: `${row.address} · ${row.municipality}`,
        }))

        try {
          const result = await investigateQaIssue(activeQaIssue.id, {
            recordId: row.id,
            signal: requestController.signal,
            onActivity: (event) => {
              if (event.model) setQaModel(event.model)
              setQaActivity((current) => mergeAgentActivity(current, {
                ...event,
                id: `${row.id}:${event.id}`,
              }))
            },
          })
          completedResults.push({ record: row, status: 'complete', result })
          setQaActivity((current) => mergeAgentActivity(current, {
            id: `${row.id}:queue`,
            type: 'status',
            phase: 'completed',
            title: `Issue ${index + 1} of ${selectedRows.length} complete`,
            detail: row.address,
          }))
        } catch (error) {
          if (error.name === 'AbortError') throw error
          completedResults.push({ record: row, status: 'error', error: error.message })
          setQaActivity((current) => mergeAgentActivity(current, {
            id: `${row.id}:queue`,
            type: 'status',
            phase: 'error',
            title: `Issue ${index + 1} could not complete`,
            detail: error.message,
          }))
        }
        setQaBatch({
          status: 'working',
          currentIndex: index + 1,
          total: selectedRows.length,
          results: [...completedResults],
        })
      }

      const successful = completedResults.filter((item) => item.status === 'complete')
      if (selectedRows.length === 1 && successful.length === 1) {
        await loadQaResultForReview(successful[0].result, requestController.signal)
      } else {
        setQaBatch({
          status: 'complete',
          currentIndex: selectedRows.length,
          total: selectedRows.length,
          results: [...completedResults],
        })
        setQaInvestigation({ status: 'batch-complete', error: '', result: null })
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        if (qaRequestRef.current === requestController) {
          setQaBatch((current) => ({ ...current, status: 'stopped', results: [...completedResults] }))
          setQaInvestigation({ status: 'stopped', error: '', result: null })
        }
        return
      }
      setQaInvestigation({ status: 'error', error: error.message, result: null })
    } finally {
      if (qaRequestRef.current === requestController) qaRequestRef.current = null
    }
  }

  const stopQaInvestigation = () => {
    if (!qaRequestRef.current) return
    qaRequestRef.current.abort()
    setQaBatch((current) => ({ ...current, status: 'stopped' }))
    setQaInvestigation({ status: 'stopped', error: '', result: null })
    setQaActivity((current) => mergeAgentActivity(current, {
      id: 'reviewer-stop',
      type: 'status',
      phase: 'completed',
      title: 'Stopped by reviewer',
      detail: 'The active model request was cancelled. No remaining selected rows will start.',
    }))
  }

  const returnToQaRows = () => {
    qaRequestRef.current?.abort()
    qaRequestRef.current = null
    resetQaReviewWorkspace()
    setQaBatch({ status: 'idle', currentIndex: 0, total: 0, results: [] })
    setQaInvestigation({ status: 'selecting', error: '', result: null })
  }

  const openQaBatchResult = async (batchItem) => {
    qaRequestRef.current?.abort()
    const requestController = new AbortController()
    qaRequestRef.current = requestController
    resetQaReviewWorkspace()
    try {
      await loadQaResultForReview(batchItem.result, requestController.signal)
    } catch (error) {
      if (error.name !== 'AbortError') {
        setQaInvestigation({ status: 'error', error: error.message, result: batchItem.result })
      }
    } finally {
      if (qaRequestRef.current === requestController) qaRequestRef.current = null
    }
  }

  const selectCase = (caseId) => {
    qaRequestRef.current?.abort()
    qaRequestRef.current = null
    setActiveDataView('cases')
    setActiveCaseId(caseId)
    setTownExtract(null)
    setVisibleLayers(['addresses', 'structures', 'parcels', 'roads'])
    clearFeatureSelection()
    setShowChangeDiff(false)
    setShowAgent(false)
    setShowRejectDialog(false)
    setDocketCollapsed(false)
  }

  const selectPublicSnapshot = () => {
    qaRequestRef.current?.abort()
    qaRequestRef.current = null
    setActiveDataView('public')
    setTownExtract(null)
    setVisibleLayers(['addresses'])
    clearFeatureSelection()
    setShowChangeDiff(false)
    setShowAgent(false)
    setShowRejectDialog(false)
    setDocketCollapsed(false)
  }

  const acceptDraft = async () => {
    setReviewDecisions((current) => ({ ...current, [caseItem.id]: { status: 'accepting' } }))
    try {
      const result = await acceptCaseDraft(caseItem.id)
      if (result.proposals) setProposalLineages((current) => ({ ...current, [caseItem.id]: result.proposals }))
      setReviewDecisions((current) => ({
        ...current,
        [caseItem.id]: { status: 'accepted', publisher: result.publisher, job: result.job },
      }))
    } catch (error) {
      setReviewDecisions((current) => ({ ...current, [caseItem.id]: { status: 'ready', error: error.message } }))
    }
  }

  const rejectDraft = async (comment) => {
    setRejectState({ submitting: true, error: '' })
    try {
      const result = await rejectCaseDraft(caseItem.id, comment)
      setReviewerFeedback((current) => ({ ...current, [caseItem.id]: result.rejection }))
      if (result.proposals) setProposalLineages((current) => ({ ...current, [caseItem.id]: result.proposals }))
      setReviewDecisions((current) => ({ ...current, [caseItem.id]: { status: 'rejected' } }))
      setShowRejectDialog(false)
      setShowChangeDiff(false)
      setShowAgent(true)
    } catch (error) {
      setRejectState({ submitting: false, error: error.message })
      return
    }
    setRejectState({ submitting: false, error: '' })
  }

  return (
    <div className="app-shell">
      <main className={docketCollapsed ? 'workbench docket-collapsed' : 'workbench'}>
        <CaseDocket
          qaCatalog={qaCatalog}
          qaCatalogStatus={qaCatalogStatus}
          qaCatalogError={qaCatalogError}
          activeIssueId={activeQaIssue?.id}
          investigationStatus={qaInvestigation.status}
          onSelectQaIssue={selectQaIssue}
          activeCaseId={activeCaseId}
          activeDataView={activeDataView}
          onSelectCase={selectCase}
          onSelectPublicSnapshot={selectPublicSnapshot}
          publicSnapshot={publicSnapshot}
          collapsed={docketCollapsed}
          onToggle={() => setDocketCollapsed((value) => !value)}
        />
        {docketCollapsed && (
          <button
            type="button"
            className="show-docket"
            onClick={() => setDocketCollapsed(false)}
            aria-label="Show case list"
          >
            MAD QA
          </button>
        )}
        {activeDataView === 'qa' && (!caseItem || !activeTownExtract) ? (
          activeQaIssue && ['working', 'loading-town', 'error', 'stopped'].includes(qaInvestigation.status) ? (
            <AgentActivityStream
              issue={activeQaIssue}
              status={qaInvestigation.status}
              error={qaInvestigation.error}
              events={qaActivity}
              model={qaModel}
              currentRecord={currentQaRecord}
              batchPosition={qaBatch.total ? { current: qaBatch.currentIndex, total: qaBatch.total } : null}
              onStop={['working', 'loading-town'].includes(qaInvestigation.status) ? stopQaInvestigation : null}
              onBack={qaInvestigation.status === 'stopped' ? returnToQaRows : null}
            />
          ) : activeQaIssue && qaInvestigation.status === 'batch-complete' ? (
            <QaBatchSummary
              issue={activeQaIssue}
              batch={qaBatch}
              onOpenResult={openQaBatchResult}
              onBack={returnToQaRows}
            />
          ) : activeQaIssue && qaInvestigation.result ? (
            <QaQueueWorkspace
              issue={activeQaIssue}
              status={qaInvestigation.status}
              error={qaInvestigation.error}
              caseItem={caseItem}
            />
          ) : activeQaIssue ? (
            <QaIssueSelector
              issue={activeQaIssue}
              recordPage={qaIssueRecords.page}
              status={qaInvestigation.status}
              error={qaIssueRecords.error}
              selectedIds={selectedQaRecordIds}
              mapPreviewState={qaMapPreview}
              onToggle={toggleQaRecord}
              onPreview={previewQaRecordOnMap}
              onSelectPreview={selectQaPreview}
              onClear={() => setSelectedQaRecordIds([])}
              onRun={runSelectedQaRecords}
              onRetry={() => selectQaIssue(activeQaIssue)}
            />
          ) : (
            <QaQueueWorkspace
              issue={activeQaIssue}
              status={qaInvestigation.status}
              error={qaInvestigation.error}
              caseItem={caseItem}
            />
          )
        ) : (
          <MapWorkspace
            caseItem={caseItem}
            selectedFeatureKey={selectedFeatureKey}
            onSelectFeature={selectFeature}
            visibleLayers={visibleLayers}
            setVisibleLayers={setVisibleLayers}
            baseMap={baseMap}
            setBaseMap={setBaseMap}
            publicSnapshot={activeDataView === 'public' ? publicSnapshot : null}
            townExtract={activeTownExtract}
            qaPreview={activeDataView === 'qa' ? qaMapPreview.result : null}
            onBackToQaRows={qaMapPreview.result ? returnFromQaMapPreview : null}
            onRunQaPreview={qaMapPreview.record
              ? () => runSelectedQaRecords([qaMapPreview.record.id])
              : null}
            highlightedFeatureKey={highlightedFeatureKey}
            queryResultKeys={mapQuery?.results.map((result) => result.key) ?? []}
            onQueryFeatures={queryMapFeatures}
            changeCount={changeCount}
            onShowDiff={() => {
              clearFeatureSelection()
              setShowAgent(false)
              setShowChangeDiff(true)
              void loadProposalLineage(caseItem.id)
            }}
            onShowAgent={() => {
              clearFeatureSelection()
              setShowChangeDiff(false)
              setShowAgent(true)
            }}
          />
        )}
        {showMapQuery && mapQuery ? (
          <MapHitInspector
            query={mapQuery}
            onSelectFeature={selectFeature}
            onClose={clearFeatureSelection}
          />
        ) : null}
        {selectedFeatureKey && (
          <FeatureInspector
            records={records}
            featureKey={selectedFeatureKey}
            onSelectFeature={selectFeature}
            onBack={selectionHistory.length ? goBackSelection : null}
            onClose={clearFeatureSelection}
          />
        )}
        {selectedFeatureKey
          && !records[selectedFeatureKey]
          && townRecordStatus.key === selectedFeatureKey
          && townRecordStatus.status !== 'idle' ? (
          <aside className="feature-inspector record-loading-sheet" aria-live="polite">
            <div className="record-loading-actions">
              {selectionHistory.length ? (
                <button type="button" className="inspector-back" onClick={goBackSelection} aria-label="Back to previous selection">
                  <ArrowLeft size={20} />
                </button>
              ) : <span />}
              <button type="button" className="inspector-close" onClick={clearFeatureSelection} aria-label="Close attributes">
                <X size={20} />
              </button>
            </div>
            {townRecordStatus.status === 'loading' ? (
              <>
                <LoaderCircle className="agent-spinner" size={22} />
                <strong>Opening MAD record</strong>
                <span>Reading attributes and preset relationships…</span>
              </>
            ) : (
              <>
                <AlertTriangle size={22} />
                <strong>Record could not be opened</strong>
                <span>{townRecordStatus.error}</span>
              </>
            )}
          </aside>
        ) : null}
        {showChangeDiff && activeDataView !== 'public' && caseItem && !selectedFeatureKey && (
          <ChangeDiffInspector
            caseItem={caseItem}
            changes={activeChanges}
            onClose={() => setShowChangeDiff(false)}
            onSelectFeature={selectFeature}
            decision={activeDecision}
            proposal={activeProposal}
            proposalLineage={activeProposalLineage}
            onAccept={acceptDraft}
            onReject={() => {
              setRejectState({ submitting: false, error: '' })
              setShowRejectDialog(true)
            }}
          />
        )}
        {showAgent && activeDataView !== 'public' && caseItem && !selectedFeatureKey && (
          <AgentPanel
            caseItem={caseItem}
            onClose={() => setShowAgent(false)}
            reviewerFeedback={activeFeedback}
            initialResult={activeDataView === 'qa' ? qaInvestigation.result : null}
            runActivity={activeDataView === 'qa' ? qaActivity : []}
            automaticStatus={activeDataView === 'qa' ? qaInvestigation.status : 'idle'}
            onDraftStaged={(draft, feedback, proposals) => {
              setAgentDrafts((current) => ({ ...current, [caseItem.id]: draft }))
              if (feedback) setReviewerFeedback((current) => ({ ...current, [caseItem.id]: feedback }))
              if (proposals) setProposalLineages((current) => ({ ...current, [caseItem.id]: proposals }))
              setReviewDecisions((current) => ({ ...current, [caseItem.id]: { status: 'ready' } }))
            }}
            onReviewDraft={() => {
              setShowAgent(false)
              setShowChangeDiff(true)
            }}
          />
        )}
        {showRejectDialog && activeDataView !== 'public' && caseItem ? (
          <RejectDraftDialog
            caseItem={caseItem}
            submitting={rejectState.submitting}
            error={rejectState.error}
            onCancel={() => setShowRejectDialog(false)}
            onSubmit={rejectDraft}
          />
        ) : null}
      </main>
    </div>
  )
}
