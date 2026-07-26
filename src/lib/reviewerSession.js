const STORAGE_KEY = 'mad-qa-reviewer-session'
const MAX_REVIEWER_INITIALS = 6
const INITIALS_PATTERN = /^[A-Z]{2,6}$/

function storage() {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

function validSession(value) {
  return value
    && typeof value.id === 'string'
    && value.id.trim()
    && typeof value.name === 'string'
    && INITIALS_PATTERN.test(value.name.trim().toUpperCase())
}

export function getReviewerSession() {
  const sessionStorage = storage()
  if (!sessionStorage) return null
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY))
    if (!validSession(value)) return null
    return {
      id: value.id.trim().slice(0, 120),
      name: value.name.trim().toUpperCase().slice(0, MAX_REVIEWER_INITIALS),
    }
  } catch {
    return null
  }
}

export function createReviewerSession(initials) {
  const normalizedName = String(initials || '')
    .trim()
    .toUpperCase()
    .slice(0, MAX_REVIEWER_INITIALS)
  if (!INITIALS_PATTERN.test(normalizedName)) {
    throw new Error('Enter 2–6 letters for your initials.')
  }
  const id = globalThis.crypto?.randomUUID?.()
    || `reviewer-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const session = { id, name: normalizedName }
  storage()?.setItem(STORAGE_KEY, JSON.stringify(session))
  return session
}

export function clearReviewerSession() {
  storage()?.removeItem(STORAGE_KEY)
}

export function reviewerHeaders(headers = {}) {
  const reviewer = getReviewerSession()
  if (!reviewer) return headers
  return {
    ...headers,
    'x-mad-reviewer-id': reviewer.id,
    'x-mad-reviewer-name': encodeURIComponent(reviewer.name),
  }
}

export { STORAGE_KEY as REVIEWER_SESSION_STORAGE_KEY }
