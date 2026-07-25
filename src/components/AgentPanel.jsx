import { Bot, BrainCircuit, CheckCircle2, LoaderCircle, Send, Sparkles, Wrench, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { askLocalAgent } from '../lib/agentClient'

const starterPrompts = [
  'Why was this case flagged?',
  'Review the evidence and stage a draft if it is safe.',
]

export default function AgentPanel({
  caseItem,
  onClose,
  onDraftStaged,
  onReviewDraft,
  reviewerFeedback,
  initialResult = null,
  automaticStatus = 'idle',
}) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [hasDraft, setHasDraft] = useState(false)

  useEffect(() => {
    setMessages([])
    setInput('')
    setStatus('idle')
    setError('')
    setHasDraft(false)
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
