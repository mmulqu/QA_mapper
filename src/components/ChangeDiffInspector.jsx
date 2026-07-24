import { ArrowRight, ChevronRight, GitCompareArrows, MapPin, Plus, X } from 'lucide-react'
import { countChangedFields, formatDiffValue, getCaseChanges } from '../lib/changeDiff'

function ChangeValue({ label, tone, value, type }) {
  return (
    <div className={`diff-value ${tone}`}>
      <span>{label}</span>
      <strong>{formatDiffValue(value, type)}</strong>
    </div>
  )
}

export default function ChangeDiffInspector({ caseItem, onClose, onSelectFeature }) {
  const changes = getCaseChanges(caseItem)
  const fieldCount = countChangedFields(changes)

  return (
    <aside className="change-diff-inspector" aria-label="Agent proposed changes">
      <header className="diff-header">
        <span className="diff-header-icon"><GitCompareArrows size={21} /></span>
        <div>
          <span>Agent proposed changes</span>
          <h2>{changes.length ? `${fieldCount} field ${fieldCount === 1 ? 'change' : 'changes'}` : 'No proposed edits'}</h2>
        </div>
        <button type="button" className="inspector-close" onClick={onClose} aria-label="Close changes">
          <X size={20} />
        </button>
      </header>

      {changes.length ? (
        <div className="diff-scroll-region">
          <p className="diff-intro">Red is the exported source value. Green is the agent’s draft. Nothing here has been applied.</p>
          {changes.map((change) => (
            <section className={change.isNew ? 'diff-change is-new' : 'diff-change'} key={change.id}>
              <header className="diff-change-header">
                <div>
                  <span className="diff-entity"><MapPin size={15} /> {change.entityLabel}</span>
                  <h3>{change.entityId}</h3>
                  <p>{change.summary}</p>
                </div>
                {change.isNew ? <span className="diff-new-badge"><Plus size={14} /> New</span> : null}
              </header>

              <div className="diff-field-list">
                {change.fields.map((field) => (
                  <div className="diff-field" key={field.field}>
                    <span className="diff-field-name">{field.field}</span>
                    <div className="diff-value-pair">
                      {!change.isNew ? (
                        <ChangeValue label="Current" tone="before" value={field.before} type={field.type} />
                      ) : null}
                      {!change.isNew ? <ArrowRight className="diff-arrow" size={17} aria-hidden="true" /> : null}
                      <ChangeValue
                        label={change.isNew ? 'New' : 'Proposed'}
                        tone="after"
                        value={field.after}
                        type={field.type}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" className="diff-inspect-link" onClick={() => onSelectFeature(change.mapTarget)}>
                Inspect {change.entityLabel.toLowerCase()} <ChevronRight size={17} />
              </button>
            </section>
          ))}
        </div>
      ) : (
        <div className="diff-empty-state">
          <GitCompareArrows size={28} />
          <strong>No agent changes to review</strong>
          <span>This case is held for evidence; the agent did not create a draft edit.</span>
        </div>
      )}
    </aside>
  )
}
