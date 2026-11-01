import { supabase, ensureSession, currentAccessToken, driveScriptUrl } from './supabase.js'

const MESSAGES = {
  EVENT_NOT_FOUND: 'No encontramos ese evento. Revisá el código.',
  EVENT_CLOSED: 'Este álbum ya está cerrado.',
  NO_SHOTS_LEFT: 'Se terminaron los disparos.',
  GUEST_LIMIT: 'Ya usaste todas tus fotos.',
  NOT_A_GUEST: 'Primero sumate al evento.',
  OWN_PHOTO: 'No podés votar tus propias fotos.',
  ALREADY_DELIVERED: 'El álbum ya se entregó.',
  NOT_ALLOWED: 'Solo quien organiza puede hacer esto.',
  EVENT_NOT_CLOSED: 'El álbum todavía no se cerró.',
  UPLOAD_NOT_FOUND: 'La foto no llegó a subirse. Probá de nuevo.',
  Anonymous: 'Falta activar el acceso anónimo en Supabase (ver README).',
}

export const friendlyError = (error) => {
  const text = error?.message || String(error)
  const key = Object.keys(MESSAGES).find((code) => text.includes(code))
  return key ? MESSAGES[key] : 'Algo salió mal. Revisá tu conexión e intentá de nuevo.'
}

const rpc = async (fn, args) => {
  await ensureSession()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

const isAlreadyUploaded = (error) =>
  String(error?.statusCode) === '409' || /exists|duplicate/i.test(error?.message || '')

export const api = {
  createEvent: ({ name, totalShots, votingMinutes, maxPerGuest, hostName, hostEmail }) =>
    rpc('create_event', {
      p_name: name,
      p_total_shots: totalShots,
      p_voting_minutes: votingMinutes,
      p_max_per_guest: maxPerGuest || null,
      p_host_name: hostName,
      p_host_email: hostEmail,
    }),

  getEvent: (code) => rpc('get_event', { p_code: code }),

  joinEvent: ({ code, name, email }) => rpc('join_event', { p_code: code, p_name: name, p_email: email }),

  reserveShot: async (eventId) => {
    const rows = await rpc('take_shot', { p_event_id: eventId })
    return rows[0]
  },

  uploadAndConfirm: async ({ photoId, path, blob }) => {
    const { error } = await supabase.storage
      .from('photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' })
    if (error && !isAlreadyUploaded(error)) throw error
    await rpc('confirm_photo', { p_photo_id: photoId })
  },

  album: (eventId) => rpc('album', { p_event_id: eventId }),

  vote: (photoId, value) => rpc('vote', { p_photo_id: photoId, p_value: value }),

  toggleWant: (photoId) => rpc('toggle_want', { p_photo_id: photoId }),

  endShots: (eventId) => rpc('end_shots', { p_event_id: eventId }),

  extendVoting: (eventId, minutes) => rpc('extend_voting', { p_event_id: eventId, p_minutes: minutes }),

  closeAlbum: (eventId) => rpc('close_album', { p_event_id: eventId }),

  photoUrl: (path) => supabase.storage.from('photos').getPublicUrl(path).data.publicUrl,

  // Le pide al Google Apps Script de quien organiza que arme la carpeta y mande los mails.
  sendToDrive: async (eventId) => {
    const accessToken = await currentAccessToken()
    const response = await fetch(driveScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ eventId, accessToken }),
    })
    const data = await response.json()
    if (!data.ok) throw new Error(data.error || 'DRIVE_FAILED')
    return data
  },
}
