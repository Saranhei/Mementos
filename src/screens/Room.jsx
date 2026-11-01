import { useEffect, useState } from 'react'
import { effectivePhase, formatRemaining, useNow } from '../lib/time.js'
import { flushPending } from '../lib/shots.js'
import { Camera } from '../components/Camera.jsx'
import { Album } from '../components/Album.jsx'
import { Ranking } from '../components/Ranking.jsx'
import { HostPanel } from '../components/HostPanel.jsx'
import { CameraIcon, GridIcon, KeyIcon, TrophyIcon } from '../components/Icons.jsx'

const PhaseBanner = ({ event, phase, now }) => {
  if (phase === 'voting') {
    return (
      <div className="banner voting">
        <strong>Se terminó el rollo.</strong> Última votación: <span className="mono">{formatRemaining(event.voting_ends_at, now)}</span>
      </div>
    )
  }
  if (phase === 'closed') {
    return (
      <div className="banner closed">
        {event.drive_folder_url ? (
          <>
            <strong>Álbum entregado.</strong>{' '}
            <a href={event.drive_folder_url} target="_blank" rel="noreferrer">Abrir en Drive</a>
          </>
        ) : (
          <>
            <strong>Álbum cerrado.</strong> Te llega a {event.guest.email}.
          </>
        )}
      </div>
    )
  }
  return null
}

export const Room = ({ room }) => {
  const { event, photos, scheduleRefresh, patchPhoto } = room
  const now = useNow(1000)
  const phase = effectivePhase(event, now)
  const [tab, setTab] = useState(phase === 'open' ? 'camera' : 'album')

  useEffect(() => {
    flushPending().then(scheduleRefresh)
    const onOnline = () => flushPending().then(scheduleRefresh)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [scheduleRefresh])

  useEffect(() => {
    if (phase !== 'open' && tab === 'camera') setTab('album')
  }, [phase, tab])

  const remaining = event.total_shots - event.shots_used

  const tabs = [
    phase === 'open' && { id: 'camera', label: 'Cámara', icon: <CameraIcon /> },
    { id: 'album', label: `Álbum · ${photos.length}`, icon: <GridIcon /> },
    { id: 'ranking', label: 'Ranking', icon: <TrophyIcon /> },
    event.is_host && { id: 'host', label: 'Panel', icon: <KeyIcon /> },
  ].filter(Boolean)

  return (
    <div className="room">
      <header className="room-head">
        <div className="room-title">
          <h1>{event.name}</h1>
          <span className="code-chip mono">{event.code}</span>
        </div>
        <div className="counter" aria-label={`Quedan ${remaining} disparos`}>
          <span className="counter-num mono">{String(remaining).padStart(2, '0')}</span>
          <span className="counter-label">quedan</span>
        </div>
      </header>

      <PhaseBanner event={event} phase={phase} now={now} />

      <main className="room-body">
        {tab === 'camera' && <Camera event={event} phase={phase} onShot={scheduleRefresh} />}
        {tab === 'album' && <Album photos={photos} phase={phase} event={event} patchPhoto={patchPhoto} />}
        {tab === 'ranking' && <Ranking photos={photos} />}
        {tab === 'host' && <HostPanel event={event} phase={phase} now={now} onChange={scheduleRefresh} />}
      </main>

      <nav className="tabbar">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={`tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
