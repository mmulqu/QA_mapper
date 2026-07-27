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
export const REVIEW_CLAIM_LEASE_MS = 60 * 60 * 1000

const ACTIVE_ITEM_STATUSES = new Set(['queued', 'running'])
const REVIEW_ITEM_STATUSES = new Set(['ready', 'withheld', 'failed', 'accepted', 'rejected'])
const CLAIMABLE_ITEM_STATUSES = new Set(['ready', 'withheld'])
const DEDUPLICATED_ITEM_STATUSES = new Set([
  ...ACTIVE_ITEM_STATUSES,
  ...CLAIMABLE_ITEM_STATUSES,
  'accepted',
  'rejected',
])
const ACTIVE_AGENT_STATUSES = new Set(['queued', 'running'])
const MAX_ITEM_TRANSCRIPT_EVENTS = 120
const MAX_ITEM_TRANSCRIPT_TEXT = 24_000

const defaultFileOperations = {
  mkdirSync,
  renameSync,
  writeFileSync,
}

export function writeQueueStateFile(
  storagePath,
  state,
  { fileOperations = defaultFileOperations } = {},
) {
  const storageDirectory = dirname(storagePath)
  const temporaryPath = resolve(
    storageDirectory,
    `.${basename(storagePath)}.${process.pid}.tmp`,
  )
  const serializedState = `${JSON.stringify(state, null, 2)}\n`
  fileOperations.mkdirSync(storageDirectory, { recursive: true })
  fileOperations.writeFileSync(temporaryPath, serializedState, 'utf8')
  fileOperations.renameSync(temporaryPath, storagePath)
  return { atomic: true }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function isoNow(clock) {
  return clock().toISOString()
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function createQueueError(message, statusCode = 409) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function normalizeReviewer(reviewer) {
  const id = String(reviewer?.id || 'local-reviewer').trim().slice(0, 120)
  const name = String(reviewer?.name || 'Local reviewer').trim().slice(0, 80)
  return { id: id || 'local-reviewer', name: name || 'Local reviewer' }
}

function isClaimExpired(item, now = Date.now()) {
  if (!item.claimedBy?.id || !item.claimExpiresAt) return false
  return Date.parse(item.claimExpiresAt) <= now
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

function jobSummary(job, queue = null) {
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
    createdBy: job.createdBy ?? null,
    total: job.items.length,
    completed,
    counts,
    current: current ? {
      itemId: current.id,
      recordId: current.recordId,
      address: current.record?.address,
      municipality: current.record?.municipality,
      activity: current.activity ?? null,
      transcriptCount: safeArray(current.transcript).length,
      queue: queue?.entryForBatchItem(current.id) ?? null,
    } : null,
  }
}

function inboxItem(job, item, reviewerId = null) {
  const claimExpired = isClaimExpired(item)
  const claimedBy = claimExpired ? null : item.claimedBy ?? null
  return {
    id: item.id,
    jobId: job.id,
    viewId: job.viewId,
    issue: job.issue,
    model: job.model,
    status: item.status,
    recordId: item.recordId,
    record: item.record,
    reviewerContext: item.reviewerContext ?? '',
    caseId: item.caseId ?? null,
    proposalId: item.proposalId ?? null,
    changeCount: item.changeCount ?? 0,
    summary: item.summary || item.error || 'No review summary was returned.',
    warning: item.warning ?? null,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    reviewedAt: item.reviewedAt ?? null,
    reviewedBy: item.reviewedBy ?? null,
    claimedBy,
    claimedAt: claimExpired ? null : item.claimedAt ?? null,
    claimExpiresAt: claimExpired ? null : item.claimExpiresAt ?? null,
    claimVersion: Number(item.claimVersion || 0),
    claimedByMe: Boolean(reviewerId && claimedBy?.id === reviewerId),
    canClaim: CLAIMABLE_ITEM_STATUSES.has(item.status)
      && (!claimedBy?.id || claimedBy.id === reviewerId),
    canOpen: Boolean(item.result),
  }
}

function normalizeLoadedState(raw) {
  const state = raw && [1, 2].includes(raw.version) && Array.isArray(raw.jobs)
    ? raw
    : { version: 2, jobs: [], requests: [], nextSequence: 1 }
  state.version = 2
  state.requests = safeArray(state.requests)
  let nextSequence = Number(state.nextSequence) || 1

  for (const job of state.jobs.slice().reverse()) {
    job.items = safeArray(job.items)
    job.pauseRequested = Boolean(job.pauseRequested)
    job.cancelRequested = Boolean(job.cancelRequested)
    if (job.status === 'running') job.status = job.pauseRequested ? 'paused' : 'queued'
    for (const item of job.items) {
      if (!Number.isFinite(item.queueSequence)) {
        item.queueSequence = nextSequence
        nextSequence += 1
      } else {
        nextSequence = Math.max(nextSequence, item.queueSequence + 1)
      }
      item.transcript = safeArray(item.transcript)
      if (item.status === 'running') {
        item.status = job.cancelRequested ? 'cancelled' : 'queued'
        item.activity = null
      }
    }
  }
  for (const request of state.requests) {
    if (!Number.isFinite(request.queueSequence)) {
      request.queueSequence = nextSequence
      nextSequence += 1
    } else {
      nextSequence = Math.max(nextSequence, request.queueSequence + 1)
    }
    request.transcript = safeArray(request.transcript)
    if (request.status === 'running') {
      request.status = 'queued'
      request.startedAt = null
      request.completedAt = null
      request.error = null
    }
  }
  state.nextSequence = nextSequence
  return state
}

export class QaBatchQueue {
  constructor({
    storagePath,
    investigate,
    executeRequest = null,
    model,
    clock = () => new Date(),
    autoStart = true,
    onAudit = null,
    onPersistenceError = null,
    writeState = writeQueueStateFile,
    persistenceRetryDelayMs = 1_000,
  }) {
    if (!storagePath) throw new Error('A persistent QA batch storage path is required.')
    if (typeof investigate !== 'function') throw new Error('A QA investigation function is required.')
    this.storagePath = resolve(storagePath)
    this.investigate = investigate
    this.executeRequest = executeRequest
    this.model = model
    this.clock = clock
    this.onAudit = typeof onAudit === 'function' ? onAudit : null
    this.onPersistenceError = typeof onPersistenceError === 'function'
      ? onPersistenceError
      : (error) => console.error(`[MAD QA queue persistence] ${error.message}`)
    this.writeState = writeState
    this.persistenceRetryDelayMs = persistenceRetryDelayMs
    this.active = null
    this.pumpScheduled = false
    this.disposed = false
    this.shuttingDown = false
    this.listeners = new Set()
    this.requestListeners = new Set()
    this.persistTimer = null
    this.persistenceError = null
    this.persistenceErrorAt = null
    this.state = this.readState()
    this.persist()
    if (autoStart) this.schedulePump()
  }

  readState() {
    if (!existsSync(this.storagePath)) {
      return { version: 2, jobs: [], requests: [], nextSequence: 1 }
    }
    try {
      return normalizeLoadedState(JSON.parse(readFileSync(this.storagePath, 'utf8')))
    } catch (error) {
      throw new Error(
        `The persistent QA batch store could not be read at ${this.storagePath}: ${error.message}`,
      )
    }
  }

  persist() {
    try {
      this.writeState(this.storagePath, this.state)
      if (this.persistTimer) {
        clearTimeout(this.persistTimer)
        this.persistTimer = null
      }
      this.persistenceError = null
      this.persistenceErrorAt = null
      return true
    } catch (error) {
      const message = error?.message || 'The persistent QA batch store could not be updated.'
      const changed = this.persistenceError !== message
      this.persistenceError = message
      this.persistenceErrorAt = isoNow(this.clock)
      if (changed) {
        try {
          this.onPersistenceError(new Error(message))
        } catch {
          // Error reporting must never terminate the queue worker.
        }
      }
      this.schedulePersist(this.persistenceRetryDelayMs)
      return false
    }
  }

  takeSequence() {
    const sequence = this.state.nextSequence
    this.state.nextSequence += 1
    return sequence
  }

  audit(event) {
    if (!this.onAudit) return
    try {
      this.onAudit(clone(event))
    } catch {
      // Audit storage problems are surfaced by its own endpoint and must not strand the worker.
    }
  }

  create({ viewId, issue, records, recordPrompts = {}, reviewer = null }) {
    const selected = safeArray(records)
    if (!viewId || !issue?.id) throw new Error('A QA view and issue definition are required.')
    if (!selected.length || selected.length > MAX_QA_BATCH_SIZE) {
      throw new Error(`Choose between 1 and ${MAX_QA_BATCH_SIZE} QA records.`)
    }
    const recordIds = selected.map((record) => record.id)
    if (new Set(recordIds).size !== recordIds.length) {
      throw new Error('A QA record may appear only once in a batch.')
    }
    const duplicate = selected.find((record) => this.state.jobs.some((job) => (
      job.viewId === viewId
      && job.items.some((item) => (
        item.recordId === record.id
        && DEDUPLICATED_ITEM_STATUSES.has(item.status)
      ))
    )))
    if (duplicate) {
      throw createQueueError(
        `${duplicate.address || duplicate.id} is already queued or waiting for review.`,
      )
    }

    const now = isoNow(this.clock)
    const createdBy = normalizeReviewer(reviewer)
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
      createdBy,
      items: selected.map((record, index) => ({
        id: `${id}-${String(index + 1).padStart(3, '0')}`,
        recordId: record.id,
        record: clone(record),
        reviewerContext: typeof recordPrompts[record.id] === 'string'
          ? recordPrompts[record.id].trim()
          : '',
        status: 'queued',
        queueSequence: this.takeSequence(),
        attempts: 0,
        activity: null,
        transcript: [],
        startedAt: null,
        completedAt: null,
        result: null,
        error: null,
      })),
    }
    this.state.jobs.unshift(job)
    this.persist()
    for (const item of job.items) {
      this.audit({
        type: 'issue_queued',
        actor: createdBy,
        jobId: job.id,
        itemId: item.id,
        viewId: job.viewId,
        recordId: item.recordId,
        issueId: job.issue.id,
        model: job.model,
        reviewerContext: item.reviewerContext,
      })
    }
    this.publishQueuePositions()
    this.schedulePump()
    return jobSummary(job, this)
  }

  dashboard(reviewerId = null) {
    const jobs = this.state.jobs.map((job) => jobSummary(job, this))
    const items = this.state.jobs
      .flatMap((job) => job.items
        .filter((item) => REVIEW_ITEM_STATUSES.has(item.status))
        .map((item) => inboxItem(job, item, reviewerId)))
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
        healthy: !this.persistenceError,
        error: this.persistenceError,
        errorAt: this.persistenceErrorAt,
      },
      worker: {
        concurrency: 1,
        active: Boolean(this.active),
        model: this.model,
      },
      agentQueue: {
        entries: this.queueEntries(),
        active: this.queueEntries().find((entry) => entry.status === 'running') ?? null,
        waiting: this.queueEntries().filter((entry) => entry.status === 'queued').length,
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

  queueEntries() {
    const entries = []
    for (const job of this.state.jobs) {
      if (job.pauseRequested || job.cancelRequested) continue
      for (const item of job.items) {
        if (!ACTIVE_AGENT_STATUSES.has(item.status)) continue
        entries.push({
          id: item.id,
          kind: 'qa-investigation',
          status: item.status,
          queueSequence: item.queueSequence,
          createdAt: job.createdAt,
          owner: job.createdBy ?? normalizeReviewer(null),
          label: item.record?.address || item.recordId,
          detail: job.issue?.description || job.viewId,
          jobId: job.id,
          recordId: item.recordId,
        })
      }
    }
    for (const request of this.state.requests) {
      if (!ACTIVE_AGENT_STATUSES.has(request.status)) continue
      entries.push({
        id: request.id,
        kind: request.kind,
        status: request.status,
        queueSequence: request.queueSequence,
        createdAt: request.createdAt,
        owner: request.reviewer,
        label: request.label,
        detail: request.detail,
        caseId: request.caseId ?? null,
        recordId: request.recordId ?? null,
      })
    }
    return entries
      .sort((left, right) => left.queueSequence - right.queueSequence)
      .map((entry, index, ordered) => ({
        ...entry,
        position: index + 1,
        total: ordered.length,
        ahead: index,
      }))
  }

  entryForBatchItem(itemId) {
    return this.queueEntries().find((entry) => entry.id === itemId) ?? null
  }

  requestSummary(request) {
    if (!request) return null
    const queue = this.queueEntries().find((entry) => entry.id === request.id) ?? null
    return {
      id: request.id,
      kind: request.kind,
      status: request.status,
      reviewer: request.reviewer,
      caseId: request.caseId ?? null,
      viewId: request.viewId ?? null,
      recordId: request.recordId ?? null,
      label: request.label,
      detail: request.detail,
      createdAt: request.createdAt,
      startedAt: request.startedAt,
      completedAt: request.completedAt,
      error: request.error,
      queue,
    }
  }

  createRequest({
    kind,
    reviewer,
    caseId = null,
    viewId = null,
    recordId = null,
    prompt = '',
    reviewerContext = '',
    payload = {},
    label = 'Agent request',
    detail = '',
  }) {
    if (typeof this.executeRequest !== 'function') {
      throw new Error('The shared agent request executor is not configured.')
    }
    const now = isoNow(this.clock)
    const request = {
      id: `AGENT-${now.slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
      kind,
      reviewer: normalizeReviewer(reviewer),
      caseId,
      viewId,
      recordId,
      prompt,
      reviewerContext,
      payload: clone(payload),
      label: String(label || 'Agent request').slice(0, 180),
      detail: String(detail || '').slice(0, 360),
      queueSequence: this.takeSequence(),
      status: 'queued',
      createdAt: now,
      startedAt: null,
      completedAt: null,
      transcript: [],
      result: null,
      error: null,
    }
    this.state.requests.push(request)
    this.persist()
    this.audit({
      type: kind === 'case-follow-up' ? 'followup_prompt_queued' : 'agent_request_queued',
      actor: request.reviewer,
      requestId: request.id,
      requestKind: request.kind,
      model: this.model,
      caseId: request.caseId,
      viewId: request.viewId,
      recordId: request.recordId,
      prompt: request.prompt,
      reviewerContext: request.reviewerContext,
    })
    this.publishQueuePositions()
    this.schedulePump()
    return this.requestSummary(request)
  }

  getRequest(requestId) {
    const request = this.state.requests.find((candidate) => candidate.id === requestId)
    return request ? { ...this.requestSummary(request), result: clone(request.result) } : null
  }

  getConversation(caseId) {
    return this.state.requests
      .filter((request) => request.kind === 'case-follow-up' && request.caseId === caseId)
      .sort((left, right) => left.queueSequence - right.queueSequence)
      .map((request) => ({
        requestId: request.id,
        reviewer: request.reviewer,
        prompt: request.prompt,
        status: request.status,
        createdAt: request.createdAt,
        completedAt: request.completedAt,
        reply: request.result?.reply ?? null,
        toolEvents: request.result?.toolEvents ?? [],
        error: request.error,
      }))
  }

  subscribeRequest(requestId, listener) {
    if (typeof listener !== 'function') throw new Error('An agent request listener is required.')
    const subscription = { requestId, listener }
    this.requestListeners.add(subscription)
    return () => this.requestListeners.delete(subscription)
  }

  publishRequest(request, type, extra = {}) {
    const payload = { type, request: this.requestSummary(request), ...clone(extra) }
    for (const subscription of this.requestListeners) {
      if (subscription.requestId !== request.id) continue
      try {
        subscription.listener(payload)
      } catch {
        // A disconnected reviewer must never interrupt the shared worker.
      }
    }
  }

  publishQueuePositions() {
    const entries = this.queueEntries()
    for (const job of this.state.jobs) {
      for (const item of job.items) {
        const queue = entries.find((entry) => entry.id === item.id)
        if (queue) this.publish(job, { type: 'queue', itemId: item.id, queue })
      }
    }
    for (const request of this.state.requests) {
      if (ACTIVE_AGENT_STATUSES.has(request.status)) this.publishRequest(request, 'queue')
    }
  }

  waitForRequest(requestId, { onEvent } = {}) {
    const existing = this.state.requests.find((candidate) => candidate.id === requestId)
    if (!existing) return Promise.reject(new Error('Unknown shared agent request.'))
    if (existing.status === 'completed') return Promise.resolve(clone(existing.result))
    if (existing.status === 'failed') return Promise.reject(createQueueError(existing.error || 'Agent request failed.', 502))
    return new Promise((resolveWait, rejectWait) => {
      const unsubscribe = this.subscribeRequest(requestId, (event) => {
        if (event.type === 'activity') onEvent?.(event.event)
        if (event.type === 'complete') {
          unsubscribe()
          resolveWait(clone(event.result))
        }
        if (event.type === 'failed') {
          unsubscribe()
          rejectWait(createQueueError(event.request.error || 'Agent request failed.', 502))
        }
      })
    })
  }

  claimItem(itemId, reviewer) {
    const actor = normalizeReviewer(reviewer)
    for (const job of this.state.jobs) {
      const item = job.items.find((candidate) => candidate.id === itemId)
      if (!item) continue
      if (!CLAIMABLE_ITEM_STATUSES.has(item.status)) {
        throw createQueueError('This result is no longer available for review.')
      }
      if (item.claimedBy?.id && !isClaimExpired(item) && item.claimedBy.id !== actor.id) {
        throw createQueueError(`${item.claimedBy.name} is already reviewing this issue.`)
      }
      const now = isoNow(this.clock)
      item.claimedBy = actor
      item.claimedAt = now
      item.claimExpiresAt = new Date(this.clock().getTime() + REVIEW_CLAIM_LEASE_MS).toISOString()
      item.claimVersion = Number(item.claimVersion || 0) + 1
      job.updatedAt = now
      this.persist()
      this.audit({
        type: 'review_claimed',
        actor,
        jobId: job.id,
        itemId: item.id,
        caseId: item.caseId,
        viewId: job.viewId,
        recordId: item.recordId,
        claimVersion: item.claimVersion,
      })
      return { ...inboxItem(job, item, actor.id), result: clone(item.result) }
    }
    throw createQueueError('Unknown queued QA result.', 404)
  }

  releaseItem(itemId, reviewer, claimVersion = null) {
    const actor = normalizeReviewer(reviewer)
    for (const job of this.state.jobs) {
      const item = job.items.find((candidate) => candidate.id === itemId)
      if (!item) continue
      if (item.claimedBy?.id !== actor.id) {
        throw createQueueError('Only the reviewer holding this issue can release it.', 403)
      }
      if (claimVersion !== null && Number(claimVersion) !== Number(item.claimVersion || 0)) {
        throw createQueueError('This review claim changed in another browser. Refresh the inbox.')
      }
      item.claimedBy = null
      item.claimedAt = null
      item.claimExpiresAt = null
      item.claimVersion = Number(item.claimVersion || 0) + 1
      job.updatedAt = isoNow(this.clock)
      this.persist()
      this.audit({
        type: 'review_released',
        actor,
        jobId: job.id,
        itemId: item.id,
        caseId: item.caseId,
        viewId: job.viewId,
        recordId: item.recordId,
        claimVersion: item.claimVersion,
      })
      return { ...inboxItem(job, item, actor.id), result: clone(item.result) }
    }
    throw createQueueError('Unknown queued QA result.', 404)
  }

  requireCaseClaim(caseId, reviewer, { itemId, claimVersion } = {}) {
    const actor = normalizeReviewer(reviewer)
    const candidates = []
    let decidedItem = null
    for (const job of this.state.jobs) {
      for (const item of job.items) {
        if (item.caseId === caseId && CLAIMABLE_ITEM_STATUSES.has(item.status)) {
          candidates.push({ job, item })
        }
        if (item.id === itemId && item.caseId === caseId && ['accepted', 'rejected'].includes(item.status)) {
          decidedItem = item
        }
      }
    }
    if (decidedItem) {
      throw createQueueError(
        `This issue was already ${decidedItem.status} by ${decidedItem.reviewedBy?.name || 'another reviewer'}.`,
      )
    }
    if (!candidates.length) return null
    const selected = candidates.find(({ item }) => item.id === itemId)
    if (!selected) throw createQueueError('Open this issue from the shared review inbox before deciding it.')
    const { item } = selected
    if (isClaimExpired(item)) throw createQueueError('Your review claim expired. Return to the inbox and claim it again.')
    if (item.claimedBy?.id !== actor.id) {
      throw createQueueError(`${item.claimedBy?.name || 'Another reviewer'} holds this issue.`)
    }
    if (Number(claimVersion) !== Number(item.claimVersion || 0)) {
      throw createQueueError('This review changed in another browser. Refresh before deciding.')
    }
    return selected
  }

  reserveCaseFollowUp(caseId, reviewer) {
    const actor = normalizeReviewer(reviewer)
    let selected = null
    let decided = null
    for (const job of this.state.jobs) {
      for (const item of job.items) {
        if (item.caseId !== caseId) continue
        if (['ready', 'withheld', 'rejected'].includes(item.status) && !selected) {
          selected = { job, item }
        }
        if (item.status === 'accepted' && !decided) decided = item
      }
    }
    if (!selected) {
      if (decided) throw createQueueError('This issue was already accepted and cannot be revised.')
      return null
    }
    const { job, item } = selected
    if (item.claimedBy?.id && !isClaimExpired(item) && item.claimedBy.id !== actor.id) {
      throw createQueueError(`${item.claimedBy.name} is already working on this issue.`)
    }
    if (!item.claimedBy?.id || isClaimExpired(item)) {
      const now = isoNow(this.clock)
      item.claimedBy = actor
      item.claimedAt = now
      item.claimExpiresAt = new Date(this.clock().getTime() + REVIEW_CLAIM_LEASE_MS).toISOString()
      item.claimVersion = Number(item.claimVersion || 0) + 1
      job.updatedAt = now
      this.persist()
      this.audit({
        type: 'review_claimed',
        actor,
        reason: 'case-follow-up',
        jobId: job.id,
        itemId: item.id,
        caseId,
        viewId: job.viewId,
        recordId: item.recordId,
        claimVersion: item.claimVersion,
      })
    }
    return {
      id: item.id,
      claimVersion: item.claimVersion,
      claimedBy: clone(item.claimedBy),
      claimExpiresAt: item.claimExpiresAt,
    }
  }

  recordCaseFollowUpResult(caseId, result, reviewer, {
    requestId = null,
    prompt = '',
  } = {}) {
    const actor = normalizeReviewer(reviewer)
    let selected = null
    for (const job of this.state.jobs) {
      const item = job.items.find((candidate) => (
        candidate.caseId === caseId
        && ['ready', 'withheld', 'rejected'].includes(candidate.status)
      ))
      if (item) {
        selected = { job, item }
        break
      }
    }
    if (!selected) return null
    const { job, item } = selected
    if (item.claimedBy?.id && !isClaimExpired(item) && item.claimedBy.id !== actor.id) {
      throw createQueueError(`${item.claimedBy.name} is already working on this issue.`)
    }

    const draft = result?.draft
    const stagedRevision = Boolean(draft?.validation?.passed && countChanges(draft) > 0)
    if (!stagedRevision) {
      if (item.status === 'rejected' && item.claimedBy?.id === actor.id) {
        item.claimedBy = null
        item.claimedAt = null
        item.claimExpiresAt = null
        item.claimVersion = Number(item.claimVersion || 0) + 1
        job.updatedAt = isoNow(this.clock)
        this.persist()
        this.audit({
          type: 'review_released',
          actor,
          reason: 'follow-up-without-revision',
          jobId: job.id,
          itemId: item.id,
          caseId,
          viewId: job.viewId,
          recordId: item.recordId,
          claimVersion: item.claimVersion,
        })
      }
      return null
    }

    const now = isoNow(this.clock)
    item.result = {
      ...clone(item.result),
      ...clone(result),
      caseItem: clone(item.result?.caseItem),
    }
    item.proposalId = draft.id ?? null
    item.changeCount = countChanges(draft)
    item.summary = compactReply(result.reply)
      || item.result?.caseItem?.recommendation
      || 'Revised proposal staged for review.'
    item.status = 'ready'
    item.reviewedAt = null
    item.reviewedBy = null
    item.revisionBy = actor
    item.revisionRequestId = requestId
    item.revisionPrompt = prompt
    item.claimedBy = actor
    item.claimedAt ||= now
    item.claimExpiresAt = new Date(this.clock().getTime() + REVIEW_CLAIM_LEASE_MS).toISOString()
    item.claimVersion = Number(item.claimVersion || 0) + 1
    job.updatedAt = now
    this.persist()
    this.audit({
      type: 'followup_revision_staged',
      actor,
      requestId,
      prompt,
      jobId: job.id,
      itemId: item.id,
      caseId,
      viewId: job.viewId,
      recordId: item.recordId,
      proposalId: item.proposalId,
      model: job.model,
      changeCount: item.changeCount,
      claimVersion: item.claimVersion,
    })
    return {
      id: item.id,
      claimVersion: item.claimVersion,
      claimedBy: clone(item.claimedBy),
      claimExpiresAt: item.claimExpiresAt,
    }
  }

  releaseCaseFollowUpReservation(caseId, reviewer) {
    const actor = normalizeReviewer(reviewer)
    for (const job of this.state.jobs) {
      const item = job.items.find((candidate) => (
        candidate.caseId === caseId
        && candidate.status === 'rejected'
        && candidate.claimedBy?.id === actor.id
      ))
      if (!item) continue
      item.claimedBy = null
      item.claimedAt = null
      item.claimExpiresAt = null
      item.claimVersion = Number(item.claimVersion || 0) + 1
      job.updatedAt = isoNow(this.clock)
      this.persist()
      this.audit({
        type: 'review_released',
        actor,
        reason: 'follow-up-failed',
        jobId: job.id,
        itemId: item.id,
        caseId,
        viewId: job.viewId,
        recordId: item.recordId,
        claimVersion: item.claimVersion,
      })
      return true
    }
    return false
  }

  pause(jobId, reviewer = null) {
    const job = this.requireJob(jobId)
    this.requireJobOwner(job, reviewer)
    if (['completed', 'cancelled'].includes(job.status)) return jobSummary(job)
    job.pauseRequested = true
    if (!job.items.some((item) => item.status === 'running')) job.status = 'paused'
    job.updatedAt = isoNow(this.clock)
    this.persist()
    this.publishJobState(job)
    this.publishQueuePositions()
    return jobSummary(job, this)
  }

  resume(jobId, reviewer = null) {
    const job = this.requireJob(jobId)
    this.requireJobOwner(job, reviewer)
    if (job.status === 'cancelled') throw new Error('A cancelled batch cannot be resumed.')
    if (!job.items.some((item) => ACTIVE_ITEM_STATUSES.has(item.status))) return jobSummary(job)
    job.pauseRequested = false
    job.status = job.items.some((item) => item.status === 'running') ? 'running' : 'queued'
    job.updatedAt = isoNow(this.clock)
    this.persist()
    this.publishJobState(job)
    this.publishQueuePositions()
    this.schedulePump()
    return jobSummary(job, this)
  }

  cancel(jobId, reviewer = null) {
    const job = this.requireJob(jobId)
    this.requireJobOwner(job, reviewer)
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
    this.publishJobState(job)
    this.publishQueuePositions()
    return jobSummary(job, this)
  }

  recordCaseDecision(caseId, decision, reviewer = null, claim = null) {
    if (!['accepted', 'rejected'].includes(decision)) return
    const selected = reviewer ? this.requireCaseClaim(caseId, reviewer, claim) : null
    const actor = reviewer ? normalizeReviewer(reviewer) : null
    let changed = false
    const now = isoNow(this.clock)
    for (const job of this.state.jobs) {
      for (const item of job.items) {
        if (
          item.caseId === caseId
          && ['ready', 'withheld'].includes(item.status)
          && (!selected || selected.item.id === item.id)
        ) {
          item.status = decision
          item.reviewedAt = now
          item.reviewedBy = actor
          item.reviewHistory = safeArray(item.reviewHistory)
          const hadRejectedProposal = item.reviewHistory.some((entry) => entry.decision === 'rejected')
          item.reviewHistory.push({
            decision,
            reviewer: actor,
            proposalId: item.proposalId,
            at: now,
          })
          item.claimedBy = null
          item.claimedAt = null
          item.claimExpiresAt = null
          item.claimVersion = Number(item.claimVersion || 0) + 1
          job.updatedAt = now
          this.audit({
            type: 'review_decision',
            actor,
            decision,
            jobId: job.id,
            itemId: item.id,
            caseId,
            viewId: job.viewId,
            recordId: item.recordId,
            proposalId: item.proposalId,
            model: job.model,
          })
          if (
            decision === 'accepted'
            && hadRejectedProposal
            && item.revisionBy
            && !item.recoveryCreditedAt
          ) {
            item.recoveryCreditedAt = now
            this.audit({
              type: 'proposal_recovered',
              actor: item.revisionBy,
              acceptedBy: actor,
              requestId: item.revisionRequestId,
              prompt: item.revisionPrompt,
              jobId: job.id,
              itemId: item.id,
              caseId,
              viewId: job.viewId,
              recordId: item.recordId,
              proposalId: item.proposalId,
              model: job.model,
              priorRejections: item.reviewHistory.filter((entry) => entry.decision === 'rejected').length,
            })
          }
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

  requireJobOwner(job, reviewer) {
    if (!reviewer || !job.createdBy?.id) return
    const actor = normalizeReviewer(reviewer)
    if (job.createdBy.id !== actor.id) {
      throw createQueueError(`Only ${job.createdBy.name} can control this batch.`, 403)
    }
  }

  schedulePump() {
    if (this.disposed || this.pumpScheduled || this.active) return
    this.pumpScheduled = true
    setImmediate(() => {
      this.pumpScheduled = false
      void this.pump()
    })
  }

  subscribe(jobId, listener) {
    if (typeof listener !== 'function') throw new Error('A batch stream listener is required.')
    const subscription = { jobId, listener }
    this.listeners.add(subscription)
    return () => this.listeners.delete(subscription)
  }

  waitForBatchItem(itemId, { onEvent, onQueue } = {}) {
    const locate = () => {
      for (const job of this.state.jobs) {
        const item = job.items.find((candidate) => candidate.id === itemId)
        if (item) return { job, item }
      }
      return null
    }
    const current = locate()
    if (!current) return Promise.reject(new Error('Unknown QA batch item.'))
    if (['ready', 'withheld', 'accepted', 'rejected'].includes(current.item.status)) {
      return Promise.resolve(clone(current.item.result))
    }
    if (['failed', 'cancelled'].includes(current.item.status)) {
      return Promise.reject(new Error(current.item.error || 'The QA investigation did not complete.'))
    }
    return new Promise((resolveWait, rejectWait) => {
      const unsubscribe = this.subscribe(current.job.id, (event) => {
        if (event.type === 'activity' && event.itemId === itemId) onEvent?.(event.event)
        if (event.type === 'state' || event.type === 'complete') {
          onQueue?.(this.entryForBatchItem(itemId))
          const latest = locate()?.item
          if (['ready', 'withheld', 'accepted', 'rejected'].includes(latest?.status)) {
            unsubscribe()
            resolveWait(clone(latest.result))
          } else if (['failed', 'cancelled'].includes(latest?.status)) {
            unsubscribe()
            rejectWait(new Error(latest.error || 'The QA investigation did not complete.'))
          }
        }
      })
    })
  }

  publish(job, payload) {
    for (const subscription of this.listeners) {
      if (subscription.jobId !== job.id) continue
      try {
        subscription.listener(clone(payload))
      } catch {
        // A disconnected browser must never interrupt background investigations.
      }
    }
  }

  publishJobState(job, event = 'state') {
    this.publish(job, { type: event, job: jobSummary(job, this) })
  }

  schedulePersist(delayMs) {
    if (this.persistTimer || this.disposed) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      if (!this.disposed) this.persist()
    }, delayMs)
    this.persistTimer.unref?.()
  }

  persistSoon() {
    this.schedulePersist(300)
  }

  appendTranscript(item, event, recordedAt) {
    const incoming = {
      id: event.id || `event-${randomUUID()}`,
      type: event.type || 'status',
      phase: event.phase,
      turn: event.turn,
      name: event.name,
      model: event.model,
      title: event.title,
      detail: event.detail,
      text: typeof event.text === 'string' ? event.text : undefined,
      recordedAt,
    }
    const transcript = safeArray(item.transcript)
    const index = transcript.findIndex((candidate) => candidate.id === incoming.id)
    const isDelta = incoming.type === 'reasoning_delta' || incoming.type === 'output_delta'

    if (index >= 0) {
      const existing = transcript[index]
      const text = isDelta ? `${existing.text || ''}${incoming.text || ''}` : (incoming.text ?? existing.text)
      const boundedText = text?.length > MAX_ITEM_TRANSCRIPT_TEXT
        ? `…${text.slice(-MAX_ITEM_TRANSCRIPT_TEXT)}`
        : text
      transcript[index] = {
        ...existing,
        ...incoming,
        ...(boundedText ? { text: boundedText } : {}),
      }
    } else {
      transcript.push(incoming)
    }
    item.transcript = transcript.slice(-MAX_ITEM_TRANSCRIPT_EVENTS)
  }

  nextWork() {
    const candidates = []
    for (const job of this.state.jobs) {
      if (job.cancelRequested || job.pauseRequested) continue
      for (const item of job.items) {
        if (item.status === 'queued') {
          candidates.push({ type: 'batch', queueSequence: item.queueSequence, job, item })
        }
      }
    }
    for (const request of this.state.requests) {
      if (request.status === 'queued') {
        candidates.push({ type: 'request', queueSequence: request.queueSequence, request })
      }
    }
    return candidates.sort((left, right) => left.queueSequence - right.queueSequence)[0] ?? null
  }

  updateActivity(job, item, event) {
    if (this.disposed) return
    const updatedAt = isoNow(this.clock)
    this.appendTranscript(item, event, updatedAt)
    if (event.type !== 'reasoning_delta' && event.type !== 'output_delta') {
      item.activity = {
        type: event.type,
        phase: event.phase,
        title: event.title,
        detail: event.detail,
        updatedAt,
      }
    }
    job.updatedAt = updatedAt
    this.publish(job, { type: 'activity', itemId: item.id, event })
    if (event.type === 'reasoning_delta' || event.type === 'output_delta') this.persistSoon()
    else this.persist()
  }

  async pump() {
    if (this.disposed || this.active) return
    const work = this.nextWork()
    if (!work) return
    if (work.type === 'request') {
      await this.pumpRequest(work.request)
      return
    }
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
    item.transcript = []
    this.persist()
    this.audit({
      type: 'issue_started',
      actor: job.createdBy,
      jobId: job.id,
      itemId: item.id,
      caseId: item.caseId,
      viewId: job.viewId,
      recordId: item.recordId,
      issueId: job.issue.id,
      model: job.model,
    })
    this.publishJobState(job)
    this.publishQueuePositions()
    let interruptedForShutdown = false

    try {
      const result = await this.investigate({
        viewId: job.viewId,
        recordId: item.recordId,
        reviewerContext: item.reviewerContext,
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
        this.publishJobState(job)
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
      this.audit({
        type: item.status === 'failed' ? 'issue_failed' : 'issue_completed',
        actor: job.createdBy,
        jobId: job.id,
        itemId: item.id,
        caseId: item.caseId,
        viewId: job.viewId,
        recordId: item.recordId,
        issueId: job.issue.id,
        model: job.model,
        status: item.status,
        proposalId: item.proposalId,
        changeCount: item.changeCount,
        error: item.error,
      })
      this.publishJobState(job, 'complete')
      this.publishQueuePositions()
      this.schedulePump()
    }
  }

  async pumpRequest(request) {
    const controller = new AbortController()
    const startedAt = isoNow(this.clock)
    this.active = { requestId: request.id, controller }
    request.status = 'running'
    request.startedAt = startedAt
    request.completedAt = null
    request.error = null
    request.transcript = []
    this.persist()
    this.audit({
      type: 'agent_request_started',
      actor: request.reviewer,
      requestId: request.id,
      requestKind: request.kind,
      model: this.model,
      caseId: request.caseId,
      viewId: request.viewId,
      recordId: request.recordId,
      prompt: request.prompt,
    })
    this.publishRequest(request, 'state')
    this.publishQueuePositions()

    try {
      const result = await this.executeRequest({
        ...clone(request),
        signal: controller.signal,
        onEvent: (event) => {
          if (this.disposed) return
          const recordedAt = isoNow(this.clock)
          this.appendTranscript(request, event, recordedAt)
          this.publishRequest(request, 'activity', { event })
          if (event.type === 'reasoning_delta' || event.type === 'output_delta') this.persistSoon()
          else this.persist()
        },
      })
      if ((this.shuttingDown || controller.signal.aborted) && !request.cancelRequested) {
        request.status = 'queued'
        request.startedAt = null
        request.error = null
        return
      }
      request.result = clone(result)
      request.status = 'completed'
      request.completedAt = isoNow(this.clock)
      this.persist()
      this.audit({
        type: request.kind === 'case-follow-up' ? 'followup_completed' : 'agent_request_completed',
        actor: request.reviewer,
        requestId: request.id,
        requestKind: request.kind,
        model: this.model,
        caseId: request.caseId,
        viewId: request.viewId,
        recordId: request.recordId,
        prompt: request.prompt,
        proposalId: result?.draft?.id ?? null,
        changeCount: countChanges(result?.draft),
      })
      this.publishRequest(request, 'complete', { result: clone(result) })
    } catch (error) {
      if (error?.name === 'AbortError' && this.shuttingDown) {
        request.status = 'queued'
        request.startedAt = null
        request.completedAt = null
        request.error = null
      } else {
        request.status = 'failed'
        request.completedAt = isoNow(this.clock)
        request.error = error?.message || 'The shared agent request could not complete.'
        if (request.kind === 'case-follow-up') {
          this.releaseCaseFollowUpReservation(request.caseId, request.reviewer)
        }
        this.persist()
        this.audit({
          type: request.kind === 'case-follow-up' ? 'followup_failed' : 'agent_request_failed',
          actor: request.reviewer,
          requestId: request.id,
          requestKind: request.kind,
          model: this.model,
          caseId: request.caseId,
          viewId: request.viewId,
          recordId: request.recordId,
          prompt: request.prompt,
          error: request.error,
        })
        this.publishRequest(request, 'failed')
      }
    } finally {
      this.active = null
      this.persist()
      this.publishQueuePositions()
      this.schedulePump()
    }
  }

  dispose() {
    if (this.disposed) return
    this.shuttingDown = true
    this.disposed = true
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
      this.persist()
    }
    this.listeners.clear()
    this.requestListeners.clear()
    if (!this.active) return
    if (this.active.requestId) {
      const request = this.state.requests.find((candidate) => candidate.id === this.active.requestId)
      if (request?.status === 'running') {
        request.status = 'queued'
        request.startedAt = null
        request.completedAt = null
        request.error = null
        this.persist()
      }
      this.active.controller.abort()
      return
    }
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
