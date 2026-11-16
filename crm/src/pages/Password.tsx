import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Alert } from '../components/ui'
import { validatePassword } from '../lib/roles'
import { AuthShell } from './Login'

export function ForgotPasswordPage() {
  const { sendReset } = useAuth()
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const err = await sendReset(email)
    setBusy(false)
    // ไม่บอกว่าอีเมลมีในระบบหรือไม่ เพื่อป้องกันการเดาบัญชี
    if (err && !/ไม่ถูกต้อง/.test(err)) setError(err); else setDone(true)
  }

  return (
    <AuthShell title="กู้คืนรหัสผ่าน">
      {done ? (
        <div className="space-y-4">
          <Alert kind="success">หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว กรุณาตรวจสอบกล่องจดหมาย</Alert>
          <Link to="/login" className="btn-ghost w-full">กลับไปหน้าเข้าสู่ระบบ</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">อีเมลที่ใช้เข้าสู่ระบบ</label>
            <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <Alert>{error}</Alert>}
          <button className="btn-primary w-full" disabled={busy || !email}>{busy ? 'กำลังส่ง…' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}</button>
          <div className="text-center text-sm"><Link to="/login" className="text-brand-dark hover:underline">กลับไปหน้าเข้าสู่ระบบ</Link></div>
        </form>
      )}
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const { setPassword, session, recovery } = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const v = validatePassword(pw)
    if (v) return setError(v)
    if (pw !== pw2) return setError('รหัสผ่านสองช่องไม่ตรงกัน')
    setBusy(true); setError(null)
    const err = await setPassword(pw)
    setBusy(false)
    if (err) setError(err); else nav('/', { replace: true })
  }

  if (!session && !recovery) {
    return (
      <AuthShell title="ตั้งรหัสผ่านใหม่">
        <div className="space-y-4">
          <Alert>ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง</Alert>
          <Link to="/forgot-password" className="btn-primary w-full">ขอลิงก์ใหม่</Link>
        </div>
      </AuthShell>
    )
  }
  return (
    <AuthShell title="ตั้งรหัสผ่านใหม่">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="pw">รหัสผ่านใหม่</label>
          <input id="pw" type="password" autoComplete="new-password" required className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">อย่างน้อย 10 ตัวอักษร และมีทั้งตัวอักษรกับตัวเลข</p>
        </div>
        <div>
          <label className="label" htmlFor="pw2">ยืนยันรหัสผ่านใหม่</label>
          <input id="pw2" type="password" autoComplete="new-password" required className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {error && <Alert>{error}</Alert>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}</button>
      </form>
    </AuthShell>
  )
}
