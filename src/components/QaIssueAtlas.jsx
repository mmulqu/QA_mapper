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
  Pane,
  TileLayer,
  useMap,
  ZoomControl,
} from 'react-leaflet'
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  ExternalLink,
  Layers3,
  LoaderCircle,
  MapPinned,
  Play,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react'
import { MAP_SERVICES } from '../config/mapServices'
import { getMassgisContext } from '../lib/agentClient'
import {
  buildIssueContextBbox,
  MASSGIS_CONTEXT_BUFFER_METERS,
  MASSGIS_CONTEXT_LAYER_OPTIONS,
  summarizeMassgisContext,
} from '../lib/massgisContext'

const DEFAULT_CENTER = [42.657, -70.624]
const DEFAULT_CONTEXT_LAYERS = MASSGIS_CONTEXT_LAYER_OPTIONS.map((layer) => layer.id)
const MASSGIS_CONTEXT_PANES = {
  parcels: 350,
  structures: 360,
  addresses: 370,
}
const MASSGIS_CONTEXT_STYLES = {
  parcels: {
    color: '#8b620e',
    weight: 1,
    opacity: 0.72,
    fillColor: '#8b620e',
    fillOpacity: 0.04,
  },
  structures: {
    color: '#174d6d',
    weight: 1,
    opacity: 0.84,
    fillColor: '#174d6d',
    fillOpacity: 0.2,
  },
  addresses: {
    color: '#174d6d',
    weight: 1.3,
    opacity: 0.94,
    fillColor: '#f7f8f5',
    fillOpacity: 0.96,
    radius: 3.5,
  },
}

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

function massgisFeatureLabel(layerId, properties = {}) {
  if (layerId === 'addresses') {
    return [
      properties.FULL_NUMBER_STANDARDIZED,
      properties.STREET_NAME,
      properties.COMMUNITY_NAME,
    ].filter(Boolean).join(' ')
  }
  if (layerId === 'parcels') {
    return properties.SITE_ADDR || properties.MAP_PAR_ID || properties.LOC_ID
  }
  return properties.STRUCT_ID || properties.OBJECTID
}

function massgisFeatureKey(layerId, feature = {}) {
  const identifier = feature.properties?.OBJECTID ?? feature.id
  return `${layerId}:${identifier ?? 'unknown'}`
}

function massgisAttributeLabel(field) {
  return field
    .toLowerCase()
    .split('_')
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '')
    .join(' ')
}

