import { useState } from 'react'
import { sendLoginEmail, verifyLoginCode } from '../lib/supabase.js'
import { friendlyError } from '../lib/api.js'

const LAST_EMAIL = 'mementos:email'
const readLastEmail = () => {
  try {
    return localStorage.getItem(LAST_EMAIL) || ''
  } catch {
    return ''
  }
}

// Ingreso sin contraseña: te llega un mail con un código y un link.
export const AuthForm = ({ intro }) => {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState(readLastEmail)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const send = async (submitEvent) => {
    submitEvent?.preventDefault()
    setBusy(true)
    setError('')
    const { error: sendError } = await sendLoginEmail(email.trim().toLowerCase())
    setBusy(false)
    if (sendError) return setError(friendlyError(sendError))
    try {
      localStorage.setItem(LAST_EMAIL, email.trim().toLowerCase())
    } catch {
      // no es importante
    }
    setStep('code')
  }

  const verify = async (submitEvent) => {
    submitEvent.preventDefault()
    setBusy(true)
    setError('')
    const { error: verifyError } = await verifyLoginCode(email.trim().toLowerCase(), code)
    setBusy(false)
    if (verifyError) setError(friendlyError(verifyError))
  }

  if (step === 'code') {
    return (
      <form className="card stack" onSubmit={verify}>
        <p className="card-title">Revisá tu mail</p>
        <p className="muted small">
          Te mandamos un código a <strong>{email}</strong>. Escribilo acá, o tocá el link del mail si lo abrís en este
          mismo navegador.
        </p>
        <label className="field">
          <span>Código</span>
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="······"
            autoFocus
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy || code.length < 6}>{busy ? 'Revisando…' : 'Entrar'}</button>
        <div className="row-between">
          <button type="button" className="link-btn" onClick={() => setStep('email')}>Cambiar mail</button>
          <button type="button" className="link-btn" onClick={send} disabled={busy}>Reenviar código</button>
        </div>
      </form>
    )
  }

  return (
    <form className="card stack" onSubmit={send}>
      {intro && <p className="muted small">{intro}</p>}
      <label className="field">
        <span>Tu mail</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          placeholder="nombre@mail.com"
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Enviando…' : 'Mandarme el código'}</button>
      <p className="muted tiny">Sin contraseñas. Usamos tu mail para entrar y para mandarte el álbum.</p>
    </form>
  )
}
