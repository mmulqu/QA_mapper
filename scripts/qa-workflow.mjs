import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const PROJECT_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)))
export const QA_REPORT_PATH = resolve(PROJECT_ROOT, 'data', 'MAD_QA_20260724.txt')
export const ROCKPORT_FAULT_MANIFEST_PATH = resolve(PROJECT_ROOT, 'data', 'rockport_qa_faults.json')

function loadRockportFaultIndex() {
  try {
    const manifest = JSON.parse(readFileSync(ROCKPORT_FAULT_MANIFEST_PATH, 'utf8'))
    return new Map(
      (manifest.scenarios ?? []).map((scenario) => [scenario.viewId, scenario]),
    )
  } catch {
    return new Map()
  }
}

const ROCKPORT_FAULTS_BY_VIEW = loadRockportFaultIndex()

function rockportFaultsEnabled() {
  return !['0', 'false', 'no', 'off', 'disabled']
    .includes(String(process.env.MAD_ROCKPORT_FAULTS ?? '1').trim().toLowerCase())
}

function localFixtureForView(viewId) {
  if (viewId === 'MADV_QA_ASL_DUPES') {
    return {
      town: 'Rockport',
      townId: 252,
      status: 'available',
      note: 'One duplicate relationship group is reproducible in the immutable Rockport extract.',
    }
  }
  const fault = ROCKPORT_FAULTS_BY_VIEW.get(viewId)
  if (!fault || !rockportFaultsEnabled()) return null
  return {
    town: 'Rockport',
    townId: 252,
    status: 'controlled-fault',
    scenarioId: fault.id,
    note: `${fault.title}. The original Rockport export remains unchanged.`,
  }
}

const FRIENDLY_GROUP_NAMES = {
  MASTER_ADDRESS: 'Master addresses',
  ADDRESS_VARIANT: 'Address variants',
  ADDRESS_POINTM: 'Address points',
  ADDRESS_POINTM_CENTROID: 'Address centroids',
  BASE_RANGE_VARIANT: 'Street ranges',
  BASE_STREET_ARC: 'Street arcs',
  MASTER_STREET_NAME: 'Master street names',
  STREET_NAME_VARIANTS: 'Street-name variants',
  EMERGENCY_SERVICE_ZONE: 'Emergency service zones',
  SITE_NAMES: 'Site names',
  ADDPT_STRUCT_LUT: 'Point–structure lookups',
}

function cleanDescription(lines) {
  return lines
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\.{3,}$/, '')
    .trim()
}

function extractCount(block) {
  for (const line of block) {
    const normalized = line.replace(/\*/g, '').trim()
    const countMatch = normalized.match(
      /(?:NUMBER OF|TOTAL(?: NUMBER OF)?|COUNT(?: OF)?)\b[^:]*:\s*([\d,]+)\b/i,
    )
    if (countMatch) return Number(countMatch[1].replace(/,/g, ''))
  }
  if (block.some((line) => /\bno\b.+\b(?:found|identified|returned|exist)/i.test(line))) return 0
  return null
}

export function parseQaReport(reportText) {
  const lines = reportText.split(/\r?\n/)
  const groups = []
  let currentGroup = null
  let pendingDescription = []
  let pendingOrdinal = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    const groupMatch = line.match(/^\((\d+)\)\s+(.+?)\s+CHECKS\s*$/i)
    if (groupMatch) {
      const sourceName = groupMatch[2].trim().toUpperCase()
      currentGroup = {
        id: sourceName,
        ordinal: Number(groupMatch[1]),
        label: FRIENDLY_GROUP_NAMES[sourceName] || sourceName.replaceAll('_', ' ').toLowerCase(),
        sourceLabel: sourceName,
        issues: [],
      }
      groups.push(currentGroup)
      pendingDescription = []
      pendingOrdinal = null
      continue
    }

    const issueMatch = line.match(/^#(\d+(?:-\d+)*)\s+(.+)$/)
    if (issueMatch) {
      pendingOrdinal = issueMatch[1]
      pendingDescription = [issueMatch[2]]
      continue
    }

    const queryMatch = line.match(/^>>\s+Querying\s+([A-Z0-9_]+)\.{3}/i)
    if (queryMatch && currentGroup) {
      const block = []
      for (let blockIndex = index + 1; blockIndex < lines.length; blockIndex += 1) {
        const blockLine = lines[blockIndex]
        if (blockLine.trim() === '----') {
          index = blockIndex
          break
        }
        block.push(blockLine)
      }
      const count = extractCount(block)
      currentGroup.issues.push({
        id: queryMatch[1].toUpperCase(),
        ordinal: pendingOrdinal || String(currentGroup.issues.length + 1),
        description: cleanDescription(pendingDescription) || queryMatch[1].replaceAll('_', ' '),
        count,
        localFixture: localFixtureForView(queryMatch[1].toUpperCase()),
      })
      pendingDescription = []
      pendingOrdinal = null
      continue
    }

    if (
      pendingDescription.length
      && line
      && !line.startsWith('_')
      && !line.startsWith('*')
      && !line.startsWith('>>')
      && !line.startsWith('(')
    ) {
      pendingDescription.push(line)
    }
  }

  const nonZeroGroups = groups
    .map((group) => {
      const issues = group.issues.filter((issue) => Number.isFinite(issue.count) && issue.count > 0)
      return {
        ...group,
        issues,
        issueCount: issues.length,
        recordCount: issues.reduce((sum, issue) => sum + issue.count, 0),
      }
    })
    .filter((group) => group.issues.length)

  return {
    kind: 'mad-qa-category-catalog',
    source: 'data/MAD_QA_20260724.txt',
    generatedAt: '2026-07-24T06:00:04-04:00',
    groups: nonZeroGroups,
    summary: {
      groupCount: nonZeroGroups.length,
      issueCount: nonZeroGroups.reduce((sum, group) => sum + group.issueCount, 0),
      recordCount: nonZeroGroups.reduce((sum, group) => sum + group.recordCount, 0),
    },
  }
}

export function loadQaCatalog(path = QA_REPORT_PATH) {
  return parseQaReport(readFileSync(path, 'utf8'))
}

export function findQaIssue(viewId, catalog = loadQaCatalog()) {
  const normalized = String(viewId || '').toUpperCase()
  for (const group of catalog.groups) {
    const issue = group.issues.find((item) => item.id === normalized)
    if (issue) return { ...issue, group: { id: group.id, label: group.label, ordinal: group.ordinal } }
  }
  return null
}
