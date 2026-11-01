import { useEffect, useState } from 'react'

export const useNow = (intervalMs = 1000) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

// La votación final se cierra sola: lo calculamos también en el teléfono.
export const effectivePhase = (event, now) => {
  if (event.phase === 'voting' && event.voting_ends_at && new Date(event.voting_ends_at).getTime() <= now) {
    return 'closed'
  }
  return event.phase
}

export const formatRemaining = (endsAt, now) => {
  const totalSeconds = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export const eventLink = (code) => `${window.location.origin}${window.location.pathname}#/e/${code}`
