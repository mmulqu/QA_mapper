import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'
import { REVIEWER_SESSION_STORAGE_KEY } from '../lib/reviewerSession'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = ResizeObserverMock
window.HTMLElement.prototype.scrollIntoView = () => {}

beforeEach(() => {
  window.localStorage.setItem(REVIEWER_SESSION_STORAGE_KEY, JSON.stringify({
    id: 'reviewer-test',
    name: 'TR',
  }))
})
