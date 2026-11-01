import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { api, friendlyError } from './api.js'

const REFRESH_DEBOUNCE_MS = 700
const FALLBACK_POLL_MS = 20000

// Después del cierre, los invitados no ven fotos hasta que el host entrega el álbum.
export const isAlbumLocked = (event, phase = event.phase) => !event.is_host && phase === 'closed' && !event.delivered_at

export const useEventRoom = (code) => {
  const [event, setEvent] = useState(null)
  const [photos, setPhotos] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const timer = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const data = await api.getEvent(code)
      setEvent(data)
      if (!data.guest) {
        setPhotos([])
      } else if (isAlbumLocked(data)) {
        setPhotos([])
      } else {
        setPhotos(await api.album(data.id))
      }
      setError('')
      setStatus('ready')
    } catch (err) {
      if (/ALBUM_LOCKED/.test(err?.message)) setPhotos([])
      setError(friendlyError(err))
      setStatus((current) => (current === 'ready' ? 'ready' : 'error'))
    }
  }, [code])

  const scheduleRefresh = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(refresh, REFRESH_DEBOUNCE_MS)
  }, [refresh])

  useEffect(() => {
    setStatus('loading')
    refresh()
  }, [refresh])

  const eventId = event?.id
  const isMember = Boolean(event?.guest)

  useEffect(() => {
    if (!eventId || !isMember) return undefined
    const channel = supabase
      .channel(`event-${eventId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` }, scheduleRefresh)
      .subscribe()
    const poll = setInterval(scheduleRefresh, FALLBACK_POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && scheduleRefresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(timer.current)
    }
  }, [eventId, isMember, scheduleRefresh])

  const patchPhoto = useCallback((photoId, changes) => {
    setPhotos((current) => current.map((photo) => (photo.id === photoId ? { ...photo, ...changes } : photo)))
  }, [])

  return { event, photos, status, error, refresh, scheduleRefresh, patchPhoto }
}
