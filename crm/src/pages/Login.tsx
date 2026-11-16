import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Logo } from '../components/ui'
import { isConfigured } from '../lib/env'

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-soft px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-center"><Logo size="lg" /></div>
        <div className="card">
          <h1 className="mb-5 text-center text-xl font-bold">{title}</h1>
          {!isConfigured && (
            <div className="mb-4"><Alert kind="info">ยังไม่ได้ตั้งค่า Supabase — กรุณาสร้างไฟล์ <code>.env.local</code> ตามคู่มือ (ดู README)</Alert></div>
          )}
          {children}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">ระบบภายในสำหรับพนักงาน ADS FAH MARKETING Co., Ltd. เท่านั้น · <Link to="/privacy" className="underline">ประกาศความเป็นส่วนตัว</Link></p>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { signIn, session, profile, notice } = useAuth()
  const nav = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session && profile) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null); setBusy(true)
    const err = await signIn(email, password)
    setBusy(false)
    if (err) setError(err); else nav(from, { replace: true })
  }

  return (
    <AuthShell title="เข้าสู่ระบบ ADS FAH CRM">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="email">อีเมล</label>
          <input id="email" type="email" autoComplete="username" required className="input" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </div>
        <div>
          <label className="label" htmlFor="password">รหัสผ่าน</label>
          <input id="password" type="password" autoComplete="current-password" required className="input" value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </div>
        {(error || notice) && <Alert>{error ?? notice}</Alert>}
        <button className="btn-primary w-full" disabled={busy || !email || !password}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
        {import.meta.env.VITE_DEMO === '1' && (
          <div className="rounded-lg bg-brand-soft p-3 text-xs text-slate-700">
            <b>โหมดสาธิต</b> — บัญชีตัวอย่าง (รหัสผ่าน <code>demo</code>):<br />owner@demo.example · manager@demo.example · admin@demo.example
          </div>)}
        <div className="text-center text-sm"><Link to="/forgot-password" className="text-brand-dark hover:underline">ลืมรหัสผ่าน?</Link></div>
      </form>
    </AuthShell>
  )
}
