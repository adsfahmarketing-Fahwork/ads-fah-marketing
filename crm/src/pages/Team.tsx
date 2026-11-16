import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Badge, Empty, Field, Modal, PageHeader, Spinner } from '../components/ui'
import { supabase } from '../lib/supabase'
import { dbError, useAsync } from '../lib/useAsync'
import { ROLE_LABEL, validatePassword, type Role } from '../lib/roles'
import { formatThaiDate } from '../lib/format'
import { PHONE_RE } from '../lib/labels'

interface Staff {
  id: string; employee_code: string; full_name: string; job_title: string | null; email: string; phone: string | null
  role: Role; status: 'active' | 'inactive'; can_view_revenue: boolean; start_date: string | null
}

function AddStaff({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'page_admin', job_title: '', phone: '', start_date: '', can_view_revenue: false })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))
  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const v = !f.full_name.trim() ? 'กรุณากรอกชื่อ-นามสกุล' : !f.email.includes('@') ? 'อีเมลไม่ถูกต้อง' : validatePassword(f.password)
      ?? (f.phone && !PHONE_RE.test(f.phone) ? 'เบอร์โทรไม่ถูกต้อง' : null)
    if (v) return setErr(v)
    setBusy(true); setErr(null)
    const { data, error } = await supabase.functions.invoke('create-staff', { body: f })
    setBusy(false)
    if (error || data?.error) {
      let msg = data?.error as string | undefined
      if (!msg && error && 'context' in error) { try { msg = (await (error as { context: Response }).context.json()).error } catch { /* ignore */ } }
      return setErr(msg ?? 'เพิ่มพนักงานไม่สำเร็จ')
    }
    onDone()
  }
  return (
    <Modal title="เพิ่มพนักงาน" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="ชื่อ-นามสกุล *"><input className="input" value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="อีเมลสำหรับเข้าสู่ระบบ *"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="รหัสผ่านเริ่มต้น *" hint="อย่างน้อย 10 ตัว มีตัวอักษรและตัวเลข — แจ้งพนักงานให้เปลี่ยนผ่านปุ่ม “ลืมรหัสผ่าน” หลังเข้าใช้งานครั้งแรก">
          <input className="input" type="text" autoComplete="off" value={f.password} onChange={set('password')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="สิทธิ์"><select className="input" value={f.role} onChange={set('role')}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
          <Field label="ตำแหน่ง"><input className="input" value={f.job_title} onChange={set('job_title')} /></Field>
          <Field label="เบอร์โทรศัพท์"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="วันที่เริ่มงาน"><input className="input" type="date" value={f.start_date} onChange={set('start_date')} /></Field>
        </div>
        {f.role === 'manager' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.can_view_revenue} onChange={(e) => setF((p) => ({ ...p, can_view_revenue: e.target.checked }))} /> อนุญาตให้ดูข้อมูลรายได้/ค่าบริการ</label>}
        {err && <Alert>{err}</Alert>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>ยกเลิก</button><button className="btn-primary" disabled={busy}>{busy ? 'กำลังสร้าง…' : 'เพิ่มพนักงาน'}</button></div>
      </form>
    </Modal>
  )
}

