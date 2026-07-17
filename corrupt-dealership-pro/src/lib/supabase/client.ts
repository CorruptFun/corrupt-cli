import { createBrowserClient } from '@supabase/ssr'

// Placeholder fallbacks so `next build` succeeds before Supabase is configured.
// A template is cloned and built before its Supabase project exists, and Vercel
// builds before every env var is set. With real env present at runtime these are
// used and everything works; without it, requests fail and the app falls back to
// its empty states — the build never hard-crashes on a missing key.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}
