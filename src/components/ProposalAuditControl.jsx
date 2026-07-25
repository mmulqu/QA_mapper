import { useEffect, useState } from 'react'
import { FileSpreadsheet, FolderOpen, LoaderCircle } from 'lucide-react'
import {
  getProposalAuditInfo,
  openProposalAuditInFileExplorer,
} from '../lib/agentClient'

const fallbackPath = '.runtime\\proposal-history.csv'

export default function ProposalAuditControl() {
  const [auditInfo, setAuditInfo] = useState(null)
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })

  useEffect(() => {
    let active = true
    getProposalAuditInfo()
      .then((info) => {
        if (active) setAuditInfo(info)
      })
      .catch(() => {
        // The relative path remains useful if the localhost bridge is still starting.
      })
    return () => { active = false }
  }, [])

  const openAudit = async () => {
    if (actionState.status === 'opening') return
    setActionState({ status: 'opening', message: 'Opening Windows File Explorer…' })
    try {
      const result = await openProposalAuditInFileExplorer()
      setAuditInfo(result)
      setActionState({ status: result.opened ? 'opened' : 'notice', message: result.message })
    } catch (error) {
      setActionState({
        status: 'error',
        message: `${error.message} Make sure the local agent bridge is running, then try again.`,
      })
    }
  }

  const visiblePath = auditInfo?.relativePath || fallbackPath
  const eventCount = Number.isInteger(auditInfo?.eventCount) ? auditInfo.eventCount : null
  const eventLabel = eventCount !== null
    ? `${eventCount.toLocaleString()} ${eventCount === 1 ? 'event' : 'events'} recorded`
    : 'Local append-only history'

  return (
    <div className="proposal-audit-control">
      <button
        type="button"
        className="proposal-audit-button"
        onClick={openAudit}
        disabled={actionState.status === 'opening'}
        title={auditInfo?.path || `Open ${visiblePath}`}
        aria-label={`Open proposal audit in Windows File Explorer. ${visiblePath}`}
      >
        <FileSpreadsheet size={18} aria-hidden="true" />
        <span>
          <strong>Proposal audit CSV</strong>
          <code>{visiblePath}</code>
          <small>{eventLabel}</small>
        </span>
        {actionState.status === 'opening'
          ? <LoaderCircle className="agent-spinner" size={18} aria-hidden="true" />
          : <FolderOpen size={18} aria-hidden="true" />}
      </button>
      {actionState.message ? (
        <p
          className={actionState.status === 'error' ? 'proposal-audit-message is-error' : 'proposal-audit-message'}
          role={actionState.status === 'error' ? 'alert' : 'status'}
        >
          {actionState.message}
        </p>
      ) : null}
    </div>
  )
}
