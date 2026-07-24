/*
THESIS: A reviewer should be able to inspect a MAD feature and move through its known relationships without reading a case narrative.
OWN-WORLD: Survey evidence dossier—cool drafting paper, blueprint ink, simple vectors, and full-size usable type.
STORY: Choose a case, click a vector, inspect its attributes, then follow a preset relation.
FIRST VIEWPORT: A permanent left case panel and one large Leaflet map; the attributes panel appears only after a feature is selected.
FORM: Map-first feature explorer with progressive disclosure; no persistent evidence folio.
*/

import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Database,
  FileText,
  Link2,
  MapPin,
  PanelLeftClose,
  X,
} from 'lucide-react'
import AgentPanel from './components/AgentPanel'
import ChangeDiffInspector from './components/ChangeDiffInspector'
import MapWorkspace from './components/MapWorkspace'
import { MAP_SERVICES } from './config/mapServices'
import { cases } from './data/cases'
import { getFeatureRecords, relatedKeys } from './lib/featureRecords'
import { countChangedFields, getCaseChanges } from './lib/changeDiff'
import { getPublicMadRecords } from './lib/publicMadRecords'

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
  const Icon = featureKey.startsWith('nearby:') || featureKey.startsWith('public-address-point:')
    ? MapPin
    : featureKey.startsWith('public-advanced-address:')
      ? FileText
      : featureIcons[featureKey] || Database
  return <Icon size={size} aria-hidden="true" />
}

function CaseDocket({
  activeCaseId,
  activeDataView,
  onSelectCase,
  onSelectPublicSnapshot,
  publicSnapshot,
  collapsed,
  onToggle,
}) {
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
      </div>

      <footer className="docket-footer-simple">
        <CircleDot size={15} />
        <span>{activeDataView === 'public' ? 'Public export · no edit actions' : 'Training workspace · vector export'}</span>
      </footer>
    </aside>
  )
}

function FeatureInspector({ caseItem, records, featureKey, onSelectFeature, onClose, approved, onApprove }) {
  const record = records[featureKey]
  if (!record) return null
  const relations = relatedKeys(record)
  const isAddressPoint = record.key === 'address-point'
  const needsEvidence = caseItem.status === 'evidence'

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

      {isAddressPoint && (
        <section className="proposal-action">
          {needsEvidence ? (
            <div className="action-hold">
              <strong>No edit proposal</strong>
              <span>Municipal evidence is required before a change can be accepted.</span>
            </div>
          ) : approved ? (
            <div className="action-approved">
              <CheckCircle2 size={20} />
              <span>Proposal accepted in training</span>
            </div>
          ) : (
            <button type="button" className="approve-button" onClick={onApprove}>
              <Check size={18} />
              Accept proposed change
            </button>
          )}
        </section>
      )}
    </aside>
  )
}

export default function App() {
  const [activeCaseId, setActiveCaseId] = useState(cases[0].id)
  const [selectedFeatureKey, setSelectedFeatureKey] = useState(null)
  const [docketCollapsed, setDocketCollapsed] = useState(false)
  const [visibleLayers, setVisibleLayers] = useState(['addresses', 'structures', 'parcels', 'roads'])
  const [baseMap, setBaseMap] = useState(MAP_SERVICES.massgisBasemap.id)
  const [approvedCases, setApprovedCases] = useState([])
  const [activeDataView, setActiveDataView] = useState('cases')
  const [publicSnapshot, setPublicSnapshot] = useState(null)
  const [showChangeDiff, setShowChangeDiff] = useState(false)
  const [showAgent, setShowAgent] = useState(false)
  const [agentDrafts, setAgentDrafts] = useState({})

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

  const caseItem = useMemo(
    () => cases.find((item) => item.id === activeCaseId),
    [activeCaseId],
  )
  const records = useMemo(
    () => activeDataView === 'public'
      ? getPublicMadRecords(publicSnapshot)
      : getFeatureRecords(caseItem, caseItem.geometry.proposed),
    [activeDataView, caseItem, publicSnapshot],
  )
  const activeAgentDraft = agentDrafts[caseItem.id]
  const activeChanges = activeAgentDraft?.changes ?? getCaseChanges(caseItem)
  const changeCount = useMemo(() => countChangedFields(activeChanges), [activeChanges])

  const selectFeature = (featureKey) => {
    setShowChangeDiff(false)
    setShowAgent(false)
    setSelectedFeatureKey(featureKey)
  }

  const selectCase = (caseId) => {
    setActiveDataView('cases')
    setActiveCaseId(caseId)
    setSelectedFeatureKey(null)
    setShowChangeDiff(false)
    setShowAgent(false)
    setDocketCollapsed(false)
  }

  const selectPublicSnapshot = () => {
    setActiveDataView('public')
    setSelectedFeatureKey(null)
    setShowChangeDiff(false)
    setShowAgent(false)
    setDocketCollapsed(false)
  }

  return (
    <div className="app-shell">
      <main className={docketCollapsed ? 'workbench docket-collapsed' : 'workbench'}>
        <CaseDocket
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
        <MapWorkspace
          caseItem={caseItem}
          selectedFeatureKey={selectedFeatureKey}
          onSelectFeature={selectFeature}
          visibleLayers={visibleLayers}
          setVisibleLayers={setVisibleLayers}
          baseMap={baseMap}
          setBaseMap={setBaseMap}
          publicSnapshot={activeDataView === 'public' ? publicSnapshot : null}
          changeCount={changeCount}
          onShowDiff={() => {
            setSelectedFeatureKey(null)
            setShowAgent(false)
            setShowChangeDiff(true)
          }}
          onShowAgent={() => {
            setSelectedFeatureKey(null)
            setShowChangeDiff(false)
            setShowAgent(true)
          }}
        />
        {selectedFeatureKey && (
          <FeatureInspector
            caseItem={caseItem}
            records={records}
            featureKey={selectedFeatureKey}
            onSelectFeature={selectFeature}
            onClose={() => setSelectedFeatureKey(null)}
            approved={approvedCases.includes(activeCaseId)}
            onApprove={() => setApprovedCases((current) => [...new Set([...current, activeCaseId])])}
          />
        )}
        {showChangeDiff && activeDataView === 'cases' && !selectedFeatureKey && (
          <ChangeDiffInspector
            caseItem={caseItem}
            changes={activeChanges}
            onClose={() => setShowChangeDiff(false)}
            onSelectFeature={selectFeature}
          />
        )}
        {showAgent && activeDataView === 'cases' && !selectedFeatureKey && (
          <AgentPanel
            caseItem={caseItem}
            onClose={() => setShowAgent(false)}
            onDraftStaged={(draft) => setAgentDrafts((current) => ({ ...current, [caseItem.id]: draft }))}
            onReviewDraft={() => {
              setShowAgent(false)
              setShowChangeDiff(true)
            }}
          />
        )}
      </main>
    </div>
  )
}
