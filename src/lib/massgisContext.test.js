import { describe, expect, it } from 'vitest'
import {
  buildIssueContextBbox,
  MASSGIS_CONTEXT_BUFFER_METERS,
  summarizeMassgisContext,
} from './massgisContext'

describe('MassGIS issue context', () => {
  it('builds one deterministic 250 meter evidence window around an issue', () => {
    const bbox = buildIssueContextBbox([-70.62, 42.656])

    expect(MASSGIS_CONTEXT_BUFFER_METERS).toBe(250)
    expect(bbox).toHaveLength(4)
    expect(bbox[0]).toBeLessThan(-70.62)
    expect(bbox[1]).toBeLessThan(42.656)
    expect(bbox[2]).toBeGreaterThan(-70.62)
    expect(bbox[3]).toBeGreaterThan(42.656)
    expect(buildIssueContextBbox([-70.62, 42.656])).toEqual(bbox)
  })

  it('summarizes each returned public evidence layer without exposing service internals', () => {
    expect(summarizeMassgisContext({
      layers: [
        { label: 'MassGIS L3 parcels', featureCount: 12 },
        { label: 'MassGIS structures', featureCount: 4 },
        { label: 'MassGIS address points', featureCount: 19 },
      ],
    })).toBe('12 L3 parcels · 4 structures · 19 address points')
  })
})
