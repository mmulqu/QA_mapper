import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { QaBatchQueue, writeQueueStateFile } from './qa-batch-queue.mjs'

function record(id, address) {
  return {
    id,
    address,
    municipality: 'Rockport',
    affectedRecordId: `AP-${id}`,
    sourceLabel: 'Controlled test',
  }
}

async function waitFor(check, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = check()
    if (value) return value
    await new Promise((resolveWait) => setTimeout(resolveWait, 10))
  }
  throw new Error('Timed out waiting for the QA batch worker.')
}

test('persists a background batch and processes records sequentially into the review inbox', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mad-qa-batch-'))
  const storagePath = resolve(directory, 'qa-batch-jobs.json')
  let active = 0
  let maximumActive = 0
  const receivedContexts = []
  const queue = new QaBatchQueue({
    storagePath,
    model: 'test-qwen',
    investigate: async ({ recordId, reviewerContext, onEvent }) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      receivedContexts.push({ recordId, reviewerContext })
      onEvent({ type: 'tool', phase: 'completed', title: 'Read QA evidence', detail: recordId })
      await new Promise((resolveWait) => setTimeout(resolveWait, 15))
      active -= 1
      return {
        caseItem: {
          id: `CASE-${recordId}`,
          recommendation: `Correct ${recordId}`,
        },
        draft: recordId === 'ROW-1'
          ? { id: 'PROPOSAL-1', changes: [{ fields: [{ field: 'POINT_TYPE' }] }] }
          : null,
        reply: 'Investigation complete.',
      }
    },
  })

  try {
    const job = queue.create({
      viewId: 'MADV_QA_AP_DOM_PTTYPE',
      issue: { id: 'MADV_QA_AP_DOM_PTTYPE', description: 'Invalid point type' },
      records: [record('ROW-1', '10 Railroad Avenue'), record('ROW-2', '12 Railroad Avenue')],
      recordPrompts: { 'ROW-1': 'Check the municipal source note before staging.' },
    })
    await waitFor(() => queue.dashboard().jobs[0]?.status === 'completed')

    const dashboard = queue.dashboard()
    assert.equal(maximumActive, 1)
    assert.equal(dashboard.worker.concurrency, 1)
    assert.equal(dashboard.jobs[0].counts.ready, 1)
    assert.equal(dashboard.jobs[0].counts.withheld, 1)
    assert.equal(dashboard.inbox.counts.ready, 1)
    assert.equal(dashboard.inbox.counts.withheld, 1)
    assert.equal(queue.getItem(`${job.id}-001`).result.draft.id, 'PROPOSAL-1')
    assert.equal(queue.getItem(`${job.id}-001`).reviewerContext, 'Check the municipal source note before staging.')
    assert.deepEqual(receivedContexts, [
      { recordId: 'ROW-1', reviewerContext: 'Check the municipal source note before staging.' },
      { recordId: 'ROW-2', reviewerContext: '' },
    ])
    assert.equal(JSON.parse(readFileSync(storagePath, 'utf8')).jobs[0].status, 'completed')
  } finally {
    queue.dispose()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('reloads interrupted work as queued and preserves completed results', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mad-qa-batch-reload-'))
  const storagePath = resolve(directory, 'qa-batch-jobs.json')
  const timestamp = '2026-07-25T16:00:00.000Z'
  const persisted = {
    version: 1,
    jobs: [{
      id: 'BATCH-RELOAD',
      viewId: 'MADV_QA_AV_APID_MISMATCH',
      issue: { id: 'MADV_QA_AV_APID_MISMATCH', description: 'Point mismatch' },
      model: 'test-qwen',
      status: 'running',
      pauseRequested: false,
      cancelRequested: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      completedAt: null,
      items: [
        {
          id: 'BATCH-RELOAD-001',
          recordId: 'ROW-1',
          record: record('ROW-1', '1 Ridgewood Road'),
          status: 'running',
          attempts: 1,
          result: null,
        },
        {
          id: 'BATCH-RELOAD-002',
          recordId: 'ROW-2',
          record: record('ROW-2', '2 Ridgewood Road'),
          status: 'ready',
          caseId: 'CASE-2',
          result: { draft: { id: 'PROPOSAL-2', changes: [] } },
        },
      ],
    }],
  }
  const queueDirectory = resolve(storagePath, '..')
  try {
    mkdirSync(queueDirectory, { recursive: true })
    writeFileSync(storagePath, JSON.stringify(persisted), 'utf8')
    const queue = new QaBatchQueue({
      storagePath,
      model: 'test-qwen',
      autoStart: false,
      investigate: async () => ({}),
    })
    try {
      const job = queue.getJob('BATCH-RELOAD')
      assert.equal(job.status, 'queued')
      assert.equal(job.items[0].status, 'queued')
      assert.equal(job.items[1].status, 'ready')
      assert.equal(queue.dashboard().inbox.counts.ready, 1)
    } finally {
      queue.dispose()
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('keeps a bounded live transcript and notifies a batch stream subscriber', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mad-qa-batch-stream-'))
  const storagePath = resolve(directory, 'qa-batch-jobs.json')
  let releaseInvestigation
  const queue = new QaBatchQueue({
    storagePath,
    model: 'test-qwen',
    investigate: ({ onEvent }) => new Promise((resolveInvestigation) => {
      releaseInvestigation = () => {
        onEvent({ id: 'reasoning-1', type: 'reasoning_delta', turn: 1, text: 'Checked ' })
        onEvent({ id: 'reasoning-1', type: 'reasoning_delta', turn: 1, text: 'the relationship.' })
        onEvent({ id: 'skill-1', type: 'skill', phase: 'completed', name: 'load_skill', title: 'Skill loaded on demand' })
        resolveInvestigation({ caseItem: { id: 'CASE-1', recommendation: 'Reviewed.' }, draft: null })
      }
    }),
  })

  try {
    const job = queue.create({
      viewId: 'MADV_QA_AP_NO_STRUCT_LUT',
      issue: { id: 'MADV_QA_AP_NO_STRUCT_LUT', description: 'Missing structure lookup' },
      records: [record('ROW-1', '10 Railroad Avenue')],
    })
    const events = []
    const unsubscribe = queue.subscribe(job.id, (event) => events.push(event))
    await waitFor(() => queue.dashboard().jobs[0]?.status === 'running')
    releaseInvestigation()
    await waitFor(() => queue.dashboard().jobs[0]?.status === 'completed')
    unsubscribe()

    const savedItem = queue.getJob(job.id).items[0]
    assert.equal(savedItem.transcript.find((event) => event.id === 'reasoning-1')?.text, 'Checked the relationship.')
    assert.ok(events.some((event) => event.type === 'activity' && event.event.type === 'reasoning_delta'))
    assert.ok(events.some((event) => event.type === 'complete'))
  } finally {
    queue.dispose()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('returns active work to the queue before a server shutdown', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mad-qa-batch-shutdown-'))
  const storagePath = resolve(directory, 'qa-batch-jobs.json')
  const queue = new QaBatchQueue({
    storagePath,
    model: 'test-qwen',
    investigate: ({ signal }) => new Promise((resolveInvestigation, rejectInvestigation) => {
      signal.addEventListener('abort', () => {
        const error = new Error('Server stopping')
        error.name = 'AbortError'
        rejectInvestigation(error)
      }, { once: true })
    }),
  })

  try {
    queue.create({
      viewId: 'MADV_QA_AP_NO_STRUCT_LUT',
      issue: { id: 'MADV_QA_AP_NO_STRUCT_LUT', description: 'Missing structure lookup' },
      records: [record('ROW-1', '10 Railroad Avenue')],
    })
    await waitFor(() => queue.dashboard().jobs[0]?.status === 'running')
    queue.dispose()
    await waitFor(() => queue.active === null)

    const persisted = JSON.parse(readFileSync(storagePath, 'utf8'))
    assert.equal(persisted.jobs[0].status, 'queued')
    assert.equal(persisted.jobs[0].items[0].status, 'queued')
    assert.equal(persisted.jobs[0].items[0].completedAt, null)
  } finally {
    queue.dispose()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('does not overwrite an unreadable persistent queue', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mad-qa-batch-corrupt-'))
  const storagePath = resolve(directory, 'qa-batch-jobs.json')
  const corruptContents = '{not-valid-json'
  try {
    writeFileSync(storagePath, corruptContents, 'utf8')
    assert.throws(
      () => new QaBatchQueue({
        storagePath,
        model: 'test-qwen',
        autoStart: false,
        investigate: async () => ({}),
      }),
      /persistent QA batch store could not be read/,
    )
    assert.equal(readFileSync(storagePath, 'utf8'), corruptContents)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('preserves the last valid queue file when an atomic Windows rename is blocked', () => {
  const files = new Map()
  let temporaryPath = null
  const storagePath = resolve('C:\\workbench', '.runtime', 'qa-batch-jobs.json')
  files.set(storagePath, '{"version":1}\n')

  assert.throws(
    () => writeQueueStateFile(
      storagePath,
      { version: 2, jobs: [], requests: [], nextSequence: 1 },
      {
        fileOperations: {
          mkdirSync: () => {},
          writeFileSync: (path, contents) => {
            temporaryPath = path
            files.set(path, contents)
          },
          renameSync: () => {
            const error = new Error('operation not permitted')
            error.code = 'EPERM'
            throw error
          },
        },
      },
    ),
    /operation not permitted/,
  )

  assert.equal(JSON.parse(files.get(storagePath)).version, 1)
  assert.equal(JSON.parse(files.get(temporaryPath)).version, 2)
  assert.match(temporaryPath, /\.qa-batch-jobs\.json\.\d+\.tmp$/)
})

test('keeps the in-memory queue available and retries when persistence is temporarily blocked', async () => {
  const persistenceErrors = []
  let storageBlocked = true
  let writeAttempts = 0
  const queue = new QaBatchQueue({
    storagePath: resolve('C:\\workbench', '.runtime', 'qa-batch-jobs.json'),
    model: 'test-qwen',
    autoStart: false,
    investigate: async () => ({}),
    writeState: () => {
      writeAttempts += 1
      if (!storageBlocked) return
      const error = new Error('EPERM: operation not permitted')
      error.code = 'EPERM'
      throw error
    },
    persistenceRetryDelayMs: 10,
    onPersistenceError: (error) => persistenceErrors.push(error.message),
  })

  try {
    assert.equal(queue.dashboard().storage.healthy, false)
    assert.match(queue.dashboard().storage.error, /EPERM/)
    assert.deepEqual(persistenceErrors, ['EPERM: operation not permitted'])

    storageBlocked = false
    await waitFor(() => queue.dashboard().storage.healthy)
    assert.equal(writeAttempts, 2)
    assert.equal(queue.dashboard().storage.healthy, true)
    assert.equal(queue.dashboard().storage.error, null)
  } finally {
    queue.dispose()
  }
})

test('uses one FIFO sequence for batch issues and reviewer follow-up prompts', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mad-shared-agent-order-'))
  const storagePath = resolve(directory, 'qa-batch-jobs.json')
  const executionOrder = []
  const queue = new QaBatchQueue({
    storagePath,
    model: 'test-qwen',
    investigate: async ({ recordId }) => {
      executionOrder.push(`issue:${recordId}`)
      await new Promise((resolveWait) => setTimeout(resolveWait, 12))
      return {
        caseItem: { id: `CASE-${recordId}`, recommendation: 'Reviewed.' },
        draft: null,
        reply: 'Reviewed.',
      }
    },
    executeRequest: async ({ prompt }) => {
      executionOrder.push(`follow-up:${prompt}`)
      return { reply: 'Follow-up complete.' }
    },
  })

  try {
    queue.create({
      viewId: 'MADV_QA_AP_DOM_PTTYPE',
      issue: { id: 'MADV_QA_AP_DOM_PTTYPE', description: 'Invalid point type' },
      records: [record('ROW-1', '10 Railroad Avenue'), record('ROW-2', '12 Railroad Avenue')],
      reviewer: { id: 'alice', name: 'Alice' },
    })
    const followUp = queue.createRequest({
      kind: 'case-follow-up',
      reviewer: { id: 'bob', name: 'Bob' },
      caseId: 'CASE-ROW-1',
      prompt: 'Explain the evidence.',
      label: 'Follow-up for 10 Railroad Avenue',
    })

    assert.equal(queue.getRequest(followUp.id).queue.position, 3)
    assert.equal(queue.getRequest(followUp.id).queue.ahead, 2)
    await queue.waitForRequest(followUp.id)
    assert.deepEqual(executionOrder, [
      'issue:ROW-1',
      'issue:ROW-2',
      'follow-up:Explain the evidence.',
    ])
  } finally {
    queue.dispose()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('prevents duplicate issue work and enforces atomic review claims', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mad-shared-review-claim-'))
  const storagePath = resolve(directory, 'qa-batch-jobs.json')
  const queue = new QaBatchQueue({
    storagePath,
    model: 'test-qwen',
    investigate: async ({ recordId }) => ({
      caseItem: { id: `CASE-${recordId}`, recommendation: 'Correct the row.' },
      draft: { id: `PROPOSAL-${recordId}`, changes: [{ fields: [{ field: 'POINT_TYPE' }] }] },
      reply: 'Proposal ready.',
    }),
  })

  try {
    const job = queue.create({
      viewId: 'MADV_QA_AP_DOM_PTTYPE',
      issue: { id: 'MADV_QA_AP_DOM_PTTYPE', description: 'Invalid point type' },
      records: [record('ROW-1', '10 Railroad Avenue')],
      reviewer: { id: 'alice', name: 'Alice' },
    })
    assert.throws(() => queue.create({
      viewId: 'MADV_QA_AP_DOM_PTTYPE',
      issue: { id: 'MADV_QA_AP_DOM_PTTYPE', description: 'Invalid point type' },
      records: [record('ROW-1', '10 Railroad Avenue')],
      reviewer: { id: 'bob', name: 'Bob' },
    }), /already queued or waiting for review/)

    await waitFor(() => queue.dashboard().inbox.counts.ready === 1)
    const itemId = `${job.id}-001`
    const aliceClaim = queue.claimItem(itemId, { id: 'alice', name: 'Alice' })
    assert.equal(aliceClaim.claimedByMe, true)
    assert.throws(
      () => queue.claimItem(itemId, { id: 'bob', name: 'Bob' }),
      /Alice is already reviewing this issue/,
    )
    assert.throws(
      () => queue.recordCaseDecision(
        'CASE-ROW-1',
        'accepted',
        { id: 'alice', name: 'Alice' },
        { itemId, claimVersion: aliceClaim.claimVersion - 1 },
      ),
      /changed in another browser/,
    )
    queue.recordCaseDecision(
      'CASE-ROW-1',
      'accepted',
      { id: 'alice', name: 'Alice' },
      { itemId, claimVersion: aliceClaim.claimVersion },
    )
    const decided = queue.getItem(itemId)
    assert.equal(decided.status, 'accepted')
    assert.equal(decided.reviewedBy.name, 'Alice')
  } finally {
    queue.dispose()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('attributes a rejected proposal recovery to the follow-up author', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'mad-proposal-recovery-'))
  const storagePath = resolve(directory, 'qa-batch-jobs.json')
  const auditEvents = []
  let queue
  queue = new QaBatchQueue({
    storagePath,
    model: 'test-qwen',
    onAudit: (event) => auditEvents.push(event),
    investigate: async ({ recordId }) => ({
      caseItem: { id: `CASE-${recordId}`, recommendation: 'Correct the row.' },
      draft: {
        id: `PROPOSAL-${recordId}-1`,
        validation: { passed: true },
        changes: [{ fields: [{ field: 'POINT_TYPE' }] }],
      },
      reply: 'First proposal.',
    }),
    executeRequest: async (request) => {
      const result = {
        caseId: request.caseId,
        draft: {
          id: 'PROPOSAL-ROW-1-2',
          validation: { passed: true },
          changes: [{ fields: [{ field: 'POINT_TYPE' }, { field: 'STRUCTURE_' }] }],
        },
        reply: 'Revised proposal.',
      }
      const reviewClaim = queue.recordCaseFollowUpResult(
        request.caseId,
        result,
        request.reviewer,
        { requestId: request.id, prompt: request.prompt },
      )
      return { ...result, reviewClaim }
    },
  })

  try {
    const job = queue.create({
      viewId: 'MADV_QA_AP_DOM_PTTYPE',
      issue: { id: 'MADV_QA_AP_DOM_PTTYPE', description: 'Invalid point type' },
      records: [record('ROW-1', '10 Railroad Avenue')],
      reviewer: { id: 'aa-session', name: 'AA' },
    })
    await waitFor(() => queue.dashboard().inbox.counts.ready === 1)
    const itemId = `${job.id}-001`
    const firstClaim = queue.claimItem(itemId, { id: 'aa-session', name: 'AA' })
    queue.recordCaseDecision(
      'CASE-ROW-1',
      'rejected',
      { id: 'aa-session', name: 'AA' },
      { itemId, claimVersion: firstClaim.claimVersion },
    )

    queue.reserveCaseFollowUp('CASE-ROW-1', { id: 'bb-session', name: 'BB' })
    const followUp = queue.createRequest({
      kind: 'case-follow-up',
      reviewer: { id: 'bb-session', name: 'BB' },
      caseId: 'CASE-ROW-1',
      prompt: 'Use the relationship evidence and repair both fields.',
    })
    const result = await queue.waitForRequest(followUp.id)
    assert.equal(result.reviewClaim.id, itemId)
    assert.equal(result.reviewClaim.claimedBy.name, 'BB')

    queue.releaseItem(itemId, { id: 'bb-session', name: 'BB' }, result.reviewClaim.claimVersion)
    const finalClaim = queue.claimItem(itemId, { id: 'cc-session', name: 'CC' })
    queue.recordCaseDecision(
      'CASE-ROW-1',
      'accepted',
      { id: 'cc-session', name: 'CC' },
      { itemId, claimVersion: finalClaim.claimVersion },
    )

    const promptEvent = auditEvents.find((event) => event.type === 'followup_prompt_queued')
    assert.equal(promptEvent.actor.name, 'BB')
    assert.equal(promptEvent.prompt, 'Use the relationship evidence and repair both fields.')
    const recoveryEvent = auditEvents.find((event) => event.type === 'proposal_recovered')
    assert.equal(recoveryEvent.actor.name, 'BB')
    assert.equal(recoveryEvent.acceptedBy.name, 'CC')
    assert.equal(recoveryEvent.priorRejections, 1)
  } finally {
    queue.dispose()
    rmSync(directory, { recursive: true, force: true })
  }
})
