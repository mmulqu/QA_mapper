/*
THESIS: The atlas lets reviewers scan every spatially supported QA result as one reliable, clickable field of evidence.
OWN-WORLD: A survey light table—muted MassGIS cartography under crisp red QA marks, with a compact paper inspector.
STORY: Refresh authoritative QA results, click an affected feature, inspect its relationship, then open or queue that exact record.
FIRST VIEWPORT: Full-height map, slim command bar, and one contextual issue card without a permanent dashboard grid.
FORM: Leaflet vector map with a textual issue index as the accessible counterpart.
*/

import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import {
  GeoJSON,
  MapContainer,
  TileLayer,
  useMap,
  ZoomControl,
} from 'react-leaflet'
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  Layers3,
  LoaderCircle,
  MapPinned,
  Play,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react'
import { MAP_SERVICES } from '../config/mapServices'

const DEFAULT_CENTER = [42.657, -70.624]

function atlasFeatureCollection(manifest) {
  if (manifest?.featureCollection?.type === 'FeatureCollection') {
    return manifest.featureCollection
  }

  return {
    type: 'FeatureCollection',
    features: (manifest?.items ?? [])
      .filter((item) => item.center?.length === 2 && item.center.every(Number.isFinite))
      .map((item) => ({
        type: 'Feature',
        id: item.issue_id,
        geometry: { type: 'Point', coordinates: item.center },
        properties: item,
      })),
  }
}

function formatDataSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Local GeoJSON'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB GeoJSON`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB GeoJSON`
}

function featureStyle(feature) {
  const geometryType = feature?.geometry?.type ?? ''
  if (geometryType.includes('Polygon')) {
    return {
      className: 'qa-atlas-vector',
      color: '#b63d31',
      weight: 3,
      opacity: 0.96,
      fillColor: '#b63d31',
      fillOpacity: 0.3,
    }
  }
  return {
    className: 'qa-atlas-vector',
    color: '#b63d31',
    weight: 6,
    opacity: 0.9,
  }
}

function pointToLayer(_feature, latlng) {
  return L.circleMarker(latlng, {
    className: 'qa-atlas-vector',
    radius: 8,
    color: '#f7f8f5',
    weight: 2,
    fillColor: '#b63d31',
    fillOpacity: 0.96,
  })
}

function AtlasMapSync({ manifest, focusedItem }) {
  const map = useMap()

  useEffect(() => {
    const bounds = manifest?.bounds
    if (!bounds?.every(Number.isFinite)) return
    map.fitBounds(
      [[bounds[1], bounds[0]], [bounds[3], bounds[2]]],
      { padding: [72, 72], maxZoom: 17, animate: false },
    )
  }, [manifest, map])

  useEffect(() => {
    if (!focusedItem?.center?.every(Number.isFinite)) return
    map.flyTo(
      [focusedItem.center[1], focusedItem.center[0]],
      18,
      { duration: 0.55 },
    )
  }, [focusedItem, map])

  return null
}

function IssueDetails({ item, onClose, onOpenIssue, onRunIssue, running }) {
  if (!item) return null
  return (
    <aside className="atlas-issue-card" aria-label={`QA issue at ${item.address}`}>
      <button type="button" className="atlas-card-close" onClick={onClose} aria-label="Close issue details">
        <X size={18} />
      </button>
      <span className="atlas-issue-category">{item.category}</span>
      <h2>{item.address}</h2>
      <p>{item.description}</p>
      <dl>
        <div><dt>QA view</dt><dd>{item.view_id}</dd></div>
        <div><dt>Affected feature</dt><dd>{item.anchor_layer} · {item.geometry_kind}</dd></div>
        <div><dt>Relate</dt><dd>{item.relationship}</dd></div>
      </dl>
      <small>
        {item.publish_eligible
          ? 'Production-eligible after validation and human approval.'
          : 'Review-only fixture; the agent may investigate but cannot publish it.'}
      </small>
      <div className="atlas-card-actions">
        <button type="button" className="atlas-secondary-action" onClick={() => onOpenIssue(item)}>
          <Eye size={17} /> Review record
        </button>
        <button type="button" className="atlas-primary-action" onClick={() => onRunIssue(item)} disabled={running}>
          {running ? <LoaderCircle className="agent-spinner" size={17} /> : <Play size={17} />}
          {running ? 'Sending…' : 'Run in queue'}
        </button>
      </div>
    </aside>
  )
}

