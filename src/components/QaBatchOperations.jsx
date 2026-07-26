import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Eye,
  Inbox,
  ListTodo,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  Square,
  Trophy,
  UserRound,
  XCircle,
} from 'lucide-react'

const statusLabels = {
  queued: 'Queued',
  running: 'Running',
  paused: 'Paused',
  cancelling: 'Cancelling',
  cancelled: 'Cancelled',
  completed: 'Complete',
  ready: 'Ready for review',
  withheld: 'Needs evidence',
  failed: 'Failed',
  accepted: 'Accepted',
  rejected: 'Rejected',
}

function QueueState({ status, error, onRefresh }) {
  return (
    <div className={error ? 'qa-operations-state is-error' : 'qa-operations-state'} role={error ? 'alert' : 'status'}>
      {error ? <AlertTriangle size={23} /> : <LoaderCircle className="agent-spinner" size={23} />}
      <div>
        <strong>{error ? 'Queue could not be loaded' : 'Reading the persistent queue'}</strong>
        <span>{error || 'Checking work owned by the local agent bridge.'}</span>
      </div>
      {error ? <button type="button" onClick={onRefresh}>Try again</button> : null}
    </div>
  )
}

function JobControls({ job, onControl, reviewer }) {
  if (['completed', 'cancelled'].includes(job.status)) return null
  if (job.createdBy?.id && job.createdBy.id !== reviewer?.id) {
    return <small className="qa-job-owner-lock">Controlled by {job.createdBy.name}</small>
  }
  return (
    <div className="qa-job-controls">
      {job.status === 'paused' ? (
        <button type="button" onClick={() => onControl(job.id, 'resume')}>
          <CirclePlay size={15} /> Resume
        </button>
      ) : (
        <button type="button" onClick={() => onControl(job.id, 'pause')}>
          <CirclePause size={15} /> Pause after current
        </button>
      )}
      <button type="button" className="is-danger" onClick={() => onControl(job.id, 'cancel')}>
        <Square size={14} fill="currentColor" /> Cancel
      </button>
    </div>
  )
}

