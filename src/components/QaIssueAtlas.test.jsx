import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMassgisContext } from '../lib/agentClient'
import QaIssueAtlas from './QaIssueAtlas'

vi.mock('leaflet', () => ({
  default: {
    circleMarker: vi.fn(() => ({ options: {} })),
  },
}))

vi.mock('react-leaflet', () => ({
  GeoJSON: ({ data, onEachFeature }) => (
    <>
      {(data?.features ?? []).map((feature, index) => {
        let clickHandler
        const leafletLayer = {
          bindTooltip: vi.fn(),
          on: vi.fn((event, handler) => {
            if (event === 'click') clickHandler = handler
          }),
        }
        onEachFeature?.(feature, leafletLayer)
        const identifier = feature.properties?.OBJECTID ?? feature.id ?? index
        return (
          <button
            type="button"
            key={`${identifier}-${index}`}
            aria-label={`map feature ${identifier}`}
            data-has-tooltip={String(leafletLayer.bindTooltip.mock.calls.length > 0)}
            onClick={() => clickHandler?.()}
          >
            Map feature {identifier}
          </button>
        )
      })}
    </>
  ),
  MapContainer: ({ children, preferCanvas }) => (
    <div data-testid="map" data-prefer-canvas={String(preferCanvas)}>
      {children}
    </div>
  ),
  Pane: ({ children }) => <>{children}</>,
  TileLayer: () => null,
  useMap: () => ({
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
  }),
  ZoomControl: () => null,
}))

vi.mock('../lib/agentClient', () => ({
  getMassgisContext: vi.fn(),
}))

const issue = {
  issue_id: 'MADV_QA_AP_DUPES-ROW-1',
  address: '14 Rowe Avenue',
  category: 'Address points',
  description: 'Duplicate address-point identifier',
  view_id: 'MADV_QA_AP_DUPES',
  anchor_layer: 'addresses',
  geometry_kind: 'point',
  relationship: 'direct address-point geometry',
  publish_eligible: false,
  center: [-70.627985, 42.670606],
}

const manifest = {
  version: '20260726210000000',
  generatedAt: '2026-07-26T21:00:00.000Z',
  featureCount: 1,
  issueCount: 1,
  dataFormat: 'geojson',
  bounds: [-70.628, 42.67, -70.627, 42.671],
  dataBytes: 1024,
  refreshNote: 'Refreshes from the QA source.',
  scopeNote: 'QA issues only.',
  items: [issue],
  featureCollection: {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: issue.issue_id,
      geometry: { type: 'Point', coordinates: issue.center },
      properties: issue,
    }],
  },
}

describe('QA issue atlas public context', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    getMassgisContext.mockResolvedValue({
      kind: 'massgis-public-context',
      requestedAt: '2026-07-26T21:01:00.000Z',
      layers: [
        {
          id: 'parcels',
          label: 'MassGIS L3 parcels',
          sourceLabel: 'MassGIS Massachusetts Property Tax Parcels',
          sourceUrl: 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0',
          featureCount: 11,
          truncated: false,
          geojson: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              id: 301,
              geometry: { type: 'Polygon', coordinates: [] },
              properties: {
                OBJECTID: 301,
                MAP_PAR_ID: '22-44',
                SITE_ADDR: '14 ROWE AVE',
                FULL_STR: 'ROWE AVE',
              },
            }],
          },
        },
        { id: 'structures', label: 'MassGIS structures', featureCount: 7, truncated: false, geojson: { type: 'FeatureCollection', features: [] } },
        { id: 'addresses', label: 'MassGIS address points', featureCount: 18, truncated: false, geojson: { type: 'FeatureCollection', features: [] } },
      ],
      errors: [],
    })
  })

  it('loads one deterministic issue window and exposes independent public layer toggles', async () => {
    const user = userEvent.setup()
    render(
      <QaIssueAtlas
        manifest={manifest}
        status="ready"
        error=""
        onRefresh={vi.fn()}
        onOpenIssue={vi.fn()}
        onRunIssue={vi.fn()}
      />,
    )

    expect(screen.getByText('Select an issue for public context')).toBeInTheDocument()
    expect(screen.getByTestId('map')).toHaveAttribute('data-prefer-canvas', 'false')
    await user.click(screen.getByRole('button', { name: /14 Rowe Avenue/i }))

    await waitFor(() => expect(getMassgisContext).toHaveBeenCalledTimes(1))
    expect(getMassgisContext).toHaveBeenCalledWith(expect.objectContaining({
      bbox: [-70.631039, 42.66836, -70.624931, 42.672852],
      zoom: 18,
      layers: ['parcels', 'structures', 'addresses'],
    }))
    expect(await screen.findByText('11 L3 parcels · 7 structures · 18 address points')).toBeInTheDocument()
    screen.getAllByRole('button', { name: /map feature/i }).forEach((featureButton) => {
      expect(featureButton).toHaveAttribute('data-has-tooltip', 'false')
    })

    await user.click(screen.getByText('Public context'))
    const structures = screen.getByRole('checkbox', { name: 'Structures' })
    expect(structures).toBeChecked()
    await user.click(structures)
    expect(structures).not.toBeChecked()
  })

  it('opens allow-listed attributes and official metadata when a public feature is clicked', async () => {
    const user = userEvent.setup()
    render(
      <QaIssueAtlas
        manifest={manifest}
        status="ready"
        error=""
        onRefresh={vi.fn()}
        onOpenIssue={vi.fn()}
        onRunIssue={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /14 Rowe Avenue/i }))
    await screen.findByText('11 L3 parcels · 7 structures · 18 address points')
    await user.click(screen.getByRole('button', { name: 'map feature 301' }))

    expect(screen.getByRole('complementary', { name: 'MassGIS L3 parcels attributes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '14 ROWE AVE' })).toBeInTheDocument()
    expect(screen.getByText('Map Par Id')).toBeInTheDocument()
    expect(screen.getByText('22-44')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open official service metadata/i })).toHaveAttribute(
      'href',
      expect.stringContaining('Massachusetts_Property_Tax_Parcels/FeatureServer/0'),
    )

    await user.click(screen.getByRole('button', { name: 'Close public feature attributes' }))
    expect(screen.getByRole('complementary', { name: /QA issue at 14 Rowe Avenue/i })).toBeInTheDocument()
  })
})
