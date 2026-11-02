import { supabase, currentAccessToken, driveScriptUrl } from './supabase.js'

const MESSAGES = {
  EVENT_NOT_FOUND: 'No encontramos ese evento. Si es la primera vez que entrás, escaneá el QR o pedile el link al anfitrión.',
  REMOVED: 'El anfitrión te quitó de este evento.',
  EVENT_CLOSED: 'Este álbum ya está cerrado.',
  EVENT_FULL: 'El evento llegó al máximo de invitados.',
  NOT_STARTED: 'La fiesta todavía no empezó.',
  NO_SHOTS_LEFT: 'Se terminaron los disparos.',
  GUEST_LIMIT: 'Ya usaste todas tus fotos.',
  NOT_A_GUEST: 'Primero sumate al evento.',
  OWN_PHOTO: 'Tus fotos las votan los demás.',
  ALREADY_DELIVERED: 'El álbum ya se entregó.',
  ALBUM_LOCKED: 'El álbum se está revelando. Te llega por mail.',
  NOT_ALLOWED: 'Solo el anfitrión puede hacer esto.',
  EVENT_NOT_CLOSED: 'El álbum todavía no se cerró.',
  BAD_SCHEDULE: 'La hora de fin tiene que ser después del inicio.',
  UPLOAD_NOT_FOUND: 'La foto no llegó a subirse. Probá de nuevo.',
  NO_SESSION: 'Tu sesión venció. Volvé a ingresar con tu mail.',
  'Token has expired or is invalid': 'El código no es válido o ya venció. Pedí uno nuevo.',
  'rate limit': 'Pediste muchos códigos seguidos. Esperá un minuto.',
}

export const friendlyError = (error) => {
  const text = error?.message || String(error)
  const key = Object.keys(MESSAGES).find((code) => text.toLowerCase().includes(code.toLowerCase()))
  return key ? MESSAGES[key] : 'Algo salió mal. Revisá tu conexión e intentá de nuevo.'
}

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

const isAlreadyUploaded = (error) =>
  String(error?.statusCode) === '409' || /exists|duplicate/i.test(error?.message || '')

// ---------- links firmados (las fotos son privadas) ----------
const SIGNED_TTL_S = 3600
const RENEW_MARGIN_MS = 10 * 60 * 1000
const signedCache = new Map()

const withUrls = async (photos) => {
  const now = Date.now()
  const missing = photos
    .map((photo) => photo.storage_path)
    .filter((path) => (signedCache.get(path)?.expires ?? 0) - RENEW_MARGIN_MS < now)
  for (let start = 0; start < missing.length; start += 100) {
    const { data, error } = await supabase.storage
      .from('photos')
      .createSignedUrls(missing.slice(start, start + 100), SIGNED_TTL_S)
    if (error) throw error
    data.forEach((item) => {
      if (item.signedUrl) signedCache.set(item.path, { url: item.signedUrl, expires: now + SIGNED_TTL_S * 1000 })
    })
  }
  return photos.map((photo) => ({ ...photo, url: signedCache.get(photo.storage_path)?.url }))
}

export const api = {
  eventPreview: (code, secret) => rpc('event_preview', { p_code: code, p_secret: secret || null }),

  myEvents: () => rpc('my_events'),

  createEvent: ({ name, totalShots, maxGuests, maxPerGuest, votingMinutes, endsAt, hostName }) =>
    rpc('create_event', {
      p_name: name,
      p_total_shots: totalShots,
      p_max_guests: maxGuests,
      p_max_per_guest: maxPerGuest || null,
      p_voting_minutes: votingMinutes,
      p_ends_at: endsAt,
      p_host_name: hostName,
    }),

  getEvent: (code, secret) => rpc('get_event', { p_code: code, p_secret: secret || null }),

  joinEvent: ({ code, name, secret }) => rpc('join_event', { p_code: code, p_name: name, p_secret: secret || null }),

  reserveShot: async (eventId) => (await rpc('take_shot', { p_event_id: eventId }))[0],

  uploadAndConfirm: async ({ photoId, path, blob }) => {
    const { error } = await supabase.storage
      .from('photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' })
    if (error && !isAlreadyUploaded(error)) throw error
    await rpc('confirm_photo', { p_photo_id: photoId })
  },

  album: async (eventId) => withUrls((await rpc('album', { p_event_id: eventId })) || []),

  vote: (photoId, value) => rpc('vote', { p_photo_id: photoId, p_value: value }),
  toggleWant: (photoId) => rpc('toggle_want', { p_photo_id: photoId }),

  // host
  hostGuests: (eventId) => rpc('host_guest_list', { p_event_id: eventId }),
  removeGuest: (eventId, guestId) => rpc('remove_guest', { p_event_id: eventId, p_guest_id: guestId }),
  rotateJoinSecret: (eventId) => rpc('rotate_join_secret', { p_event_id: eventId }),
  startNow: (eventId) => rpc('start_now', { p_event_id: eventId }),
  endParty: (eventId) => rpc('end_shots', { p_event_id: eventId }),
  extendVoting: (eventId, minutes) => rpc('extend_voting', { p_event_id: eventId, p_minutes: minutes }),
  closeAlbum: (eventId) => rpc('close_album', { p_event_id: eventId }),
  setPhotoHidden: (photoId, hidden) => rpc('set_photo_hidden', { p_photo_id: photoId, p_hidden: hidden }),
  setAlbumDetails: (eventId, message, coverPhotoId) =>
    rpc('set_album_details', { p_event_id: eventId, p_message: message, p_cover_photo_id: coverPhotoId }),

  // Le pide al Google Apps Script del host que arme la carpeta y mande los mails.
  sendAlbum: async (eventId) => {
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
