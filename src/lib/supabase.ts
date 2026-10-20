import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
export const SCHEMA = 'patinage'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // eslint-disable-next-line no-console
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY manquants')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: SCHEMA },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}
