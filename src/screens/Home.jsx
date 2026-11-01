import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut, useSession } from '../lib/supabase.js'
import { api } from '../lib/api.js'
import { formatWhen } from '../lib/time.js'
import { FilmStrip } from '../components/FilmStrip.jsx'

const normalizeCode = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)

const PHASE_LABEL = {
  scheduled: 'Programado',
  open: 'En vivo',
  voting: 'Votación final',
  closed: 'Revelando',
}

const MyEvents = () => {
  const [events, setEvents] = useState(null)
  useEffect(() => {
    api.myEvents().then(setEvents).catch(() => setEvents([]))
  }, [])
  if (!events?.length) return null
  return (
    <section className="stack">
      <p className="eyebrow">Tus eventos</p>
      <ul className="event-list">
        {events.map((event) => (
          <li key={event.code}>
            <Link to={`/e/${event.code}`} className="event-row">
              <div>
                <p className="event-row-name">{event.name}</p>
                <p className="muted tiny mono">
                  {event.is_host ? 'Anfitrión' : 'Invitado'} · {event.starts_at ? formatWhen(event.starts_at) : event.code}
                </p>
              </div>
              <span className={`tag ${event.delivered_at ? 'delivered' : event.phase}`}>
                {event.delivered_at ? 'Entregado' : PHASE_LABEL[event.phase]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export const Home = () => {
  const navigate = useNavigate()
  const session = useSession()
  const [code, setCode] = useState('')

  const enter = (submitEvent) => {
    submitEvent.preventDefault()
    if (code.length === 6) navigate(`/e/${code}`)
  }

  return (
    <main className="screen home">
      <header className="home-hero">
        <FilmStrip />
        <h1 className="display xl">Mementos</h1>
        <p className="lede">
          Un solo rollo para toda la fiesta. Cada disparo cuenta: no se repite, no se borra. Al final, el álbum revelado
          llega a todos por mail.
        </p>
      </header>

      <form className="card stack" onSubmit={enter}>
        <label className="field">
          <span>Código del evento</span>
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoComplete="off"
          />
        </label>
        <button className="btn primary" disabled={code.length !== 6}>Entrar a la fiesta</button>
      </form>

      {session && <MyEvents />}

      <footer className="home-foot">
        <Link className="btn ghost" to="/nuevo">Organizar un evento</Link>
        {session && (
          <button className="link-btn" onClick={signOut}>
            Salir ({session.user.email})
          </button>
        )}
      </footer>
    </main>
  )
}
