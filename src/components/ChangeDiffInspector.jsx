import { ArrowRight, CheckCircle2, ChevronRight, GitBranch, GitCompareArrows, LoaderCircle, MapPin, MessageSquareWarning, Plus, Send, X } from 'lucide-react'
import { countChangedFields, formatDiffValue, getCaseChanges } from '../lib/changeDiff'

function ChangeValue({ label, tone, value, type }) {
  return (
    <div className={`diff-value ${tone}`}>
      <span>{label}</span>
      <strong>{formatDiffValue(value, type)}</strong>
    </div>
  )
}

function ProposalLineage({ proposal, proposals }) {
  if (!proposal && !proposals.length) return null

  return (
    <section className="proposal-lineage" aria-labelledby="proposal-lineage-heading">
      <header>
        <span id="proposal-lineage-heading"><GitBranch size={16} /> Proposal lineage</span>
        <small>{proposals.length ? `${proposals.length} recorded` : 'Pending registry'}</small>
      </header>
      {proposal ? <p className="current-proposal-id">Current proposal: <code>{proposal.id}</code></p> : null}
      {proposals.length ? (
        <ol>
          {proposals.map((item) => (
            <li key={item.id} style={{ marginLeft: `${item.depth * 16}px` }}>
              <div className="proposal-lineage-heading">
                <code>{item.id}</code>
                <span className={`proposal-status ${item.status}`}>{item.status}</span>
              </div>
              <span>{item.category} · {item.model || 'model not recorded'}</span>
              <p>{item.summary}</p>
              {item.reviewerFeedback ? <blockquote>Rejected: {item.reviewerFeedback}</blockquote> : null}
            </li>
          ))}
        </ol>
      ) : <p className="proposal-lineage-empty">This fixture becomes a tracked proposal the first time the agent stages, accepts, or rejects it.</p>}
    </section>
  )
}

export default function ChangeDiffInspector({
  caseItem,
  changes: stagedChanges,
  onClose,
  onSelectFeature,
  onAccept,
  onReject,
  decision,
  proposal,
  proposalLineage = [],
  reviewClaim = null,
}) {
  const changes = stagedChanges ?? getCaseChanges(caseItem)
  const fieldCount = countChangedFields(changes)
  const isWorking = decision?.status === 'accepting'
  const accepted = decision?.status === 'accepted'
  const rejected = decision?.status === 'rejected'
  const publishBlocked = caseItem.publishEligible === false

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
          {reviewClaim ? (
            <div className="diff-review-claim" role="status">
              <strong>Shared review claimed by you</strong>
              <span>
                Coworkers can see this issue is in review. The claim expires at{' '}
                {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
                  .format(new Date(reviewClaim.claimExpiresAt))}.
              </span>
            </div>
          ) : null}
          <p className="diff-intro">Red is the exported source value. Green is the agent’s draft. Nothing here has been applied.</p>
          <ProposalLineage proposal={proposal} proposals={proposalLineage} />
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

      {changes.length ? (
        <footer className="diff-decision-bar">
          {accepted ? (
            <div className="diff-decision-message accepted" role="status">
              <CheckCircle2 size={19} />
              <span>
                <strong>{decision.publisher?.productionApplied ? 'MAD edit applied' : 'Publisher handoff created'}</strong>
                <small>{decision.publisher?.message || 'The approved draft is now in the publisher workflow.'}</small>
              </span>
            </div>
          ) : rejected ? (
            <div className="diff-decision-message rejected" role="status">
              <MessageSquareWarning size={19} />
              <span>
                <strong>Draft rejected</strong>
                <small>Reviewer feedback was saved for the next local-agent revision.</small>
              </span>
            </div>
          ) : (
            <>
              {publishBlocked ? (
                <div className="diff-publish-blocker" role="note">
                  <MessageSquareWarning size={18} />
                  <span>
                    <strong>Reviewable, not publishable</strong>
                    <small>{caseItem.publishBlocker}</small>
                  </span>
                </div>
              ) : (
                <p>Acceptance freezes this reviewed draft and sends it to the server-side ArcPy publisher handoff. It does not give the browser MAD credentials.</p>
              )}
              {decision?.error ? <div className="diff-decision-error" role="alert">{decision.error}</div> : null}
              <div className="diff-decision-actions">
                <button type="button" className="diff-reject-button" onClick={onReject} disabled={isWorking}>
                  <MessageSquareWarning size={17} /> Reject and add feedback
                </button>
                <button
                  type="button"
                  className="diff-accept-button"
                  onClick={onAccept}
                  disabled={isWorking || publishBlocked}
                  title={publishBlocked ? 'An ID-preserving export is required before this edit can be approved.' : undefined}
                >
                  {isWorking ? <LoaderCircle className="agent-spinner" size={18} /> : <Send size={17} />}
                  {publishBlocked ? 'Stable row ID required' : isWorking ? 'Sending to publisherâ€¦' : 'Accept and send to publisher'}
                </button>
              </div>
            </>
          )}
        </footer>
      ) : null}
    </aside>
  )
}