function formatMassgisAttribute(field, value) {
  if (typeof value !== 'number') return String(value)
  if (/(?:^|_)(?:ID|OBJECTID)$/.test(field) || ['FY', 'YEAR_BUILT'].includes(field)) {
    return String(value)
  }
  if (['BLDG_VAL', 'LAND_VAL', 'OTHER_VAL', 'TOTAL_VAL', 'LS_PRICE'].includes(field)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value)
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

function MassgisReferenceInspector({ selection, onClose }) {
  if (!selection) return null
  const attributes = Object.entries(selection.properties)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')

  return (
    <aside className="feature-inspector atlas-reference-inspector" aria-label={`${selection.layerLabel} attributes`}>
      <header className="inspector-header">
        <span className="inspector-feature-icon"><Layers3 size={21} /></span>
        <div>
          <span>{selection.layerLabel} · public reference</span>
          <h2>{selection.label || `Feature ${selection.properties.OBJECTID ?? ''}`}</h2>
        </div>
        <button type="button" className="inspector-close" onClick={onClose} aria-label="Close public feature attributes">
          <X size={20} />
        </button>
      </header>

      <section className="attribute-section" aria-labelledby="massgis-attribute-heading">
        <div className="atlas-reference-heading">
          <div>
            <h3 id="massgis-attribute-heading">Attributes</h3>
            <p>{selection.geometryType.replace(/^Multi/, '')} · read-only MassGIS context</p>
          </div>
          <span>{attributes.length} fields</span>
        </div>
        <dl className="attribute-table">
          {attributes.map(([field, value]) => (
            <div key={field}>
              <dt>{massgisAttributeLabel(field)}</dt>
              <dd>{formatMassgisAttribute(field, value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="atlas-reference-source">
        <p>This public feature is context only and is not the secured MAD production record.</p>
        <a href={selection.sourceUrl} target="_blank" rel="noreferrer">
          Open official service metadata <ExternalLink size={15} />
        </a>
      </footer>
    </aside>
  )
}

function PublicContextLayers({
  context,
  visibleLayers,
  selectedFeatureKey,
  onSelectFeature,
}) {
  if (!context?.layers?.length) return null
  return context.layers
    .filter((layer) => visibleLayers.includes(layer.id))
    .map((layer) => {
      const paneName = `massgis-context-${layer.id}`
      const baseStyle = MASSGIS_CONTEXT_STYLES[layer.id]
      const featureStyleFor = (feature) => {
        const selected = massgisFeatureKey(layer.id, feature) === selectedFeatureKey
        return {
          ...baseStyle,
          ...(selected ? {
            color: '#0a5d90',
            weight: layer.id === 'addresses' ? 3 : 4,
            opacity: 1,
            fillColor: layer.id === 'addresses' ? '#f7f8f5' : '#6fb1cc',
            fillOpacity: layer.id === 'addresses' ? 1 : 0.32,
            radius: layer.id === 'addresses' ? 7 : baseStyle.radius,
          } : {}),
          pane: paneName,
        }
      }
      return (
        <Pane key={layer.id} name={paneName} style={{ zIndex: MASSGIS_CONTEXT_PANES[layer.id] }}>
          <GeoJSON
            key={`${layer.id}-${context.requestedAt}-${selectedFeatureKey ?? 'none'}`}
            data={layer.geojson}
            style={featureStyleFor}
            pointToLayer={(feature, latlng) => {
              const style = featureStyleFor(feature)
              return L.circleMarker(latlng, {
                ...style,
                radius: style.radius || 4,
              })
            }}
            onEachFeature={(feature, leafletLayer) => {
              const label = massgisFeatureLabel(layer.id, feature.properties)
              leafletLayer.on('click', () => onSelectFeature({
                key: massgisFeatureKey(layer.id, feature),
                layerId: layer.id,
                layerLabel: layer.label,
                sourceLabel: layer.sourceLabel,
                sourceUrl: layer.sourceUrl,
                geometryType: feature.geometry?.type || 'Feature',
                properties: feature.properties ?? {},
                label,
              }))
            }}
          />
        </Pane>
      )
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
  const [visibleContextLayers, setVisibleContextLayers] = useState(DEFAULT_CONTEXT_LAYERS)
  const [massgisContext, setMassgisContext] = useState(null)
  const [selectedContextFeature, setSelectedContextFeature] = useState(null)
  const [contextStatus, setContextStatus] = useState('idle')
  const [contextError, setContextError] = useState('')
  const [contextRetry, setContextRetry] = useState(0)
  const featureCollection = useMemo(() => atlasFeatureCollection(manifest), [manifest])
  const itemIndex = useMemo(
    () => new Map((manifest?.items ?? []).map((item) => [item.issue_id, item])),
    [manifest],
  )
  const activeBaseMap = Object.values(MAP_SERVICES).find((candidate) => candidate.id === baseMapId)
    || MAP_SERVICES.massgisBasemap

  useEffect(() => {
    setSelectedContextFeature(null)
  }, [selectedItem?.issue_id])

  useEffect(() => {
    if (!selectedItem?.center?.every(Number.isFinite)) {
      setMassgisContext(null)
      setContextError('')
      setContextStatus('idle')
      return undefined
    }

    const controller = new AbortController()
    setMassgisContext(null)
    setContextError('')
    setContextStatus('loading')
    getMassgisContext({
      bbox: buildIssueContextBbox(selectedItem.center),
      zoom: 18,
      layers: DEFAULT_CONTEXT_LAYERS,
      signal: controller.signal,
    })
      .then((context) => {
        setMassgisContext(context)
        setContextError(context.errors?.map((item) => item.message).join(' ') || '')
        setContextStatus('ready')
      })
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return
        setContextError(requestError.message)
        setContextStatus('error')
      })
    return () => controller.abort()
  }, [contextRetry, selectedItem])

  useEffect(() => {
    if (previousManifest && manifest && previousManifest.version !== manifest.version) {
      setRefreshDelta(previousManifest.featureCount - manifest.featureCount)
      setSelectedItem(null)
      setFocusedItem(null)
      setSelectedContextFeature(null)
    }
    if (manifest && previousManifest !== manifest) setPreviousManifest(manifest)
  }, [manifest, previousManifest])

  const focusItem = (item) => {
    setSelectedItem(item)
    setFocusedItem(item)
    setSelectedContextFeature(null)
  }

  const toggleContextLayer = (layerId) => {
    if (selectedContextFeature?.layerId === layerId && visibleContextLayers.includes(layerId)) {
      setSelectedContextFeature(null)
    }
    setVisibleContextLayers((current) => (
      current.includes(layerId)
        ? current.filter((candidate) => candidate !== layerId)
        : [...current, layerId]
    ))
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
    layer.on('click', () => focusItem(item))
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
          <details className="atlas-context-menu">
            <summary>
              <MapPinned size={17} />
              Public context
              <small>{visibleContextLayers.length}/{MASSGIS_CONTEXT_LAYER_OPTIONS.length}</small>
            </summary>
            <div>
              <strong>Bounded MassGIS evidence</strong>
              <span>
                Loaded only within {MASSGIS_CONTEXT_BUFFER_METERS} m of the selected issue.
              </span>
              {MASSGIS_CONTEXT_LAYER_OPTIONS.map((layer) => (
                <label key={layer.id}>
                  <input
                    type="checkbox"
                    checked={visibleContextLayers.includes(layer.id)}
                    onChange={() => toggleContextLayer(layer.id)}
                  />
                  {layer.label}
                </label>
              ))}
            </div>
          </details>
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
          preferCanvas={false}
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
          <PublicContextLayers
            context={massgisContext}
            visibleLayers={visibleContextLayers}
            selectedFeatureKey={selectedContextFeature?.key}
            onSelectFeature={setSelectedContextFeature}
          />
          {featureCollection.features.length ? (
            <Pane name="qa-issue-evidence" style={{ zIndex: 470 }}>
              <GeoJSON
                key={manifest?.version ?? 'qa-atlas'}
                data={featureCollection}
                style={(feature) => ({ ...featureStyle(feature), pane: 'qa-issue-evidence' })}
                pointToLayer={(feature, latlng) => {
                  const marker = pointToLayer(feature, latlng)
                  marker.options.pane = 'qa-issue-evidence'
                  return marker
                }}
                onEachFeature={bindFeature}
              />
            </Pane>
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
        <div
          className={`atlas-context-status is-${contextStatus}${contextError ? ' has-warning' : ''}`}
          role={contextStatus === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {contextStatus === 'loading' ? (
            <LoaderCircle className="agent-spinner" size={16} />
          ) : contextStatus === 'error' || contextError ? (
            <TriangleAlert size={16} />
          ) : (
            <MapPinned size={16} />
          )}
          <span>
            <strong>
              {contextStatus === 'idle' && 'Select an issue for public context'}
              {contextStatus === 'loading' && `Loading ${MASSGIS_CONTEXT_BUFFER_METERS} m evidence window…`}
              {contextStatus === 'ready' && 'MassGIS public evidence'}
              {contextStatus === 'error' && 'Public context unavailable'}
            </strong>
            <small>
              {contextStatus === 'idle' && 'The statewide layer contains QA issues only; reference features load on demand.'}
              {contextStatus === 'loading' && 'Parcels, structures, and address points remain read-only.'}
              {contextStatus === 'ready' && (
                <>
                  {summarizeMassgisContext(massgisContext)}
                  {massgisContext?.layers?.some((layer) => layer.truncated) ? ' · one or more layers capped' : ''}
                  {contextError ? ` · ${contextError}` : ''}
                </>
              )}
              {contextStatus === 'error' && contextError}
            </small>
          </span>
          {contextStatus === 'error' ? (
            <button type="button" onClick={() => setContextRetry((value) => value + 1)}>
              Retry
            </button>
          ) : null}
        </div>
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
        {selectedContextFeature ? (
          <MassgisReferenceInspector
            selection={selectedContextFeature}
            onClose={() => setSelectedContextFeature(null)}
          />
        ) : (
          <IssueDetails
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onOpenIssue={onOpenIssue}
            onRunIssue={runIssue}
            running={runningItemId === selectedItem?.issue_id}
          />
        )}
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
