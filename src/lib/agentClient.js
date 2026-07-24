export async function askLocalAgent(caseId, message) {
  const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'The local agent could not answer this request.')
  return payload
}
