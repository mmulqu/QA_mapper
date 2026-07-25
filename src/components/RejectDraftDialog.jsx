import { BrainCircuit, LoaderCircle, MessageSquareWarning, X } from 'lucide-react'
import { useState } from 'react'

export default function RejectDraftDialog({ caseItem, onCancel, onSubmit, submitting, error }) {
  const [comment, setComment] = useState('')
  const memoryTarget = caseItem.skillMemory ?? {
    categoryCode: 'AP',
    skillName: 'MAD QA AP',
    skillFile: 'agent-skills\\mad-qa-ap\\SKILL.md',
    memoryFile: 'agent-skills\\mad-qa-ap\\references\\reviewer-memory.md',
  }

  const submit = (event) => {
    event.preventDefault()
    onSubmit(comment)
  }

  return (
    <div className="review-reject-backdrop">
      <section className="review-reject-dialog" role="dialog" aria-modal="true" aria-labelledby="reject-draft-title">
        <header>
          <span className="review-reject-icon"><MessageSquareWarning size={20} /></span>
          <div>
            <span>Reject agent draft</span>
            <h2 id="reject-draft-title">What needs to change?</h2>
          </div>
          <button type="button" className="review-reject-close" onClick={onCancel} disabled={submitting} aria-label="Close rejection comment">
            <X size={19} />
          </button>
        </header>

        <form onSubmit={submit}>
          <p>The local agent will turn your correction into a reusable, category-specific lesson. Nothing is written unless its structured memory call passes validation.</p>
          <div className="review-memory-target">
            <BrainCircuit size={18} aria-hidden="true" />
            <span>
              <strong>{memoryTarget.categoryCode} agent memory target</strong>
              <small>{memoryTarget.skillFile}</small>
              <code>{memoryTarget.memoryFile}</code>
            </span>
          </div>
          <label htmlFor="rejection-comment">Reviewer feedback</label>
          <textarea
            id="rejection-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="For example: The point should use the driveway, not the east entrance."
            minLength={5}
            maxLength={1200}
            autoFocus
            disabled={submitting}
          />
          <span className="review-reject-count">{comment.length}/1200</span>
          {submitting ? (
            <div className="review-memory-writing" role="status" aria-live="polite">
              <LoaderCircle className="agent-spinner" size={19} aria-hidden="true" />
              <span>
                <strong>Local agent is authoring {memoryTarget.categoryCode} memory</strong>
                <small>Generating and validating one structured skill lesson before writing.</small>
                <code>{memoryTarget.memoryFile}</code>
              </span>
            </div>
          ) : null}
          {error ? <div className="review-reject-error" role="alert">{error}</div> : null}
          <footer>
            <button type="button" className="review-cancel" onClick={onCancel} disabled={submitting}>Cancel</button>
            <button type="submit" className="review-reject-submit" disabled={submitting || comment.trim().length < 5}>
              {submitting ? `Agent authoring ${memoryTarget.categoryCode} memory…` : 'Reject and teach agent'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
