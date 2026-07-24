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
