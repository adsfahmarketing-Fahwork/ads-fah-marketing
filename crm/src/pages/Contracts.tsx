import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Badge, Empty, Field, Modal, PageHeader, Spinner, Toolbar } from '../components/ui'
import { supabase } from '../lib/supabase'
import { cleanSearch, dbError, useAsync } from '../lib/useAsync'
import { CONTRACT_STATUS, STATUS_TONE, daysLeft, effectiveContractStatus, type ContractStatus } from '../lib/labels'
import { addDays, contractEndDate, formatMoney, formatThaiDate, todayBangkok } from '../lib/format'
import { isManagement } from '../lib/roles'

interface ContractRow {
  id: string; contract_no: string; customer_id: string; service_type: string; start_date: string; duration_days: number
  end_date: string; status: ContractStatus; cycle_no: number; cancel_reason: string | null; cancelled_at: string | null; notes: string | null
  customers: { business_name: string }
  contract_pages: { page_id: string; pages: { page_name: string } }[]
  contract_financials: { cycle_no: number; monthly_fee: number; ad_budget: number }[]
}

const SERVICES = ['ดูแลเพจ + ยิงโฆษณา', 'ดูแลเพจ', 'ยิงโฆษณา', 'ทำคอนเทนต์', 'อื่นๆ']

