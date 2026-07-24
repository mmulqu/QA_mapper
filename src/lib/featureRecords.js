import { formatCoordinate } from './geometry'

const relationKeys = [
  'address-point',
  'master-address',
  'structure',
  'structure-lookup',
  'address-variant',
  'parcel',
]

function row(field, value) {
  return { field, value: String(value ?? '—') }
}

export function getFeatureRecords(caseItem, draftPoint) {
  const pointId = caseItem.records.addressPoint.id
  const isNewPoint = caseItem.operationKind === 'create'
  const hasProposal = Boolean(draftPoint)

  const commonRelations = relationKeys.filter((key) => key !== 'address-point')
  const records = {
    'address-point': {
      key: 'address-point',
      label: 'Address point',
      id: pointId,
      mapTarget: 'address-point',
      related: commonRelations,
      attributes: [
        row('ADDRESS_POINT_ID', pointId),
        row('STATUS', isNewPoint ? 'Proposed new point' : 'Active point'),
        row('FULL_ADDRESS', caseItem.address),
        row('MUNICIPALITY', caseItem.municipality),
        row('PLACEMENT', caseItem.operationKind === 'move' ? 'Proposed entrance' : 'Structure location'),
        row('LATITUDE', hasProposal ? formatCoordinate(draftPoint[0]) : 'No proposal'),
        row('LONGITUDE', hasProposal ? formatCoordinate(draftPoint[1]) : 'No proposal'),
        row('GLOBALID', caseItem.records.addressPoint.globalId),
      ],
    },
    'master-address': {
      key: 'master-address',
      label: 'Master Address',
      id: caseItem.records.masterAddress.id,
      mapTarget: 'address-point',
      related: relationKeys.filter((key) => key !== 'master-address'),
      attributes: [
        row('MASTER_ADDRESS_ID', caseItem.records.masterAddress.id),
        row('FULL_ADDRESS', caseItem.address),
        row('MUNICIPALITY', caseItem.municipality),
        row('STATE', 'MA'),
        row('STATUS', 'Active'),
        row('SOURCE', caseItem.snapshot.source),
        row('GLOBALID', caseItem.records.masterAddress.globalId),
      ],
    },
    structure: {
      key: 'structure',
      label: 'MAD structure',
      id: caseItem.records.structure.id,
      mapTarget: 'structure',
      related: relationKeys.filter((key) => key !== 'structure'),
      attributes: [
        row('STRUCTURE_ID', caseItem.records.structure.id),
        row('STRUCTURE_TYPE', 'Building'),
        row('STATUS', 'Active'),
        row('SOURCE_DATE', '2025-12-11'),
        row('MASTER_ADDRESS_ID', caseItem.records.masterAddress.id),
        row('GLOBALID', caseItem.records.structure.globalId),
      ],
    },
    'structure-lookup': {
      key: 'structure-lookup',
      label: 'Structure lookup',
      id: `SL-${caseItem.records.structure.id.replace('STR-', '')}`,
      mapTarget: 'structure',
      related: relationKeys.filter((key) => key !== 'structure-lookup'),
      attributes: [
        row('LOOKUP_ID', `SL-${caseItem.records.structure.id.replace('STR-', '')}`),
        row('STRUCTURE_ID', caseItem.records.structure.id),
        row('MASTER_ADDRESS_ID', caseItem.records.masterAddress.id),
        row('ADDRESS_POINT_ID', pointId),
        row('RELATIONSHIP', 'Primary site address'),
        row('STATUS', 'Current'),
      ],
    },
    'address-variant': {
      key: 'address-variant',
      label: 'Address variant',
      id: caseItem.records.variant.id,
      mapTarget: 'address-point',
      related: relationKeys.filter((key) => key !== 'address-variant'),
      attributes: [
        row('VARIANT_ID', caseItem.records.variant.id),
        row('VARIANT_ADDRESS', caseItem.records.variant.value),
        row('VARIANT_TYPE', 'Standardized'),
        row('MASTER_ADDRESS_ID', caseItem.records.masterAddress.id),
        row('STATUS', 'Current'),
      ],
    },
    parcel: {
      key: 'parcel',
      label: 'Parcel',
      id: `PAR-${caseItem.municipality.slice(0, 3).toUpperCase()}-19-004-12`,
      mapTarget: 'parcel',
      related: relationKeys.filter((key) => key !== 'parcel'),
      attributes: [
        row('PARCEL_ID', `PAR-${caseItem.municipality.slice(0, 3).toUpperCase()}-19-004-12`),
        row('MUNICIPALITY', caseItem.municipality),
        row('SITE_ADDRESS', caseItem.address),
        row('SOURCE', 'Municipal parcel extract'),
        row('STATUS', 'Current export'),
      ],
    },
    road: {
      key: 'road',
      label: 'Road segment',
      id: `RD-${caseItem.address.split(' ').slice(1).join('-').toUpperCase()}`,
      mapTarget: 'road',
      related: ['address-point', 'master-address', 'parcel'],
      attributes: [
        row('ROAD_NAME', caseItem.address.replace(/^\d+\s+/, '')),
        row('ROAD_CLASS', 'Local'),
        row('MUNICIPALITY', caseItem.municipality),
        row('ADDRESS_RANGE', 'Context only'),
        row('SOURCE', 'MassGIS roads'),
      ],
    },
  }

  caseItem.geometry.nearby.forEach((nearby) => {
    records[`nearby:${nearby.id}`] = {
      key: `nearby:${nearby.id}`,
      label: 'Address point',
      id: nearby.id,
      mapTarget: `nearby:${nearby.id}`,
      related: ['master-address', 'structure', 'parcel'],
      attributes: [
        row('ADDRESS_POINT_ID', nearby.id),
        row('FULL_ADDRESS', nearby.address),
        row('MUNICIPALITY', caseItem.municipality),
        row('STATUS', 'Active'),
        row('ROLE', 'Neighbor sequence context'),
        row('LATITUDE', formatCoordinate(nearby.position[0])),
        row('LONGITUDE', formatCoordinate(nearby.position[1])),
      ],
    }
  })

  return records
}

export function relatedKeys(record) {
  return record?.related?.filter((key) => key !== record.key) ?? []
}
