import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { effectivePhase, formatRemaining, useNow } from '../lib/time.js'
import { flushPending } from '../lib/shots.js'
import { isAlbumLocked } from '../lib/useEventRoom.js'
import { Camera } from '../components/Camera.jsx'
import { Album } from '../components/Album.jsx'
import { Ranking } from '../components/Ranking.jsx'
import { HostPanel } from '../components/HostPanel.jsx'
import { AlbumEditor } from '../components/AlbumEditor.jsx'
import { Darkroom } from '../components/Darkroom.jsx'
import { PostIt } from '../components/PostIt.jsx'
import { CameraIcon, GridIcon, KeyIcon, TrophyIcon, PencilIcon } from '../components/Icons.jsx'

// Avisos de estado como post-its pegados arriba del contenido.
const Banner = ({ event, phase, now }) => {
  if (phase === 'scheduled') {
    return (
      <PostIt tone="yellow" seed={1} size="sm" className="banner">
        <strong>En espera.</strong> {event.is_host ? 'Tocá Comenzar en el Panel para activar la cámara.' : 'La cámara se activa cuando el anfitrión toque Comenzar.'}
      </PostIt>
    )
  }
  if (phase === 'voting') {
    return (
      <PostIt tone="pink" seed={2} size="sm" className="banner">
        <strong>¡Se terminó la fiesta!</strong> Última votación: <span className="mono">{formatRemaining(event.voting_ends_at, now)}</span>
      </PostIt>
    )
  }
  if (phase === 'closed' && event.delivered_at) {
    return (
      <PostIt tone="green" seed={3} size="sm" className="banner">
        <strong>Álbum revelado.</strong>{' '}
        {event.drive_folder_url && <a href={event.drive_folder_url} target="_blank" rel="noreferrer">Abrir en Drive</a>}
      </PostIt>
    )
  }
  if (phase === 'closed' && event.is_host) {
    return (
      <PostIt tone="blue" seed={4} size="sm" className="banner">
        <strong>Fiesta cerrada.</strong> Editá el álbum y envialo.
      </PostIt>
    )
  }
  return null
}

const tabsFor = (event, phase) => {
  const delivered = Boolean(event.delivered_at)
  const list = []
  if (phase === 'open' || phase === 'scheduled') list.push({ id: 'camera', label: 'Cámara', icon: <CameraIcon /> })
  if (event.is_host && phase === 'closed' && !delivered) {
    list.push({ id: 'edit', label: 'Edición', icon: <PencilIcon /> })
  } else {
    list.push({ id: 'album', label: 'Álbum', icon: <GridIcon /> })
    list.push({ id: 'ranking', label: 'Ranking', icon: <TrophyIcon /> })
  }
  if (event.is_host) list.push({ id: 'host', label: 'Panel', icon: <KeyIcon /> })
  return list
}

export const Room = ({ room }) => {
  const { event, photos, scheduleRefresh, patchPhoto } = room
  const now = useNow(1000)
  const phase = effectivePhase(event, now)
  const tabs = tabsFor(event, phase)
  const [tab, setTab] = useState(tabs[0].id)
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id

  useEffect(() => {
    flushPending().then(scheduleRefresh)
    const onOnline = () => flushPending().then(scheduleRefresh)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [scheduleRefresh])

  // Cuando cambia la fase por horario, pedimos el estado real al servidor (p. ej. para bloquear el álbum).
  const lastPhase = useRef(phase)
  useEffect(() => {
    if (lastPhase.current !== phase) scheduleRefresh()
    lastPhase.current = phase
  }, [phase, scheduleRefresh])

  const remaining = event.total_shots - event.shots_used
  const locked = isAlbumLocked(event, phase)

  return (
    <div className="room">
      <header className="room-head">
        <Link to="/" className="room-title">
          <h1>{event.name}</h1>
          <span className="code-chip mono">{event.code} · {event.guest.name}</span>
        </Link>
        <div className="counter" aria-label={`Quedan ${remaining} disparos`}>
          <span key={remaining} className="counter-num mono">{String(remaining).padStart(2, '0')}</span>
        </div>
      </header>

      <Banner event={event} phase={phase} now={now} />

      <main className="room-body">
        {locked ? (
          <Darkroom event={event} />
        ) : (
          <div key={activeTab} className="tab-panel">
            {activeTab === 'camera' && <Camera event={event} phase={phase} now={now} onShot={scheduleRefresh} />}
            {activeTab === 'album' && <Album photos={photos} phase={phase} event={event} patchPhoto={patchPhoto} />}
            {activeTab === 'ranking' && <Ranking photos={photos} />}
            {activeTab === 'edit' && <AlbumEditor event={event} photos={photos} patchPhoto={patchPhoto} onChange={scheduleRefresh} />}
            {activeTab === 'host' && <HostPanel event={event} phase={phase} now={now} onChange={scheduleRefresh} />}
          </div>
        )}
      </main>

      {!locked && tabs.length > 1 && (
        <nav className="tabbar">
          {tabs.map((item) => (
            <button key={item.id} className={`tab ${activeTab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
