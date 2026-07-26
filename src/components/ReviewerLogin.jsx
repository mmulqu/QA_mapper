import { ArrowRight, ShieldCheck, Users } from 'lucide-react'
import { useState } from 'react'

export default function ReviewerLogin({ onLogin }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const submit = (event) => {
    event.preventDefault()
    try {
      onLogin(name)
    } catch (loginError) {
      setError(loginError.message)
    }
  }

  return (
    <main className="reviewer-login">
      <section className="reviewer-login-sheet" aria-labelledby="reviewer-login-title">
        <span className="reviewer-login-mark"><Users size={28} aria-hidden="true" /></span>
        <div className="reviewer-login-copy">
          <span>Shared AWS WorkSpace</span>
          <h1 id="reviewer-login-title">Identify your review session</h1>
          <p>
            Your initials appear beside queued agent work and claimed issues so coworkers can
            coordinate without duplicating effort.
          </p>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="reviewer-name">Reviewer initials</label>
          <input
            id="reviewer-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value.replace(/[^a-z]/gi, '').toUpperCase())
              setError('')
            }}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
            placeholder="MM"
            aria-describedby="reviewer-login-help"
            aria-invalid={Boolean(error)}
          />
          <small id="reviewer-login-help">
            Use 2–6 letters. This coordinates shared work; it is not organizational SSO.
          </small>
          {error ? <p className="reviewer-login-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={!/^[A-Z]{2,6}$/.test(name.trim())}>
            Enter workbench <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>
        <footer>
          <ShieldCheck size={17} aria-hidden="true" />
          One bridge owns the shared queue; LM Studio still runs one request at a time.
        </footer>
      </section>
    </main>
  )
}
