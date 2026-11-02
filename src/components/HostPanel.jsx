import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api, friendlyError } from '../lib/api.js'
import { eventLink, formatRemaining } from '../lib/time.js'

const useQr = (link) => {
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 720, errorCorrectionLevel: 'M', color: { dark: '#1d1a16', light: '#ffffff' } }).then(setQr)
  }, [link])
  return qr
}

// Tarjeta para imprimir y dejar en las mesas: el QR es fijo y se activa con "Comenzar".
const PrintCard = ({ event, qr }) => (
  <div className="print-card" aria-hidden="true">
    <p className="print-eyebrow">Mementos · un rollo para todos</p>
    <h1>{event.name}</h1>
    <img src={qr} alt="" />
    <p className="print-code">{event.code}</p>
    <p className="print-steps">
      Escaneá · ingresá con tu mail · poné tu nombre · disparar.<br />
      Cada foto se saca una sola vez. El álbum te llega por mail.
    </p>
  </div>
)

const ShareCard = ({ event, onChange }) => {
  const link = eventLink(event.code, event.join_secret)
  const qr = useQr(link)
  const [copied, setCopied] = useState(false)
  const [rotating, setRotating] = useState(false)

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: event.name, text: `Sumate al rollo de fotos de ${event.name}`, url: link }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Si el QR se filtró: el viejo deja de servir para sumarse; los que ya están, siguen.
  const rotate = async () => {
    if (!window.confirm('¿Generar un QR nuevo? El anterior (y los que imprimiste) dejan de servir para sumarse. Los que ya están adentro siguen.')) return
    setRotating(true)
    try {
      await api.rotateJoinSecret(event.id)
      onChange()
    } finally {
      setRotating(false)
    }
  }

  return (
    <section className="card stack share">
      <p className="card-title">Invitación</p>
      {qr && <img className="qr" src={qr} alt={`QR para entrar a ${event.name}`} />}
      <p className="muted tiny">Solo se puede sumar quien tenga este QR o el link. Código para volver a entrar: <span className="mono">{event.code}</span></p>
      <div className="row two">
        <button className="btn ghost" onClick={() => window.print()} disabled={!qr}>Imprimir QR</button>
        <button className="btn ghost" onClick={share}>{copied ? 'Copiado' : 'Compartir link'}</button>
      </div>
      <button className="link-btn" onClick={rotate} disabled={rotating}>{rotating ? 'Generando…' : '¿Se filtró? Generar un QR nuevo'}</button>
      {qr && <PrintCard event={event} qr={qr} />}
    </section>
  )
}

