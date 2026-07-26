import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, dirname, resolve } from 'node:path'

export const MAX_QA_BATCH_SIZE = 50

const ACTIVE_ITEM_STATUSES = new Set(['queued', 'running'])
const REVIEW_ITEM_STATUSES = new Set(['ready', 'withheld', 'failed', 'accepted', 'rejected'])

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function isoNow(clock) {
  return clock().toISOString()
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function countChanges(draft) {
  return safeArray(draft?.changes).reduce(
    (count, change) => count + safeArray(change.fields).length,
    0,
  )
}

function compactReply(reply) {
  return String(reply || '')
    .replace(/[#*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360)
}

function itemCounts(items) {
  return items.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1
    return counts
  }, {
    queued: 0,
    running: 0,
    ready: 0,
    withheld: 0,
    failed: 0,
    accepted: 0,
    rejected: 0,
    cancelled: 0,
  })
}

function jobSummary(job) {
  const counts = itemCounts(job.items)
  const completed = job.items.length - counts.queued - counts.running
  const current = job.items.find((item) => item.status === 'running') ?? null
  return {
    id: job.id,
    viewId: job.viewId,
    issue: job.issue,
    model: job.model,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    total: job.items.length,
    completed,
    counts,
    current: current ? {
      itemId: current.id,
      recordId: current.recordId,
      address: current.record?.address,
      municipality: current.record?.municipality,
      activity: current.activity ?? null,
    } : null,
  }
}

function inboxItem(job, item) {
  return {
    id: item.id,
    jobId: job.id,
    viewId: job.viewId,
    issue: job.issue,
    model: job.model,
    status: item.status,
    recordId: item.recordId,
    record: item.record,
    caseId: item.caseId ?? null,
    proposalId: item.proposalId ?? null,
    changeCount: item.changeCount ?? 0,
    summary: item.summary || item.error || 'No review summary was returned.',
    warning: item.warning ?? null,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    reviewedAt: item.reviewedAt ?? null,
    canOpen: Boolean(item.result),
  }
}

function normalizeLoadedState(raw) {
  const state = raw?.version === 1 && Array.isArray(raw.jobs)
    ? raw
    : { version: 1, jobs: [] }

  for (const job of state.jobs) {
    job.items = safeArray(job.items)
    job.pauseRequested = Boolean(job.pauseRequested)
    job.cancelRequested = Boolean(job.cancelRequested)
    if (job.status === 'running') job.status = job.pauseRequested ? 'paused' : 'queued'
    for (const item of job.items) {
      if (item.status === 'running') {
        item.status = job.cancelRequested ? 'cancelled' : 'queued'
        item.activity = null
      }
    }
  }
  return state
}

export class QaBatchQueue {
  constructor({
    storagePath,
    investigate,
    model,
    clock = () => new Date(),
    autoStart = true,
  }) {
    if (!storagePath) throw new Error('A persistent QA batch storage path is required.')
    if (typeof investigate !== 'function') throw new Error('A QA investigation function is required.')
    this.storagePath = resolve(storagePath)
    this.investigate = investigate
    this.model = model
    this.clock = clock
    this.active = null
    this.pumpScheduled = false
    this.disposed = false
    this.shuttingDown = false
    this.state = this.readState()
    this.persist()
    if (autoStart) this.schedulePump()
  }

  readState() {
    if (!existsSync(this.storagePath)) return { version: 1, jobs: [] }
    try {
      return normalizeLoadedState(JSON.parse(readFileSync(this.storagePath, 'utf8')))
    } catch (error) {
      throw new Error(
        `The persistent QA batch store could not be read at ${this.storagePath}: ${error.message}`,
      )
    }
  }

  persist() {
    mkdirSync(dirname(this.storagePath), { recursive: true })
    const temporaryPath = resolve(
      dirname(this.storagePath),
      `.${basename(this.storagePath)}.${process.pid}.tmp`,
    )
    writeFileSync(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8')
    renameSync(temporaryPath, this.storagePath)
  }

  create({ viewId, issue, records }) {
    const selected = safeArray(records)
    if (!viewId || !issue?.id) throw new Error('A QA view and issue definition are required.')
    if (!selected.length || selected.length > MAX_QA_BATCH_SIZE) {
      throw new Error(`Choose between 1 and ${MAX_QA_BATCH_SIZE} QA records.`)
    }
    const recordIds = selected.map((record) => record.id)
    if (new Set(recordIds).size !== recordIds.length) {
      throw new Error('A QA record may appear only once in a batch.')
    }

    const now = isoNow(this.clock)
    const dateStamp = now.slice(0, 10).replaceAll('-', '')
    const id = `BATCH-${dateStamp}-${randomUUID().slice(0, 8).toUpperCase()}`
    const job = {
      id,
      viewId,
      issue: {
        id: issue.id,
        description: issue.description,
        category: issue.group?.label ?? issue.category ?? null,
      },
      model: this.model,
      status: 'queued',
      pauseRequested: false,
      cancelRequested: false,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      items: selected.map((record, index) => ({
        id: `${id}-${String(index + 1).padStart(3, '0')}`,
        recordId: record.id,
        record: clone(record),
        status: 'queued',
        attempts: 0,
        activity: null,
        startedAt: null,
        completedAt: null,
        result: null,
        error: null,
      })),
    }
    this.state.jobs.unshift(job)
    this.persist()
    this.schedulePump()
    return jobSummary(job)
  }

  dashboard() {
    const jobs = this.state.jobs.map(jobSummary)
    const items = this.state.jobs
      .flatMap((job) => job.items
        .filter((item) => REVIEW_ITEM_STATUSES.has(item.status))
        .map((item) => inboxItem(job, item)))
      .sort((left, right) => String(right.completedAt || '').localeCompare(String(left.completedAt || '')))
    const counts = items.reduce((result, item) => {
      result[item.status] = (result[item.status] || 0) + 1
      return result
    }, { ready: 0, withheld: 0, failed: 0, accepted: 0, rejected: 0 })
    return {
      kind: 'mad-qa-batch-dashboard',
      storage: {
        relativePath: '.runtime\\qa-batch-jobs.json',
        persistent: true,
      },
      worker: {
        concurrency: 1,
        active: Boolean(this.active),
        model: this.model,
      },
      jobs,
      inbox: { counts, items },
    }
  }

  getJob(jobId) {
    const job = this.state.jobs.find((candidate) => candidate.id === jobId)
    return job ? clone(job) : null
  }

  getItem(itemId) {
    for (const job of this.state.jobs) {
      const item = job.items.find((candidate) => candidate.id === itemId)
      if (item) return { ...inboxItem(job, item), result: clone(item.result) }
    }
    return null
  }

  pause(jobId) {
    const job = this.requireJob(jobId)
    if (['completed', 'cancelled'].includes(job.status)) return jobSummary(job)
    job.pauseRequested = true
    if (!job.items.some((item) => item.status === 'running')) job.status = 'paused'
    job.updatedAt = isoNow(this.clock)
    this.persist()
    return jobSummary(job)
  }

  resume(jobId) {
    const job = this.requireJob(jobId)
    if (job.status === 'cancelled') throw new Error('A cancelled batch cannot be resumed.')
    if (!job.items.some((item) => ACTIVE_ITEM_STATUSES.has(item.status))) return jobSummary(job)
    job.pauseRequested = false
    job.status = job.items.some((item) => item.status === 'running') ? 'running' : 'queued'
    job.updatedAt = isoNow(this.clock)
    this.persist()
    this.schedulePump()
    return jobSummary(job)
  }

  cancel(jobId) {
    const job = this.requireJob(jobId)
    job.cancelRequested = true
    job.pauseRequested = false
    for (const item of job.items) {
      if (item.status === 'queued') {
        item.status = 'cancelled'
        item.completedAt = isoNow(this.clock)
      }
    }
    if (this.active?.jobId === jobId) {
      job.status = 'cancelling'
      this.active.controller.abort()
    } else {
      job.status = 'cancelled'
      job.completedAt = isoNow(this.clock)
    }
    job.updatedAt = isoNow(this.clock)
    this.persist()
    return jobSummary(job)
  }

  recordCaseDecision(caseId, decision) {
    if (!['accepted', 'rejected'].includes(decision)) return
    let changed = false
    const now = isoNow(this.clock)
    for (const job of this.state.jobs) {
      for (const item of job.items) {
        if (item.caseId === caseId && ['ready', 'withheld'].includes(item.status)) {
          item.status = decision
          item.reviewedAt = now
          job.updatedAt = now
          changed = true
        }
      }
    }
    if (changed) this.persist()
  }

  requireJob(jobId) {
    const job = this.state.jobs.find((candidate) => candidate.id === jobId)
    if (!job) throw new Error('Unknown QA batch.')
    return job
  }

  schedulePump() {
    if (this.disposed || this.pumpScheduled || this.active) return
    this.pumpScheduled = true
    setImmediate(() => {
      this.pumpScheduled = false
      void this.pump()
    })
  }

  nextWork() {
    for (const job of this.state.jobs.slice().reverse()) {
      if (job.cancelRequested || job.pauseRequested) continue
      const item = job.items.find((candidate) => candidate.status === 'queued')
      if (item) return { job, item }
    }
    return null
  }

  updateActivity(job, item, event) {
    if (this.disposed) return
    if (event.type === 'reasoning_delta' || event.type === 'output_delta') return
    item.activity = {
      type: event.type,
      phase: event.phase,
      title: event.title,
      detail: event.detail,
      updatedAt: isoNow(this.clock),
    }
    job.updatedAt = item.activity.updatedAt
    this.persist()
  }

  async pump() {
    if (this.disposed || this.active) return
    const work = this.nextWork()
    if (!work) return
    const { job, item } = work
    const controller = new AbortController()
    const startedAt = isoNow(this.clock)
    this.active = { jobId: job.id, itemId: item.id, controller }
    job.status = 'running'
    job.startedAt ||= startedAt
    job.updatedAt = startedAt
    item.status = 'running'
    item.startedAt = startedAt
    item.attempts += 1
    item.error = null
    this.persist()
    let interruptedForShutdown = false

    try {
      const result = await this.investigate({
        viewId: job.viewId,
        recordId: item.recordId,
        signal: controller.signal,
        onEvent: (event) => this.updateActivity(job, item, event),
      })
      if ((this.shuttingDown || controller.signal.aborted) && !job.cancelRequested) {
        interruptedForShutdown = true
        return
      }
      item.result = clone(result)
      item.caseId = result.caseItem?.id ?? null
      item.proposalId = result.draft?.id ?? null
      item.changeCount = countChanges(result.draft)
      item.summary = result.caseItem?.recommendation
        || compactReply(result.reply)
        || 'Investigation completed without a narrative summary.'
      item.warning = result.agentWarning ?? null
      item.status = item.changeCount > 0 ? 'ready' : 'withheld'
    } catch (error) {
      if (error?.name === 'AbortError' && job.cancelRequested) {
        item.status = 'cancelled'
        item.error = 'Cancelled by the reviewer.'
      } else if (error?.name === 'AbortError' && this.shuttingDown) {
        interruptedForShutdown = true
      } else {
        item.status = 'failed'
        item.error = error?.message || 'The local agent could not complete this queued issue.'
        item.summary = item.error
      }
    } finally {
      if (interruptedForShutdown) {
        item.status = 'queued'
        item.activity = null
        item.completedAt = null
        item.error = null
        job.status = job.pauseRequested ? 'paused' : 'queued'
        job.updatedAt = isoNow(this.clock)
        this.active = null
        this.persist()
        return
      }
      const completedAt = isoNow(this.clock)
      item.completedAt = completedAt
      item.activity = null
      job.updatedAt = completedAt
      this.active = null
      const remaining = job.items.some((candidate) => candidate.status === 'queued')
      if (job.cancelRequested) {
        job.status = 'cancelled'
        job.completedAt = completedAt
      } else if (job.pauseRequested && remaining) {
        job.status = 'paused'
      } else if (remaining) {
        job.status = 'queued'
      } else {
        job.status = 'completed'
        job.completedAt = completedAt
      }
      this.persist()
      this.schedulePump()
    }
  }

  dispose() {
    if (this.disposed) return
    this.shuttingDown = true
    this.disposed = true
    if (!this.active) return
    const job = this.state.jobs.find((candidate) => candidate.id === this.active.jobId)
    const item = job?.items.find((candidate) => candidate.id === this.active.itemId)
    if (job && item?.status === 'running') {
      const now = isoNow(this.clock)
      item.status = job.cancelRequested ? 'cancelled' : 'queued'
      item.activity = null
      item.completedAt = job.cancelRequested ? now : null
      item.error = job.cancelRequested ? 'Cancelled by the reviewer.' : null
      job.status = job.cancelRequested ? 'cancelled' : (job.pauseRequested ? 'paused' : 'queued')
      job.completedAt = job.cancelRequested ? now : job.completedAt
      job.updatedAt = now
      this.persist()
    }
    this.active.controller.abort()
  }
}

export function createQaBatchQueue(options) {
  return new QaBatchQueue(options)
}
