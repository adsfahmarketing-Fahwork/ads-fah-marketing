import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Badge, Empty, Field, Modal, PageHeader, Spinner, Toolbar } from '../components/ui'
import { supabase } from '../lib/supabase'
import { cleanSearch, dbError, useAsync } from '../lib/useAsync'
import { PAGE_STATUS, PLATFORM, STATUS_TONE, URL_RE } from '../lib/labels'
import { isManagement } from '../lib/roles'
import { AssignStaffModal } from './AssignStaff'

export interface PageRow {
  id: string; customer_id: string; platform: keyof typeof PLATFORM; page_name: string; page_url: string | null
  instagram_url: string | null; status: keyof typeof PAGE_STATUS; notes: string | null
}

export function PageForm({ initial, customerId, customers, onDone, onClose }: {
  initial?: PageRow; customerId?: string; customers: { id: string; business_name: string }[]; onDone: () => void; onClose: () => void
}) {
  const [f, setF] = useState({
    customer_id: initial?.customer_id ?? customerId ?? '', platform: initial?.platform ?? 'facebook', page_name: initial?.page_name ?? '',
    page_url: initial?.page_url ?? '', instagram_url: initial?.instagram_url ?? '', status: initial?.status ?? 'active', notes: initial?.notes ?? '',
  })
  const [err, setErr] = useState<Record<string, string>>({})
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const e: Record<string, string> = {}
    if (!f.customer_id) e.customer_id = 'กรุณาเลือกลูกค้า'
    if (!f.page_name.trim()) e.page_name = 'กรุณากรอกชื่อเพจ'
    if (f.page_url && !URL_RE.test(f.page_url)) e.page_url = 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://'
    if (f.instagram_url && !URL_RE.test(f.instagram_url)) e.instagram_url = 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://'
    setErr(e); if (Object.keys(e).length) return
    setBusy(true); setFormErr(null)
    const n = (v: string) => (v.trim() === '' ? null : v.trim())
    const row = { customer_id: f.customer_id, platform: f.platform, page_name: f.page_name.trim(), page_url: n(f.page_url), instagram_url: n(f.instagram_url), status: f.status, notes: n(f.notes) }
    const { error } = initial ? await supabase.from('pages').update(row).eq('id', initial.id) : await supabase.from('pages').insert(row)
    setBusy(false)
    if (error) setFormErr(dbError(error)); else onDone()
  }

  return (
    <Modal title={initial ? 'แก้ไขเพจ' : 'เพิ่มเพจ'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="ลูกค้า *" error={err.customer_id}>
          <select className="input" value={f.customer_id} onChange={set('customer_id')} disabled={!!initial || !!customerId}>
            <option value="">— เลือกลูกค้า —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อเพจ *" error={err.page_name}><input className="input" value={f.page_name} onChange={set('page_name')} /></Field>
          <Field label="แพลตฟอร์ม"><select className="input" value={f.platform} onChange={set('platform')}>{Object.entries(PLATFORM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <Field label="ลิงก์ Facebook Page" error={err.page_url}><input className="input" placeholder="https://" value={f.page_url} onChange={set('page_url')} /></Field>
        <Field label="ลิงก์ Instagram" error={err.instagram_url}><input className="input" placeholder="https://" value={f.instagram_url} onChange={set('instagram_url')} /></Field>
        <Field label="สถานะเพจ"><select className="input" value={f.status} onChange={set('status')}>{Object.entries(PAGE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="หมายเหตุ"><textarea className="input" rows={3} value={f.notes} onChange={set('notes')} /></Field>
        {formErr && <Alert>{formErr}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function PagesPage() {
  const { profile } = useAuth()
  const canEdit = isManagement(profile?.role)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<PageRow | 'new' | null>(null)
  const [assigning, setAssigning] = useState<PageRow | null>(null)

  const { data, loading, error, reload } = useAsync(async () => {
    const s = cleanSearch(q)
    let query = supabase.from('pages').select('*, customers(id, business_name, customer_code), page_assignments(staff_id)').order('created_at', { ascending: false }).limit(500)
    if (status) query = query.eq('status', status)
    if (s) query = query.ilike('page_name', `%${s}%`)
    const [pages, custs, staff] = await Promise.all([query, supabase.from('customers').select('id, business_name').order('business_name'), supabase.from('staff_directory').select('id, full_name')])
    if (pages.error) throw pages.error
    return { pages: pages.data as unknown as (PageRow & { customers: { id: string; business_name: string; customer_code: string }; page_assignments: { staff_id: string }[] })[], customers: custs.data ?? [], staff: new Map((staff.data ?? []).map((x) => [x.id as string, x.full_name as string])) }
  }, [q, status])

  return (
    <>
      <PageHeader title="เพจ" subtitle={profile?.role === 'page_admin' ? 'เพจที่คุณได้รับมอบหมาย' : 'เพจ Facebook / Instagram ที่บริษัทรับดูแล'}
        action={canEdit && <button className="btn-primary" onClick={() => setEditing('new')}>+ เพิ่มเพจ</button>} />
      <Toolbar>
        <input className="input max-w-xs" placeholder="ค้นหาชื่อเพจ" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" />
        <select className="input max-w-[11rem]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="สถานะ">
          <option value="">ทุกสถานะ</option>{Object.entries(PAGE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Toolbar>
      {error && <Alert>{dbError({ message: error })}</Alert>}
      {loading && !data ? <Spinner /> : !data?.pages.length ? <Empty>ไม่พบเพจ</Empty> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-brand-soft text-left text-xs text-slate-600"><tr><th className="p-3">ชื่อเพจ</th><th className="p-3">ลูกค้า</th><th className="p-3">แพลตฟอร์ม</th><th className="p-3">ผู้รับผิดชอบ</th><th className="p-3">ลิงก์</th><th className="p-3">สถานะ</th>{canEdit && <th className="p-3" />}</tr></thead>
            <tbody>
              {data.pages.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-medium">{p.page_name}{p.notes && <div className="max-w-xs whitespace-pre-wrap text-xs font-normal text-slate-500">{p.notes}</div>}</td>
                  <td className="p-3"><Link className="text-brand-dark hover:underline" to={`/customers/${p.customers.id}`}>{p.customers.business_name}</Link></td>
                  <td className="p-3">{PLATFORM[p.platform]}</td>
                  <td className="p-3">{p.page_assignments.length ? p.page_assignments.map((a) => data.staff.get(a.staff_id) ?? '—').join(', ') : <span className="text-slate-400">ยังไม่มอบหมาย</span>}</td>
                  <td className="p-3 space-x-2">{p.page_url && <a className="text-brand-dark hover:underline" href={p.page_url} target="_blank" rel="noopener noreferrer">Facebook</a>}{p.instagram_url && <a className="text-brand-dark hover:underline" href={p.instagram_url} target="_blank" rel="noopener noreferrer">Instagram</a>}{!p.page_url && !p.instagram_url && '—'}</td>
                  <td className="p-3"><Badge tone={STATUS_TONE[p.status]}>{PAGE_STATUS[p.status]}</Badge></td>
                  {canEdit && <td className="p-3 text-right whitespace-nowrap space-x-3"><button className="text-brand-dark hover:underline" onClick={() => setAssigning(p)}>มอบหมาย</button><button className="text-brand-dark hover:underline" onClick={() => setEditing(p)}>แก้ไข</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && data && <PageForm initial={editing === 'new' ? undefined : editing} customers={data.customers} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} />}
      {assigning && <AssignStaffModal page={assigning} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); reload() }} />}
    </>
  )
}