function EditStaff({ s, isOwner, onDone, onClose }: { s: Staff; isOwner: boolean; onDone: () => void; onClose: () => void }) {
  const { profile } = useAuth()
  const [f, setF] = useState({ full_name: s.full_name, job_title: s.job_title ?? '', phone: s.phone ?? '', start_date: s.start_date ?? '', role: s.role, status: s.status, can_view_revenue: s.can_view_revenue })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))
  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (!f.full_name.trim()) return setErr('กรุณากรอกชื่อ-นามสกุล')
    if (f.phone && !PHONE_RE.test(f.phone)) return setErr('เบอร์โทรไม่ถูกต้อง')
    setBusy(true); setErr(null)
    const { error } = await supabase.from('profiles').update({
      full_name: f.full_name.trim(), job_title: f.job_title.trim() || null, phone: f.phone.trim() || null, start_date: f.start_date || null,
      role: f.role, status: f.status, can_view_revenue: f.role === 'manager' ? f.can_view_revenue : false,
    }).eq('id', s.id)
    setBusy(false); if (error) setErr(dbError(error)); else onDone()
  }
  return (
    <Modal title={`แก้ไขพนักงาน ${s.employee_code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-500">{s.email}</p>
        <Field label="ชื่อ-นามสกุล *"><input className="input" value={f.full_name} onChange={set('full_name')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ตำแหน่ง"><input className="input" value={f.job_title} onChange={set('job_title')} /></Field>
          <Field label="เบอร์โทรศัพท์"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="วันที่เริ่มงาน"><input className="input" type="date" value={f.start_date} onChange={set('start_date')} /></Field>
          <Field label="สถานะ"><select className="input" value={f.status} onChange={set('status')} disabled={s.id === profile?.id}><option value="active">ปฏิบัติงาน</option><option value="inactive">ปิดใช้งาน</option></select></Field>
          <Field label="สิทธิ์"><select className="input" value={f.role} onChange={set('role')} disabled={s.id === profile?.id}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
        </div>
        {isOwner && f.role === 'manager' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.can_view_revenue} onChange={(e) => setF((p) => ({ ...p, can_view_revenue: e.target.checked }))} /> อนุญาตให้ดูข้อมูลรายได้/ค่าบริการ</label>}
        <p className="text-xs text-slate-500">การปิดใช้งานจะทำให้พนักงานเข้าสู่ระบบและเข้าถึงข้อมูลไม่ได้ทันที โดยยังเก็บประวัติการทำงานไว้</p>
        {err && <Alert>{err}</Alert>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>ยกเลิก</button><button className="btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></div>
      </form>
    </Modal>
  )
}

/** เลือกเพจที่พนักงานรับผิดชอบ (ฝั่งพนักงาน) */
function AssignPages({ s, onDone, onClose }: { s: Staff; onDone: () => void; onClose: () => void }) {
  const { data, loading } = useAsync(async () => {
    const [p, a] = await Promise.all([
      supabase.from('pages').select('id, page_name, customers(business_name)').neq('status', 'ended').order('page_name'),
      supabase.from('page_assignments').select('page_id').eq('staff_id', s.id),
    ])
    return { pages: (p.data ?? []) as unknown as { id: string; page_name: string; customers: { business_name: string } }[], current: new Set((a.data ?? []).map((x) => x.page_id)) }
  }, [s.id])
  const [sel, setSel] = useState<Set<string> | null>(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const chosen = sel ?? data?.current ?? new Set<string>()
  async function save() {
    if (!data) return
    setBusy(true); setErr(null)
    const changed = data.pages.filter((p) => chosen.has(p.id) !== data.current.has(p.id))
    for (const p of changed) {
      const { data: rows } = await supabase.from('page_assignments').select('staff_id').eq('page_id', p.id)
      const ids = new Set((rows ?? []).map((r) => r.staff_id))
      if (chosen.has(p.id)) ids.add(s.id); else ids.delete(s.id)
      const { error } = await supabase.rpc('set_page_assignments', { p_page_id: p.id, p_staff_ids: [...ids] })
      if (error) { setBusy(false); return setErr(dbError(error)) }
    }
    setBusy(false); onDone()
  }
  return (
    <Modal title={`มอบหมายเพจให้ ${s.full_name}`} onClose={onClose} wide>
      {loading || !data ? <Spinner /> : (
        <div className="space-y-3">
          <input className="input" placeholder="ค้นหาเพจ / ลูกค้า" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {data.pages.filter((p) => `${p.page_name} ${p.customers.business_name}`.toLowerCase().includes(q.toLowerCase())).map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input type="checkbox" checked={chosen.has(p.id)} onChange={(e) => { const n = new Set(chosen); e.target.checked ? n.add(p.id) : n.delete(p.id); setSel(n) }} />
                <span className="font-medium">{p.page_name}</span><span className="text-xs text-slate-500">{p.customers.business_name}</span>
              </label>))}
            {!data.pages.length && <Empty>ยังไม่มีเพจในระบบ</Empty>}
          </div>
          <p className="text-sm text-slate-500">เลือกแล้ว {chosen.size} เพจ — พนักงานจะได้รับแจ้งเตือนเมื่อบันทึก</p>
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึกการมอบหมาย'}</button></div>
        </div>)}
    </Modal>
  )
}

export function TeamPage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [modal, setModal] = useState<{ kind: 'add' } | { kind: 'edit' | 'assign'; s: Staff } | null>(null)
  const { data, loading, error, reload } = useAsync(async () => {
    const [p, a] = await Promise.all([
      supabase.from('profiles').select('*').order('employee_code'),
      supabase.from('page_assignments').select('staff_id'),
    ])
    if (p.error) throw p.error
    const count = new Map<string, number>()
    for (const r of a.data ?? []) count.set(r.staff_id, (count.get(r.staff_id) ?? 0) + 1)
    return { staff: p.data as Staff[], count }
  }, [])
  const done = () => { setModal(null); reload() }
  return (
    <>
      <PageHeader title="ทีมงาน" subtitle="พนักงานและการมอบหมายเพจ" action={isOwner && <button className="btn-primary" onClick={() => setModal({ kind: 'add' })}>+ เพิ่มพนักงาน</button>} />
      {error && <Alert>{dbError({ message: error })}</Alert>}
      {loading && !data ? <Spinner /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-brand-soft text-left text-xs text-slate-600"><tr><th className="p-3">รหัส</th><th className="p-3">ชื่อ-นามสกุล</th><th className="p-3">ตำแหน่ง</th><th className="p-3">อีเมล / โทร</th><th className="p-3">สิทธิ์</th><th className="p-3">เริ่มงาน</th><th className="p-3 text-center">เพจ</th><th className="p-3">สถานะ</th><th className="p-3" /></tr></thead>
            <tbody>
              {data?.staff.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 text-slate-500">{s.employee_code}</td><td className="p-3 font-medium">{s.full_name || '—'}</td><td className="p-3">{s.job_title ?? '—'}</td>
                  <td className="p-3"><div>{s.email}</div><div className="text-xs text-slate-500">{s.phone ?? ''}</div></td>
                  <td className="p-3">{ROLE_LABEL[s.role].split(' (')[0]}{s.role === 'manager' && s.can_view_revenue && <div className="text-xs text-brand-dark">ดูรายได้ได้</div>}</td>
                  <td className="p-3">{formatThaiDate(s.start_date)}</td><td className="p-3 text-center">{data.count.get(s.id) ?? 0}</td>
                  <td className="p-3"><Badge tone={s.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}>{s.status === 'active' ? 'ปฏิบัติงาน' : 'ปิดใช้งาน'}</Badge></td>
                  <td className="p-3 text-right whitespace-nowrap space-x-3">
                    {s.status === 'active' && <button className="text-brand-dark hover:underline" onClick={() => setModal({ kind: 'assign', s })}>มอบหมายเพจ</button>}
                    {isOwner && <button className="text-brand-dark hover:underline" onClick={() => setModal({ kind: 'edit', s })}>แก้ไข</button>}
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
      {modal?.kind === 'add' && <AddStaff onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'edit' && <EditStaff s={modal.s} isOwner={isOwner} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'assign' && <AssignPages s={modal.s} onClose={() => setModal(null)} onDone={done} />}
    </>
  )
}
