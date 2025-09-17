const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url) {
  throw new Error('Missing VITE_SUPABASE_URL environment variable.')
}

if (!anonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY environment variable.')
}

type MinimalSupabaseClient = {
  url: string
  anonKey: string
}

function createClient(supabaseUrl: string, supabaseAnonKey: string): MinimalSupabaseClient {
  return { url: supabaseUrl, anonKey: supabaseAnonKey }
}

export const supabase = createClient(url, anonKey)
export type { MinimalSupabaseClient }
