import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)
export const driveScriptUrl = import.meta.env.VITE_DRIVE_SCRIPT_URL || ''

// PKCE: el link del mail vuelve con ?code= y no pisa las rutas con # de la app.
export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null

// undefined = cargando, null = sin sesión
export const useSession = () => {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}

// El código del mail funciona siempre; el link solo si se abre en el mismo navegador
// (en el iPhone, la app instalada y Safari no comparten sesión).
export const sendLoginEmail = (email) =>
  supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: window.location.href.split('?')[0] },
  })

export const verifyLoginCode = (email, token) => supabase.auth.verifyOtp({ email, token, type: 'email' })

export const signOut = () => supabase.auth.signOut()

export const currentAccessToken = async () => {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}
