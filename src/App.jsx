/*
THESIS: A reviewer should be able to inspect a MAD feature and move through its known relationships without reading a case narrative.
OWN-WORLD: Survey evidence dossier—cool drafting paper, blueprint ink, simple vectors, and full-size usable type.
STORY: Choose a case, click a vector, inspect its attributes, then follow a preset relation.
FIRST VIEWPORT: A permanent left case panel and one large Leaflet map; the attributes panel appears only after a feature is selected.
FORM: Map-first feature explorer with progressive disclosure; no persistent evidence folio.
*/

import { useMemo, useState } from 'react'
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
import MapWorkspace from './components/MapWorkspace'
import { cases } from './data/cases'
import { getFeatureRecords, relatedKeys } from './lib/featureRecords'

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
  const Icon = featureKey.startsWith('nearby:') ? MapPin : featureIcons[featureKey] || Database
  return <Icon size={size} aria-hidden="true" />
}

function CaseDocket({ activeCaseId, onSelectCase, collapsed, onToggle }) {
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
        {cases.map((caseItem) => {
          const active = caseItem.id === activeCaseId
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
        <span>Training workspace · vector export</span>
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
  const [baseMap, setBaseMap] = useState('streets')
  const [approvedCases, setApprovedCases] = useState([])

  const caseItem = useMemo(
    () => cases.find((item) => item.id === activeCaseId),
    [activeCaseId],
  )
  const records = useMemo(
    () => getFeatureRecords(caseItem, caseItem.geometry.proposed),
    [caseItem],
  )

  const selectCase = (caseId) => {
    setActiveCaseId(caseId)
    setSelectedFeatureKey(null)
    setDocketCollapsed(false)
  }

  return (
    <div className="app-shell">
      <main className={docketCollapsed ? 'workbench docket-collapsed' : 'workbench'}>
        <CaseDocket
          activeCaseId={activeCaseId}
          onSelectCase={selectCase}
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
          onSelectFeature={setSelectedFeatureKey}
          visibleLayers={visibleLayers}
          setVisibleLayers={setVisibleLayers}
          baseMap={baseMap}
          setBaseMap={setBaseMap}
        />
        {selectedFeatureKey && (
          <FeatureInspector
            caseItem={caseItem}
            records={records}
            featureKey={selectedFeatureKey}
            onSelectFeature={setSelectedFeatureKey}
            onClose={() => setSelectedFeatureKey(null)}
            approved={approvedCases.includes(activeCaseId)}
            onApprove={() => setApprovedCases((current) => [...new Set([...current, activeCaseId])])}
          />
        )}
      </main>
    </div>
  )
}
