const QA_MAP_RELATION_RULES = {
  MASTER_ADDRESS: {
    qaEntity: 'MAD_MASTER_ADDRESS',
    anchorEntity: 'MAD_ADDRESS_POINTM',
    anchorLayer: 'addresses',
    anchorLabel: 'address point',
    requiredFields: ['ADDRESS_POINT_ID'],
    path: [
      {
        from: 'MAD_MASTER_ADDRESS.ADDRESS_POINT_ID',
        to: 'MAD_ADDRESS_POINTM.ADDRESS_POINT_ID',
      },
    ],
    relevantLayers: ['addresses', 'centroids', 'structures', 'parcels', 'roads'],
  },
  ADDRESS_VARIANT: {
    qaEntity: 'MAD_ADDRESS_VARIANTS',
    anchorEntity: 'MAD_ADDRESS_POINTM',
    anchorLayer: 'addresses',
    anchorLabel: 'address point',
    requiredFields: ['MASTER_ADDRESS_ID'],
    path: [
      {
        from: 'MAD_ADDRESS_VARIANTS.MASTER_ADDRESS_ID',
        to: 'MAD_MASTER_ADDRESS.MASTER_ADDRESS_ID',
      },
      {
        from: 'MAD_MASTER_ADDRESS.ADDRESS_POINT_ID',
        to: 'MAD_ADDRESS_POINTM.ADDRESS_POINT_ID',
      },
    ],
    relevantLayers: ['addresses', 'centroids', 'structures', 'parcels', 'roads'],
  },
  ADDRESS_POINTM: {
    qaEntity: 'MAD_ADDRESS_POINTM',
    anchorEntity: 'MAD_ADDRESS_POINTM',
    anchorLayer: 'addresses',
    anchorLabel: 'address point',
    requiredFields: ['ADDRESS_POINT_ID'],
    path: [],
    relevantLayers: ['addresses', 'centroids', 'structures', 'parcels', 'roads'],
  },
  ADDRESS_POINTM_CENTROID: {
    qaEntity: 'MAD_ADDRESS_POINTM_CENTROID',
    anchorEntity: 'MAD_ADDRESS_POINTM_CENTROID',
    anchorLayer: 'centroids',
    anchorLabel: 'address centroid',
    requiredFields: ['CENTROID_ID'],
    path: [],
    relevantLayers: ['centroids', 'addresses', 'structures', 'parcels', 'roads'],
  },
  BASE_RANGE_VARIANT: {
    qaEntity: 'MAD_BASE_RANGE_VARIANTS',
    anchorEntity: 'MAD_BASE_STREET_ARC',
    anchorLayer: 'roads',
    anchorLabel: 'base street arc',
    requiredFields: ['BASE_SEGMENT_ID'],
    path: [
      {
        from: 'MAD_BASE_RANGE_VARIANTS.BASE_SEGMENT_ID',
        to: 'MAD_BASE_STREET_ARC.BASE_SEGMENT_ID',
      },
    ],
    relevantLayers: ['roads', 'addresses', 'centroids'],
  },
  BASE_STREET_ARC: {
    qaEntity: 'MAD_BASE_STREET_ARC',
    anchorEntity: 'MAD_BASE_STREET_ARC',
    anchorLayer: 'roads',
    anchorLabel: 'base street arc',
    requiredFields: ['BASE_SEGMENT_ID'],
    path: [],
    relevantLayers: ['roads', 'addresses', 'centroids'],
  },
  MASTER_STREET_NAME: {
    qaEntity: 'MAD_MASTER_STREET_NAME',
    anchorEntity: 'MAD_BASE_STREET_ARC',
    anchorLayer: 'roads',
    anchorLabel: 'base street arc',
    requiredFields: ['STREET_NAME_ID'],
    path: [
      {
        from: 'MAD_MASTER_STREET_NAME.STREET_NAME_ID',
        to: 'MAD_BASE_RANGE_VARIANTS.STREET_NAME_ID',
      },
      {
        from: 'MAD_BASE_RANGE_VARIANTS.BASE_SEGMENT_ID',
        to: 'MAD_BASE_STREET_ARC.BASE_SEGMENT_ID',
      },
    ],
    relevantLayers: ['roads', 'addresses', 'centroids'],
  },
  STREET_NAME_VARIANTS: {
    qaEntity: 'MAD_STREET_NAME_VARIANTS',
    anchorEntity: 'MAD_BASE_STREET_ARC',
    anchorLayer: 'roads',
    anchorLabel: 'base street arc',
    requiredFields: ['STREET_NAME_ID'],
    path: [
      {
        from: 'MAD_STREET_NAME_VARIANTS.STREET_NAME_ID',
        to: 'MAD_MASTER_STREET_NAME.STREET_NAME_ID',
      },
      {
        from: 'MAD_MASTER_STREET_NAME.STREET_NAME_ID',
        to: 'MAD_BASE_RANGE_VARIANTS.STREET_NAME_ID',
      },
      {
        from: 'MAD_BASE_RANGE_VARIANTS.BASE_SEGMENT_ID',
        to: 'MAD_BASE_STREET_ARC.BASE_SEGMENT_ID',
      },
    ],
    relevantLayers: ['roads', 'addresses', 'centroids'],
  },
  EMERGENCY_SERVICE_ZONE: {
    qaEntity: 'MAD_EMERGENCY_SERVICE_ZONE',
    anchorEntity: 'MAD_EMERGENCY_SERVICE_ZONE',
    anchorLayer: 'emergency-service-zones',
    anchorLabel: 'emergency service zone',
    requiredFields: ['ESZ_ID'],
    path: [],
    relevantLayers: ['emergency-service-zones', 'roads', 'addresses'],
  },
  ADDPT_STRUCT_LUT: {
    qaEntity: 'MAD_ADDPT_STRUCT_LUT',
    anchorEntity: 'MAD_STRUCTURES_POLY',
    anchorLayer: 'structures',
    anchorLabel: 'structure polygon',
    requiredFields: ['STRUCTURE_ID'],
    path: [
      {
        from: 'MAD_ADDPT_STRUCT_LUT.STRUCTURE_ID',
        to: 'MAD_STRUCTURES_POLY.STRUCTURE_ID',
      },
    ],
    relevantLayers: ['structures', 'addresses', 'centroids', 'parcels', 'roads'],
  },
}