function ContractForm({ initial, canSeeMoney, onDone, onClose }: { initial?: ContractRow; canSeeMoney: boolean; onDone: () => void; onClose: () => void }) {
  const lists = useAsync(async () => {
    const [c, p] = await Promise.all([
      supabase.from('customers').select('id, business_name').order('business_name'),
      supabase.from('pages').select('id, page_name, customer_id').order('page_name'),
    ])
    return { customers: c.data ?? [], pages: p.data ?? [] }
  }, [])
  const cur = initial?.contract_financials.find((x) => x.cycle_no === initial.cycle_no)
  const [f, setF] = useState({
    customer_id: initial?.customer_id ?? '', service_type: initial?.service_type ?? SERVICES[0],
    start_date: initial?.start_date ?? todayBangkok(), duration_days: String(initial?.duration_days ?? 30),
    monthly_fee: cur ? String(cur.monthly_fee) : '', ad_budget: cur ? String(cur.ad_budget) : '', notes: initial?.notes ?? '',
    page_ids: initial?.contract_pages.map((x) => x.page_id) ?? ([] as string[]),
  })
  const [err, setErr] = useState<Record<string, string>>({})
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dur = Number(f.duration_days)
  const end = f.start_date && dur >= 1 ? contractEndDate(f.start_date, dur) : null
  const custPages = useMemo(() => (lists.data?.pages ?? []).filter((p) => p.customer_id === f.customer_id), [lists.data, f.customer_id])
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const e: Record<string, string> = {}
    if (!f.customer_id) e.customer_id = 'กรุณาเลือกลูกค้า'
    if (!f.page_ids.length) e.page_ids = 'กรุณาเลือกเพจอย่างน้อย 1 เพจ'
    if (!f.start_date) e.start_date = 'กรุณาระบุวันที่เริ่มดูแล'
    if (!Number.isInteger(dur) || dur < 1 || dur > 3650) e.duration_days = 'ระยะเวลาต้องเป็นจำนวนวัน 1–3650'
    if (canSeeMoney) {
      if (f.monthly_fee !== '' && !(Number(f.monthly_fee) >= 0)) e.monthly_fee = 'จำนวนเงินไม่ถูกต้อง'
      if (f.ad_budget !== '' && !(Number(f.ad_budget) >= 0)) e.ad_budget = 'จำนวนเงินไม่ถูกต้อง'
    }
    setErr(e); if (Object.keys(e).length) return
    setBusy(true); setFormErr(null)
    const fee = Number(f.monthly_fee || 0), budget = Number(f.ad_budget || 0)
    if (!initial) {
      const { error } = await supabase.rpc('create_contract', {
        p_customer_id: f.customer_id, p_service_type: f.service_type, p_start_date: f.start_date, p_duration_days: dur,
        p_monthly_fee: fee, p_ad_budget: budget, p_page_ids: f.page_ids, p_notes: f.notes.trim() || null,
      })
      setBusy(false)
      return error ? setFormErr(dbError(error)) : onDone()
    }
    const { error } = await supabase.from('contracts').update({ service_type: f.service_type, start_date: f.start_date, duration_days: dur, notes: f.notes.trim() || null }).eq('id', initial.id)
    if (error) { setBusy(false); return setFormErr(dbError(error)) }
    const old = new Set(initial.contract_pages.map((x) => x.page_id))
    const add = f.page_ids.filter((x) => !old.has(x)), del = [...old].filter((x) => !f.page_ids.includes(x))
    if (add.length) await supabase.from('contract_pages').insert(add.map((page_id) => ({ contract_id: initial.id, page_id })))
    if (del.length) await supabase.from('contract_pages').delete().eq('contract_id', initial.id).in('page_id', del)
    if (canSeeMoney) await supabase.from('contract_financials').update({ monthly_fee: fee, ad_budget: budget }).eq('contract_id', initial.id).eq('cycle_no', initial.cycle_no)
    await supabase.rpc('refresh_contract_statuses')
    setBusy(false); onDone()
  }

  return (
    <Modal title={initial ? `แก้ไขสัญญา ${initial.contract_no}` : 'สร้างสัญญาใหม่'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><Field label="ลูกค้า *" error={err.customer_id}>
          <select className="input" value={f.customer_id} disabled={!!initial} onChange={(e) => setF((p) => ({ ...p, customer_id: e.target.value, page_ids: [] }))}>
            <option value="">— เลือกลูกค้า —</option>{lists.data?.customers.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
          </select></Field></div>
        <div className="sm:col-span-2">
          <span className="label">เพจที่อยู่ในสัญญา *</span>
          {!f.customer_id ? <p className="text-sm text-slate-500">เลือกลูกค้าก่อน</p> : !custPages.length ? <Alert kind="info">ลูกค้ารายนี้ยังไม่มีเพจ — เพิ่มเพจที่หน้ารายละเอียดลูกค้าก่อน</Alert> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {custPages.map((p) => (
                <label key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" checked={f.page_ids.includes(p.id)} onChange={(e) => setF((s) => ({ ...s, page_ids: e.target.checked ? [...s.page_ids, p.id] : s.page_ids.filter((x) => x !== p.id) }))} />
                  {p.page_name}
                </label>))}
            </div>)}
          {err.page_ids && <span className="mt-1 block text-xs text-red-600">{err.page_ids}</span>}
        </div>
        <Field label="ประเภทบริการ"><input className="input" list="services" value={f.service_type} onChange={set('service_type')} /><datalist id="services">{SERVICES.map((s) => <option key={s} value={s} />)}</datalist></Field>
        <Field label="วันที่เริ่มดูแล *" error={err.start_date}><input className="input" type="date" value={f.start_date} onChange={set('start_date')} /></Field>
        <Field label="ระยะเวลาสัญญา (วัน)" error={err.duration_days} hint="ค่าเริ่มต้น 30 วันปฏิทิน นับวันเริ่มเป็นวันแรก"><input className="input" inputMode="numeric" value={f.duration_days} onChange={set('duration_days')} /></Field>
        <Field label="วันที่สิ้นสุดดูแล (คำนวณอัตโนมัติ)"><input className="input bg-slate-50" readOnly value={end ? formatThaiDate(end) : '—'} /></Field>
        {canSeeMoney ? (<>
          <Field label="ค่าบริการรายเดือน (บาท)" error={err.monthly_fee}><input className="input" inputMode="decimal" value={f.monthly_fee} onChange={set('monthly_fee')} /></Field>
          <Field label="งบโฆษณาต่อเดือน (บาท)" error={err.ad_budget}><input className="input" inputMode="decimal" value={f.ad_budget} onChange={set('ad_budget')} /></Field>
        </>) : !initial && (<>
          <Field label="ค่าบริการรายเดือน (บาท)"><input className="input" inputMode="decimal" value={f.monthly_fee} onChange={set('monthly_fee')} /></Field>
          <Field label="งบโฆษณาต่อเดือน (บาท)"><input className="input" inputMode="decimal" value={f.ad_budget} onChange={set('ad_budget')} /></Field>
        </>)}
        <div className="sm:col-span-2"><Field label="หมายเหตุ"><textarea className="input" rows={2} value={f.notes} onChange={set('notes')} /></Field></div>
        {formErr && <div className="sm:col-span-2"><Alert>{formErr}</Alert></div>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
      </form>
    </Modal>
  )
}

function RenewModal({ c, canSeeMoney, onDone, onClose }: { c: ContractRow; canSeeMoney: boolean; onDone: () => void; onClose: () => void }) {
  const cur = c.contract_financials.find((x) => x.cycle_no === c.cycle_no)
  const [start, setStart] = useState(addDays(c.end_date, 1))
  const [dur, setDur] = useState(String(c.duration_days))
  const [fee, setFee] = useState(cur ? String(cur.monthly_fee) : '')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const d = Number(dur)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!Number.isInteger(d) || d < 1) return setErr('ระยะเวลาไม่ถูกต้อง')
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('renew_contract', { p_contract_id: c.id, p_start_date: start, p_duration_days: d, p_monthly_fee: canSeeMoney && fee !== '' ? Number(fee) : null, p_notes: notes.trim() || null })
    setBusy(false); if (error) setErr(dbError(error)); else onDone()
  }
  return (
    <Modal title={`ต่อสัญญา ${c.contract_no}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert kind="info">รอบปัจจุบัน {formatThaiDate(c.start_date)} – {formatThaiDate(c.end_date)} จะถูกเก็บเป็นประวัติ และเปิดรอบที่ {c.cycle_no + 1}</Alert>
        <Field label="วันที่เริ่มรอบใหม่"><input className="input" type="date" min={addDays(c.end_date, 1)} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="ระยะเวลา (วัน)" hint={d >= 1 ? `สิ้นสุด ${formatThaiDate(contractEndDate(start, d))}` : undefined}><input className="input" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} /></Field>
        {canSeeMoney && <Field label="ค่าบริการรายเดือนรอบใหม่ (บาท)"><input className="input" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>}
        <Field label="หมายเหตุ"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {err && <Alert>{err}</Alert>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>ยกเลิก</button><button className="btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'ยืนยันต่อสัญญา'}</button></div>
      </form>
    </Modal>
  )
}

function CancelModal({ c, onDone, onClose }: { c: ContractRow; onDone: () => void; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayBangkok())
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return setErr('กรุณาระบุเหตุผลที่ยกเลิก')
    setBusy(true)
    const { error } = await supabase.from('contracts').update({ status: 'cancelled', cancel_reason: reason.trim(), cancelled_at: date }).eq('id', c.id)
    setBusy(false); if (error) setErr(dbError(error)); else onDone()
  }
  return (
    <Modal title={`ยกเลิกบริการ ${c.contract_no}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="วันที่ยกเลิก"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="เหตุผล *"><textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {err && <Alert>{err}</Alert>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>ไม่ยกเลิก</button><button className="btn-primary !bg-red-600 hover:!bg-red-700" disabled={busy}>ยืนยันยกเลิกบริการ</button></div>
      </form>
    </Modal>
  )
}

export function ContractList({ customerId, hideCustomer }: { customerId?: string; hideCustomer?: boolean }) {
  const { profile } = useAuth()
  const canEdit = isManagement(profile?.role)
  const canSeeMoney = profile?.role === 'owner' || (profile?.role === 'manager' && !!profile.can_view_revenue)
  const today = todayBangkok()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [modal, setModal] = useState<{ kind: 'form' | 'renew' | 'cancel'; c?: ContractRow } | null>(null)

  useEffect(() => { if (canEdit) void supabase.rpc('refresh_contract_statuses') }, [canEdit])

  const { data, loading, error, reload } = useAsync(async () => {
    if (canEdit) await supabase.rpc('refresh_contract_statuses')
    let query = supabase.from('contracts')
      .select('*, customers(business_name), contract_pages(page_id, pages(page_name)), contract_financials(cycle_no, monthly_fee, ad_budget)')
      .order('end_date', { ascending: true }).limit(500)
    if (customerId) query = query.eq('customer_id', customerId)
    const { data, error } = await query
    if (error) throw error
    return data as unknown as ContractRow[]
  }, [customerId])

  const rows = useMemo(() => {
    const s = cleanSearch(q).toLowerCase()
    return (data ?? []).map((c) => ({ c, st: effectiveContractStatus(c, today) }))
      .filter(({ c, st }) => (!status || st === status) && (!s || [c.contract_no, c.customers.business_name, ...c.contract_pages.map((p) => p.pages.page_name)].some((x) => x.toLowerCase().includes(s))))
  }, [data, q, status, today])

  const done = () => { setModal(null); reload() }
  return (
    <>
      {!customerId && <PageHeader title="สัญญา" subtitle={canEdit ? 'สัญญาดูแลเพจรายเดือนทั้งหมด' : 'สัญญาที่เกี่ยวข้องกับเพจที่คุณดูแล'}
        action={canEdit && <button className="btn-primary" onClick={() => setModal({ kind: 'form' })}>+ สร้างสัญญา</button>} />}
      {customerId && canEdit && <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setModal({ kind: 'form' })}>+ สร้างสัญญา</button></div>}
      {!customerId && <Toolbar>
        <input className="input max-w-xs" placeholder="ค้นหา เลขที่สัญญา / ลูกค้า / เพจ" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" />
        <select className="input max-w-[12rem]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="สถานะ">
          <option value="">ทุกสถานะ</option>{Object.entries(CONTRACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Toolbar>}
      {error && <Alert>{dbError({ message: error })}</Alert>}
      {loading && !data ? <Spinner /> : !rows.length ? <Empty>ไม่พบสัญญา</Empty> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-brand-soft text-left text-xs text-slate-600"><tr>
              <th className="p-3">เลขที่</th>{!hideCustomer && <th className="p-3">ลูกค้า</th>}<th className="p-3">เพจ / บริการ</th><th className="p-3">ระยะเวลา (รอบที่)</th><th className="p-3">เหลือ</th>
              {canSeeMoney && <th className="p-3 text-right">ค่าบริการ/เดือน</th>}<th className="p-3">สถานะ</th>{canEdit && <th className="p-3" />}</tr></thead>
            <tbody>
              {rows.map(({ c, st }) => {
                const fin = c.contract_financials.find((x) => x.cycle_no === c.cycle_no)
                const left = daysLeft(c.end_date, today)
                return (
                  <tr key={c.id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                    <td className="p-3 font-medium">{c.contract_no}</td>
                    {!hideCustomer && <td className="p-3"><Link className="text-brand-dark hover:underline" to={`/customers/${c.customer_id}`}>{c.customers.business_name}</Link></td>}
                    <td className="p-3"><div>{c.contract_pages.map((p) => p.pages.page_name).join(', ') || '—'}</div><div className="text-xs text-slate-500">{c.service_type}</div></td>
                    <td className="p-3">{formatThaiDate(c.start_date)} – {formatThaiDate(c.end_date)}<div className="text-xs text-slate-500">{c.duration_days} วัน · รอบที่ {c.cycle_no}</div></td>
                    <td className="p-3 whitespace-nowrap">{st === 'cancelled' ? '—' : left < 0 ? `เกิน ${-left} วัน` : left === 0 ? 'วันนี้วันสุดท้าย' : `${left} วัน`}</td>
                    {canSeeMoney && <td className="p-3 text-right">{formatMoney(fin?.monthly_fee)}</td>}
                    <td className="p-3"><Badge tone={STATUS_TONE[st]}>{CONTRACT_STATUS[st]}</Badge>{c.cancel_reason && <div className="mt-1 max-w-[12rem] text-xs text-slate-500">{c.cancel_reason}</div>}</td>
                    {canEdit && <td className="p-3 text-right whitespace-nowrap space-x-3">
                      <button className="text-brand-dark hover:underline" onClick={() => setModal({ kind: 'form', c })}>แก้ไข</button>
                      {st !== 'cancelled' && <button className="text-brand-dark hover:underline" onClick={() => setModal({ kind: 'renew', c })}>ต่อสัญญา</button>}
                      {st !== 'cancelled' && <button className="text-red-600 hover:underline" onClick={() => setModal({ kind: 'cancel', c })}>ยกเลิก</button>}
                    </td>}
                  </tr>)
              })}
            </tbody>
          </table>
        </div>)}
      {modal?.kind === 'form' && <ContractForm initial={modal.c} canSeeMoney={canSeeMoney} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'renew' && modal.c && <RenewModal c={modal.c} canSeeMoney={canSeeMoney} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'cancel' && modal.c && <CancelModal c={modal.c} onClose={() => setModal(null)} onDone={done} />}
    </>
  )
}

export const ContractsPage = () => <ContractList />
