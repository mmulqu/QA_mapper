import { ArrowLeft, Bot, BrainCircuit, Check, CheckCircle2, CircleAlert, Database, LoaderCircle, ScrollText, Send, Sparkles, Wrench, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { askLocalAgent } from '../lib/agentClient'

const starterPrompts = [
  'Why was this case flagged?',
  'Review the evidence and stage a draft if it is safe.',
]

const transcriptEventMeta = {
  status: { label: 'System', icon: Database },
  model: { label: 'Model', icon: Bot },
  reasoning: { label: 'Thinking', icon: BrainCircuit },
  output: { label: 'Output', icon: Sparkles },
  skill: { label: 'Skill', icon: Sparkles },
  tool: { label: 'Tool', icon: Wrench },
}

function TranscriptEvent({ event }) {
  const meta = transcriptEventMeta[event.type] || transcriptEventMeta.status
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

export default function AgentPanel({
  caseItem,
  onClose,
  onDraftStaged,
  onReviewDraft,
  reviewerFeedback,
  initialResult = null,
  runActivity = [],
  automaticStatus = 'idle',
}) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [hasDraft, setHasDraft] = useState(false)
  const [showRunTranscript, setShowRunTranscript] = useState(false)

  useEffect(() => {
    setMessages([])
    setInput('')
    setStatus('idle')
    setError('')
    setHasDraft(false)
    setShowRunTranscript(false)
  }, [caseItem.id])

  useEffect(() => {
    if (!initialResult?.reply) return
    setMessages([{
      role: 'agent',
      content: initialResult.reply,
      tools: initialResult.toolEvents ?? [],
    }])
    setHasDraft(Boolean(initialResult.draft?.changes?.length))
  }, [initialResult])

  const isWorking = status === 'working' || automaticStatus === 'working'
  const transcriptEvents = useMemo(() => {
    const reply = initialResult?.reply?.trim()
    const capturedOutput = runActivity
      .filter((event) => event.type === 'output' || event.type === 'output_delta')
      .map((event) => event.text || '')
      .join(' ')
      .replaceAll(/\s+/g, ' ')
      .trim()
    const normalizedReply = reply?.replaceAll(/\s+/g, ' ').trim()
    if (!reply || (normalizedReply && capturedOutput.includes(normalizedReply))) return runActivity
    return [...runActivity, {
      id: `${caseItem.id}:final-agent-response`,
      type: 'output',
      phase: 'completed',
      title: 'Final model response',
      text: reply,
    }]
  }, [caseItem.id, initialResult?.reply, runActivity])

  const submit = async (message) => {
    const prompt = message.trim()
    if (!prompt || isWorking) return

    setMessages((current) => [...current, { role: 'user', content: prompt }])
    setInput('')
    setError('')
    setStatus('working')

    try {
      const result = await askLocalAgent(caseItem.id, prompt)
      setMessages((current) => [...current, {
        role: 'agent',
        content: result.reply,
        tools: result.toolEvents ?? [],
      }])
      if (result.draft?.validation?.passed) {
        setHasDraft(true)
        onDraftStaged(result.draft, result.reviewerFeedback, result.proposals)
      }
      setStatus('idle')
    } catch (requestError) {
      setError(requestError.message)
      setStatus('idle')
    }
  }

  if (showRunTranscript) {
    return (
      <aside className="agent-panel is-transcript" aria-label="Full LLM run transcript">
        <header className="agent-header">
          <button
            type="button"
            className="agent-transcript-back"
            onClick={() => setShowRunTranscript(false)}
            aria-label="Back to agent conversation"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <span>Captured QA investigation</span>
            <h2>Full LLM run transcript</h2>
          </div>
          <button type="button" className="inspector-close" onClick={onClose} aria-label="Close local agent">
            <X size={20} />
          </button>
        </header>

        <div className="agent-scroll-region">
          <p className="agent-scope-note">
            <ScrollText size={16} />
            This is the captured investigation sequence. Thinking appears only when the model exposed it.
          </p>
          <div className="agent-run-transcript" aria-label="Captured LLM activity">
        {transcriptEvents.length ? transcriptEvents.map((event) => <TranscriptEvent key={event.id} event={event} />) : (
              <p className="agent-transcript-empty">No streamed LLM activity was captured for this run.</p>
            )}
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="agent-panel" aria-label="Local MAD agent" aria-busy={isWorking}>
      <header className="agent-header">
        <span className="agent-header-icon"><Bot size={21} /></span>
        <div>
          <span>Case-scoped assistant</span>
          <h2>Local MAD agent</h2>
        </div>
        <button type="button" className="inspector-close" onClick={onClose} aria-label="Close local agent">
          <X size={20} />
        </button>
      </header>

      <div className="agent-scroll-region">
        <p className="agent-scope-note"><Sparkles size={16} /> LM Studio reads this issue and its selected town extract. It can stage a review draft, never publish one.</p>

        {transcriptEvents.length ? (
          <button
            type="button"
            className="agent-transcript-trigger"
            onClick={() => setShowRunTranscript(true)}
            aria-label="View full LLM run transcript"
          >
            <ScrollText size={18} aria-hidden="true" />
            <span>
              <strong>View full LLM run transcript</strong>
              <small>{transcriptEvents.length} captured events: output, skills, tools, and model-visible thinking.</small>
            </span>
          </button>
        ) : null}

        {reviewerFeedback?.status === 'active' ? (
          <div className="agent-review-feedback">
            <strong>Reviewer feedback is in context</strong>
            <p>{reviewerFeedback.comment}</p>
            {reviewerFeedback.memoryUpdate ? (
              <div className={`agent-memory-confirmation ${reviewerFeedback.memoryUpdate.status === 'unmapped' ? 'is-warning' : ''}`}>
                <BrainCircuit size={16} aria-hidden="true" />
                <span>
                  <strong>
                    {reviewerFeedback.memoryUpdate.written
                      ? `${reviewerFeedback.memoryUpdate.categoryCode} lesson authored and written`
                      : reviewerFeedback.memoryUpdate.status === 'already-recorded'
                        ? 'Reviewer memory already recorded'
                        : 'Case feedback saved without category memory'}
                  </strong>
                  {reviewerFeedback.memoryUpdate.agentEntry ? (
                    <>
                      <span className="agent-memory-lesson-title">{reviewerFeedback.memoryUpdate.agentEntry.title}</span>
                      <span className="agent-memory-lesson">{reviewerFeedback.memoryUpdate.agentEntry.lesson}</span>
                    </>
                  ) : null}
                  {reviewerFeedback.memoryUpdate.memoryFile
                    ? <code>{reviewerFeedback.memoryUpdate.memoryFile}</code>
                    : <small>{reviewerFeedback.memoryUpdate.message}</small>}
                </span>
              </div>
            ) : (
              <small>The next request automatically includes this feedback so the agent can revise its draft.</small>
            )}
          </div>
        ) : null}

        {messages.length === 0 ? (
          <div className="agent-starters">
            <strong>Ask about this case</strong>
            {[...starterPrompts, ...(reviewerFeedback?.status === 'active' ? ['Review the reviewer feedback and propose a revised draft if the evidence supports one.'] : [])].map((prompt) => (
              <button type="button" key={prompt} onClick={() => submit(prompt)} disabled={isWorking}>
                {prompt}
              </button>
            ))}
          </div>
        ) : (
          <div className="agent-message-list" aria-live="polite">
            {messages.map((message, index) => (
              <article className={`agent-message ${message.role}`} key={`${message.role}-${index}`}>
                <span>{message.role === 'user' ? 'You' : 'Local agent'}</span>
                <div className="agent-markdown">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    skipHtml
                    components={{
                      a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
                {message.tools?.length ? (
                  <div className="agent-tool-list">
                    {message.tools.map((tool) => <small key={`${tool.name}-${tool.summary}`}><Wrench size={13} /> {tool.summary}</small>)}
                  </div>
                ) : null}
              </article>
            ))}
            {isWorking ? (
              <div className="agent-working" role="status" aria-live="polite">
                <LoaderCircle className="agent-spinner" size={20} aria-hidden="true" />
                <span>
                  <strong>Agent is working</strong>
                  <small>{automaticStatus === 'working' ? 'Narrowing QA rows and selecting a town extract…' : 'Reviewing case evidence…'}</small>
                </span>
              </div>
            ) : null}
          </div>
        )}

        {messages.length === 0 && isWorking ? (
          <div className="agent-working is-primary" role="status" aria-live="polite">
            <LoaderCircle className="agent-spinner" size={20} aria-hidden="true" />
            <span>
              <strong>Agent is investigating</strong>
              <small>Narrowing QA rows and selecting a town extract…</small>
            </span>
          </div>
        ) : null}

        {error ? <div className="agent-error" role="alert">{error} Start LM Studio and the local bridge, then try again.</div> : null}
      </div>

      <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); submit(input) }}>
        <label htmlFor="agent-message">Message local agent</label>
        <div>
          <input
            id="agent-message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask why this was flagged"
            disabled={isWorking}
          />
          <button type="submit" aria-label="Send message" disabled={!input.trim() || isWorking}>
            <Send size={18} />
          </button>
        </div>
      </form>

      {hasDraft ? (
        <button type="button" className="agent-review-draft" onClick={onReviewDraft}>
          <CheckCircle2 size={18} /> Review staged changes
        </button>
      ) : null}
    </aside>
  )
}
