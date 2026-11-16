import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './env'

// ไม่ log session/token ใดๆ ลง console
export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'http://localhost:54321',
  isConfigured ? SUPABASE_ANON_KEY : 'not-configured',
  import.meta.env.VITE_DEMO === '1'
    ? { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'demo-auth', storage: (window as unknown as { __demoStorage: Storage }).__demoStorage } }
    : { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)
