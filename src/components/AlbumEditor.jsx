import { useState } from 'react'
import { api, friendlyError } from '../lib/api.js'
import { driveScriptUrl } from '../lib/supabase.js'
import { EyeOffIcon, StarIcon } from './Icons.jsx'
import { DevelopingImage } from './DevelopingImage.jsx'

// Edición del host entre el cierre y el envío: qué fotos van, portada y mensaje.
// Ocultar no borra: la foto queda guardada, solo no sale en el álbum final.
export const AlbumEditor = ({ event, photos, patchPhoto, onChange }) => {
  const [message, setMessage] = useState(event.message || '')
  const [cover, setCover] = useState(event.cover_photo_id)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const included = photos.filter((photo) => !photo.hidden)

  const toggleHidden = async (photo) => {
    patchPhoto(photo.id, { hidden: !photo.hidden })
    if (!photo.hidden && cover === photo.id) setCover(null)
    try {
      await api.setPhotoHidden(photo.id, !photo.hidden)
    } catch (err) {
      patchPhoto(photo.id, { hidden: photo.hidden })
      setError(friendlyError(err))
    }
  }

  const send = async () => {
    if (!window.confirm(`¿Enviar el álbum con ${included.length} fotos? Después ya no se puede editar.`)) return
    setError('')
    try {
      setBusy('save')
      await api.setAlbumDetails(event.id, message, cover)
      setBusy('send')
      setResult(await api.sendAlbum(event.id))
      onChange()
    } catch (err) {
      setError(err.message?.match(/^[A-Z_]+$/) ? friendlyError(err) : err.message || friendlyError(err))
    } finally {
      setBusy('')
    }
  }

  if (result) {
    return (
      <section className="card stack center-text">
        <p className="display">¡Revelado!</p>
        <p className="muted">
          Se mandaron {result.emailsSent} mails{result.failed?.length ? ` (fallaron: ${result.failed.join(', ')})` : ''}.
        </p>
        <a className="btn primary" href={result.folderUrl} target="_blank" rel="noreferrer">Abrir carpeta de Drive</a>
      </section>
    )
  }

  return (
    <div className="stack">
      <section className="card stack">
        <p className="card-title">Nota para los invitados</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="¡Gracias por venir! Acá están los recuerdos de la noche."
        />
        <p className="muted tiny">Es la nota que ven mientras se revela el álbum y va en el mail con la portada. Si la dejás vacía, elegimos una. Tocá ★ en una foto para la portada.</p>
      </section>

      <p className="muted small">
        {included.length} de {photos.length} fotos van al álbum. Ocultá las que no querés que salgan: no se borran.
      </p>

      <div className="polaroids editor">
        {photos.map((photo) => (
          <div key={photo.id} className={`polaroid static ${photo.hidden ? 'is-hidden' : ''} ${cover === photo.id ? 'is-cover' : ''}`}>
            <span className="polaroid-photo">
              <DevelopingImage src={photo.url} alt={`Foto ${photo.shot_number} de ${photo.author}`} />
              {photo.hidden && <span className="hidden-label mono">Oculta</span>}
            </span>
            <span className="polaroid-caption">
              <span className="hand">{photo.is_mine ? 'vos' : photo.author}</span>
              <span className="mono tiny">#{photo.shot_number} · {photo.ups - photo.downs > 0 ? '+' : ''}{photo.ups - photo.downs}</span>
            </span>
            <span className="editor-actions">
              <button
                className={`mini ${cover === photo.id ? 'on' : ''}`}
                onClick={() => setCover(cover === photo.id ? null : photo.id)}
                disabled={photo.hidden}
                aria-label="Usar de portada"
                aria-pressed={cover === photo.id}
              >
                <StarIcon filled={cover === photo.id} />
              </button>
              <button className={`mini ${photo.hidden ? 'on' : ''}`} onClick={() => toggleHidden(photo)} aria-label={photo.hidden ? 'Mostrar' : 'Ocultar'} aria-pressed={photo.hidden}>
                <EyeOffIcon />
              </button>
            </span>
          </div>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      <div className="sticky-action">
        {driveScriptUrl ? (
          <button className="btn primary big" onClick={send} disabled={Boolean(busy) || included.length === 0}>
            {busy === 'send' ? 'Revelando y enviando… (puede tardar)' : busy === 'save' ? 'Guardando…' : 'Enviar álbum por mail'}
          </button>
        ) : (
          <p className="muted small">Falta configurar el script de Google Drive (paso 4 del README).</p>
        )}
      </div>
    </div>
  )
}
