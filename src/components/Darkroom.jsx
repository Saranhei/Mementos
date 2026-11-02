import { closingNoteFor } from '../lib/notes.js'
import { PostIt } from './PostIt.jsx'

// Entre el cierre y la entrega: una nota del anfitrión pegada en el álbum (o una de las nuestras).
export const Darkroom = ({ event }) => {
  const note = closingNoteFor(event)
  return (
    <section className="closing">
      <p className="eyebrow">El rollo se está revelando</p>
      <PostIt tone="yellow" seed={event.code.length} size="lg" className="closing-note">
        <p className="hand closing-text">{note.text}</p>
        {note.signature && <p className="hand closing-sign">— {note.signature}</p>}
      </PostIt>
      <p className="muted small closing-foot">
        Cuando el álbum esté listo te llega a <strong>{event.guest.email}</strong> y vas a poder verlo acá.
      </p>
    </section>
  )
}
