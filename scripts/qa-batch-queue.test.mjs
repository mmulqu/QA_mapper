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
import { QaBatchQueue } from './qa-batch-queue.mjs'

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
  const queue = new QaBatchQueue({
    storagePath,
    model: 'test-qwen',
    investigate: async ({ recordId, onEvent }) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
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
