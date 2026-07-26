import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Pane,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import {
  ArrowLeft,
  Bot,
  GitCompareArrows,
  Image,
  Layers3,
  Link2,
  Map as MapIcon,
  Minus,
  Play,
  Plus,
  Route,
} from 'lucide-react'
import { MAP_SERVICES } from '../config/mapServices'
import { buildTownFeatureIndex, queryTownFeaturesAtLatLng } from '../lib/mapHitTest'

function MapSync({ caseItem }) {
  const map = useMap()

  useEffect(() => {
    const bounds = L.latLngBounds([
      ...caseItem.geometry.parcel,
      caseItem.geometry.current,
      caseItem.geometry.proposed,
      ...caseItem.geometry.nearby.map((point) => point.position),
    ].filter(Boolean))
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: caseItem.zoom })
  }, [caseItem, map])

  return null
}

function MapZoomControls() {
  const map = useMap()
  return (
    <div className="map-zoom-controls" aria-label="Map zoom controls">
      <button type="button" onClick={() => map.zoomIn()} aria-label="Zoom in" title="Zoom in">
        <Plus size={19} />
      </button>
      <button type="button" onClick={() => map.zoomOut()} aria-label="Zoom out" title="Zoom out">
        <Minus size={19} />
      </button>
    </div>
  )
}

const defaultVectorLayers = [
  ['addresses', 'Address points'],
  ['structures', 'Structures'],
  ['parcels', 'Parcels'],
  ['roads', 'Roads'],
]

function activeMapService(baseMap) {
  return baseMap === MAP_SERVICES.massgis2025Imagery.id
    ? MAP_SERVICES.massgis2025Imagery
    : MAP_SERVICES.massgisBasemap
}

