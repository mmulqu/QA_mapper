import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'

export const REVIEWER_ACTIVITY_RELATIVE_PATH = '.runtime\\reviewer-agent-activity.jsonl'

function normalizeActor(actor) {
  if (!actor?.id && !actor?.name) return null
  return {
    id: String(actor.id || '').trim().slice(0, 120),
    initials: String(actor.name || '??').trim().toUpperCase().slice(0, 6),
  }
}

function readEntries(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
}

function createReviewerStats(initials) {
  return {
    initials,
    issuesQueued: 0,
    issuesClaimed: 0,
    followUps: 0,
    followUpsCompleted: 0,
    revisionsStaged: 0,
    decisionsAccepted: 0,
    decisionsRejected: 0,
    recoveredProposals: 0,
  }
}

function summarize(entries) {
  const reviewers = new Map()
  const statsFor = (event) => {
    const initials = String(event.actor?.initials || '').trim().toUpperCase()
    if (!initials) return null
    if (!reviewers.has(initials)) reviewers.set(initials, createReviewerStats(initials))
    return reviewers.get(initials)
  }

  for (const event of entries) {
    const stats = statsFor(event)
    if (!stats) continue
    if (event.type === 'issue_queued') stats.issuesQueued += 1
    if (event.type === 'review_claimed') stats.issuesClaimed += 1
    if (event.type === 'followup_prompt_queued') stats.followUps += 1
    if (event.type === 'followup_completed') stats.followUpsCompleted += 1
    if (event.type === 'followup_revision_staged') stats.revisionsStaged += 1
    if (event.type === 'review_decision' && event.decision === 'accepted') stats.decisionsAccepted += 1
    if (event.type === 'review_decision' && event.decision === 'rejected') stats.decisionsRejected += 1
    if (event.type === 'proposal_recovered') stats.recoveredProposals += 1
  }

  return [...reviewers.values()].sort((left, right) => (
    right.recoveredProposals - left.recoveredProposals
    || right.revisionsStaged - left.revisionsStaged
    || right.followUps - left.followUps
    || left.initials.localeCompare(right.initials)
  ))
}

export class ReviewerActivityLog {
  constructor({
    path,
    clock = () => new Date(),
  }) {
    if (!path) throw new Error('A reviewer activity log path is required.')
    this.path = resolve(path)
    this.clock = clock
    mkdirSync(dirname(this.path), { recursive: true })
    appendFileSync(this.path, '', 'utf8')
    this.entries = readEntries(this.path)
  }

  record(event) {
    const entry = {
      eventId: event.eventId || randomUUID(),
      recordedAt: event.recordedAt || this.clock().toISOString(),
      ...event,
      actor: normalizeActor(event.actor),
    }
    mkdirSync(dirname(this.path), { recursive: true })
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, 'utf8')
    this.entries.push(entry)
    return entry
  }

  info() {
    return {
      kind: 'mad-reviewer-agent-activity',
      path: this.path,
      relativePath: REVIEWER_ACTIVITY_RELATIVE_PATH,
      persistent: true,
      appendOnly: true,
      eventCount: this.entries.length,
      reviewers: summarize(this.entries),
    }
  }
}

export function createReviewerActivityLog(options) {
  return new ReviewerActivityLog(options)
}
