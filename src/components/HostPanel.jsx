import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api, friendlyError } from '../lib/api.js'
import { driveScriptUrl } from '../lib/supabase.js'
import { eventLink, formatRemaining } from '../lib/time.js'

const ShareCard = ({ code }) => {
  const link = eventLink(code)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 480, color: { dark: '#14110f', light: '#f4ece1' } }).then(setQr)
  }, [link])

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Mementos', text: `Sumate al rollo de fotos (código ${code})`, url: link }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="card stack share">
      <p className="eyebrow">Invitar</p>
      {qr && <img className="qr" src={qr} alt={`QR para entrar al evento ${code}`} />}
      <p className="share-code mono">{code}</p>
      <button className="btn primary" onClick={share}>{copied ? 'Link copiado' : 'Compartir link'}</button>
    </section>
  )
}

export const HostPanel = ({ event, phase, now, onChange }) => {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [driveResult, setDriveResult] = useState(null)

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

  const sendToDrive = () =>
    run('drive', async () => {
      const result = await api.sendToDrive(event.id)
      setDriveResult(result)
    })

  const folderUrl = driveResult?.folderUrl || event.drive_folder_url

  return (
    <div className="stack">
      <section className="stats">
        <div><span className="stat-num mono">{event.shots_used}/{event.total_shots}</span><span className="muted">disparos</span></div>
        <div><span className="stat-num mono">{event.guests_count}</span><span className="muted">invitados</span></div>
      </section>

      {phase === 'open' && (
        <>
          <ShareCard code={event.code} />
          <section className="card stack">
            <p className="eyebrow">Terminar la fiesta</p>
            <p className="muted">
              Corta los disparos aunque queden fotos y abre la votación final de {event.voting_minutes} min.
            </p>
            <button
              className="btn ghost"
              disabled={Boolean(busy)}
              onClick={() => run('end', () => api.endShots(event.id), '¿Cortar los disparos y abrir la votación final?')}
            >
              {busy === 'end' ? 'Cerrando…' : 'Terminar fotos'}
            </button>
          </section>
        </>
      )}

      {phase === 'voting' && (
        <section className="card stack">
          <p className="eyebrow">Votación final</p>
          <p className="display">{formatRemaining(event.voting_ends_at, now)}</p>
          <div className="row two">
            <button className="btn ghost" disabled={Boolean(busy)} onClick={() => run('extend', () => api.extendVoting(event.id, 15))}>
              +15 min
            </button>
            <button
              className="btn ghost danger"
              disabled={Boolean(busy)}
              onClick={() => run('close', () => api.closeAlbum(event.id), '¿Cerrar el álbum ya? Nadie podrá votar más.')}
            >
              Cerrar ya
            </button>
          </div>
        </section>
      )}

      {phase === 'closed' && (
        <section className="card stack">
          <p className="eyebrow">Entrega</p>
          {folderUrl ? (
            <>
              <p>
                Álbum en Drive listo{driveResult ? ` · ${driveResult.emailsSent} mails enviados` : ''}.
              </p>
              <a className="btn primary" href={folderUrl} target="_blank" rel="noreferrer">Abrir carpeta</a>
            </>
          ) : driveScriptUrl ? (
            <>
              <p className="muted">
                Arma la carpeta en tu Drive, comparte el link con todos y le manda a cada invitado por mail sus “quiero
                esta” y las más votadas.
              </p>
              <button className="btn primary" disabled={Boolean(busy)} onClick={sendToDrive}>
                {busy === 'drive' ? 'Armando el álbum… (puede tardar)' : 'Enviar álbum por Drive'}
              </button>
            </>
          ) : (
            <p className="muted">Falta configurar el script de Google Drive (paso 4 del README).</p>
          )}
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  )
}
