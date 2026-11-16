import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { appUrl } from '../lib/basePath'
import { thaiAuthError, type Role } from '../lib/roles'

export interface Profile {
  id: string
  employee_code: string
  full_name: string
  job_title: string | null
  email: string
  phone: string | null
  role: Role
  status: 'active' | 'inactive'
  can_view_revenue: boolean
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  recovery: boolean
  notice: string | null
  setNotice: (n: string | null) => void
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  sendReset: (email: string) => Promise<string | null>
  setPassword: (password: string) => Promise<string | null>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
      if (!s) { setProfile(null); setLoading(false) }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    supabase.from('profiles')
      .select('id, employee_code, full_name, job_title, email, phone, role, status, can_view_revenue')
      .eq('id', userId).maybeSingle()
      .then(async ({ data }) => {
        if (cancelled) return
        if (!data || data.status !== 'active') {
          // บัญชีถูกปิดใช้งาน หรือไม่มีโปรไฟล์ — ออกจากระบบทันที
          await supabase.auth.signOut()
          setNotice('บัญชีนี้ถูกปิดใช้งานหรือยังไม่ได้เปิดสิทธิ์ กรุณาติดต่อ Owner')
          setProfile(null)
        } else setProfile(data as Profile)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId])

  const signIn = useCallback(async (email: string, password: string) => {
    setNotice(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    return error ? thaiAuthError(error.message) : null
  }, [])
  const signOut = useCallback(async () => { await supabase.auth.signOut(); setRecovery(false) }, [])
  const sendReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: appUrl('/reset-password'),
    })
    return error ? thaiAuthError(error.message) : null
  }, [])
  const setPassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (!error) setRecovery(false)
    return error ? thaiAuthError(error.message) : null
  }, [])

  const value = useMemo(
    () => ({ session, profile, loading, recovery, notice, setNotice, signIn, signOut, sendReset, setPassword }),
    [session, profile, loading, recovery, notice, signIn, signOut, sendReset, setPassword],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
