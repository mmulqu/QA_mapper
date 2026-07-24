function row(field, value) {
  return { field, value: String(value ?? '—') }
}

function attributeRows(attributes) {
  return Object.entries(attributes ?? {}).map(([field, value]) => row(field, value))
}

export function getPublicMadRecords(snapshot) {
  if (!snapshot?.features) return {}

  return snapshot.features.reduce((records, feature) => {
    const pointKey = feature.key
    const advancedKey = `public-advanced-address:${feature.addressId}`
    const hasAdvancedRecord = Boolean(feature.advancedAddress)

    records[pointKey] = {
      key: pointKey,
      label: 'Basic address point',
      id: feature.id,
      mapTarget: pointKey,
      related: hasAdvancedRecord ? [advancedKey] : [],
      attributes: attributeRows(feature.attributes),
    }

    if (hasAdvancedRecord) {
      records[advancedKey] = {
        key: advancedKey,
        label: 'Advanced address record',
        id: String(feature.addressId),
        mapTarget: pointKey,
        related: [pointKey],
        attributes: attributeRows(feature.advancedAddress),
      }
    }

    return records
  }, {})
}
