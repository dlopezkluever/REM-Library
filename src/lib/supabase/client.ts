import { createBrowserClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const localAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const runtimeGlobal = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> }
}
const processEnv = runtimeGlobal.process?.env

const supabaseUrl =
  import.meta.env?.VITE_SUPABASE_URL ?? processEnv?.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'

const supabaseAnonKey =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ?? processEnv?.VITE_SUPABASE_ANON_KEY ?? localAnonKey

export const supabase: SupabaseClient<Database> =
  typeof window === 'undefined'
    ? createClient<Database>(supabaseUrl, supabaseAnonKey)
    : createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
