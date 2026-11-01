import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSession, signOut } from '../lib/supabase.js'
import { api, friendlyError } from '../lib/api.js'
import { useEventRoom } from '../lib/useEventRoom.js'
import { formatWhen } from '../lib/time.js'
import { AuthForm } from '../components/AuthForm.jsx'
import { JoinForm } from './JoinForm.jsx'
import { Room } from './Room.jsx'

const Centered = ({ children }) => (
  <main className="screen center">
    <div className="stack narrow">{children}</div>
  </main>
)

const Invitation = ({ event, children }) => (
  <main className="screen">
    <Link to="/" className="back">← Mementos</Link>
    <div className="invite">
      <p className="eyebrow">Te invitaron a</p>
      <h1 className="display">{event.name}</h1>
      <p className="muted small">
        {event.phase === 'scheduled' && event.starts_at ? `Empieza ${formatWhen(event.starts_at)} · ` : ''}
        Un rollo compartido. Cada foto se saca una sola vez y no se borra.
      </p>
    </div>
    {children}
  </main>
)

// Sin sesión: invitación pública + ingreso con mail.
const Guest = ({ code }) => {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.eventPreview(code).then(setPreview).catch((err) => setError(friendlyError(err)))
  }, [code])

  if (error) return <Centered><p className="error">{error}</p><Link className="btn ghost" to="/">Volver</Link></Centered>
  if (!preview) return <Centered><p className="muted pulse">Buscando el evento…</p></Centered>
  if (preview.phase === 'closed') {
    return (
      <Invitation event={preview}>
        <AuthForm intro="La fiesta terminó. Si estuviste, ingresá con tu mail para ver el álbum cuando se entregue." />
      </Invitation>
    )
  }
  return (
    <Invitation event={preview}>
      <AuthForm intro="Ingresá con tu mail: ahí te llega el álbum cuando termine la fiesta." />
    </Invitation>
  )
}

const Member = ({ code, session }) => {
  const room = useEventRoom(code)

  if (room.status === 'loading' && !room.event) return <Centered><p className="muted pulse">Cargando el rollo…</p></Centered>
  if (room.status === 'error' && !room.event) {
    return <Centered><p className="error">{room.error}</p><Link className="btn ghost" to="/">Volver</Link></Centered>
  }

  if (!room.event.guest) {
    if (room.event.phase === 'closed') {
      return (
        <Invitation event={room.event}>
          <p className="card muted small">Esta fiesta ya terminó y no estás en la lista de invitados con {session.user.email}.</p>
          <button className="link-btn" onClick={signOut}>Probar con otro mail</button>
        </Invitation>
      )
    }
    return (
      <Invitation event={room.event}>
        <JoinForm event={room.event} email={session.user.email} onJoined={room.refresh} />
        <button className="link-btn" onClick={signOut}>No soy {session.user.email}</button>
      </Invitation>
    )
  }
  return <Room room={room} />
}

export const EventPage = () => {
  const code = useParams().code.toUpperCase()
  const session = useSession()
  if (session === undefined) return <Centered><p className="muted pulse">Cargando…</p></Centered>
  if (!session) return <Guest code={code} />
  return <Member code={code} session={session} />
}
