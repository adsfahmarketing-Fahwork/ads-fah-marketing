import { useState, type FormEvent } from 'react'
import { Alert, Badge, Empty, Field, PageHeader, Spinner } from '../components/ui'
import { supabase } from '../lib/supabase'
import { dbError, useAsync } from '../lib/useAsync'
import { formatThaiDate } from '../lib/format'
import { appUrl } from '../lib/basePath'

interface LinkRow {
  id: string; label: string | null; expires_at: string; revoked_at: string | null; max_submissions: number; submission_count: number
  created_at: string; customers: { business_name: string }; pages: { page_name: string } | null
}

export const customerMessage = (url: string) =>
  `ขอข้อมูลเพื่อ Record รายละเอียด\n(ดูแลเพจ 30 วัน)\n\n📍ข้อมูลสำหรับยิง Ads\n\nPage :\n\n“สำหรับยิงแอดโฆษณา”\n\n1. งบประมาณต่อเดือน\n2. ช่วงอายุของลูกค้า\n3. บริเวณ เขตพื้นที่ต้องการที่จะยิง\n4. Target เป็นกลุ่มคนไหน\n\nกรอกข้อมูลได้ที่ลิงก์นี้ค่ะ 👇\n${url}\n\n**ขอทราบข้อมูลเบื้องต้นไว้นะคะ นอกนั้นเดี๋ยวเป็นหน้าที่ของทางทีมฟ้านำส่งโฆษณา หากลุ่มเป้าหมายให้เองค่ะ`

export const briefUrl = (token: string) => appUrl(`/brief/${token}`)

function linkState(l: LinkRow, now = Date.now()) {
  if (l.revoked_at) return ['ยกเลิกแล้ว', 'bg-slate-200 text-slate-600'] as const
  if (new Date(l.expires_at).getTime() <= now) return ['หมดอายุ', 'bg-red-50 text-red-700'] as const
  if (l.submission_count >= l.max_submissions) return ['ใช้ครบแล้ว', 'bg-amber-50 text-amber-700'] as const
  return ['ใช้งานได้', 'bg-emerald-50 text-emerald-700'] as const
}

