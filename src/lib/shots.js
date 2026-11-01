import { api } from './api.js'
import { blobToDataUrl, dataUrlToBlob } from './image.js'

// Si se corta la señal después de gastar el disparo, la foto queda guardada
// en el teléfono y se reintenta sola. Nunca se pierde una foto ya disparada.
const KEY = 'mementos:pending'

const readQueue = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

const writeQueue = (queue) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(queue))
  } catch {
    // Sin espacio: la foto queda en memoria hasta cerrar la app
  }
}

const enqueue = async ({ photoId, path, blob }) => {
  const dataUrl = await blobToDataUrl(blob)
  writeQueue([...readQueue().filter((item) => item.photoId !== photoId), { photoId, path, dataUrl }])
}

export const pendingCount = () => readQueue().length

export const flushPending = async () => {
  for (const item of readQueue()) {
    try {
      const blob = await dataUrlToBlob(item.dataUrl)
      await api.uploadAndConfirm({ photoId: item.photoId, path: item.path, blob })
      writeQueue(readQueue().filter((queued) => queued.photoId !== item.photoId))
    } catch {
      return // sin conexión todavía: se reintenta más tarde
    }
  }
}

export const submitShot = async (eventId, blob) => {
  const shot = await api.reserveShot(eventId)
  const job = { photoId: shot.photo_id, path: shot.storage_path, blob }
  try {
    await api.uploadAndConfirm(job)
    return { shotNumber: shot.shot_number, queued: false }
  } catch {
    await enqueue(job)
    return { shotNumber: shot.shot_number, queued: true }
  }
}
