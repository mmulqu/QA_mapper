import { describe, expect, it } from 'vitest'
import {
  buildTownFeatureIndex,
  geometryHitsMapClick,
  queryTownFeaturesAtLatLng,
} from './mapHitTest'

const map = {
  latLngToContainerPoint([latitude, longitude]) {
    return { x: longitude * 100, y: latitude * 100 }
  },
}

const feature = (key, id, geometry, label) => ({
  type: 'Feature',
  geometry,
  properties: {
    __recordKey: key,
    __id: id,
    LABEL_TEXT: label,
  },
})

const extract = {
  layers: [
    {
      id: 'communities',
      label: 'MSAG communities',
      geojson: {
        features: [
          feature(
            'communities:270',
            '270',
            {
              type: 'Polygon',
              coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]],
            },
            'ROCKPORT',
          ),
        ],
      },
    },
    {
      id: 'structures',
      label: 'MAD structures',
      geojson: {
        features: [
          feature(
            'structures:272643_933827',
            '272643_933827',
            {
              type: 'Polygon',
              coordinates: [[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]]],
            },
            'Structure 272643_933827',
          ),
        ],
      },
    },
    {
      id: 'addresses',
      label: 'Address points',
      geojson: {
        features: [
          feature(
            'addresses:M_272655_933812',
            'M_272655_933812',
            { type: 'Point', coordinates: [0.02, 0.02] },
            '8 ALPACA COURT',
          ),
        ],
      },
    },
  ],
}

describe('town map hit testing', () => {
  it('returns every visible feature at a click with precise layers first', () => {
    const results = queryTownFeaturesAtLatLng({
      featureIndex: buildTownFeatureIndex(extract),
      visibleLayers: ['addresses', 'structures', 'communities'],
      latlng: { lat: 0, lng: 0 },
      map,
    })

    expect(results.map((result) => result.key)).toEqual([
      'addresses:M_272655_933812',
      'structures:272643_933827',
      'communities:270',
    ])
  })

  it('does not return features from hidden layers', () => {
    const results = queryTownFeaturesAtLatLng({
      featureIndex: buildTownFeatureIndex(extract),
      visibleLayers: ['structures'],
      latlng: { lat: 0, lng: 0 },
      map,
    })

    expect(results.map((result) => result.key)).toEqual(['structures:272643_933827'])
  })

  it('respects polygon holes and line hit tolerance', () => {
    const polygonWithHole = {
      type: 'Polygon',
      coordinates: [
        [[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]],
        [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]],
      ],
    }
    const line = { type: 'LineString', coordinates: [[-1, 1], [1, 1]] }

    expect(geometryHitsMapClick(polygonWithHole, [0, 0], map)).toBe(false)
    expect(geometryHitsMapClick(polygonWithHole, [1, 1], map)).toBe(true)
    expect(geometryHitsMapClick(line, [0, 1.05], map)).toBe(true)
    expect(geometryHitsMapClick(line, [0, 1.2], map)).toBe(false)
  })
})
