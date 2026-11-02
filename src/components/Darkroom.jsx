import { closingNoteFor } from '../lib/notes.js'

// Entre el cierre y la entrega: una instax todavía sin revelar con la nota del anfitrión
// (o una de las nuestras si no dejó ninguna).
export const Darkroom = ({ event }) => {
  const note = closingNoteFor(event)
  return (
    <section className="closing">
      <figure className="instax-note">
        <div className="instax-unrevealed" aria-hidden="true">
          <span className="eyebrow">Revelando</span>
        </div>
        <figcaption>
          <p className="closing-text">{note.text}</p>
          {note.signature && <p className="closing-sign">{note.signature}</p>}
        </figcaption>
      </figure>
      <p className="muted small closing-foot">
        Cuando el álbum esté listo te llega a <strong>{event.guest.email}</strong> y vas a poder verlo acá.
      </p>
    </section>
  )
}
