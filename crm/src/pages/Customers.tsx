import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Badge, Empty, Field, Modal, PageHeader, Spinner, Toolbar } from '../components/ui'
import { supabase } from '../lib/supabase'
import { cleanSearch, dbError, useAsync } from '../lib/useAsync'
import { CUSTOMER_STATUS, EMAIL_RE, PHONE_RE, STATUS_TONE, URL_RE } from '../lib/labels'
import { isManagement } from '../lib/roles'
import { formatThaiDate, todayBangkok } from '../lib/format'

export interface CustomerRow {
  id: string; customer_code: string; business_name: string; contact_name: string | null; phone: string | null
  line_id: string | null; email: string | null; business_type: string | null; started_at: string
  status: keyof typeof CUSTOMER_STATUS; notes: string | null
}

export function CustomerForm({ initial, onDone, onClose }: { initial?: CustomerRow; onDone: (id: string) => void; onClose: () => void }) {
  const [f, setF] = useState({
    business_name: initial?.business_name ?? '', contact_name: initial?.contact_name ?? '', phone: initial?.phone ?? '',
    line_id: initial?.line_id ?? '', email: initial?.email ?? '', business_type: initial?.business_type ?? '',
    started_at: initial?.started_at ?? todayBangkok(), status: initial?.status ?? 'active', notes: initial?.notes ?? '',
    page_name: '', page_url: '', instagram_url: '',
  })
  const [err, setErr] = useState<Record<string, string>>({})
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))

  function validate() {
    const e: Record<string, string> = {}
    if (!f.business_name.trim()) e.business_name = 'กรุณากรอกชื่อธุรกิจ'
    if (f.phone && !PHONE_RE.test(f.phone)) e.phone = 'เบอร์โทรไม่ถูกต้อง'
    if (f.email && !EMAIL_RE.test(f.email)) e.email = 'อีเมลไม่ถูกต้อง'
    if (f.page_url && !URL_RE.test(f.page_url)) e.page_url = 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://'
    if (f.instagram_url && !URL_RE.test(f.instagram_url)) e.instagram_url = 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://'
    if (f.page_url && !f.page_name.trim()) e.page_name = 'กรุณากรอกชื่อเพจ'
    setErr(e); return Object.keys(e).length === 0
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    setBusy(true); setFormErr(null)
    const n = (v: string) => (v.trim() === '' ? null : v.trim())
    const row = {
      business_name: f.business_name.trim(), contact_name: n(f.contact_name), phone: n(f.phone), line_id: n(f.line_id),
      email: n(f.email), business_type: n(f.business_type), started_at: f.started_at, status: f.status, notes: n(f.notes),
    }
    let id = initial?.id
    if (initial) {
      const { error } = await supabase.from('customers').update(row).eq('id', initial.id)
      if (error) { setBusy(false); return setFormErr(dbError(error)) }
    } else {
      const { data, error } = await supabase.from('customers').insert(row).select('id').single()
      if (error || !data) { setBusy(false); return setFormErr(dbError(error)) }
      id = data.id
      if (f.page_name.trim()) {
        const { error: pe } = await supabase.from('pages').insert({
          customer_id: id, page_name: f.page_name.trim(), page_url: n(f.page_url), instagram_url: n(f.instagram_url),
        })
        if (pe) { setBusy(false); return setFormErr(`บันทึกลูกค้าแล้ว แต่เพิ่มเพจไม่สำเร็จ: ${dbError(pe)} (เพิ่มเพจได้ในหน้ารายละเอียดลูกค้า)`) }
      }
    }
    setBusy(false); onDone(id!)
  }

  return (
    <Modal title={initial ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><Field label="ชื่อบริษัท / ชื่อธุรกิจ *" error={err.business_name}><input className="input" value={f.business_name} onChange={set('business_name')} maxLength={200} /></Field></div>
        <Field label="ชื่อผู้ติดต่อ"><input className="input" value={f.contact_name} onChange={set('contact_name')} /></Field>
        <Field label="เบอร์โทรศัพท์" error={err.phone}><input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="LINE ID"><input className="input" value={f.line_id} onChange={set('line_id')} /></Field>
        <Field label="อีเมล" error={err.email}><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="ประเภทธุรกิจ"><input className="input" value={f.business_type} onChange={set('business_type')} /></Field>
        <Field label="วันที่เริ่มเป็นลูกค้า"><input className="input" type="date" value={f.started_at} onChange={set('started_at')} /></Field>
        <Field label="สถานะลูกค้า">
          <select className="input" value={f.status} onChange={set('status')}>
            {Object.entries(CUSTOMER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="หมายเหตุเพิ่มเติม"><textarea className="input" rows={3} value={f.notes} onChange={set('notes')} /></Field></div>
        {!initial && (
          <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:col-span-2 sm:grid-cols-2">
            <legend className="px-2 text-sm font-semibold text-brand-dark">เพจแรกของลูกค้า (ไม่บังคับ — เพิ่มทีหลังได้)</legend>
            <Field label="ชื่อ Facebook Page" error={err.page_name}><input className="input" value={f.page_name} onChange={set('page_name')} /></Field>
            <Field label="ลิงก์ Facebook Page" error={err.page_url}><input className="input" inputMode="url" placeholder="https://" value={f.page_url} onChange={set('page_url')} /></Field>
            <div className="sm:col-span-2"><Field label="ลิงก์ Instagram" error={err.instagram_url}><input className="input" inputMode="url" placeholder="https://" value={f.instagram_url} onChange={set('instagram_url')} /></Field></div>
          </fieldset>
        )}
        {formErr && <div className="sm:col-span-2"><Alert>{formErr}</Alert></div>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function CustomersPage() {
  const { profile } = useAuth()
  const canEdit = isManagement(profile?.role)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [showForm, setShowForm] = useState(false)

  const { data, loading, error, reload } = useAsync(async () => {
    const s = cleanSearch(q)
    let query = supabase.from('customers').select('*, pages(id, page_name)').order('created_at', { ascending: false }).limit(500)
    if (status) query = query.eq('status', status)
    if (s) {
      const { data: byPage } = await supabase.from('pages').select('customer_id').ilike('page_name', `%${s}%`).limit(200)
      const ids = (byPage ?? []).map((p) => p.customer_id)
      const parts = [`business_name.ilike.%${s}%`, `phone.ilike.%${s}%`, `customer_code.ilike.%${s}%`, `contact_name.ilike.%${s}%`]
      if (ids.length) parts.push(`id.in.(${ids.join(',')})`)
      query = query.or(parts.join(','))
    }
    const { data, error } = await query
    if (error) throw error
    return data as (CustomerRow & { pages: { id: string; page_name: string }[] })[]
  }, [q, status])

  return (
    <>
      <PageHeader title="ลูกค้า" subtitle={profile?.role === 'page_admin' ? 'เฉพาะลูกค้าที่เกี่ยวข้องกับเพจที่คุณดูแล' : 'ลูกค้าทั้งหมดของบริษัท'}
        action={canEdit && <button className="btn-primary" onClick={() => setShowForm(true)}>+ เพิ่มลูกค้า</button>} />
      <Toolbar>
        <input className="input max-w-xs" placeholder="ค้นหา ชื่อธุรกิจ / ชื่อเพจ / เบอร์โทร / รหัส" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" />
        <select className="input max-w-[11rem]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="สถานะ">
          <option value="">ทุกสถานะ</option>
          {Object.entries(CUSTOMER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Toolbar>
      {error && <Alert>{dbError({ message: error })}</Alert>}
      {loading && !data ? <Spinner /> : !data?.length ? <Empty>ไม่พบข้อมูลลูกค้า</Empty> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-brand-soft text-left text-xs text-slate-600">
              <tr><th className="p-3">รหัส</th><th className="p-3">ชื่อธุรกิจ</th><th className="p-3">ผู้ติดต่อ</th><th className="p-3">เบอร์โทร</th><th className="p-3">เพจ</th><th className="p-3">เริ่มเป็นลูกค้า</th><th className="p-3">สถานะ</th></tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 text-slate-500">{c.customer_code}</td>
                  <td className="p-3 font-medium"><Link className="text-brand-dark hover:underline" to={`/customers/${c.id}`}>{c.business_name}</Link></td>
                  <td className="p-3">{c.contact_name ?? '—'}</td><td className="p-3">{c.phone ?? '—'}</td>
                  <td className="p-3">{c.pages.length}</td><td className="p-3">{formatThaiDate(c.started_at)}</td>
                  <td className="p-3"><Badge tone={STATUS_TONE[c.status]}>{CUSTOMER_STATUS[c.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && <CustomerForm onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); reload() }} />}
    </>
  )
}
