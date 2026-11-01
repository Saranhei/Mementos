import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../lib/supabase.js'
import { api, friendlyError } from '../lib/api.js'
import { localInputToIso } from '../lib/time.js'
import { AuthForm } from '../components/AuthForm.jsx'

const VOTING_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
  { value: 180, label: '3 horas' },
  { value: 720, label: '12 horas' },
  { value: 1440, label: '24 horas' },
]

const EventForm = ({ session }) => {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    hostName: '',
    totalShots: 100,
    maxGuests: 50,
    maxPerGuest: '',
    endsAt: '',
    votingMinutes: 1440,
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
        name: form.name,
        hostName: form.hostName,
        totalShots: Number(form.totalShots),
        maxGuests: Number(form.maxGuests),
        maxPerGuest: form.maxPerGuest ? Number(form.maxPerGuest) : null,
        votingMinutes: Number(form.votingMinutes),
        endsAt: localInputToIso(form.endsAt),
      })
      navigate(`/e/${code}`, { replace: true })
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <section className="card stack">
        <p className="card-title">El evento</p>
        <label className="field">
          <span>Nombre</span>
          <input value={form.name} onChange={update('name')} placeholder="Cumple 30 de Kora" maxLength={80} required />
        </label>
        <label className="field">
          <span>Tu nombre (así te ven los invitados)</span>
          <input value={form.hostName} onChange={update('hostName')} maxLength={40} required />
        </label>
      </section>

      <section className="card stack">
        <p className="card-title">El rollo</p>
        <div className="row two">
          <label className="field">
            <span>Disparos en total</span>
            <input type="number" min={1} max={2000} value={form.totalShots} onChange={update('totalShots')} required />
          </label>
          <label className="field">
            <span>Invitados máx.</span>
            <input type="number" min={1} max={2000} value={form.maxGuests} onChange={update('maxGuests')} required />
          </label>
        </div>
        <label className="field">
          <span>Disparos máx. por persona</span>
          <input type="number" min={1} value={form.maxPerGuest} onChange={update('maxPerGuest')} placeholder="Sin límite" />
        </label>
      </section>

      <section className="card stack">
        <p className="card-title">Horario</p>
        <p className="muted tiny">
          El QR ya sirve desde ahora para que los invitados se anoten (podés imprimirlo), pero nadie dispara hasta que
          tocás <strong>Comenzar</strong> en el Panel.
        </p>
        <label className="field">
          <span>Termina sola a las (opcional)</span>
          <input type="datetime-local" value={form.endsAt} onChange={update('endsAt')} />
        </label>
        <p className="muted tiny">Si no ponés hora, la terminás vos con el botón Terminar fiesta.</p>
        <label className="field">
          <span>Votación final después de terminar</span>
          <select value={form.votingMinutes} onChange={update('votingMinutes')}>
            {VOTING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </section>

      <p className="muted tiny">Vas a recibir todo en {session.user.email}.</p>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Cargando el rollo…' : 'Crear evento'}</button>
    </form>
  )
}

export const CreateEvent = () => {
  const session = useSession()
  return (
    <main className="screen">
      <Link to="/" className="back">← Volver</Link>
      <h1 className="display">Nuevo evento</h1>
      {session === undefined && <p className="muted pulse">Cargando…</p>}
      {session === null && <AuthForm intro="Ingresá con tu mail para crear y manejar tus eventos desde cualquier dispositivo." />}
      {session && <EventForm session={session} />}
    </main>
  )
}
