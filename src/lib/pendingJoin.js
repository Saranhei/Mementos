// Si alguien escanea el QR y entra tocando el link del mail (en vez de escribir el código),
// vuelve a la página principal: guardamos a qué evento iba para llevarlo de nuevo ahí.
const KEY = 'mementos:pending-join'
const MAX_AGE_MS = 30 * 60 * 1000

export const rememberPendingJoin = (code, secret) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ code, secret, at: Date.now() }))
  } catch {
    // sin storage: el código del mail igual funciona
  }
}

export const takePendingJoin = () => {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    const data = raw ? JSON.parse(raw) : null
    return data && Date.now() - data.at < MAX_AGE_MS ? data : null
  } catch {
    return null
  }
}