// La nota que ven los invitados mientras se revela el álbum (y que va en el mail).
const HostNote = ({ event, onChange }) => {
  const [text, setText] = useState(event.message || '')
  const [state, setState] = useState('idle')
  const dirty = text.trim() !== (event.message || '')

  const save = async () => {
    setState('saving')
    try {
      await api.setAlbumDetails(event.id, text, event.cover_photo_id)
      setState('saved')
      onChange()
      setTimeout(() => setState('idle'), 1800)
    } catch {
      setState('error')
    }
  }

  return (
    <section className="card stack note-editor">
      <p className="card-title">Tu nota para los invitados</p>
      <textarea
        className="note-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        rows={4}
        placeholder="Unas palabras para cuando termine la fiesta. Si la dejás vacía, elegimos una por vos."
      />
      <div className="row-between">
        <span className="tiny muted">{state === 'saved' ? 'Guardada ✓' : state === 'error' ? 'No se pudo guardar' : 'La ven al cerrar el álbum'}</span>
        <button className="btn primary small-btn" onClick={save} disabled={!dirty || state === 'saving'}>
          {state === 'saving' ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </section>
  )
}

const GuestList = ({ eventId, refreshKey, onChange }) => {
  const [guests, setGuests] = useState([])
  const [removing, setRemoving] = useState('')
  const load = () => api.hostGuests(eventId).then(setGuests).catch(() => {})
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, refreshKey])

  // Quitar no borra sus fotos: pierde el acceso y no recibe el álbum.
  const remove = async (guest) => {
    if (!window.confirm(`¿Quitar a ${guest.name} (${guest.email})? Pierde el acceso al evento y no recibe el álbum. Sus fotos quedan.`)) return
    setRemoving(guest.id)
    try {
      await api.removeGuest(eventId, guest.id)
      await load()
      onChange()
    } finally {
      setRemoving('')
    }
  }
  if (!guests.length) return null
  return (
    <section className="card stack">
      <p className="card-title">Invitados · {guests.length}</p>
      <ul className="guest-list">
        {guests.map((guest) => (
          <li key={guest.id}>
            <div>
              <p>{guest.name}{guest.is_host ? <span className="muted tiny"> · anfitrión</span> : ''}</p>
              <p className="muted tiny">{guest.email}</p>
            </div>
            <span className="guest-actions">
              <span className="mono small">{guest.photos} 📷</span>
              {!guest.is_host && (
                <button className="link-btn danger-link" onClick={() => remove(guest)} disabled={removing === guest.id}>
                  {removing === guest.id ? '…' : 'Quitar'}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export const HostPanel = ({ event, phase, now, onChange }) => {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const run = async (label, action, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(label)
    setError('')
    try {
      await action()
      onChange()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="stack">
      <section className="stats">
        <div><span className="stat-num mono">{event.shots_used}/{event.total_shots}</span><span className="muted small">disparos</span></div>
        <div><span className="stat-num mono">{event.guests_count}/{event.max_guests}</span><span className="muted small">invitados</span></div>
      </section>

      {phase === 'scheduled' && (
        <section className="card stack control">
          <p className="card-title">En espera</p>
          <p className="muted small">Los invitados ya pueden escanear y anotarse. La cámara se activa para todos cuando toques Comenzar.</p>
          <button className="btn primary big" disabled={Boolean(busy)} onClick={() => run('start', () => api.startNow(event.id), '¿Comenzar la fiesta? Desde ahora todos pueden disparar.')}>
            {busy === 'start' ? 'Activando…' : 'Comenzar'}
          </button>
        </section>
      )}

      {phase === 'open' && (
        <section className="card stack control">
          <p className="card-title">Fiesta en vivo</p>
          <p className="muted small">
            {event.ends_at ? `Termina sola en ${formatRemaining(event.ends_at, now)}. ` : ''}
            Al terminar se cortan los disparos y arranca la votación final ({event.voting_minutes} min).
          </p>
          <button className="btn danger big" disabled={Boolean(busy)} onClick={() => run('end', () => api.endParty(event.id), '¿Terminar la fiesta? Nadie va a poder sacar más fotos.')}>
            {busy === 'end' ? 'Terminando…' : 'Terminar fiesta'}
          </button>
        </section>
      )}

      {phase === 'voting' && (
        <section className="card stack control">
          <p className="card-title">Votación final</p>
          <p className="display">{formatRemaining(event.voting_ends_at, now)}</p>
          <div className="row two">
            <button className="btn ghost" disabled={Boolean(busy)} onClick={() => run('extend', () => api.extendVoting(event.id, 15))}>+15 min</button>
            <button className="btn danger" disabled={Boolean(busy)} onClick={() => run('close', () => api.closeAlbum(event.id), '¿Cerrar el álbum ya? Nadie podrá votar más.')}>
              Cerrar álbum
            </button>
          </div>
        </section>
      )}

      {phase === 'closed' && !event.delivered_at && (
        <section className="card stack">
          <p className="card-title">Revelado</p>
          <p className="muted small">El álbum está cerrado y los invitados no ven las fotos hasta que lo envíes desde Edición.</p>
        </section>
      )}

      {!event.delivered_at && phase !== 'closed' && <HostNote event={event} onChange={onChange} />}
      {phase !== 'closed' && <ShareCard event={event} onChange={onChange} />}
      <GuestList eventId={event.id} refreshKey={`${event.guests_count}-${event.shots_used}`} onChange={onChange} />
      {error && <p className="error">{error}</p>}
    </div>
  )
}
