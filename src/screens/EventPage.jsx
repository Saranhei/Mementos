import { Link, useParams } from 'react-router-dom'
import { useEventRoom } from '../lib/useEventRoom.js'
import { JoinForm } from './JoinForm.jsx'
import { Room } from './Room.jsx'

export const EventPage = () => {
  const { code } = useParams()
  const room = useEventRoom(code.toUpperCase())

  if (room.status === 'loading' && !room.event) {
    return (
      <main className="screen center">
        <p className="muted pulse">Cargando el rollo…</p>
      </main>
    )
  }

  if (room.status === 'error' && !room.event) {
    return (
      <main className="screen center">
        <div className="stack narrow">
          <p className="error">{room.error}</p>
          <Link className="btn ghost" to="/">Volver</Link>
        </div>
      </main>
    )
  }

  if (!room.event.guest) return <JoinForm event={room.event} onJoined={room.refresh} />
  return <Room room={room} />
}
