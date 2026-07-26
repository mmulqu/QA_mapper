import { MessageSquareText, X } from 'lucide-react'
import { useState } from 'react'

const MAX_CONTEXT_LENGTH = 1200

export default function QaRecordPromptDialog({ record, initialValue = '', onCancel, onSave }) {
  const [context, setContext] = useState(initialValue)
  const trimmed = context.trim()

  const submit = (event) => {
    event.preventDefault()
    onSave(trimmed)
  }

  return (
    <div className="qa-record-context-backdrop">
      <section className="qa-record-context-dialog" role="dialog" aria-modal="true" aria-labelledby="qa-record-context-title">
        <header>
          <span className="qa-record-context-icon"><MessageSquareText size={20} /></span>
          <div>
            <span>Per-record agent context</span>
            <h2 id="qa-record-context-title">{record.address}</h2>
            <small>{record.municipality} · {record.affectedRecordId}</small>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close agent context">
            <X size={19} />
          </button>
        </header>

        <form onSubmit={submit}>
          <p>
            Add a case-specific lead, source, or question for this one QA row. The agent receives it only for this run and must verify it against MAD evidence and tools.
          </p>
          <label htmlFor="qa-record-context">Context for the agent</label>
          <textarea
            id="qa-record-context"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="For example: Check whether the municipal source calls this a seasonal driveway before proposing a point move."
            maxLength={MAX_CONTEXT_LENGTH}
            autoFocus
          />
          <span className="qa-record-context-count">{context.length}/{MAX_CONTEXT_LENGTH}</span>
          <footer>
            {initialValue ? (
              <button type="button" className="qa-record-context-clear" onClick={() => onSave('')}>Clear context</button>
            ) : <span />}
            <div>
              <button type="button" className="qa-record-context-cancel" onClick={onCancel}>Cancel</button>
              <button type="submit" className="qa-record-context-save">Save context</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
