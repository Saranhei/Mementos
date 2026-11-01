import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)
export const driveScriptUrl = import.meta.env.VITE_DRIVE_SCRIPT_URL || ''

export const supabase = isConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

let sessionPromise

// Cada teléfono tiene una sesión anónima: nadie necesita crear cuenta.
export const ensureSession = () => {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) return data.session
      const { data: signed, error } = await supabase.auth.signInAnonymously()
      if (error) throw error
      return signed.session
    })().catch((error) => {
      sessionPromise = undefined
      throw error
    })
  }
  return sessionPromise
}

export const currentAccessToken = async () => {
  await ensureSession()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}
