import { describe, expect, it } from 'vitest'
import {
  clearReviewerSession,
  createReviewerSession,
  getReviewerSession,
  reviewerHeaders,
} from './reviewerSession'

describe('shared reviewer session', () => {
  it('persists a reviewer identity and adds it to coordinated requests', () => {
    clearReviewerSession()
    const session = createReviewerSession('ar')

    expect(getReviewerSession()).toEqual(session)
    expect(reviewerHeaders({ accept: 'text/event-stream' })).toEqual({
      accept: 'text/event-stream',
      'x-mad-reviewer-id': session.id,
      'x-mad-reviewer-name': 'AR',
    })
  })

  it('requires 2–6 letter initials', () => {
    clearReviewerSession()
    expect(() => createReviewerSession(' ')).toThrow(/2–6 letters/)
  })
})
