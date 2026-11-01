import { api } from '../lib/api.js'

const score = (photo) => photo.ups - photo.downs

const RankList = ({ title, photos, tone }) => (
  <section className="rank-section">
    <h2 className="eyebrow">{title}</h2>
    <ol className="rank-list">
      {photos.map((photo, position) => (
        <li key={photo.id} className={`rank-item ${tone}`}>
          <span className="rank-pos display">{position + 1}</span>
          <img src={api.photoUrl(photo.storage_path)} alt={`Foto ${photo.shot_number}`} loading="lazy" />
          <div className="rank-meta">
            <span>#{photo.shot_number} · {photo.is_mine ? 'vos' : photo.author}</span>
            <span className="mono muted">{photo.ups} mejor · {photo.downs} peor</span>
          </div>
          <span className="rank-score mono">{score(photo) > 0 ? `+${score(photo)}` : score(photo)}</span>
        </li>
      ))}
    </ol>
  </section>
)

export const Ranking = ({ photos }) => {
  const best = photos
    .filter((photo) => score(photo) > 0)
    .sort((a, b) => score(b) - score(a) || b.ups - a.ups)
    .slice(0, 5)
  const worst = photos
    .filter((photo) => score(photo) < 0)
    .sort((a, b) => score(a) - score(b) || b.downs - a.downs)
    .slice(0, 3)

  if (best.length === 0 && worst.length === 0) {
    return (
      <div className="empty">
        <p className="display">Sin votos todavía.</p>
        <p className="muted">Abrí una foto del álbum y votá si es la mejor o la peor.</p>
      </div>
    )
  }

  return (
    <div className="ranking">
      {best.length > 0 && <RankList title="Las mejores" photos={best} tone="best" />}
      {worst.length > 0 && <RankList title="Las peores (con cariño)" photos={worst} tone="worst" />}
    </div>
  )
}
