import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Badge, Empty, Field, PageHeader, Spinner } from '../components/ui'
import { supabase } from '../lib/supabase'
import { dbError, useAsync } from '../lib/useAsync'
import { AUDIT_ACTIONS, AUDIT_TABLES, auditLabel, diffAudit, fmtVal } from '../lib/audit'
import { validatePassword } from '../lib/roles'

interface Log { id: string; actor_id: string | null; action: string; table_name: string; record_id: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; created_at: string }

function ChangePassword() {
  const { setPassword } = useAuth()
  const [a, setA] = useState(''); const [b, setB] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const v = validatePassword(a)
    if (v) return setMsg({ ok: false, text: v })
    if (a !== b) return setMsg({ ok: false, text: 'รหัสผ่านสองช่องไม่ตรงกัน' })
    const err = await setPassword(a)
    setMsg(err ? { ok: false, text: err } : { ok: true, text: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' }); if (!err) { setA(''); setB('') }
  }
  return (
    <form onSubmit={submit} className="card max-w-md space-y-3">
      <h2 className="font-semibold">เปลี่ยนรหัสผ่านของฉัน</h2>
      <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 10 ตัว มีตัวอักษรและตัวเลข"><input className="input" type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} /></Field>
      <Field label="ยืนยันรหัสผ่านใหม่"><input className="input" type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></Field>
      {msg && <Alert kind={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
      <button className="btn-primary">บันทึกรหัสผ่านใหม่</button>
    </form>
  )
}

function AuditLog() {
  const [table, setTable] = useState(''); const [action, setAction] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const { data, loading, error } = useAsync(async () => {
    let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200)
    if (table) q = q.eq('table_name', table)
    if (action) q = q.eq('action', action)
    if (from) q = q.gte('created_at', `${from}T00:00:00+07:00`)
    if (to) q = q.lte('created_at', `${to}T23:59:59+07:00`)
    const [logs, staff] = await Promise.all([q, supabase.from('profiles').select('id, full_name, email')])
    if (logs.error) throw logs.error
    return { logs: logs.data as Log[], names: new Map((staff.data ?? []).map((s) => [s.id, s.full_name || s.email])) }
  }, [table, action, from, to])
  return (
    <section>
      <h2 className="mb-1 font-semibold">ประวัติการแก้ไขข้อมูล</h2>
      <p className="mb-3 text-sm text-slate-500">บันทึกอัตโนมัติจากฐานข้อมูล แก้ไขหรือลบไม่ได้ (แสดง 200 รายการล่าสุดตามตัวกรอง)</p>
      <div className="mb-3 grid gap-3 sm:grid-cols-4">
        <select className="input" value={table} onChange={(e) => setTable(e.target.value)} aria-label="ตาราง"><option value="">ทุกประเภทข้อมูล</option>{Object.entries(AUDIT_TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input" value={action} onChange={(e) => setAction(e.target.value)} aria-label="การกระทำ"><option value="">ทุกการกระทำ</option>{Object.entries(AUDIT_ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="ตั้งแต่" /><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="ถึง" />
      </div>
      {error && <Alert>{dbError({ message: error })}</Alert>}
      {loading && !data ? <Spinner /> : !data?.logs.length ? <Empty>ไม่พบประวัติ</Empty> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-brand-soft text-left text-xs text-slate-600"><tr><th className="p-3">เวลา</th><th className="p-3">ผู้ทำรายการ</th><th className="p-3">การกระทำ</th><th className="p-3">ข้อมูล</th><th className="p-3">รายละเอียด</th></tr></thead>
            <tbody>{data.logs.map((l) => {
              const diffs = diffAudit(l.old_data, l.new_data)
              return (
                <tr key={l.id} className="border-t border-slate-100 align-top">
                  <td className="p-3 whitespace-nowrap">{new Date(l.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="p-3">{(l.actor_id && data.names.get(l.actor_id)) || 'ระบบ/ลูกค้า'}</td>
                  <td className="p-3"><Badge tone={l.action === 'DELETE' || l.action === 'ANONYMIZE' ? 'bg-red-50 text-red-700' : l.action === 'INSERT' ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-soft text-brand-dark'}>{AUDIT_ACTIONS[l.action] ?? l.action}</Badge></td>
                  <td className="p-3">{AUDIT_TABLES[l.table_name] ?? l.table_name}<div className="text-xs text-slate-500">{auditLabel(l.new_data ?? l.old_data)}</div></td>
                  <td className="p-3 text-xs text-slate-600">{l.action === 'UPDATE' ? diffs.map((d) => <div key={d.field}><b>{d.field}</b>: {fmtVal(d.from)} → {fmtVal(d.to)}</div>) : l.action === 'ANONYMIZE' ? 'ลบข้อมูลส่วนบุคคลตามคำขอ' : '—'}</td>
                </tr>) })}</tbody>
          </table>
        </div>)}
    </section>
  )
}

export function SettingsPage() {
  const { profile } = useAuth()
  return (
    <>
      <PageHeader title="ตั้งค่าระบบ" subtitle={`บัญชี: ${profile?.email}`} />
      <div className="space-y-8"><ChangePassword />{profile?.role === 'owner' && <AuditLog />}</div>
    </>
  )
}
