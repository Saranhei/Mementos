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

const ShareCard = ({ event }) => {
  const link = eventLink(event.code)
  const qr = useQr(link)
  const [copied, setCopied] = useState(false)

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: event.name, text: `Sumate al rollo de fotos de ${event.name}`, url: link }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="card stack share">
      <p className="card-title">Invitación</p>
      {qr && <img className="qr" src={qr} alt={`QR para entrar a ${event.name}`} />}
      <p className="share-code mono">{event.code}</p>
      <div className="row two">
        <button className="btn ghost" onClick={() => window.print()} disabled={!qr}>Imprimir QR</button>
        <button className="btn ghost" onClick={share}>{copied ? 'Copiado' : 'Compartir link'}</button>
      </div>
      {qr && <PrintCard event={event} qr={qr} />}
    </section>
  )
}

const GuestList = ({ eventId, refreshKey }) => {
  const [guests, setGuests] = useState([])
  useEffect(() => {
    api.hostGuests(eventId).then(setGuests).catch(() => {})
  }, [eventId, refreshKey])
  if (!guests.length) return null
  return (
    <section className="card stack">
      <p className="card-title">Invitados · {guests.length}</p>
      <ul className="guest-list">
        {guests.map((guest) => (
          <li key={guest.email}>
            <div>
              <p className="hand">{guest.name}</p>
              <p className="muted tiny">{guest.email}</p>
            </div>
            <span className="mono small">{guest.photos} 📷</span>
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

      {phase !== 'closed' && <ShareCard event={event} />}
      <GuestList eventId={event.id} refreshKey={`${event.guests_count}-${event.shots_used}`} />
      {error && <p className="error">{error}</p>}
    </div>
  )
}
