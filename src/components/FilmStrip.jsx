// Tira de negativo decorativa: cuadros con tonos de foto, perforaciones arriba y abajo.
const FRAMES = ['#c9a27e', '#7d8f9e', '#d8b46a', '#8e7a6b', '#b46b56', '#6f8a73', '#cfa98a']

export const FilmStrip = () => (
  <div className="filmstrip" aria-hidden="true">
    {FRAMES.map((tone, index) => (
      <span key={tone} className="filmstrip-frame" style={{ '--tone': tone }}>
        <span className="filmstrip-num mono">{index + 23}</span>
      </span>
    ))}
  </div>
)
