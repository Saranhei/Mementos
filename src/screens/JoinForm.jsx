import { useState } from 'react'
import { api, friendlyError } from '../lib/api.js'

const REMEMBERED = 'mementos:me'

const remembered = () => {
  try {
    return JSON.parse(localStorage.getItem(REMEMBERED) || '{}')
  } catch {
    return {}
  }
}

export const JoinForm = ({ event, onJoined }) => {
  const [name, setName] = useState(remembered().name || '')
  const [email, setEmail] = useState(remembered().email || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (submitEvent) => {
    submitEvent.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.joinEvent({ code: event.code, name, email })
      try {
        localStorage.setItem(REMEMBERED, JSON.stringify({ name, email }))
      } catch {
        // no pasa nada si no se puede recordar
      }
      await onJoined()
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  const remaining = event.total_shots - event.shots_used

  return (
    <main className="screen">
      <p className="eyebrow">Te invitaron a</p>
      <h1 className="display">{event.name}</h1>
      <p className="lede">
        Quedan <strong>{remaining}</strong> disparos para todos. Cada foto se saca una sola vez y no se puede borrar.
        Al final te llega el álbum completo por mail.
      </p>

      <form className="card stack" onSubmit={submit}>
        <label className="field">
          <span>Tu nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        </label>
        <label className="field">
          <span>Tu mail (para mandarte el álbum)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Entrando…' : 'Sumarme'}</button>
      </form>
    </main>
  )
}
