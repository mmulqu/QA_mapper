import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QaBatchQueueWorkspace } from './QaBatchOperations'

describe('shared QA operations workspace', () => {
  it('shows global follow-up position and initials-attributed recovery totals', () => {
    render(
      <QaBatchQueueWorkspace
        dashboard={{
          worker: { active: true, concurrency: 1 },
          jobs: [],
          inbox: { counts: { ready: 0 }, items: [] },
          agentQueue: {
            entries: [{
              id: 'AGENT-1',
              kind: 'case-follow-up',
              status: 'queued',
              position: 2,
              ahead: 1,
              owner: { id: 'bb-session', name: 'BB' },
              label: 'Follow-up for 10 Railroad Avenue',
              detail: 'Compare the relationship evidence.',
            }],
          },
          reviewerActivity: {
            relativePath: '.runtime\\reviewer-agent-activity.jsonl',
            reviewers: [{
              initials: 'BB',
              followUps: 7,
              revisionsStaged: 4,
              recoveredProposals: 2,
            }],
          },
        }}
        status="ready"
        error=""
        onRefresh={vi.fn()}
        onControl={vi.fn()}
        onShowInbox={vi.fn()}
        onOpenTranscript={vi.fn()}
        reviewer={{ id: 'aa-session', name: 'AA' }}
      />,
    )

    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByText('1 ahead')).toBeInTheDocument()
    expect(screen.getAllByText('BB')).toHaveLength(2)
    expect(screen.getByText('Recovery leader')).toBeInTheDocument()
    expect(screen.getByText('.runtime\\reviewer-agent-activity.jsonl')).toBeInTheDocument()
  })
})
