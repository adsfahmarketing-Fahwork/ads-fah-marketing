import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Badge, Empty, Modal, PageHeader, Spinner, Toolbar } from '../components/ui'
import { supabase } from '../lib/supabase'
import { dbError, useAsync } from '../lib/useAsync'
import { formatMoney, formatThaiDate } from '../lib/format'

const STATUS = { new: 'ใหม่ รอตรวจสอบ', in_review: 'กำลังตรวจสอบ', reviewed: 'ตรวจสอบแล้ว' } as const
const TONE = { new: 'bg-amber-50 text-amber-700', in_review: 'bg-brand-soft text-brand-dark', reviewed: 'bg-emerald-50 text-emerald-700' } as const
type St = keyof typeof STATUS

interface Brief {
  id: string; status: St; version: number; submitted_at: string; reviewed_at: string | null; internal_notes: string | null
  business_name: string; contact_name: string; phone: string; line_id: string | null; fb_page_name: string | null; fb_page_url: string | null
  instagram_url: string | null; product_category: string | null; ad_budget_monthly: number | null; age_min: number | null; age_max: number | null
  provinces: string[]; target_audience: string | null; ad_objective: string | null; promote_items: string | null; current_promotion: string | null
  contact_link: string | null; extra_details: string | null; customers: { business_name: string } | null; pages: { page_name: string } | null
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="grid gap-1 py-2 text-sm sm:grid-cols-3"><dt className="text-slate-500">{k}</dt><dd className="whitespace-pre-wrap break-words sm:col-span-2">{v || '—'}</dd></div>
}
const link = (u: string | null) => u && /^https?:\/\//i.test(u) ? <a className="text-brand-dark hover:underline" href={u} target="_blank" rel="noopener noreferrer">{u}</a> : u

function BriefDetail({ b, onClose, onChanged }: { b: Brief; onClose: () => void; onChanged: () => void }) {
  const [notes, setNotes] = useState(b.internal_notes ?? '')
  const [err, setErr] = useState<string | null>(null)
  const files = useAsync(async () => {
    const { data } = await supabase.from('attachments').select('id, storage_path, file_name, mime_type, size_bytes').eq('entity_type', 'brief').eq('entity_id', b.id)
    return Promise.all((data ?? []).map(async (a) => ({ ...a, url: (await supabase.storage.from('brief-uploads').createSignedUrl(a.storage_path, 600)).data?.signedUrl ?? null })))
  }, [b.id])
  async function update(status: St) {
    setErr(null)
    const { error } = await supabase.from('customer_briefs').update({ status, internal_notes: notes.trim() || null }).eq('id', b.id)
    if (error) setErr(dbError(error)); else onChanged()
  }
  return (
    <Modal title={`Brief: ${b.business_name}`} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm"><Badge tone={TONE[b.status]}>{STATUS[b.status]}</Badge><span className="text-slate-500">ส่งเมื่อ {formatThaiDate(b.submitted_at)} · ครั้งที่ {b.version}{b.reviewed_at && ` · ตรวจสอบเมื่อ ${formatThaiDate(b.reviewed_at)}`}</span></div>
      <h3 className="mt-2 font-semibold text-brand-dark">ข้อมูลธุรกิจ</h3>
      <dl className="divide-y divide-slate-100">
        <Row k="ชื่อธุรกิจ" v={b.business_name} /><Row k="ผู้ติดต่อ" v={b.contact_name} /><Row k="เบอร์โทร" v={b.phone} /><Row k="LINE ID" v={b.line_id} />
        <Row k="Facebook Page" v={<>{b.fb_page_name} {link(b.fb_page_url)}</>} /><Row k="Instagram" v={link(b.instagram_url)} /><Row k="ประเภทสินค้า/บริการ" v={b.product_category} />
      </dl>
      <h3 className="mt-4 font-semibold text-brand-dark">ข้อมูลสำหรับยิงโฆษณา</h3>
      <dl className="divide-y divide-slate-100">
        <Row k="งบโฆษณา/เดือน" v={b.ad_budget_monthly != null ? `${formatMoney(b.ad_budget_monthly)} บาท` : null} />
        <Row k="ช่วงอายุ" v={b.age_min || b.age_max ? `${b.age_min ?? '-'} – ${b.age_max ?? '-'} ปี` : null} /><Row k="พื้นที่" v={b.provinces.join(', ')} />
        <Row k="กลุ่มเป้าหมาย" v={b.target_audience} /><Row k="วัตถุประสงค์" v={b.ad_objective} /><Row k="สินค้า/บริการที่โปรโมต" v={b.promote_items} />
        <Row k="โปรโมชั่นปัจจุบัน" v={b.current_promotion} /><Row k="ช่องทางติดต่อ" v={link(b.contact_link)} /><Row k="รายละเอียดเพิ่มเติม" v={b.extra_details} />
        <Row k="ไฟล์แนบ" v={files.loading ? 'กำลังโหลด…' : files.data?.length ? (
          <ul className="space-y-1">{files.data.map((f) => <li key={f.id}>{f.url ? <a className="text-brand-dark hover:underline" href={f.url} target="_blank" rel="noopener noreferrer">{f.file_name}</a> : f.file_name} <span className="text-xs text-slate-400">({Math.ceil(f.size_bytes / 1024)} KB)</span></li>)}</ul>) : null} />
      </dl>
      <label className="mt-4 block"><span className="label">บันทึกภายในของทีมงาน</span><textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {b.status !== 'in_review' && <button className="btn-ghost" onClick={() => update('in_review')}>กำลังตรวจสอบ</button>}
        {b.status !== 'reviewed' && <button className="btn-primary" onClick={() => update('reviewed')}>ตรวจสอบแล้ว</button>}
        {b.status === 'reviewed' && <button className="btn-ghost" onClick={() => update('reviewed')}>บันทึกหมายเหตุ</button>}
      </div>
    </Modal>
  )
}

