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
  RefreshCw,
  Square,
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

function JobControls({ job, onControl }) {
  if (['completed', 'cancelled'].includes(job.status)) return null
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
}) {
  const jobs = dashboard?.jobs ?? []
  const queued = jobs.reduce((count, job) => count + job.counts.queued, 0)
  const running = jobs.reduce((count, job) => count + job.counts.running, 0)
  const reviewable = dashboard?.inbox?.counts?.ready ?? 0

  return (
    <section className="map-workspace qa-queue-workspace" aria-label="Persistent QA batch queue">
      <div className="qa-operations-sheet">
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
                      <span>{job.model} · {job.completed} of {job.total} finished</span>
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
                    <JobControls job={job} onControl={onControl} />
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
      <div className="qa-operations-sheet">
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
                  </div>
                  {item.canOpen ? (
                    <button type="button" onClick={() => onOpenReview(item)}>
                      {item.status === 'ready' ? 'Open review' : 'Inspect result'}
                      <ChevronRight size={16} />
                    </button>
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
