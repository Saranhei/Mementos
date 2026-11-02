import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSession, signOut } from '../lib/supabase.js'
import { api, friendlyError } from '../lib/api.js'
import { useEventRoom } from '../lib/useEventRoom.js'
import { rememberPendingJoin } from '../lib/pendingJoin.js'
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
      {event ? (
        <>
          <p className="eyebrow">Te invitaron a</p>
          <h1 className="display">{event.name}</h1>
          <p className="muted small">
            {event.phase === 'scheduled' && event.starts_at ? `Empieza ${formatWhen(event.starts_at)} · ` : ''}
            Un rollo compartido. Cada foto se saca una sola vez y no se borra.
          </p>
        </>
      ) : (
        <h1 className="display">Mementos</h1>
      )}
    </div>
    {children}
  </main>
)

// Sin sesión. Con la clave del QR mostramos la invitación; sin clave, solo puede volver quien ya estaba.
const Guest = ({ code, secret }) => {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!secret) return
    rememberPendingJoin(code, secret)
    api.eventPreview(code, secret).then(setPreview).catch((err) => setError(friendlyError(err)))
  }, [code, secret])

  if (!secret) {
    return (
      <Invitation>
        <AuthForm intro="¿Ya estabas en este evento? Ingresá con tu mail para volver. Si es la primera vez, escaneá el QR de la fiesta." />
      </Invitation>
    )
  }
  if (error) return <Centered><p className="error">{error}</p><Link className="btn ghost" to="/">Volver</Link></Centered>
  if (!preview) return <Centered><p className="muted pulse">Buscando el evento…</p></Centered>
  return (
    <Invitation event={preview}>
      <AuthForm
        intro={
          preview.phase === 'closed'
            ? 'La fiesta terminó. Si estuviste, ingresá con tu mail para ver el álbum cuando se entregue.'
            : 'Ingresá con tu mail: ahí te llega el álbum cuando termine la fiesta.'
        }
      />
    </Invitation>
  )
}

const Member = ({ code, secret, session }) => {
  const navigate = useNavigate()
  const room = useEventRoom(code, secret)

  // Una vez adentro, sacamos la clave de la barra de direcciones.
  useEffect(() => {
    if (secret && room.event?.guest) navigate(`/e/${code}`, { replace: true })
  }, [secret, room.event?.guest, code, navigate])

  if (room.status === 'loading' && !room.event) return <Centered><p className="muted pulse">Cargando el rollo…</p></Centered>
  if (room.status === 'error' && !room.event) {
    return (
      <Centered>
        <p className="error">{room.error}</p>
        <Link className="btn ghost" to="/">Volver</Link>
        <button className="link-btn" onClick={signOut}>Probar con otro mail</button>
      </Centered>
    )
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
        <JoinForm event={room.event} email={session.user.email} secret={secret} onJoined={room.refresh} />
        <button className="link-btn" onClick={signOut}>No soy {session.user.email}</button>
      </Invitation>
    )
  }
  return <Room room={room} />
}

export const EventPage = () => {
  const params = useParams()
  const code = params.code.toUpperCase()
  const secret = params.secret || null
  const session = useSession()
  if (session === undefined) return <Centered><p className="muted pulse">Cargando…</p></Centered>
  if (!session) return <Guest code={code} secret={secret} />
  return <Member code={code} secret={secret} session={session} />
}
