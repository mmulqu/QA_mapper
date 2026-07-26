import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import AgentActivityStream from './AgentActivityStream'

const issue = {
  id: 'MADV_QA_AP_DOM_PTTYPE',
  description: 'Address-point domain check',
}

const firstEvent = {
  id: 'model-1',
  type: 'model',
  phase: 'started',
  title: 'Model turn 1',
  detail: 'Reading the case.',
}

const nextEvent = {
  id: 'tool-1',
  type: 'tool',
  phase: 'completed',
  title: 'get_qa_investigation_packet',
  detail: 'Read case evidence.',
}

function streamProps(events) {
  return {
    issue,
    status: 'working',
    events,
    model: 'local-test-model',
    currentRecord: { address: '5 Doyles Cove Road', municipality: 'Rockport' },
    onStop: () => {},
  }
}

afterEach(cleanup)

describe('AgentActivityStream', () => {
  it('continues to follow new events while the reviewer remains at the latest activity', () => {
    const { rerender } = render(<AgentActivityStream {...streamProps([firstEvent])} />)
    const stream = screen.getByLabelText('Live agent activity')

    Object.defineProperties(stream, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1_000 },
    })
    Object.defineProperty(stream, 'scrollTop', { configurable: true, writable: true, value: 700 })
    fireEvent.scroll(stream)

    rerender(<AgentActivityStream {...streamProps([firstEvent, nextEvent])} />)

    expect(stream.scrollTop).toBe(1_000)
    expect(screen.queryByRole('button', { name: 'Jump to latest agent activity' })).not.toBeInTheDocument()
  })

  it('keeps the reviewer’s scroll position when new events arrive above the latest activity', () => {
    const { rerender } = render(<AgentActivityStream {...streamProps([firstEvent])} />)
    const stream = screen.getByLabelText('Live agent activity')

    Object.defineProperties(stream, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1_000 },
    })
    Object.defineProperty(stream, 'scrollTop', { configurable: true, writable: true, value: 120 })
    fireEvent.scroll(stream)

    rerender(<AgentActivityStream {...streamProps([firstEvent, nextEvent])} />)

    expect(stream.scrollTop).toBe(120)
    expect(screen.getByRole('button', { name: 'Jump to latest agent activity' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest agent activity' }))

    expect(stream.scrollTop).toBe(1_000)
    expect(screen.queryByRole('button', { name: 'Jump to latest agent activity' })).not.toBeInTheDocument()
  })
})
