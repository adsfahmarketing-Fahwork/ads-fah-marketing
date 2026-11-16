import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Badge, Empty, PageHeader, Spinner } from '../components/ui'
import { BarChart } from '../components/BarChart'
import { RangePicker } from '../components/RangePicker'
import { supabase } from '../lib/supabase'
import { dbError, useAsync } from '../lib/useAsync'
import { addDays, formatMoney, formatThaiDate, todayBangkok } from '../lib/format'
import { presetRange, type PresetKey } from '../lib/range'
import { TASK_TONE } from '../lib/labels'
import type { Summary } from '../lib/reportSections'

function Kpi({ label, value, hint, to, tone }: { label: string; value: string | number; hint?: string; to?: string; tone?: 'warn' | 'bad' }) {
  const body = (
    <div className={`card h-full transition ${to ? 'hover:border-brand' : ''}`}>
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : ''}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>)
  return to ? <Link to={to} className="block">{body}</Link> : body
}

export function DashboardPage() {
  const { profile } = useAuth()
  const today = todayBangkok()
  const [preset, setPreset] = useState<PresetKey>('this_month')
  const [range, setRange] = useState(presetRange('this_month', today))
  const mgmt = profile?.role !== 'page_admin'

  const { data, loading, error } = useAsync(async () => {
    const { data, error } = await supabase.rpc('dashboard_summary', { p_from: range.from, p_to: range.to })
    if (error) throw error
    return data as Summary
  }, [range.from, range.to])

  const lists = useAsync(async () => {
    const [c, t] = await Promise.all([
      supabase.from('contracts').select('id, contract_no, end_date, customers(business_name)').not('status', 'in', '(cancelled,expired)').gte('end_date', today).lte('end_date', addDays(today, 7)).order('end_date').limit(5),
      supabase.from('tasks').select('id, title, due_date, pages(page_name)').neq('status', 'done').lt('due_date', today).order('due_date').limit(5),
    ])
    return { contracts: (c.data ?? []) as unknown as { id: string; contract_no: string; end_date: string; customers: { business_name: string } }[], tasks: (t.data ?? []) as unknown as { id: string; title: string; due_date: string; pages: { page_name: string } | null }[] }
  }, [])

  if (!profile) return null
  const months = data?.monthly.map((m) => m.month) ?? []
  const hasRev = data?.revenue !== null && data?.revenue !== undefined
  const rangeHint = 'ในช่วงที่เลือก'

  return (
    <>
      <PageHeader title={`สวัสดี ${profile.full_name || profile.email}`} subtitle={mgmt ? 'ภาพรวมบริษัท ADS FAH MARKETING' : 'ภาพรวมงานของคุณ — แสดงเฉพาะเพจและงานที่ได้รับมอบหมาย'} />
      {mgmt && <RangePicker preset={preset} from={range.from} to={range.to} today={today} onChange={(p, f, t) => { setPreset(p); setRange({ from: f, to: t }) }} />}
      {error && <Alert>{dbError({ message: error })}</Alert>}
      {loading && !data ? <Spinner /> : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={mgmt ? 'ลูกค้าทั้งหมด' : 'ลูกค้าที่ดูแล'} value={data.customers_total} to="/customers" />
            <Kpi label="เพจที่กำลังดูแล" value={data.pages_active} to="/pages" />
            {mgmt && <Kpi label="เพจที่เริ่มดูแลใหม่" value={data.pages_new} hint={rangeHint} />}
            <Kpi label="สัญญาใกล้หมดอายุ" value={data.contracts_expiring} hint="ภายใน 7 วันข้างหน้า" to="/contracts" tone={data.contracts_expiring ? 'warn' : undefined} />
            {mgmt && <Kpi label="สัญญาที่ต่ออายุแล้ว" value={data.contracts_renewed} hint={rangeHint} />}
            {mgmt && <Kpi label="ลูกค้าที่ไม่ต่อสัญญา" value={data.contracts_lost} hint={`${rangeHint} (รวมยกเลิกบริการ)`} tone={data.contracts_lost ? 'bad' : undefined} />}
            {hasRev && <Kpi label="รายได้ค่าบริการ" value={`฿${formatMoney(data.revenue)}`} hint={`${rangeHint} · นับตามเดือนที่รอบสัญญาเริ่ม`} />}
            {mgmt && <Kpi label="พนักงานที่ปฏิบัติงาน" value={data.staff_active ?? 0} to={profile.role === 'owner' || profile.role === 'manager' ? '/team' : undefined} />}
            <Kpi label="งานที่ยังไม่เสร็จ" value={data.tasks_open} to="/tasks" />
            <Kpi label="งานเกินกำหนด" value={data.tasks_overdue} to="/tasks" tone={data.tasks_overdue ? 'bad' : undefined} />
            <Kpi label="Brief รอตรวจสอบ" value={data.briefs_pending} to="/briefs" tone={data.briefs_pending ? 'warn' : undefined} />
          </div>

          {mgmt && (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <BarChart title="ลูกค้าใหม่ และเพจที่เริ่มดูแลใหม่ (รายเดือน)" months={months} series={[
                { name: 'ลูกค้าใหม่', color: '#10B9D1', values: data.monthly.map((m) => m.new_customers) },
                { name: 'เพจใหม่', color: '#111827', values: data.monthly.map((m) => m.new_pages) }]} />
              <BarChart title="ต่อสัญญา เทียบ ไม่ต่อสัญญา (รายเดือน)" months={months} series={[
                { name: 'ต่อสัญญา', color: '#10B9D1', values: data.monthly.map((m) => m.renewed) },
                { name: 'ไม่ต่อสัญญา', color: '#dc2626', values: data.monthly.map((m) => m.lost) }]} />
              {hasRev && <div className="lg:col-span-2"><BarChart title="รายได้ค่าบริการ (บาท/เดือน)" months={months} fmt={(n) => `฿${formatMoney(n)}`} series={[{ name: 'รายได้', color: '#10B9D1', values: data.monthly.map((m) => m.revenue) }]} /></div>}
            </div>)}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="card">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">สัญญาที่จะหมดภายใน 7 วัน</h2><Link to="/contracts" className="text-sm text-brand-dark hover:underline">ดูทั้งหมด</Link></div>
              {!lists.data?.contracts.length ? <Empty>ไม่มีสัญญาใกล้หมดอายุ</Empty> : <ul className="divide-y divide-slate-100 text-sm">{lists.data.contracts.map((c) => <li key={c.id} className="flex justify-between gap-3 py-2"><span><b>{c.customers.business_name}</b> <span className="text-slate-500">{c.contract_no}</span></span><Badge tone="bg-amber-50 text-amber-700">{formatThaiDate(c.end_date)}</Badge></li>)}</ul>}
            </section>
            <section className="card">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">งานเกินกำหนด</h2><Link to="/tasks" className="text-sm text-brand-dark hover:underline">ดูทั้งหมด</Link></div>
              {!lists.data?.tasks.length ? <Empty>ไม่มีงานเกินกำหนด 🎉</Empty> : <ul className="divide-y divide-slate-100 text-sm">{lists.data.tasks.map((t) => <li key={t.id} className="flex justify-between gap-3 py-2"><span><b>{t.title}</b> <span className="text-slate-500">{t.pages?.page_name}</span></span><Badge tone={TASK_TONE.overdue}>{formatThaiDate(t.due_date)}</Badge></li>)}</ul>}
            </section>
          </div>
        </>)}
    </>
  )
}
