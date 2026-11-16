import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Badge, Empty, PageHeader, Spinner } from '../components/ui'
import { supabase } from '../lib/supabase'
import { dbError, useAsync } from '../lib/useAsync'
import { CUSTOMER_STATUS, PAGE_STATUS, PLATFORM, STATUS_TONE } from '../lib/labels'
import { formatThaiDate } from '../lib/format'
import { isManagement } from '../lib/roles'
import { CustomerForm, type CustomerRow } from './Customers'
import { PageForm, type PageRow } from './PagesPage'
import { ContractList } from './Contracts'

export function CustomerDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile } = useAuth()
  const canEdit = isManagement(profile?.role)
  const [editCust, setEditCust] = useState(false)
  const [pageModal, setPageModal] = useState<PageRow | 'new' | null>(null)
  const [delErr, setDelErr] = useState<string | null>(null)

  const { data, loading, error, reload } = useAsync(async () => {
    const [c, p] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id!).maybeSingle(),
      supabase.from('pages').select('*').eq('customer_id', id!).order('created_at'),
    ])
    if (c.error) throw c.error
    return { customer: c.data as CustomerRow | null, pages: (p.data ?? []) as PageRow[] }
  }, [id])

  if (loading && !data) return <Spinner />
  if (error) return <Alert>{dbError({ message: error })}</Alert>
  if (!data?.customer) return <Empty>ไม่พบลูกค้า หรือคุณไม่มีสิทธิ์ดูข้อมูลนี้ · <Link className="text-brand-dark" to="/customers">กลับ</Link></Empty>
  const c = data.customer

  async function anonymize() {
    const typed = prompt(`ลบข้อมูลส่วนบุคคลของ "${c.business_name}" ตามคำขอ PDPA\n\nการกระทำนี้ย้อนกลับไม่ได้: ข้อมูลติดต่อ Brief ไฟล์แนบ และประวัติการแก้ไขที่มีข้อมูลส่วนบุคคลจะถูกลบ (สัญญา/ตัวเลขทางบัญชีคงอยู่)\n\nพิมพ์รหัสลูกค้า ${c.customer_code} เพื่อยืนยัน`)
    if (typed?.trim() !== c.customer_code) return
    const { data, error } = await supabase.rpc('anonymize_customer', { p_customer_id: c.id })
    if (error) return setDelErr(dbError(error))
    const paths = (data as { storage_paths?: string[] } | null)?.storage_paths ?? []
    for (let i = 0; i < paths.length; i += 100) await supabase.storage.from('brief-uploads').remove(paths.slice(i, i + 100))
    alert('ลบข้อมูลส่วนบุคคลเรียบร้อยแล้ว')
    reload()
  }
  async function remove() {
    if (!confirm(`ลบลูกค้า "${c.business_name}" ถาวร? (ลบได้เฉพาะลูกค้าที่ไม่มีเพจ/สัญญา)`)) return
    const { error } = await supabase.from('customers').delete().eq('id', c.id)
    if (error) setDelErr(dbError(error)); else nav('/customers')
  }
  const info: [string, string | null][] = [['ผู้ติดต่อ', c.contact_name], ['เบอร์โทร', c.phone], ['LINE ID', c.line_id], ['อีเมล', c.email], ['ประเภทธุรกิจ', c.business_type], ['เริ่มเป็นลูกค้า', formatThaiDate(c.started_at)]]

  return (
    <>
      <div className="mb-2 text-sm"><Link to="/customers" className="text-brand-dark hover:underline">← ลูกค้าทั้งหมด</Link></div>
      <PageHeader title={c.business_name} subtitle={`รหัส ${c.customer_code}`}
        action={canEdit && <div className="flex gap-2"><button className="btn-ghost" onClick={() => setEditCust(true)}>แก้ไข</button>{profile?.role === 'owner' && <><button className="btn-ghost" onClick={anonymize}>ลบข้อมูลส่วนบุคคล (PDPA)</button><button className="btn-ghost !text-red-600" onClick={remove}>ลบลูกค้า</button></>}</div>} />
      {delErr && <div className="mb-4"><Alert>{delErr}</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-1">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">ข้อมูลลูกค้า</h2><Badge tone={STATUS_TONE[c.status]}>{CUSTOMER_STATUS[c.status]}</Badge></div>
          <dl className="space-y-2 text-sm">{info.map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-slate-500">{k}</dt><dd className="text-right">{v || '—'}</dd></div>)}</dl>
          {c.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-brand-soft p-3 text-sm">{c.notes}</p>}
        </section>
        <section className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">เพจ ({data.pages.length})</h2>{canEdit && <button className="btn-ghost" onClick={() => setPageModal('new')}>+ เพิ่มเพจ</button>}</div>
          {!data.pages.length ? <Empty>ยังไม่มีเพจ</Empty> : (
            <ul className="divide-y divide-slate-100">
              {data.pages.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div><span className="font-medium">{p.page_name}</span> <span className="text-xs text-slate-500">({PLATFORM[p.platform]})</span>
                    <div className="space-x-3 text-xs">{p.page_url && <a className="text-brand-dark hover:underline" href={p.page_url} target="_blank" rel="noopener noreferrer">Facebook</a>}{p.instagram_url && <a className="text-brand-dark hover:underline" href={p.instagram_url} target="_blank" rel="noopener noreferrer">Instagram</a>}</div></div>
                  <div className="flex items-center gap-3"><Badge tone={STATUS_TONE[p.status]}>{PAGE_STATUS[p.status]}</Badge>{canEdit && <button className="text-brand-dark hover:underline" onClick={() => setPageModal(p)}>แก้ไข</button>}</div>
                </li>))}
            </ul>)}
        </section>
      </div>
      <h2 className="mb-3 mt-8 font-semibold">สัญญา</h2>
      <ContractList customerId={c.id} hideCustomer />
      {editCust && <CustomerForm initial={c} onClose={() => setEditCust(false)} onDone={() => { setEditCust(false); reload() }} />}
      {pageModal && <PageForm initial={pageModal === 'new' ? undefined : pageModal} customerId={c.id} customers={[{ id: c.id, business_name: c.business_name }]} onClose={() => setPageModal(null)} onDone={() => { setPageModal(null); reload() }} />}
    </>
  )
}