export function QaBatchQueueWorkspace({
  dashboard,
  status,
  error,
  onRefresh,
  onControl,
  onShowInbox,
  onOpenTranscript,
  reviewer,
}) {
  const jobs = dashboard?.jobs ?? []
  const sharedEntries = dashboard?.agentQueue?.entries ?? []
  const queued = sharedEntries.filter((entry) => entry.status === 'queued').length
  const running = sharedEntries.filter((entry) => entry.status === 'running').length
  const reviewable = dashboard?.inbox?.counts?.ready ?? 0
  const reviewerStats = dashboard?.reviewerActivity?.reviewers ?? []

  return (
    <section className="map-workspace qa-queue-workspace" aria-label="Persistent QA batch queue">
      <div className="qa-operations-sheet is-batch">
        <header className="qa-operations-header">
          <span className="qa-operations-icon"><ListTodo size={24} /></span>
          <div>
            <span>Bridge-owned work</span>
            <h2>Batch queue</h2>
            <p>Queued work continues while this browser is closed.</p>
          </div>
          <div className="qa-operations-header-actions">
            <button type="button" onClick={onRefresh} aria-label="Refresh batch queue">
              <RefreshCw size={16} /> Refresh
            </button>
            <button type="button" className="is-primary" onClick={onShowInbox}>
              <Inbox size={16} /> Review {reviewable || ''}
            </button>
          </div>
        </header>

        {status === 'loading' || error ? (
          <QueueState status={status} error={error} onRefresh={onRefresh} />
        ) : (
          <>
            <div className="qa-operations-summary" aria-label="Queue summary">
              <span><strong>{running}</strong> running</span>
              <span><strong>{queued}</strong> waiting</span>
              <span><strong>{reviewable}</strong> ready for review</span>
              <span className="qa-worker-note">
                {dashboard?.worker?.active ? <LoaderCircle className="agent-spinner" size={15} /> : <Check size={15} />}
                One local-model job at a time
              </span>
            </div>

            <section className="qa-agent-ledger" aria-labelledby="shared-agent-queue-heading">
              <header>
                <div>
                  <span>Global request order</span>
                  <h3 id="shared-agent-queue-heading">Shared agent queue</h3>
                </div>
                <small>Issue investigations and follow-up prompts use this same FIFO order.</small>
              </header>
              {!sharedEntries.length ? (
                <p className="qa-agent-ledger-empty">The shared model queue is clear.</p>
              ) : (
                <ol>
                  {sharedEntries.map((entry) => (
                    <li key={entry.id} className={entry.status === 'running' ? 'is-running' : undefined}>
                      <strong>#{entry.position}</strong>
                      <span className="qa-agent-kind">
                        {entry.kind === 'case-follow-up'
                          ? <MessageSquare size={15} aria-hidden="true" />
                          : <ListTodo size={15} aria-hidden="true" />}
                        {entry.kind === 'case-follow-up'
                          ? 'Follow-up'
                          : entry.kind === 'review-memory' ? 'Review note' : 'Issue'}
                      </span>
                      <span className="qa-agent-request-copy">
                        <b>{entry.label}</b>
                        <small>{entry.detail}</small>
                      </span>
                      <span className="qa-agent-owner">
                        <UserRound size={14} aria-hidden="true" />
                        {entry.owner?.id === reviewer?.id ? 'You' : entry.owner?.name || 'Reviewer'}
                      </span>
                      <span className="qa-agent-state">
                        {entry.status === 'running'
                          ? <LoaderCircle className="agent-spinner" size={14} aria-hidden="true" />
                          : null}
                        {entry.status === 'running' ? 'Running' : `${entry.ahead} ahead`}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="qa-recovery-ledger" aria-labelledby="agentic-recovery-heading">
                <header>
                  <div>
                    <Trophy size={16} aria-hidden="true" />
                    <strong id="agentic-recovery-heading">Agentic recovery ledger</strong>
                  </div>
                  <small>
                    A recovery credits the initials that staged the final revision after a rejection.
                  </small>
                </header>
                {!reviewerStats.length ? (
                  <p>No attributed follow-ups yet.</p>
                ) : (
                  <div className="qa-recovery-table" role="table" aria-label="Reviewer recovery statistics">
                    <span className="is-heading" role="columnheader">Initials</span>
                    <span className="is-heading" role="columnheader">Follow-ups</span>
                    <span className="is-heading" role="columnheader">Revisions</span>
                    <span className="is-heading" role="columnheader">Recovered</span>
                    {reviewerStats.map((stats, index) => (
                      <div className={index === 0 && stats.recoveredProposals ? 'is-leader' : undefined} role="row" key={stats.initials}>
                        <strong role="cell">{stats.initials}</strong>
                        <span role="cell">{stats.followUps}</span>
                        <span role="cell">{stats.revisionsStaged}</span>
                        <span role="cell">
                          {stats.recoveredProposals}
                          {index === 0 && stats.recoveredProposals
                            ? <small>Recovery leader</small>
                            : null}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <code>{dashboard?.reviewerActivity?.relativePath}</code>
              </div>
            </section>

            <div className="qa-job-list">
              {!jobs.length ? (
                <div className="qa-operations-empty">
                  <ListTodo size={30} />
                  <strong>No batches have been sent</strong>
                  <p>Select records from any non-zero QA check and choose <b>Queue selected</b>.</p>
                </div>
              ) : jobs.map((job) => {
                const progress = job.total ? Math.round((job.completed / job.total) * 100) : 0
                return (
                  <article className="qa-job-row" key={job.id}>
                    <span className={`qa-job-status is-${job.status}`}>
                      {job.status === 'running' ? <LoaderCircle className="agent-spinner" size={16} /> : <span />}
                      {statusLabels[job.status] || job.status}
                    </span>
                    <div className="qa-job-main">
                      <strong>{job.issue.description}</strong>
                      <code>{job.id}</code>
                      <span>
                        {job.model} · {job.completed} of {job.total} finished · queued by{' '}
                        {job.createdBy?.id === reviewer?.id ? 'you' : job.createdBy?.name || 'local reviewer'}
                      </span>
                      <div className="qa-job-progress" aria-label={`${progress}% complete`}>
                        <span style={{ transform: `scaleX(${progress / 100})` }} />
                      </div>
                      {job.current ? (
                        <p>
                          <b>{job.current.address}</b>
                          {' · '}
                          {job.current.activity?.title || 'Local agent is reading the case'}
                        </p>
                      ) : null}
                      {job.current ? (
                        <button
                          type="button"
                          className="qa-job-live-output"
                          onClick={() => onOpenTranscript(job)}
                          aria-label={`View live agent output for ${job.current.address || job.id}`}
                        >
                          <Eye size={15} /> View live output
                        </button>
                      ) : null}
                    </div>
                    <div className="qa-job-outcomes">
                      <span><b>{job.counts.ready}</b> review</span>
                      <span><b>{job.counts.withheld}</b> withheld</span>
                      <span><b>{job.counts.failed}</b> failed</span>
                    </div>
                    <JobControls job={job} onControl={onControl} reviewer={reviewer} />
                  </article>
                )
              })}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

const inboxFilters = [
  ['ready', 'Ready'],
  ['withheld', 'Withheld'],
  ['failed', 'Failed'],
  ['decided', 'Decided'],
]

function matchesFilter(item, filter) {
  if (filter === 'decided') return item.status === 'accepted' || item.status === 'rejected'
  return item.status === filter
}

function ResultMark({ status }) {
  if (status === 'failed') return <XCircle size={18} />
  if (status === 'withheld') return <AlertTriangle size={18} />
  return <Check size={18} />
}

export function QaReviewInboxWorkspace({
  dashboard,
  status,
  error,
  onRefresh,
  onShowQueue,
  onOpenReview,
  reviewer,
}) {
  const counts = dashboard?.inbox?.counts ?? {}
  const [filter, setFilter] = useState('ready')
  const items = useMemo(
    () => (dashboard?.inbox?.items ?? []).filter((item) => matchesFilter(item, filter)),
    [dashboard, filter],
  )
  const activeJobs = (dashboard?.jobs ?? []).filter((job) => ['queued', 'running', 'paused'].includes(job.status)).length

  return (
    <section className="map-workspace qa-queue-workspace" aria-label="QA review inbox">
      <div className="qa-operations-sheet is-inbox">
        <header className="qa-operations-header">
          <span className="qa-operations-icon"><Inbox size={24} /></span>
          <div>
            <span>Human decision queue</span>
            <h2>Review inbox</h2>
            <p>Completed investigations arrive here while remaining batches continue.</p>
          </div>
          <div className="qa-operations-header-actions">
            <button type="button" onClick={onRefresh} aria-label="Refresh review inbox">
              <RefreshCw size={16} /> Refresh
            </button>
            <button type="button" onClick={onShowQueue}>
              <ListTodo size={16} /> {activeJobs ? `${activeJobs} active` : 'Queue'}
            </button>
          </div>
        </header>

        {status === 'loading' || error ? (
          <QueueState status={status} error={error} onRefresh={onRefresh} />
        ) : (
          <>
            <nav className="qa-inbox-filters" aria-label="Review result filters">
              {inboxFilters.map(([id, label]) => {
                const count = id === 'decided'
                  ? (counts.accepted || 0) + (counts.rejected || 0)
                  : counts[id] || 0
                return (
                  <button
                    type="button"
                    className={filter === id ? 'active' : undefined}
                    key={id}
                    onClick={() => setFilter(id)}
                    aria-pressed={filter === id}
                  >
                    <strong>{count}</strong>
                    <span>{label}</span>
                  </button>
                )
              })}
            </nav>

            <div className="qa-inbox-list">
              {!items.length ? (
                <div className="qa-operations-empty">
                  <Inbox size={30} />
                  <strong>No {inboxFilters.find(([id]) => id === filter)?.[1].toLowerCase()} results</strong>
                  <p>{activeJobs ? 'The queue is still working. New results will appear automatically.' : 'Send a QA batch to begin filling the inbox.'}</p>
                </div>
              ) : items.map((item) => (
                <article className={`qa-inbox-row is-${item.status}`} key={item.id}>
                  <span className="qa-inbox-mark"><ResultMark status={item.status} /></span>
                  <div>
                    <span>{statusLabels[item.status] || item.status}</span>
                    <strong>{item.record.address}</strong>
                    <small>{item.record.municipality} · {item.viewId}</small>
                    <p>{item.summary}</p>
                    <code>{item.model} · {item.changeCount} changed fields</code>
                    {item.claimedBy ? (
                      <small className="qa-inbox-claim">
                        <UserRound size={13} aria-hidden="true" />
                        {item.claimedBy.id === reviewer?.id
                          ? 'Claimed by you'
                          : `In review by ${item.claimedBy.name}`}
                      </small>
                    ) : null}
                  </div>
                  {item.canOpen && (item.canClaim !== false || item.claimedByMe) ? (
                    <button type="button" onClick={() => onOpenReview(item)}>
                      {item.claimedByMe
                        ? 'Continue review'
                        : item.status === 'ready' ? 'Claim & review' : 'Claim & inspect'}
                      <ChevronRight size={16} />
                    </button>
                  ) : item.canOpen && item.claimedBy ? (
                    <strong className="qa-inbox-no-result">In review</strong>
                  ) : (
                    <strong className="qa-inbox-no-result">No review result</strong>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
