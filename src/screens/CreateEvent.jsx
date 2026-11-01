import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, friendlyError } from '../lib/api.js'

const VOTING_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
  { value: 180, label: '3 horas' },
  { value: 720, label: '12 horas' },
  { value: 1440, label: '24 horas' },
]

export const CreateEvent = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    totalShots: 100,
    maxPerGuest: '',
    votingMinutes: 1440,
    hostName: '',
    hostEmail: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const update = (field) => (e) => setForm((current) => ({ ...current, [field]: e.target.value }))

  const submit = async (submitEvent) => {
    submitEvent.preventDefault()
    setBusy(true)
    setError('')
    try {
      const code = await api.createEvent({
        ...form,
        totalShots: Number(form.totalShots),
        votingMinutes: Number(form.votingMinutes),
        maxPerGuest: form.maxPerGuest ? Number(form.maxPerGuest) : null,
      })
      navigate(`/e/${code}`, { replace: true })
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <main className="screen">
      <Link to="/" className="back">← Volver</Link>
      <h1 className="display">Nuevo evento</h1>

      <form className="stack" onSubmit={submit}>
        <section className="card stack">
          <label className="field">
            <span>Nombre del evento</span>
            <input value={form.name} onChange={update('name')} placeholder="Cumple 30 de Kora" maxLength={80} required />
          </label>
          <div className="row two">
            <label className="field">
              <span>Disparos en total</span>
              <input type="number" min={1} max={2000} value={form.totalShots} onChange={update('totalShots')} required />
            </label>
            <label className="field">
              <span>Máx. por persona</span>
              <input type="number" min={1} value={form.maxPerGuest} onChange={update('maxPerGuest')} placeholder="Sin límite" />
            </label>
          </div>
          <label className="field">
            <span>Votación final cuando se acaban las fotos</span>
            <select value={form.votingMinutes} onChange={update('votingMinutes')}>
              {VOTING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <small className="muted">Se vota durante toda la fiesta; esto es el tiempo extra antes de cerrar el álbum.</small>
          </label>
        </section>

        <section className="card stack">
          <p className="eyebrow">Vos</p>
          <label className="field">
            <span>Tu nombre</span>
            <input value={form.hostName} onChange={update('hostName')} maxLength={40} required />
          </label>
          <label className="field">
            <span>Tu mail</span>
            <input type="email" value={form.hostEmail} onChange={update('hostEmail')} autoComplete="email" required />
          </label>
        </section>

        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Creando…' : 'Crear evento'}</button>
      </form>
    </main>
  )
}
