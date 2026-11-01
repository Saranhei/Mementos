import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { api, friendlyError } from './api.js'

const REFRESH_DEBOUNCE_MS = 700
const FALLBACK_POLL_MS = 20000

// Carga el evento + álbum y los mantiene al día en tiempo real.
export const useEventRoom = (code) => {
  const [event, setEvent] = useState(null)
  const [photos, setPhotos] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const timer = useRef(null)

  const loadEvent = useCallback(async () => {
    const data = await api.getEvent(code)
    setEvent(data)
    return data
  }, [code])

  const loadAlbum = useCallback(async (eventId) => {
    const rows = await api.album(eventId)
    setPhotos(rows || [])
  }, [])

  const refresh = useCallback(async () => {
    try {
      const data = await loadEvent()
      if (data.guest) await loadAlbum(data.id)
      setStatus('ready')
    } catch (err) {
      setError(friendlyError(err))
      setStatus((current) => (current === 'ready' ? 'ready' : 'error'))
    }
  }, [loadEvent, loadAlbum])

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

  // Para votos y "quiero esta": se ve el cambio al instante y se confirma con el servidor.
  const patchPhoto = useCallback((photoId, changes) => {
    setPhotos((current) => current.map((photo) => (photo.id === photoId ? { ...photo, ...changes } : photo)))
  }, [])

  return { event, photos, status, error, refresh, scheduleRefresh, patchPhoto }
}
