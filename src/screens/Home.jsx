import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const normalizeCode = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)

export const Home = () => {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  const enter = (submitEvent) => {
    submitEvent.preventDefault()
    if (code.length === 6) navigate(`/e/${code}`)
  }

  return (
    <main className="screen home">
      <header className="home-hero">
        <p className="eyebrow">un rollo · muchas manos</p>
        <h1 className="display xl">
          Mementos<span className="dot">.</span>
        </h1>
        <p className="lede">
          Un solo rollo de fotos para toda la fiesta. Cada disparo cuenta: no se repite, no se borra. Votan la mejor y
          la peor, y al final el álbum llega a todos por Drive.
        </p>
      </header>

      <form className="card stack" onSubmit={enter}>
        <label className="field">
          <span>Código del evento</span>
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
          />
        </label>
        <button className="btn primary" disabled={code.length !== 6}>
          Entrar
        </button>
      </form>

      <div className="home-foot">
        <span className="muted">¿Organizás?</span>
        <Link className="btn ghost" to="/nuevo">
          Crear un evento
        </Link>
      </div>
    </main>
  )
}
