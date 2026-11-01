import { useState } from 'react'
import { api, friendlyError } from '../lib/api.js'
import { formatWhen } from '../lib/time.js'

const LAST_NAME = 'mementos:name'
const readLastName = () => {
  try {
    return localStorage.getItem(LAST_NAME) || ''
  } catch {
    return ''
  }
}

export const JoinForm = ({ event, email, onJoined }) => {
  const [name, setName] = useState(readLastName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (submitEvent) => {
    submitEvent.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.joinEvent({ code: event.code, name })
      try {
        localStorage.setItem(LAST_NAME, name)
      } catch {
        // no es importante
      }
      await onJoined()
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <p className="card-title">¿Cómo te llamamos?</p>
      <label className="field">
        <span>Tu nombre o apodo</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Así firma tus fotos" required autoFocus />
      </label>
      <p className="muted tiny">
        El anfitrión va a ver qué fotos sacaste. El álbum te llega a {email}.
        {event.starts_at && event.phase === 'scheduled' ? ` Se dispara desde el ${formatWhen(event.starts_at)}.` : ''}
      </p>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Entrando…' : 'Sumarme a la fiesta'}</button>
    </form>
  )
}
