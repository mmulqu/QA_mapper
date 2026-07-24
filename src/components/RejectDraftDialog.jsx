import { MessageSquareWarning, X } from 'lucide-react'
import { useState } from 'react'

export default function RejectDraftDialog({ caseItem, onCancel, onSubmit, submitting, error }) {
  const [comment, setComment] = useState('')

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
          <p>Your feedback will be included in the local agentâ€™s next case-scoped review for {caseItem.address}.</p>
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
          {error ? <div className="review-reject-error" role="alert">{error}</div> : null}
          <footer>
            <button type="button" className="review-cancel" onClick={onCancel} disabled={submitting}>Cancel</button>
            <button type="submit" className="review-reject-submit" disabled={submitting || comment.trim().length < 5}>
              {submitting ? 'Saving feedbackâ€¦' : 'Reject and request revision'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
