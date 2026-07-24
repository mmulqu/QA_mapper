export const MAP_SERVICES = {
  massgisBasemap: {
    id: 'massgis-basemap',
    label: 'MassGIS basemap',
    shortLabel: 'Basemap',
    url: 'https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/MassGISBasemap/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; <a href="https://www.mass.gov/info-details/massgis-base-map">MassGIS</a>',
    maxNativeZoom: 23,
  },
  massgis2025Imagery: {
    id: 'massgis-2025-imagery',
    label: 'MassGIS 2025 imagery',
    shortLabel: '2025 imagery',
    url: 'https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Aerial_Imagery_2025/MapServer/tile/{z}/{y}/{x}',
    attribution: '2025 aerial imagery &copy; <a href="https://www.mass.gov/info-details/massgis-data-2025-aerial-imagery">MassGIS</a>',
    maxNativeZoom: 20,
  },
}
