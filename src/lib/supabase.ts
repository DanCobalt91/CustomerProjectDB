// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

type SupabaseEnv = {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

const env = (typeof import.meta !== 'undefined' && (import.meta as { env?: SupabaseEnv }).env) ?? {}
const url = env?.VITE_SUPABASE_URL
const anon = env?.VITE_SUPABASE_ANON_KEY

export const supabase = url && anon ? createClient(url, anon) : null

export function isSupabaseConfigured(): boolean {
  return !!supabase
}

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  return supabase
}
