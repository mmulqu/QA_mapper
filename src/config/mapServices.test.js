import { describe, expect, it } from 'vitest'
import { MAP_SERVICES } from './mapServices'

describe('MassGIS map services', () => {
  it('uses the public MassGIS basemap tile cache', () => {
    expect(MAP_SERVICES.massgisBasemap.url).toContain('/MassGISBasemap/MapServer/tile/{z}/{y}/{x}')
  })

  it('uses the public 2025 natural-color imagery tile cache', () => {
    expect(MAP_SERVICES.massgis2025Imagery.url).toContain(
      '/Massachusetts_Aerial_Imagery_2025/MapServer/tile/{z}/{y}/{x}',
    )
  })
})
