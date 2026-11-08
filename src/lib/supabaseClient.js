import { createClient } from '@supabase/supabase-js'

/*
 * Supabase browser client. Uses ONLY the public (anon / publishable) key; all protection comes from
 * Row Level Security in the database. This file refuses to start with a privileged key.
 * There is no demo fallback: if configuration is wrong the app shows a configuration error screen.
 */
const url = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

function jwtRole(key) {
  try {
    const part = key.split('.')[1]
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).role
  } catch {
    return null
  }
}

function validate() {
  if (!url || !anonKey) return 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env, then restart the dev server.'
  let u
  try {
    u = new URL(url)
  } catch {
    return 'VITE_SUPABASE_URL is not a valid URL. It should look like https://<project-ref>.supabase.co'
  }
  if (u.hostname === 'supabase.com' || u.hostname.endsWith('.supabase.com')) {
    const ref = u.pathname.split('/').filter(Boolean).pop() || '<project-ref>'
    return `VITE_SUPABASE_URL is the dashboard address, not the API address. Use https://${ref}.supabase.co (Project Settings → API → Project URL).`
  }
  if (anonKey.startsWith('sb_secret_') || jwtRole(anonKey) === 'service_role') {
    return 'VITE_SUPABASE_ANON_KEY contains a privileged (service-role / secret) key. Never put that in the frontend. Use the anon / publishable key and rotate the exposed key in the Supabase dashboard.'
  }
  return null
}

export const configError = validate()
export const isSupabaseConfigured = configError === null

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'academy-admin-auth' },
    })
  : null
