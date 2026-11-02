import { useState } from 'react'
import { api, friendlyError } from '../lib/api.js'
import { Viewer } from './Viewer.jsx'
import { DevelopingImage } from './DevelopingImage.jsx'
import { PostIt } from './PostIt.jsx'

const scoreOf = (photo) => photo.ups - photo.downs

export const usePhotoActions = ({ phase, event, patchPhoto }) => {
  const [message, setMessage] = useState('')
  const canVote = phase === 'open' || phase === 'voting'
  const canWant = canVote

  const vote = async (photo, value) => {
    if (!canVote || photo.is_mine) return
    const next = photo.my_vote === value ? 0 : value
    const ups = photo.ups - (photo.my_vote === 1 ? 1 : 0) + (next === 1 ? 1 : 0)
    const downs = photo.downs - (photo.my_vote === -1 ? 1 : 0) + (next === -1 ? 1 : 0)
    patchPhoto(photo.id, { my_vote: next, ups, downs })
    try {
      await api.vote(photo.id, next)
    } catch (err) {
      patchPhoto(photo.id, { my_vote: photo.my_vote, ups: photo.ups, downs: photo.downs })
      setMessage(friendlyError(err))
    }
  }

  const toggleWant = async (photo) => {
    if (!canWant) return
    patchPhoto(photo.id, { wanted: !photo.wanted })
    try {
      const wanted = await api.toggleWant(photo.id)
      patchPhoto(photo.id, { wanted })
    } catch (err) {
      patchPhoto(photo.id, { wanted: photo.wanted })
      setMessage(friendlyError(err))
    }
  }

  return { vote, toggleWant, canVote, canWant, message, clearMessage: () => setMessage('') }
}

export const Album = ({ photos, phase, event, patchPhoto }) => {
  const [openId, setOpenId] = useState(null)
  const [filter, setFilter] = useState('all')
  const actions = usePhotoActions({ phase, event, patchPhoto })

  const visible = photos.filter((photo) => {
    if (filter === 'mine') return photo.is_mine
    if (filter === 'wanted') return photo.wanted
    return true
  })

  if (photos.length === 0) {
    return (
      <div className="empty">
        <PostIt tone="blue" seed={5} size="lg">
          <p className="hand big-hand">Rollo virgen.</p>
          <p className="small">Las fotos aparecen acá apenas alguien dispara.</p>
        </PostIt>
      </div>
    )
  }

  const openIndex = visible.findIndex((photo) => photo.id === openId)

  return (
    <section className="album">
      <div className="chips">
        {[
          ['all', 'Todas'],
          ['mine', 'Mías'],
          ['wanted', 'Quiero estas'],
        ].map(([id, label]) => (
          <button key={id} className={`chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className="muted center-text">Nada por acá todavía.</p>}

      <div className="polaroids">
        {visible.map((photo, index) => (
          <button
            key={photo.id}
            className="polaroid"
            style={{ '--tilt': `${((photo.shot_number * 37) % 7) - 3}deg`, animationDelay: `${Math.min(index, 12) * 30}ms` }}
            onClick={() => setOpenId(photo.id)}
          >
            <span className="polaroid-photo">
              <DevelopingImage src={photo.url} alt={`Foto ${photo.shot_number} de ${photo.author}`} />
              {photo.wanted && <span className="polaroid-want" aria-label="La querés">♥</span>}
            </span>
            <span className="polaroid-caption">
              <span className="hand">{photo.is_mine ? 'vos' : photo.author}</span>
              <span className="mono tiny">
                #{photo.shot_number}
                {scoreOf(photo) !== 0 && (
                  <b className={scoreOf(photo) > 0 ? 'pos' : 'neg'}> {scoreOf(photo) > 0 ? `+${scoreOf(photo)}` : scoreOf(photo)}</b>
                )}
              </span>
            </span>
          </button>
        ))}
      </div>

      {openIndex >= 0 && (
        <Viewer
          photos={visible}
          index={openIndex}
          onIndex={(index) => setOpenId(visible[index].id)}
          onClose={() => setOpenId(null)}
          actions={actions}
        />
      )}

      {actions.message && (
        <button className="toast" onClick={actions.clearMessage}>{actions.message}</button>
      )}
    </section>
  )
}