export function BriefBuilderPage() {
  const lists = useAsync(async () => {
    const [c, p, l] = await Promise.all([
      supabase.from('customers').select('id, business_name').order('business_name'),
      supabase.from('pages').select('id, page_name, customer_id').neq('status', 'ended').order('page_name'),
      supabase.from('brief_links').select('id, label, expires_at, revoked_at, max_submissions, submission_count, created_at, customers(business_name), pages(page_name)').order('created_at', { ascending: false }).limit(200),
    ])
    return { customers: c.data ?? [], pages: p.data ?? [], links: (l.data ?? []) as unknown as LinkRow[] }
  }, [])
  const [f, setF] = useState({ customer_id: '', page_id: '', label: '', days: '14', max: '5' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedMsg, setCopiedMsg] = useState(false)
  const custPages = (lists.data?.pages ?? []).filter((p) => p.customer_id === f.customer_id)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const days = Number(f.days), max = Number(f.max)
    if (!f.customer_id || !f.page_id) return setErr('กรุณาเลือกลูกค้าและเพจ')
    if (!Number.isInteger(days) || days < 1 || days > 90) return setErr('วันหมดอายุต้องอยู่ระหว่าง 1–90 วัน')
    if (!Number.isInteger(max) || max < 1 || max > 50) return setErr('จำนวนครั้งที่ส่งได้ต้องอยู่ระหว่าง 1–50')
    setBusy(true); setErr(null); setCreated(null); setCopied(false)
    const { data, error } = await supabase.rpc('create_brief_link', { p_customer_id: f.customer_id, p_page_id: f.page_id, p_label: f.label || null, p_expires_days: days, p_max_submissions: max })
    setBusy(false)
    if (error || !data?.[0]) return setErr(dbError(error))
    setCreated(briefUrl(data[0].token)); setCopiedMsg(false); lists.reload()
  }
  async function revoke(id: string) {
    if (!confirm('ยกเลิกลิงก์นี้? ลูกค้าจะเปิดฟอร์มไม่ได้อีก')) return
    await supabase.from('brief_links').update({ revoked_at: new Date().toISOString() }).eq('id', id)
    lists.reload()
  }
  async function copy() {
    if (!created) return
    try { await navigator.clipboard.writeText(created); setCopied(true) } catch { setCopied(false) }
  }

  async function copyMsg() {
    if (!created) return
    try { await navigator.clipboard.writeText(customerMessage(created)); setCopiedMsg(true) } catch { setCopiedMsg(false) }
  }

  return (
    <>
      <PageHeader title="สร้างลิงก์รับ Brief" subtitle="สร้างลิงก์เฉพาะลูกค้าแต่ละราย เพื่อให้ลูกค้ากรอกข้อมูลสำหรับวางแผนโฆษณาด้วยตนเอง" />
      <form onSubmit={submit} className="card mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate>
        <Field label="ลูกค้า *"><select className="input" value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value, page_id: '' })}><option value="">— เลือกลูกค้า —</option>{lists.data?.customers.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}</select></Field>
        <Field label="เพจ *"><select className="input" value={f.page_id} onChange={(e) => setF({ ...f, page_id: e.target.value })} disabled={!f.customer_id}><option value="">— เลือกเพจ —</option>{custPages.map((p) => <option key={p.id} value={p.id}>{p.page_name}</option>)}</select></Field>
        <Field label="ชื่อเรียกลิงก์ (ไม่บังคับ)"><input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} maxLength={200} /></Field>
        <Field label="หมดอายุภายใน (วัน)" hint="1–90 วัน"><input className="input" inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field>
        <Field label="ส่งได้สูงสุด (ครั้ง)" hint="ลูกค้าส่งซ้ำเพื่อแก้ไขได้ตามจำนวนนี้"><input className="input" inputMode="numeric" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></Field>
        <div className="flex items-end"><button className="btn-primary w-full" disabled={busy}>{busy ? 'กำลังสร้าง…' : 'สร้างลิงก์รับ Brief'}</button></div>
        {err && <div className="sm:col-span-2 lg:col-span-3"><Alert>{err}</Alert></div>}
      </form>

      {created && (
        <div className="mb-6"><Alert kind="success">
          <p className="mb-2 font-semibold">สร้างลิงก์สำเร็จ — คัดลอกและส่งให้ลูกค้าได้เลย</p>
          <div className="flex flex-wrap items-center gap-2"><input readOnly className="input flex-1 font-mono text-xs" value={created} onFocus={(e) => e.target.select()} /><button type="button" className="btn-ghost" onClick={copy}>{copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}</button><button type="button" className="btn-primary" onClick={copyMsg}>{copiedMsg ? 'คัดลอกแล้ว ✓' : 'คัดลอกข้อความส่งลูกค้า'}</button></div>
          <p className="mt-2 text-xs">เพื่อความปลอดภัย ระบบเก็บเฉพาะค่า hash ของลิงก์ จะแสดงลิงก์นี้ให้เห็นเพียงครั้งเดียว หากทำหาย ให้สร้างลิงก์ใหม่และยกเลิกลิงก์เดิม</p>
        </Alert></div>)}

      <h2 className="mb-3 font-semibold">ลิงก์ที่สร้างไว้</h2>
      {lists.loading && !lists.data ? <Spinner /> : !lists.data?.links.length ? <Empty>ยังไม่มีลิงก์</Empty> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-brand-soft text-left text-xs text-slate-600"><tr><th className="p-3">ลูกค้า / เพจ</th><th className="p-3">ชื่อลิงก์</th><th className="p-3">สร้างเมื่อ</th><th className="p-3">หมดอายุ</th><th className="p-3 text-center">ส่งแล้ว</th><th className="p-3">สถานะ</th><th className="p-3" /></tr></thead>
            <tbody>
              {lists.data.links.map((l) => { const [txt, tone] = linkState(l); return (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="p-3"><div className="font-medium">{l.customers.business_name}</div><div className="text-xs text-slate-500">{l.pages?.page_name ?? '—'}</div></td>
                  <td className="p-3">{l.label ?? '—'}</td><td className="p-3">{formatThaiDate(l.created_at)}</td><td className="p-3">{formatThaiDate(l.expires_at)}</td>
                  <td className="p-3 text-center">{l.submission_count}/{l.max_submissions}</td><td className="p-3"><Badge tone={tone}>{txt}</Badge></td>
                  <td className="p-3 text-right">{txt === 'ใช้งานได้' && <button className="text-red-600 hover:underline" onClick={() => revoke(l.id)}>ยกเลิกลิงก์</button>}</td>
                </tr>) })}
            </tbody>
          </table>
        </div>)}
    </>
  )
}
