import { useMemo, useState } from 'react'
import { Alert, Empty, PageHeader, Spinner } from '../components/ui'
import { BarChart } from '../components/BarChart'
import { RangePicker } from '../components/RangePicker'
import { supabase } from '../lib/supabase'
import { dbError, useAsync } from '../lib/useAsync'
import { formatMoney, todayBangkok } from '../lib/format'
import { presetRange, type PresetKey } from '../lib/range'
import { buildSections, type Report } from '../lib/reportSections'
import { downloadCsv, downloadXlsx } from '../lib/export'

export function ReportsPage() {
  const today = todayBangkok()
  const [preset, setPreset] = useState<PresetKey>('6m')
  const [range, setRange] = useState(presetRange('6m', today))
  const [busy, setBusy] = useState(false)
  const { data, loading, error } = useAsync(async () => {
    const { data, error } = await supabase.rpc('report_data', { p_from: range.from, p_to: range.to })
    if (error) throw error
    return data as Report
  }, [range.from, range.to])
  const sections = useMemo(() => (data ? buildSections(data, range) : []), [data, range])
  const months = data?.summary.monthly.map((m) => m.month) ?? []
  const hasRev = data?.summary.revenue !== null && data?.summary.revenue !== undefined
  const fname = `ADS-FAH-report_${range.from}_${range.to}`

  async function xlsx() { setBusy(true); try { await downloadXlsx(sections, fname) } finally { setBusy(false) } }

  return (
    <>
      <PageHeader title="รายงาน" subtitle="สรุปผลการดำเนินงานของบริษัท" action={data && (
        <div className="flex gap-2"><button className="btn-ghost" onClick={() => downloadCsv(sections, fname)}>ส่งออก CSV</button><button className="btn-primary" disabled={busy} onClick={xlsx}>{busy ? 'กำลังสร้างไฟล์…' : 'ส่งออก Excel'}</button></div>)} />
      <RangePicker preset={preset} from={range.from} to={range.to} today={today} onChange={(p, f, t) => { setPreset(p); setRange({ from: f, to: t }) }} />
      {error && <Alert>{dbError({ message: error })}</Alert>}
      {loading && !data ? <Spinner /> : data && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[['อัตราการรักษาลูกค้า', data.retention.rate === null ? '—' : `${data.retention.rate}%`, `ต่อ ${data.retention.renewed} · ไม่ต่อ/ยกเลิก ${data.retention.lost}`],
              ['สัญญาที่ต่อในช่วง', data.summary.contracts_renewed, ''], ['ไม่ต่อสัญญา/ยกเลิก', data.summary.contracts_lost, ''],
              ['รายได้ค่าบริการ', hasRev ? `฿${formatMoney(data.summary.revenue)}` : 'ไม่มีสิทธิ์ดู', hasRev ? 'นับตามเดือนที่รอบสัญญาเริ่ม' : 'ติดต่อ Owner']].map(([l, v, h]) => (
              <div key={String(l)} className="card"><div className="text-sm text-slate-500">{l}</div><div className="mt-1 text-2xl font-bold">{v}</div>{h && <div className="mt-1 text-xs text-slate-400">{h}</div>}</div>))}
          </div>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <BarChart title="ลูกค้าใหม่ / เพจใหม่" months={months} series={[{ name: 'ลูกค้าใหม่', color: '#10B9D1', values: data.summary.monthly.map((m) => m.new_customers) }, { name: 'เพจใหม่', color: '#111827', values: data.summary.monthly.map((m) => m.new_pages) }]} />
            <BarChart title="ต่อสัญญา / ไม่ต่อสัญญา" months={months} series={[{ name: 'ต่อสัญญา', color: '#10B9D1', values: data.summary.monthly.map((m) => m.renewed) }, { name: 'ไม่ต่อสัญญา', color: '#dc2626', values: data.summary.monthly.map((m) => m.lost) }]} />
            {hasRev && <div className="lg:col-span-2"><BarChart title="รายได้ค่าบริการรายเดือน (บาท)" months={months} fmt={(n) => `฿${formatMoney(n)}`} series={[{ name: 'รายได้', color: '#10B9D1', values: data.summary.monthly.map((m) => m.revenue) }]} /></div>}
          </div>
          <div className="space-y-6">
            {sections.filter((s) => s.key !== 'summary').map((s) => (
              <section key={s.key}>
                <h2 className="mb-2 font-semibold">{s.title}</h2>
                {!s.rows.length ? <Empty>ไม่มีข้อมูลในช่วงนี้</Empty> : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="w-full min-w-[520px] text-sm"><thead className="bg-brand-soft text-left text-xs text-slate-600"><tr>{s.columns.map((c) => <th key={c} className="p-3">{c}</th>)}</tr></thead>
                      <tbody>{s.rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{r.map((c, j) => <td key={j} className="p-3">{typeof c === 'number' && j > 0 && /บาท/.test(s.columns[j]) ? formatMoney(c) : (c ?? '—')}</td>)}</tr>)}</tbody></table>
                  </div>)}
              </section>))}
          </div>
        </>)}
    </>
  )
}