function LayerPicker({
  visibleLayers,
  setVisibleLayers,
  baseMap,
  setBaseMap,
  vectorLayers = defaultVectorLayers,
}) {
  const [open, setOpen] = useState(false)
  const toggle = (layer) => {
    setVisibleLayers((current) =>
      current.includes(layer) ? current.filter((item) => item !== layer) : [...current, layer],
    )
  }

  return (
    <div className="map-layer-picker">
      <button
        type="button"
        className={open ? 'map-tool active' : 'map-tool'}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="map-layers-menu"
      >
        <Layers3 size={18} />
        Layers
      </button>
      {open && (
        <div className="layer-popover" id="map-layers-menu">
          <span className="layer-popover-heading">Basemap</span>
          <div className="basemap-buttons" role="group" aria-label="Basemap">
            <button
              type="button"
              className={baseMap === MAP_SERVICES.massgisBasemap.id ? 'active' : ''}
              onClick={() => setBaseMap(MAP_SERVICES.massgisBasemap.id)}
              aria-pressed={baseMap === MAP_SERVICES.massgisBasemap.id}
            >
              <MapIcon size={15} /> {MAP_SERVICES.massgisBasemap.shortLabel}
            </button>
            <button
              type="button"
              className={baseMap === MAP_SERVICES.massgis2025Imagery.id ? 'active' : ''}
              onClick={() => setBaseMap(MAP_SERVICES.massgis2025Imagery.id)}
              aria-pressed={baseMap === MAP_SERVICES.massgis2025Imagery.id}
            >
              <Image size={15} /> {MAP_SERVICES.massgis2025Imagery.shortLabel}
            </button>
          </div>
          <span className="layer-popover-heading">Vectors</span>
          {vectorLayers.map(([key, label]) => (
            <label key={key} className="layer-option">
              <input
                type="checkbox"
                checked={visibleLayers.includes(key)}
                onChange={() => toggle(key)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function ChangeDiffControl({ changeCount, onShowDiff }) {
  return (
    <div className="map-diff-control">
      <button type="button" className="map-tool" onClick={onShowDiff}>
        <GitCompareArrows size={18} />
        Changes
        <span className="map-diff-count">{changeCount}</span>
      </button>
    </div>
  )
}

function AgentControl({ onShowAgent }) {
  return (
    <div className="map-agent-control">
      <button type="button" className="map-tool" onClick={onShowAgent}>
        <Bot size={18} />
        Agent
      </button>
    </div>
  )
}

function PublicMadMapSync({ snapshot }) {
  const map = useMap()

  useEffect(() => {
    if (!snapshot.features.length) return
    const bounds = L.latLngBounds(snapshot.features.map((feature) => feature.position))
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: snapshot.zoom })
  }, [map, snapshot])

  return null
}

function TownExtractMapSync({ extract, caseItem, previewMode = false }) {
  const map = useMap()

  useEffect(() => {
    if (!previewMode && caseItem?.center) {
      map.setView(caseItem.center, caseItem.zoom || 18)
      return
    }
    if (!extract.bounds) return
    map.fitBounds(
      [
        [extract.bounds[1], extract.bounds[0]],
        [extract.bounds[3], extract.bounds[2]],
      ],
      { padding: [48, 48], maxZoom: extract.zoom || 15 },
    )
  }, [caseItem, extract, map, previewMode])

  return null
}

const townLayerStyles = {
  communities: { color: '#667a7e', weight: 2, dashArray: '7 5', fillColor: '#dce2df', fillOpacity: 0.05 },
  parcels: { color: '#9aaaa8', weight: 1, fillColor: '#7ab1cf', fillOpacity: 0.05 },
  structures: { color: '#354d58', weight: 1, fillColor: '#6f8792', fillOpacity: 0.18 },
  roads: { color: '#273f4a', weight: 2.5, opacity: 0.62 },
  addresses: { color: '#174d6d', weight: 1.5, fillColor: '#f7f8f5', fillOpacity: 0.95, radius: 4.5 },
  centroids: { color: '#8b620e', weight: 1.2, fillColor: '#fff7dd', fillOpacity: 0.82, radius: 3.5 },
}

const townPaneOrder = {
  communities: 410,
  parcels: 420,
  structures: 430,
  roads: 440,
  centroids: 450,
  addresses: 460,
}

function TownMapClickQuery({ featureIndex, visibleLayers, onQueryFeatures }) {
  useMapEvents({
    click(event) {
      const results = queryTownFeaturesAtLatLng({
        featureIndex,
        visibleLayers,
        latlng: event.latlng,
        map: event.target,
      })
      onQueryFeatures({
        latlng: [event.latlng.lat, event.latlng.lng],
        results,
      })
    },
  })

  return null
}

function TownExtractWorkspace({
  extract,
  caseItem,
  highlightedFeatureKey,
  queryResultKeys,
  onQueryFeatures,
  visibleLayers,
  setVisibleLayers,
  baseMap,
  setBaseMap,
  changeCount,
  onShowDiff,
  onShowAgent,
  qaPreview,
  onBackToQaRows,
  onRunQaPreview,
}) {
  const activeBaseMap = activeMapService(baseMap)
  const previewMode = Boolean(qaPreview)
  const targetAddress = caseItem.records?.addressPoint?.id
  const targetStructure = caseItem.records?.structure?.id
  const vectorLayers = extract.layers.map((layer) => [layer.id, `${layer.label} (${layer.count.toLocaleString()})`])
  const featureIndex = useMemo(() => buildTownFeatureIndex(extract), [extract])
  const queryResults = useMemo(() => new Set(queryResultKeys), [queryResultKeys])
  const previewAnchors = useMemo(
    () => new Set(qaPreview?.relation?.anchorFeatureKeys ?? []),
    [qaPreview],
  )
  const querySignature = queryResultKeys.join('|')

  const isIssueFeature = (feature) => (
    previewAnchors.has(feature.properties.__recordKey)
    || (feature.properties.__layer === 'addresses' && feature.properties.__id === targetAddress)
    || (feature.properties.__layer === 'structures' && feature.properties.__id === targetStructure)
  )

  const styleFor = (feature) => {
    const baseStyle = townLayerStyles[feature.properties.__layer] || townLayerStyles.parcels
    if (feature.properties.__recordKey === highlightedFeatureKey) {
      return {
        ...baseStyle,
        color: '#0d638f',
        weight: Math.max(baseStyle.weight || 1, 5),
        fillOpacity: 0.38,
        radius: Math.max(baseStyle.radius || 0, 8),
      }
    }
    if (queryResults.has(feature.properties.__recordKey)) {
      return {
        ...baseStyle,
        color: '#8b620e',
        weight: Math.max(baseStyle.weight || 1, 3),
        fillOpacity: 0.26,
        radius: Math.max(baseStyle.radius || 0, 6.5),
      }
    }
    if (isIssueFeature(feature)) {
      return { ...baseStyle, color: '#b63d31', weight: Math.max(baseStyle.weight || 1, 3), fillOpacity: 0.3 }
    }
    return baseStyle
  }

  return (
    <section
      className={previewMode ? 'map-workspace is-qa-map-preview' : 'map-workspace'}
      aria-label={previewMode
        ? `Pre-agent map preview for ${caseItem.address}`
        : `Rockport town extract for ${caseItem.address}`}
    >
      <MapContainer
        center={caseItem.center || extract.center}
        zoom={caseItem.zoom || extract.zoom}
        zoomControl={false}
        className="map-canvas"
        preferCanvas
      >
        <TileLayer
          attribution={activeBaseMap.attribution}
          maxNativeZoom={activeBaseMap.maxNativeZoom}
          url={activeBaseMap.url}
        />
        <TownExtractMapSync extract={extract} caseItem={caseItem} previewMode={previewMode} />
        <MapZoomControls />
        <TownMapClickQuery
          featureIndex={featureIndex}
          visibleLayers={visibleLayers}
          onQueryFeatures={onQueryFeatures}
        />

        {extract.layers
          .filter((layer) => visibleLayers.includes(layer.id))
          .map((layer) => (
            <Pane
              key={layer.id}
              name={`town-${layer.id}`}
              style={{ zIndex: townPaneOrder[layer.id] ?? 425 }}
            >
              <GeoJSON
                key={`${layer.id}-${highlightedFeatureKey || 'none'}-${querySignature}-${baseMap}`}
                data={layer.geojson}
                style={styleFor}
                pointToLayer={(feature, latlng) => {
                  const options = styleFor(feature)
                  return L.circleMarker(latlng, {
                    ...options,
                    pane: `town-${layer.id}`,
                    radius: options.radius || 4,
                  })
                }}
                onEachFeature={(feature, leafletLayer) => {
                const properties = feature.properties
                const label = properties.LABEL_TEXT
                  || properties.SITE_ADDR
                  || properties.COMMUNITY1
                  || properties.STREET_N_1
                  || properties.__id
                leafletLayer.bindTooltip(`${layer.label}: ${label} — click to query this location`, { sticky: true })
                }}
              />
            </Pane>
          ))}
      </MapContainer>

      <div className="map-case-label qa-case-label">
        <span className="map-case-id">
          {previewMode ? 'PRE-AGENT MAP CHECK' : caseItem.issueCode}
        </span>
        <strong>{caseItem.address}</strong>
        <span>
          {previewMode
            ? `${caseItem.municipality} · ${qaPreview.limits.bufferMeters} m bounded context`
            : `${caseItem.municipality} · read-only town extract`}
        </span>
      </div>
      <LayerPicker
        visibleLayers={visibleLayers}
        setVisibleLayers={setVisibleLayers}
        baseMap={baseMap}
        setBaseMap={setBaseMap}
        vectorLayers={vectorLayers}
      />
      {previewMode ? (
        <>
          <div className="qa-preview-map-actions" aria-label="Pre-agent map actions">
            <button type="button" onClick={onBackToQaRows}>
              <ArrowLeft size={17} />
              Back to rows
            </button>
            <button type="button" className="run" onClick={onRunQaPreview}>
              <Play size={16} fill="currentColor" />
              Run agent on this issue
            </button>
          </div>
          <div className="qa-preview-map-note" role="note">
            <Link2 size={18} aria-hidden="true" />
            <span>
              <strong>Mapped before agent run</strong>
              <small>{qaPreview.relation.description}</small>
              <em>
                {extract.metadata.loadedFeatureCount.toLocaleString()} features loaded · maximum {qaPreview.limits.maxTotalFeatures}
              </em>
            </span>
          </div>
        </>
      ) : (
        <>
          <ChangeDiffControl changeCount={changeCount} onShowDiff={onShowDiff} />
          <AgentControl onShowAgent={onShowAgent} />
          <div className="map-legend town-extract-legend" aria-label="Town extract map legend">
            <span><i className="legend-dot current" /> QA feature</span>
            <span><i className="legend-dot other" /> Town extract</span>
            <span>{extract.layers.reduce((sum, layer) => sum + layer.count, 0).toLocaleString()} mapped features</span>
          </div>
        </>
      )}
    </section>
  )
}

function PublicMadWorkspace({
  snapshot,
  selectedFeatureKey,
  onSelectFeature,
  visibleLayers,
  setVisibleLayers,
  baseMap,
  setBaseMap,
}) {
  const activeBaseMap = activeMapService(baseMap)

  return (
    <section className="map-workspace" aria-label="Public Brookline MAD test snapshot">
      <MapContainer
        center={snapshot.center}
        zoom={snapshot.zoom}
        zoomControl={false}
        className="map-canvas"
        preferCanvas
      >
        <TileLayer
          attribution={activeBaseMap.attribution}
          maxNativeZoom={activeBaseMap.maxNativeZoom}
          url={activeBaseMap.url}
        />
        <PublicMadMapSync snapshot={snapshot} />
        <MapZoomControls />

        {visibleLayers.includes('addresses') && snapshot.features.map((feature) => {
          const selected = selectedFeatureKey === feature.key
          return (
            <CircleMarker
              key={feature.key}
              center={feature.position}
              radius={selected ? 8 : 5}
              pathOptions={{
                color: selected ? '#0d638f' : '#174d6d',
                weight: selected ? 3 : 1.5,
                fillColor: '#f7f8f5',
                fillOpacity: 0.94,
              }}
              eventHandlers={{ click: () => onSelectFeature(feature.key) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                {feature.address} · {feature.attributes.POINT_TYPE} · click for attributes
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>

      <div className="map-case-label">
        <span className="map-case-id">PUBLIC MAD TEST SNAPSHOT</span>
        <strong>Brookline address points</strong>
        <span>{snapshot.metadata.fixturePointCount.toLocaleString()} points · read-only export</span>
      </div>
      <LayerPicker
        visibleLayers={visibleLayers}
        setVisibleLayers={setVisibleLayers}
        baseMap={baseMap}
        setBaseMap={setBaseMap}
        vectorLayers={[["addresses", "Basic address points"]]}
      />
      <div className="map-legend" aria-label="Public MAD map legend">
        <span><i className="legend-dot other" /> Basic address point</span>
        <span>{snapshot.metadata.advancedJoinCount.toLocaleString()} related Advanced Address records</span>
      </div>
    </section>
  )
}

function featureStyle(selected, defaults) {
  return selected
    ? { ...defaults, color: '#0a5d90', weight: Math.max(defaults.weight ?? 2, 4), fillOpacity: 0.2 }
    : defaults
}

export default function MapWorkspace({
  caseItem,
  selectedFeatureKey,
  onSelectFeature,
  visibleLayers,
  setVisibleLayers,
  baseMap,
  setBaseMap,
  publicSnapshot,
  townExtract,
  highlightedFeatureKey,
  queryResultKeys = [],
  onQueryFeatures,
  changeCount,
  onShowDiff,
  onShowAgent,
  qaPreview,
  onBackToQaRows,
  onRunQaPreview,
}) {
  if (townExtract) {
    return (
      <TownExtractWorkspace
        extract={townExtract}
        caseItem={caseItem}
        highlightedFeatureKey={highlightedFeatureKey}
        queryResultKeys={queryResultKeys}
        onQueryFeatures={onQueryFeatures}
        visibleLayers={visibleLayers}
        setVisibleLayers={setVisibleLayers}
        baseMap={baseMap}
        setBaseMap={setBaseMap}
        changeCount={changeCount}
        onShowDiff={onShowDiff}
        onShowAgent={onShowAgent}
        qaPreview={qaPreview}
        onBackToQaRows={onBackToQaRows}
        onRunQaPreview={onRunQaPreview}
      />
    )
  }

  if (publicSnapshot) {
    return (
      <PublicMadWorkspace
        snapshot={publicSnapshot}
        selectedFeatureKey={selectedFeatureKey}
        onSelectFeature={onSelectFeature}
        visibleLayers={visibleLayers}
        setVisibleLayers={setVisibleLayers}
        baseMap={baseMap}
        setBaseMap={setBaseMap}
      />
    )
  }

  const selectedTarget = selectedFeatureKey?.startsWith('nearby:')
    ? selectedFeatureKey
    : selectedFeatureKey === 'master-address' || selectedFeatureKey === 'address-variant'
      ? 'address-point'
      : selectedFeatureKey === 'structure-lookup'
        ? 'structure'
        : selectedFeatureKey

  const addressSelected = selectedTarget === 'address-point'
  const proposedPoint = caseItem.geometry.proposed
  const activeBaseMap = activeMapService(baseMap)

  return (
    <section className="map-workspace" aria-label={`Vector map for ${caseItem.address}`}>
      <MapContainer
        center={caseItem.center}
        zoom={caseItem.zoom}
        zoomControl={false}
        className="map-canvas"
        preferCanvas
      >
        <TileLayer
          attribution={activeBaseMap.attribution}
          maxNativeZoom={activeBaseMap.maxNativeZoom}
          url={activeBaseMap.url}
        />

        <MapSync caseItem={caseItem} />
        <MapZoomControls />

        {visibleLayers.includes('parcels') && (
          <Polygon
            positions={caseItem.geometry.parcel}
            pathOptions={featureStyle(selectedTarget === 'parcel', {
              color: '#b8c2c0',
              weight: 2,
              dashArray: '7 5',
              fillColor: '#7ab1cf',
              fillOpacity: 0.08,
            })}
            eventHandlers={{ click: () => onSelectFeature('parcel') }}
          >
            <Tooltip sticky>Parcel · click for attributes</Tooltip>
          </Polygon>
        )}

        {visibleLayers.includes('structures') && (
          <Polygon
            positions={caseItem.geometry.structure}
            pathOptions={featureStyle(selectedTarget === 'structure', {
              color: '#0e2433',
              weight: 2,
              fillColor: '#6f8792',
              fillOpacity: baseMap === MAP_SERVICES.massgis2025Imagery.id ? 0.28 : 0.18,
            })}
            eventHandlers={{ click: () => onSelectFeature('structure') }}
          >
            <Tooltip sticky>{caseItem.records.structure.id} · click for attributes</Tooltip>
          </Polygon>
        )}

        {visibleLayers.includes('roads') && (
          <Polyline
            positions={caseItem.geometry.road}
            pathOptions={featureStyle(selectedTarget === 'road', {
              color: '#1d2b32',
              weight: 5,
              opacity: 0.75,
            })}
            eventHandlers={{ click: () => onSelectFeature('road') }}
          >
            <Tooltip sticky>Road segment · click for attributes</Tooltip>
          </Polyline>
        )}

        {visibleLayers.includes('addresses') &&
          caseItem.geometry.nearby.map((point) => (
            <CircleMarker
              key={point.id}
              center={point.position}
              radius={selectedTarget === `nearby:${point.id}` ? 9 : 6}
              pathOptions={{
                color: selectedTarget === `nearby:${point.id}` ? '#0a5d90' : '#174d6d',
                weight: selectedTarget === `nearby:${point.id}` ? 4 : 2,
                fillColor: '#f8fbfa',
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onSelectFeature(`nearby:${point.id}`) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                {point.address} · click for attributes
              </Tooltip>
            </CircleMarker>
          ))}

        {caseItem.geometry.current && visibleLayers.includes('addresses') && (
          <CircleMarker
            center={caseItem.geometry.current}
            radius={addressSelected ? 11 : 8}
            pathOptions={{
              color: '#b63d31',
              weight: addressSelected ? 4 : 3,
              fillColor: '#fff',
              fillOpacity: 1,
            }}
            eventHandlers={{ click: () => onSelectFeature('address-point') }}
          >
            <Tooltip direction="left" offset={[-11, 0]}>
              Current address point · click for attributes
            </Tooltip>
          </CircleMarker>
        )}

        {proposedPoint && visibleLayers.includes('addresses') && (
          <CircleMarker
            center={proposedPoint}
            radius={addressSelected ? 10 : 7}
            pathOptions={{
              color: '#287044',
              weight: addressSelected ? 4 : 3,
              fillColor: '#e4f0e7',
              fillOpacity: 1,
            }}
            eventHandlers={{ click: () => onSelectFeature('address-point') }}
          >
            <Tooltip direction="right" offset={[11, 0]}>
              Proposed address point · click for attributes
            </Tooltip>
          </CircleMarker>
        )}

        {caseItem.geometry.current && proposedPoint && visibleLayers.includes('addresses') && (
          <Polyline
            positions={[caseItem.geometry.current, proposedPoint]}
            pathOptions={{ color: '#287044', weight: 2, dashArray: '4 7', opacity: 0.8 }}
          />
        )}
      </MapContainer>

      <div className="map-case-label">
        <span className="map-case-id">{caseItem.id}</span>
        <strong>{caseItem.address}</strong>
        <span>{caseItem.municipality}</span>
      </div>
      <LayerPicker
        visibleLayers={visibleLayers}
        setVisibleLayers={setVisibleLayers}
        baseMap={baseMap}
        setBaseMap={setBaseMap}
      />
      <ChangeDiffControl changeCount={changeCount} onShowDiff={onShowDiff} />
      <AgentControl onShowAgent={onShowAgent} />
      <div className="map-legend" aria-label="Map legend">
        <span><i className="legend-dot current" /> Current</span>
        <span><i className="legend-dot proposed" /> Proposed</span>
        <span><i className="legend-dot other" /> Other point</span>
        <span><Route size={14} /> Road</span>
      </div>
    </section>
  )
}
