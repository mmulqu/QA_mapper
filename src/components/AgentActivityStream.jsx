import {
  ArrowLeft,
  Bot,
  BrainCircuit,
  Check,
  CircleAlert,
  Database,
  Sparkles,
  Square,
  Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const eventMeta = {
  status: { label: 'System', icon: Database },
  model: { label: 'Model', icon: Bot },
  reasoning: { label: 'Thinking', icon: BrainCircuit },
  output: { label: 'Output', icon: Sparkles },
  skill: { label: 'Skill', icon: Sparkles },
  tool: { label: 'Tool', icon: Wrench },
}

function StreamEvent({ event }) {
  const meta = eventMeta[event.type] || eventMeta.status
  const Icon = event.phase === 'error' ? CircleAlert : meta.icon
  const complete = event.phase === 'completed'

  return (
    <article className={`activity-event is-${event.type} is-${event.phase || 'running'}`}>
      <span className="activity-event-tag">
        <Icon size={14} aria-hidden="true" />
        {meta.label}
      </span>
      <div className="activity-event-body">
        <header>
          <strong>{event.title || (event.type === 'reasoning' ? 'Model reasoning' : 'Model response')}</strong>
          {complete ? <span><Check size={13} aria-hidden="true" /> Complete</span> : null}
          {event.phase === 'started' ? <span className="is-live">Live</span> : null}
        </header>
        {event.name ? <code>{event.name}</code> : null}
        {event.text ? (
          event.type === 'output' ? (
            <div className="activity-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                {event.text}
              </ReactMarkdown>
            </div>
          ) : <p className="activity-stream-text">{event.text}</p>
        ) : event.detail ? <p>{event.detail}</p> : null}
      </div>
    </article>
  )
}

export default function AgentActivityStream({
  issue,
  status,
  events,
  model,
  error,
  currentRecord,
  batchPosition,
  onStop,
  onBack,
}) {
  const scrollRegionRef = useRef(null)
  const latestEvent = events[events.length - 1]
  const statusText = useMemo(() => {
    if (error) return 'Investigation stopped'
    if (status === 'stopped') return 'Stopped by reviewer'
    if (status === 'loading-town') return 'Loading the selected town extract'
    return latestEvent?.title || 'Connecting to the local agent'
  }, [error, latestEvent?.title, status])

  useEffect(() => {
    const region = scrollRegionRef.current
    if (region) region.scrollTop = region.scrollHeight
  }, [events])

  return (
    <section className="map-workspace qa-queue-workspace" aria-label="QA investigation workspace">
      <div className="qa-activity-sheet" aria-busy={['working', 'loading-town'].includes(status)}>
        <header className="qa-activity-header">
          <div>
            <span>Local agent investigation</span>
            <h2>{issue?.description || 'Preparing QA investigation'}</h2>
            {currentRecord ? (
              <p>
                {batchPosition ? `${batchPosition.current} of ${batchPosition.total} · ` : ''}
                {currentRecord.address} · {currentRecord.municipality}
              </p>
            ) : null}
          </div>
          <div className="qa-activity-session">
            <span className={error || status === 'stopped' ? 'activity-live-mark is-error' : 'activity-live-mark'} aria-hidden="true" />
            <span>
              <strong>{error || status === 'stopped' ? 'Stopped' : 'Live'}</strong>
              <small>{model || 'LM Studio model'}</small>
            </span>
          </div>
        </header>

        <div className="activity-sr-status" role="status" aria-live="polite">{statusText}</div>

        <div className="qa-activity-stream" ref={scrollRegionRef} aria-label="Live agent activity">
          {events.length ? events.map((event) => <StreamEvent key={event.id} event={event} />) : (
            <div className="activity-empty">
              <span className="activity-live-mark" aria-hidden="true" />
              <strong>Opening the investigation stream</strong>
              <p>The model’s output, on-demand skills, and controlled tool calls will appear here.</p>
            </div>
          )}
          {error ? (
            <article className="activity-event is-status is-error">
              <span className="activity-event-tag"><CircleAlert size={14} /> Error</span>
              <div className="activity-event-body">
                <header><strong>Investigation could not complete</strong></header>
                <p>{error}</p>
              </div>
            </article>
          ) : null}
        </div>

        <footer className="qa-activity-footer">
          <div>
            <span>{statusText}</span>
            <small>Thinking appears only when the active model exposes it.</small>
          </div>
          {onStop ? (
            <button type="button" className="agent-stop-button" onClick={onStop}>
              <Square size={15} fill="currentColor" aria-hidden="true" />
              Stop agent
            </button>
          ) : onBack ? (
            <button type="button" onClick={onBack}>
              <ArrowLeft size={16} aria-hidden="true" />
              Back to issues
            </button>
          ) : null}
        </footer>
      </div>
    </section>
  )
}