export default function QaIssueAtlas({
  manifest,
  status,
  error,
  onRefresh,
  onOpenIssue,
  onRunIssue,
}) {
  const [selectedItem, setSelectedItem] = useState(null)
  const [focusedItem, setFocusedItem] = useState(null)
  const [baseMapId, setBaseMapId] = useState(MAP_SERVICES.massgisBasemap.id)
  const [basemapError, setBasemapError] = useState('')
  const [refreshDelta, setRefreshDelta] = useState(null)
  const [runningItemId, setRunningItemId] = useState(null)
  const [previousManifest, setPreviousManifest] = useState(null)
  const featureCollection = useMemo(() => atlasFeatureCollection(manifest), [manifest])
  const itemIndex = useMemo(
    () => new Map((manifest?.items ?? []).map((item) => [item.issue_id, item])),
    [manifest],
  )
  const activeBaseMap = Object.values(MAP_SERVICES).find((candidate) => candidate.id === baseMapId)
    || MAP_SERVICES.massgisBasemap

  useEffect(() => {
    if (previousManifest && manifest && previousManifest.version !== manifest.version) {
      setRefreshDelta(previousManifest.featureCount - manifest.featureCount)
      setSelectedItem(null)
      setFocusedItem(null)
    }
    if (manifest && previousManifest !== manifest) setPreviousManifest(manifest)
  }, [manifest, previousManifest])

  const focusItem = (item) => {
    setSelectedItem(item)
    setFocusedItem(item)
  }

  const runIssue = async (item) => {
    setRunningItemId(item.issue_id)
    try {
      await onRunIssue(item)
    } finally {
      setRunningItemId(null)
    }
  }

  const bindFeature = (feature, layer) => {
    const properties = feature.properties ?? {}
    const item = itemIndex.get(properties.issue_id) ?? properties
    const label = [properties.address, properties.category].filter(Boolean).join(' · ')
    if (label) layer.bindTooltip(`${label} · click for QA details`, { sticky: true })
    layer.on('click', () => setSelectedItem(item))
  }

  return (
    <section className="qa-atlas-workspace" aria-label="QA issue map">
      <header className="qa-atlas-toolbar">
        <div>
          <span className="app-kicker">Spatial QA overview</span>
          <h1>Affected feature atlas</h1>
          <p>{manifest ? `${manifest.featureCount} mapped features across ${manifest.issueCount} QA checks` : 'Preparing mapped QA evidence'}</p>
        </div>
        <div className="qa-atlas-toolbar-actions">
          <label>
            <Layers3 size={17} />
            <span className="sr-only">Basemap</span>
            <select
              value={baseMapId}
              onChange={(event) => {
                setBasemapError('')
                setBaseMapId(event.target.value)
              }}
            >
              {Object.values(MAP_SERVICES).map((service) => (
                <option key={service.id} value={service.id}>{service.shortLabel}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={onRefresh} disabled={status === 'refreshing'}>
            <RefreshCw className={status === 'refreshing' ? 'agent-spinner' : undefined} size={17} />
            {status === 'refreshing' ? 'Rebuilding…' : 'Refresh QA map'}
          </button>
        </div>
      </header>

      <div className="qa-atlas-stage">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={14}
          zoomControl={false}
          preferCanvas
          className="qa-atlas-map"
          aria-label="Interactive map of affected QA features"
        >
          <TileLayer
            key={activeBaseMap.id}
            attribution={activeBaseMap.attribution}
            maxNativeZoom={activeBaseMap.maxNativeZoom}
            url={activeBaseMap.url}
            eventHandlers={{
              load: () => setBasemapError(''),
              tileerror: () => setBasemapError('Basemap tiles are unavailable. QA issue vectors remain visible and clickable.'),
            }}
          />
          <ZoomControl position="bottomright" />
          <AtlasMapSync manifest={manifest} focusedItem={focusedItem} />
          {featureCollection.features.length ? (
            <GeoJSON
              key={manifest?.version ?? 'qa-atlas'}
              data={featureCollection}
              style={featureStyle}
              pointToLayer={pointToLayer}
              onEachFeature={bindFeature}
            />
          ) : null}
        </MapContainer>

        {(status === 'loading' || !manifest) && !error ? (
          <div className="qa-atlas-loading" role="status">
            <LoaderCircle className="agent-spinner" size={24} />
            <span>Building the issue atlas…</span>
          </div>
        ) : null}
        {error ? (
          <div className="qa-atlas-error" role="alert">
            <TriangleAlert size={18} />
            <span><strong>QA map refresh failed.</strong> {error}</span>
            <button type="button" onClick={onRefresh}>Try again</button>
          </div>
        ) : basemapError ? (
          <div className="qa-atlas-error is-warning" role="status">
            <TriangleAlert size={18} />
            <span>{basemapError}</span>
          </div>
        ) : null}
        {manifest ? (
          <div className="qa-atlas-freshness">
            <span className="atlas-live-dot" />
            Built {new Date(manifest.generatedAt).toLocaleString()}
            <strong>{formatDataSize(manifest.dataBytes ?? manifest.archiveBytes)}</strong>
          </div>
        ) : null}
        {manifest?.featureCount === 0 ? (
          <div className="qa-atlas-clean-state" role="status">
            <CheckCircle2 size={23} />
            <span>
              <strong>Mapped QA view is clean</strong>
              The refreshed source returned no spatially mapped issues.
            </span>
          </div>
        ) : refreshDelta !== null ? (
          <div className="qa-atlas-refresh-result" role="status">
            <CheckCircle2 size={17} />
            {refreshDelta > 0
              ? `${refreshDelta} fewer affected ${refreshDelta === 1 ? 'feature' : 'features'} after refresh.`
              : refreshDelta < 0
                ? `${Math.abs(refreshDelta)} new affected ${Math.abs(refreshDelta) === 1 ? 'feature' : 'features'} after refresh.`
                : 'QA source refreshed; the mapped issue count is unchanged.'}
          </div>
        ) : null}
        <IssueDetails
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onOpenIssue={onOpenIssue}
          onRunIssue={runIssue}
          running={runningItemId === selectedItem?.issue_id}
        />
      </div>

      {manifest ? (
        <details className="qa-atlas-index">
          <summary>
            <span><MapPinned size={17} /> Browse mapped issues without the map</span>
            <small>{manifest.items.length}{manifest.featureCount > manifest.items.length ? ` of ${manifest.featureCount}` : ''}</small>
          </summary>
          <div>
            {manifest.items.map((item) => (
              <button type="button" key={item.issue_id} onClick={() => focusItem(item)}>
                <span>
                  <strong>{item.address}</strong>
                  <small>{item.category} · {item.view_id}</small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </details>
      ) : null}

      {manifest ? (
        <footer className="qa-atlas-note">
          <strong>Refresh behavior.</strong> {manifest.refreshNote} {manifest.scopeNote}
        </footer>
      ) : null}
    </section>
  )
}