export function BriefsPage() {
  const { profile } = useAuth()
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState<Brief | null>(null)
  const { data, loading, error, reload } = useAsync(async () => {
    let q = supabase.from('customer_briefs').select('*, customers(business_name), pages(page_name)').order('submitted_at', { ascending: false }).limit(300)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) throw error
    return data as unknown as Brief[]
  }, [status])
  return (
    <>
      <PageHeader title="Brief ลูกค้า" subtitle={profile?.role === 'page_admin' ? 'Brief ของเพจที่คุณดูแล' : 'ข้อมูลที่ลูกค้ากรอกผ่านลิงก์'} />
      <Toolbar><select className="input max-w-[12rem]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="สถานะ"><option value="">ทุกสถานะ</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Toolbar>
      {error && <Alert>{dbError({ message: error })}</Alert>}
      {loading && !data ? <Spinner /> : !data?.length ? <Empty>ยังไม่มี Brief</Empty> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-brand-soft text-left text-xs text-slate-600"><tr><th className="p-3">ลูกค้า / เพจ</th><th className="p-3">ผู้ติดต่อ</th><th className="p-3">ส่งเมื่อ</th><th className="p-3">ครั้งที่</th><th className="p-3">สถานะ</th></tr></thead>
            <tbody>{data.map((b) => (
              <tr key={b.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setOpen(b)}>
                <td className="p-3"><button className="font-medium text-brand-dark hover:underline">{b.customers?.business_name ?? b.business_name}</button><div className="text-xs text-slate-500">{b.pages?.page_name ?? '—'}</div></td>
                <td className="p-3">{b.contact_name}<div className="text-xs text-slate-500">{b.phone}</div></td><td className="p-3">{formatThaiDate(b.submitted_at)}</td><td className="p-3">{b.version}</td>
                <td className="p-3"><Badge tone={TONE[b.status]}>{STATUS[b.status]}</Badge></td></tr>))}</tbody>
          </table>
        </div>)}
      {open && <BriefDetail b={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); reload() }} />}
    </>
  )
}
