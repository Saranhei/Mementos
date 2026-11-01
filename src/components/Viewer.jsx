import { useEffect, useRef } from 'react'
import { api } from '../lib/api.js'
import { ChevronIcon, CloseIcon, DownIcon, HeartIcon, UpIcon } from './Icons.jsx'

const SWIPE_PX = 50

export const Viewer = ({ photos, index, onIndex, onClose, actions }) => {
  const photo = photos[index]
  const touchStart = useRef(null)
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) onIndex(index - 1)
      if (e.key === 'ArrowRight' && hasNext) onIndex(index + 1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [index, hasPrev, hasNext, onIndex, onClose])

  const onTouchStart = (e) => {
    touchStart.current = e.touches[0].clientX
  }
  const onTouchEnd = (e) => {
    if (touchStart.current === null) return
    const delta = e.changedTouches[0].clientX - touchStart.current
    touchStart.current = null
    if (delta > SWIPE_PX && hasPrev) onIndex(index - 1)
    if (delta < -SWIPE_PX && hasNext) onIndex(index + 1)
  }

  const voteDisabled = !actions.canVote || photo.is_mine

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Foto ${photo.shot_number}`}>
      <header className="viewer-head">
        <div>
          <p className="mono">#{photo.shot_number}</p>
          <p className="muted">por {photo.is_mine ? 'vos' : photo.author}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
          <CloseIcon />
        </button>
      </header>

      <div className="viewer-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {hasPrev && (
          <button className="viewer-nav prev" onClick={() => onIndex(index - 1)} aria-label="Anterior">
            <ChevronIcon dir="left" />
          </button>
        )}
        <img key={photo.id} src={api.photoUrl(photo.storage_path)} alt={`Foto ${photo.shot_number} de ${photo.author}`} />
        {hasNext && (
          <button className="viewer-nav next" onClick={() => onIndex(index + 1)} aria-label="Siguiente">
            <ChevronIcon />
          </button>
        )}
      </div>

      <footer className="viewer-actions">
        <button
          className={`vote best ${photo.my_vote === 1 ? 'on' : ''}`}
          onClick={() => actions.vote(photo, 1)}
          disabled={voteDisabled}
          aria-pressed={photo.my_vote === 1}
        >
          <UpIcon />
          <span>Mejor</span>
          <span className="mono">{photo.ups}</span>
        </button>
        <button
          className={`vote worst ${photo.my_vote === -1 ? 'on' : ''}`}
          onClick={() => actions.vote(photo, -1)}
          disabled={voteDisabled}
          aria-pressed={photo.my_vote === -1}
        >
          <DownIcon />
          <span>Peor</span>
          <span className="mono">{photo.downs}</span>
        </button>
        <button
          className={`vote want ${photo.wanted ? 'on' : ''}`}
          onClick={() => actions.toggleWant(photo)}
          disabled={!actions.canWant}
          aria-pressed={photo.wanted}
        >
          <HeartIcon filled={photo.wanted} />
          <span>Quiero esta</span>
        </button>
      </footer>
      {photo.is_mine && actions.canVote && <p className="viewer-note muted">Tus fotos las votan los demás.</p>}
      {actions.message && (
        <button className="toast" onClick={actions.clearMessage}>{actions.message}</button>
      )}
    </div>
  )
}
