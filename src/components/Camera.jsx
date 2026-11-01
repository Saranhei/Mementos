import { useEffect, useRef, useState } from 'react'
import { captureFrame, fileToJpeg } from '../lib/image.js'
import { submitShot } from '../lib/shots.js'
import { friendlyError } from '../lib/api.js'
import { FlipIcon } from './Icons.jsx'

const useCameraStream = (videoRef, facing) => {
  const [state, setState] = useState('starting') // starting | live | unavailable

  useEffect(() => {
    let cancelled = false
    let stream

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unavailable')
        return
      }
      setState('starting')
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        })
        if (cancelled) return
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
        setState('live')
      } catch {
        if (!cancelled) setState('unavailable')
      }
    }

    start()
    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [videoRef, facing])

  return state
}

export const Camera = ({ event, phase, onShot }) => {
  const videoRef = useRef(null)
  const fileRef = useRef(null)
  const [facing, setFacing] = useState('environment')
  const camera = useCameraStream(videoRef, facing)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)
  const [last, setLast] = useState(null)
  const [error, setError] = useState('')

  const remaining = event.total_shots - event.shots_used
  const myLeft = event.max_per_guest ? event.max_per_guest - event.my_shots : null
  const blockedReason =
    phase !== 'open' || remaining <= 0
      ? 'Se terminó el rollo.'
      : myLeft !== null && myLeft <= 0
        ? 'Ya usaste todos tus disparos.'
        : ''

  const previewUrl = useRef('')
  useEffect(() => () => previewUrl.current && URL.revokeObjectURL(previewUrl.current), [])

  const shoot = async (getBlob) => {
    if (busy || blockedReason) return
    setBusy(true)
    setError('')
    setFlash(true)
    setTimeout(() => setFlash(false), 380)
    try {
      const blob = await getBlob()
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      const url = URL.createObjectURL(blob)
      previewUrl.current = url
      setLast({ url, status: 'uploading' })
      const result = await submitShot(event.id, blob)
      setLast({ url, status: result.queued ? 'queued' : 'done', number: result.shotNumber })
      onShot()
    } catch (err) {
      setLast(null)
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const onShutter = () => {
    if (camera === 'live') shoot(() => captureFrame(videoRef.current))
    else fileRef.current?.click()
  }

  const onFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) shoot(() => fileToJpeg(file))
  }

  return (
    <section className="camera">
      <div className={`viewfinder ${facing === 'user' ? 'mirrored' : ''}`}>
        <video ref={videoRef} playsInline muted autoPlay hidden={camera === 'unavailable'} />
        {camera === 'starting' && <p className="viewfinder-msg muted pulse">Abriendo cámara…</p>}
        {camera === 'unavailable' && (
          <p className="viewfinder-msg muted">
            No pudimos abrir la cámara acá. Tocá el disparador para usar la cámara del teléfono.
          </p>
        )}
        {flash && <div className="flash" />}
        {last && (
          <figure className={`last-shot ${last.status}`}>
            <img src={last.url} alt="Tu última foto" />
            <figcaption>
              {last.status === 'uploading' && 'Revelando…'}
              {last.status === 'done' && `#${last.number} al álbum`}
              {last.status === 'queued' && 'Guardada, sube con señal'}
            </figcaption>
          </figure>
        )}
      </div>

      <div className="camera-controls">
        <div className="camera-side mono muted">
          {myLeft !== null && !blockedReason ? `te quedan ${myLeft}` : ''}
        </div>
        <button
          className={`shutter ${busy ? 'busy' : ''}`}
          onClick={onShutter}
          disabled={busy || Boolean(blockedReason)}
          aria-label="Sacar foto"
        >
          <span />
        </button>
        <div className="camera-side end">
          {camera === 'live' && (
            <button
              className="icon-btn"
              onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
              aria-label="Dar vuelta la cámara"
            >
              <FlipIcon />
            </button>
          )}
        </div>
      </div>

      <p className="camera-note">
        {blockedReason || error || 'Una sola oportunidad por foto. No se repite ni se borra.'}
      </p>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
    </section>
  )
}