function cleanCategoryId(categoryId) {
  return String(categoryId ?? '').trim().toUpperCase()
}

export function getQaMapRelationRule(categoryId) {
  const rule = QA_MAP_RELATION_RULES[cleanCategoryId(categoryId)]
  return rule ? structuredClone(rule) : null
}

export function describeQaMapRelation(rule) {
  if (!rule) return 'No map relationship has been configured for this QA category.'
  if (!rule.path.length) return `${rule.qaEntity} supplies its own ${rule.anchorLabel} geometry.`
  return rule.path.map((step) => `${step.from} → ${step.to}`).join(' · ')
}

export function buildQaMapPreviewDescriptor(issue, caseItem = null, { mock = false } = {}) {
  const relation = getQaMapRelationRule(issue?.group?.id)
  if (!relation) {
    return {
      status: 'unavailable',
      reason: 'This QA category does not yet have an approved geometry relationship.',
      relation: null,
    }
  }
  const hasFixtureGeometry = Boolean(
    caseItem?.center
    && (
      caseItem.geometry?.current
      || caseItem.geometry?.currentParts?.length
      || caseItem.geometry?.structure?.length
      || caseItem.geometry?.road?.length
    ),
  )
  return {
    status: hasFixtureGeometry && !mock ? 'available' : 'awaiting-record-geometry',
    reason: hasFixtureGeometry && !mock
      ? null
      : mock
        ? 'This mock row has no authoritative relationship keys or geometry.'
        : `The production QA row must supply ${relation.requiredFields.join(' and ')} before its ${relation.anchorLabel} can be loaded.`,
    relation: {
      ...relation,
      description: describeQaMapRelation(relation),
    },
    limits: {
      bufferMeters: 120,
      maxFeaturesPerLayer: 50,
      maxTotalFeatures: 200,
    },
  }
}

export { QA_MAP_RELATION_RULES }
