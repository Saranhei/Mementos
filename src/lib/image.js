const MAX_SIDE = 1920
const QUALITY = 0.85

const canvasToJpeg = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('CAPTURE_FAILED'))), 'image/jpeg', QUALITY)
  })

const fitWithin = (width, height) => {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export const captureFrame = (video) => {
  const size = fitWithin(video.videoWidth, video.videoHeight)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  canvas.getContext('2d').drawImage(video, 0, 0, size.width, size.height)
  return canvasToJpeg(canvas)
}

const loadBitmap = async (file) => {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Safari viejo: seguimos con <img>
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const fileToJpeg = async (file) => {
  const bitmap = await loadBitmap(file)
  const size = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, size.width, size.height)
  return canvasToJpeg(canvas)
}

export const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

export const dataUrlToBlob = async (dataUrl) => (await fetch(dataUrl)).blob()
