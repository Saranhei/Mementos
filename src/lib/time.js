import { useEffect, useState } from 'react'

export const useNow = (intervalMs = 1000) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

const ms = (value) => (value ? new Date(value).getTime() : null)

// Misma lógica que phase() en la base, para que la pantalla cambie a horario sin esperar al servidor.
export const effectivePhase = (event, now) => {
  if (event.phase === 'closed') return 'closed'
  const deadline = ms(event.voting_ends_at)
  if (event.phase === 'voting') return deadline && now >= deadline ? 'closed' : 'voting'
  const ends = ms(event.ends_at)
  if (ends && now >= ends) return deadline && now >= deadline ? 'closed' : 'voting'
  // "En espera" solo termina cuando el host toca Comenzar (lo decide el servidor).
  return event.phase === 'scheduled' ? 'scheduled' : 'open'
}

export const formatRemaining = (endsAt, now) => {
  const totalSeconds = Math.max(0, Math.floor((ms(endsAt) - now) / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value) => String(value).padStart(2, '0')
  if (days > 0) return `${days}d ${pad(hours)}h`
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

const dateFormat = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const formatWhen = (value) => (value ? dateFormat.format(new Date(value)) : '')

// Sello de fecha como el de las cámaras de rollo: '26 11 01
export const dateStamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0')
  return `'${String(date.getFullYear()).slice(2)} ${pad(date.getMonth() + 1)} ${pad(date.getDate())}`
}

// <input type="datetime-local"> trabaja en hora local sin zona; lo pasamos a ISO.
export const localInputToIso = (value) => (value ? new Date(value).toISOString() : null)

export const eventLink = (code) => `${window.location.origin}${window.location.pathname}#/e/${code}`
