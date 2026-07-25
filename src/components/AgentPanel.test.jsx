import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentPanel from './AgentPanel'

const caseItem = {
  id: 'MADV_QA_AV_APID_MISMATCH-FAULT-ROCKPORT-AV-POINT-LINK-MISMATCH',
}

const runActivity = [
  {
    id: 'model-1',
    type: 'reasoning',
    phase: 'completed',
    title: 'Model reasoning',
    text: 'Checking the point relationship before making a recommendation.',
  },
  {
    id: 'skill-1',
    type: 'skill',
    phase: 'completed',
    name: 'load_skill',
    title: 'Skill loaded on demand',
    detail: 'Loaded skill: MAD QA AV',
  },
  {
    id: 'tool-1',
    type: 'tool',
    phase: 'completed',
    name: 'get_qa_investigation_packet',
    title: 'get_qa_investigation_packet',
    detail: 'Read combined QA evidence and Rockport town context',
  },
]

afterEach(cleanup)

describe('AgentPanel', () => {
  it('lets reviewers open the complete captured run and return to the conversation', async () => {
    const user = userEvent.setup()
    render(
      <AgentPanel
        caseItem={caseItem}
        onClose={vi.fn()}
        onDraftStaged={vi.fn()}
        onReviewDraft={vi.fn()}
        initialResult={{ reply: 'I inspected the case but did not return a narrative response.', toolEvents: [] }}
        runActivity={runActivity}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'View full LLM run transcript' }))

    expect(screen.getByRole('heading', { name: 'Full LLM run transcript' })).toBeInTheDocument()
    expect(screen.getByText('Checking the point relationship before making a recommendation.')).toBeInTheDocument()
    expect(screen.getByText('Loaded skill: MAD QA AV')).toBeInTheDocument()
    expect(screen.getByText('Read combined QA evidence and Rockport town context')).toBeInTheDocument()
    expect(screen.getByText('I inspected the case but did not return a narrative response.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to agent conversation' }))

    expect(screen.getByText('I inspected the case but did not return a narrative response.')).toBeInTheDocument()
  })
})
