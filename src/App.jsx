/*
THESIS: A reviewer should be able to inspect a MAD feature and move through its known relationships without reading a case narrative.
OWN-WORLD: Survey evidence dossier—cool drafting paper, blueprint ink, simple vectors, and full-size usable type.
STORY: Choose a case, click a vector, inspect its attributes, then follow a preset relation.
FIRST VIEWPORT: A permanent left case panel and one large Leaflet map; the attributes panel appears only after a feature is selected.
FORM: Map-first feature explorer with progressive disclosure; no persistent evidence folio.
*/

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  CircleDot,
  Database,
  FileText,
  Link2,
  LoaderCircle,
  MapPin,
  PanelLeftClose,
  Search,
  X,
} from 'lucide-react'
import AgentPanel from './components/AgentPanel'
import ChangeDiffInspector from './components/ChangeDiffInspector'
import MapWorkspace from './components/MapWorkspace'
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
                          disabled={working}
                        >
                          <span className="qa-issue-count">{issue.count.toLocaleString()}</span>
                          <span className="qa-issue-copy">
                            <strong>{issue.description}</strong>
                            <small>{issue.id}</small>
                            {issue.localFixture ? <em>Rockport test data available</em> : null}
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

      <footer className="docket-footer-simple">
        <CircleDot size={15} />
        <span>
          {activeDataView === 'qa'
            ? 'QA report · town extracts are read-only'
            : activeDataView === 'public'
              ? 'Public export · no edit actions'
              : 'Training workspace · vector export'}
        </span>
      </footer>
    </aside>
  )
}

function FeatureInspector({ records, featureKey, onSelectFeature, onClose }) {
  const record = records[featureKey]
  if (!record) return null
  const relations = relatedKeys(record)

  return (
    <aside className="feature-inspector" aria-label="Selected feature attributes">
      <header className="inspector-header">
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
            <small>{issue.count.toLocaleString()} statewide records are reported, but no record-level rows were available in the Rockport fixture.</small>
          </>
        ) : (
          <>
            <span>Current QA report</span>
            <h2>Select a non-zero QA check</h2>
            <p>The selected category becomes a bounded investigation. When issue rows resolve to a town, its MAD extract opens here with the agent’s proposed change.</p>
            <small>Rockport test coverage is marked in the queue.</small>
          </>
        )}
      </div>
    </section>
  )
}

export default function App() {
  const [activeCaseId, setActiveCaseId] = useState(cases[0].id)
  const [selectedFeatureKey, setSelectedFeatureKey] = useState(null)
  const [docketCollapsed, setDocketCollapsed] = useState(false)
  const [visibleLayers, setVisibleLayers] = useState(['addresses', 'structures', 'parcels', 'roads'])
  const [baseMap, setBaseMap] = useState(MAP_SERVICES.massgisBasemap.id)
  const [activeDataView, setActiveDataView] = useState('qa')
  const [publicSnapshot, setPublicSnapshot] = useState(null)
  const [qaCatalog, setQaCatalog] = useState(null)
  const [qaCatalogStatus, setQaCatalogStatus] = useState('loading')
  const [qaCatalogError, setQaCatalogError] = useState('')
  const [activeQaIssue, setActiveQaIssue] = useState(null)
  const [qaCase, setQaCase] = useState(null)
  const [qaInvestigation, setQaInvestigation] = useState({ status: 'idle', error: '', result: null })
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
      ? qaCase
      : cases.find((item) => item.id === activeCaseId),
    [activeCaseId, activeDataView, qaCase],
  )
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

  const loadProposalLineage = async (caseId) => {
    try {
      const proposals = await getProposalLineage(caseId)
      setProposalLineages((current) => ({ ...current, [caseId]: proposals }))
    } catch {
      // History is supplemental to the review sheet; the draft remains usable if it is unavailable.
    }
  }

  const selectFeature = (featureKey) => {
    setShowChangeDiff(false)
    setShowAgent(false)
    setShowRejectDialog(false)
    setSelectedFeatureKey(featureKey)

    if (
      activeDataView === 'qa'
      && qaCase?.townExtractSummary?.townId
      && !townRecords[featureKey]
      && featureKey.includes(':')
    ) {
      setTownRecordStatus({ key: featureKey, status: 'loading', error: '' })
      getTownRecordBundle(qaCase.townExtractSummary.townId, featureKey)
        .then((bundle) => {
          setTownRecords((current) => ({ ...current, ...bundle.records }))
          setTownRecordStatus({ key: featureKey, status: 'ready', error: '' })
        })
        .catch((error) => {
          setTownRecordStatus({ key: featureKey, status: 'error', error: error.message })
        })
    }
  }

  const selectQaIssue = async (issue) => {
    setActiveDataView('qa')
    setActiveQaIssue(issue)
    setQaCase(null)
    setTownExtract(null)
    setTownRecords({})
    setTownRecordStatus({ key: null, status: 'idle', error: '' })
    setSelectedFeatureKey(null)
    setShowChangeDiff(false)
    setShowAgent(false)
    setShowRejectDialog(false)
    setDocketCollapsed(false)
    setQaInvestigation({ status: 'working', error: '', result: null })

    try {
      const result = await investigateQaIssue(issue.id)
      setQaCase(result.caseItem)
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
      setShowAgent(true)

      if (result.townExtractUrl) {
        const extract = await getTownExtract(result.townExtractUrl)
        setTownExtract(extract)
        setVisibleLayers(['addresses', 'structures', 'roads', 'communities'])
      }
      setQaInvestigation({ status: 'ready', error: '', result })
    } catch (error) {
      setQaInvestigation({ status: 'error', error: error.message, result: null })
    }
  }

  const selectCase = (caseId) => {
    setActiveDataView('cases')
    setActiveCaseId(caseId)
    setTownExtract(null)
    setVisibleLayers(['addresses', 'structures', 'parcels', 'roads'])
    setSelectedFeatureKey(null)
    setShowChangeDiff(false)
    setShowAgent(false)
    setShowRejectDialog(false)
    setDocketCollapsed(false)
  }

  const selectPublicSnapshot = () => {
    setActiveDataView('public')
    setTownExtract(null)
    setVisibleLayers(['addresses'])
    setSelectedFeatureKey(null)
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
        {activeDataView === 'qa' && (!caseItem || !townExtract) ? (
          <QaQueueWorkspace
            issue={activeQaIssue}
            status={qaInvestigation.status}
            error={qaInvestigation.error}
            caseItem={caseItem}
          />
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
            townExtract={activeDataView === 'qa' ? townExtract : null}
            changeCount={changeCount}
            onShowDiff={() => {
              setSelectedFeatureKey(null)
              setShowAgent(false)
              setShowChangeDiff(true)
              void loadProposalLineage(caseItem.id)
            }}
            onShowAgent={() => {
              setSelectedFeatureKey(null)
              setShowChangeDiff(false)
              setShowAgent(true)
            }}
          />
        )}
        {selectedFeatureKey && (
          <FeatureInspector
            records={records}
            featureKey={selectedFeatureKey}
            onSelectFeature={selectFeature}
            onClose={() => setSelectedFeatureKey(null)}
          />
        )}
        {selectedFeatureKey && !records[selectedFeatureKey] && townRecordStatus.status !== 'idle' ? (
          <aside className="feature-inspector record-loading-sheet" aria-live="polite">
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
