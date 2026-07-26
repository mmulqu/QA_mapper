async function postCaseAction(caseId, action, body) {
  const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const responsePayload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(responsePayload.error || 'The local service could not complete this request.')
  return responsePayload
}

export function askLocalAgent(caseId, message) {
  return postCaseAction(caseId, 'agent', { message })
}

export function acceptCaseDraft(caseId, reviewerNote = '') {
  return postCaseAction(caseId, 'accept', { reviewerNote })
}

export function rejectCaseDraft(caseId, comment) {
  return postCaseAction(caseId, 'reject', { comment })
}

export async function getProposalLineage(caseId) {
  const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/proposals`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The proposal history could not be loaded.')
  return payload.proposals ?? []
}

export async function getProposalAuditInfo() {
  const response = await fetch('/api/audit/proposal-history')
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The proposal audit location could not be loaded.')
  return payload
}

export async function openProposalAuditInFileExplorer() {
  const response = await fetch('/api/audit/proposal-history/open', {
    method: 'POST',
    headers: { 'x-mad-local-action': 'open-proposal-audit' },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Windows File Explorer could not open the proposal audit.')
  return payload
}

export async function getQaIssueCatalog() {
  const response = await fetch('/api/qa/issues')
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The QA issue report could not be loaded.')
  return payload
}

export async function getQaIssueAtlas({ signal } = {}) {
  const response = await fetch('/api/qa/atlas', { signal })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The QA issue map could not be loaded.')
  return payload
}

export async function refreshQaIssueAtlas({ signal } = {}) {
  const response = await fetch('/api/qa/atlas/refresh', {
    method: 'POST',
    headers: { 'x-mad-local-action': 'refresh-qa-atlas' },
    signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The QA issue map could not be refreshed.')
  return payload
}

export async function getQaIssueRecords(viewId, { signal } = {}) {
  const response = await fetch(`/api/qa/issues/${encodeURIComponent(viewId)}/records`, { signal })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The selected QA view rows could not be loaded.')
  return payload
}

export async function getQaBatchDashboard({ signal } = {}) {
  const response = await fetch('/api/qa/batches', { signal })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The persistent QA batch queue could not be loaded.')
  return payload
}

export async function createQaBatch(viewId, recordIds, recordPrompts = {}) {
  const response = await fetch('/api/qa/batches', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ viewId, recordIds, recordPrompts }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The selected QA rows could not be queued.')
  return payload
}

export async function controlQaBatch(jobId, action) {
  const response = await fetch(
    `/api/qa/batches/${encodeURIComponent(jobId)}/${encodeURIComponent(action)}`,
    { method: 'POST' },
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The QA batch action could not be completed.')
  return payload
}

export async function getQaBatchJob(jobId, { signal } = {}) {
  const response = await fetch(`/api/qa/batches/${encodeURIComponent(jobId)}`, { signal })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The queued QA batch could not be opened.')
  return payload.job
}

export function streamQaBatchJob(jobId, { onSnapshot, onActivity, onState, onComplete, onError } = {}) {
  if (typeof EventSource !== 'function') return () => {}
  const stream = new EventSource(`/api/qa/batches/${encodeURIComponent(jobId)}/stream`)
  const read = (handler) => (event) => {
    try {
      handler?.(JSON.parse(event.data))
    } catch {
      // Ignore malformed stream events; the persistent queue remains the source of truth.
    }
  }
  stream.addEventListener('snapshot', read(onSnapshot))
  stream.addEventListener('activity', read(onActivity))
  stream.addEventListener('state', read(onState))
  stream.addEventListener('complete', read(onComplete))
  stream.onerror = () => onError?.('The live batch stream disconnected. The queue will continue in the background.')
  return () => stream.close()
}

export async function getQaBatchItem(itemId, { signal } = {}) {
  const response = await fetch(`/api/qa/review-inbox/${encodeURIComponent(itemId)}`, { signal })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The queued QA result could not be opened.')
  return payload.item
}

export async function getQaRecordMapPreview(viewId, recordId, { signal } = {}) {
  const response = await fetch(
    `/api/qa/issues/${encodeURIComponent(viewId)}/records/${encodeURIComponent(recordId)}/map-preview`,
    { signal },
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The QA row map preview could not be loaded.')
  return payload
}

function parseEventBlock(block) {
  let event = 'message'
  const data = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (!data.length) return null
  return { event, payload: JSON.parse(data.join('\n')) }
}

export async function readAgentEventStream(response, onActivity) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    return response.json()
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = null

  const processBlock = (block) => {
    const message = parseEventBlock(block)
    if (!message) return
    if (message.event === 'activity') onActivity?.(message.payload)
    if (message.event === 'complete') result = message.payload
    if (message.event === 'error') {
      throw new Error(message.payload?.message || 'The local agent stream stopped unexpectedly.')
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    blocks.forEach(processBlock)
    if (done) break
  }
  if (buffer.trim()) processBlock(buffer)
  if (!result) throw new Error('The local agent stream ended before returning a result.')
  return result
}

export async function investigateQaIssue(viewId, { recordId, reviewerContext = '', onActivity, signal } = {}) {
  const response = await fetch(`/api/qa/issues/${encodeURIComponent(viewId)}/investigate-stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ recordId, reviewerContext }),
    signal,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'The local agent could not investigate this QA category.')
  }
  return readAgentEventStream(response, onActivity)
}

export async function getTownExtract(url, { signal } = {}) {
  const response = await fetch(url, { signal })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The town extract could not be loaded.')
  return payload
}

export async function getTownRecordBundle(townId, recordKey) {
  const query = new URLSearchParams({ key: recordKey })
  const response = await fetch(`/api/towns/${encodeURIComponent(townId)}/records?${query}`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The town record could not be loaded.')
  return payload
}
