import { monthLabel } from '../lib/format'

export interface BarSeries { name: string; color: string; values: (number | null)[] }

function niceMax(v: number) {
  if (v <= 0) return 4
  const p = 10 ** Math.floor(Math.log10(v)); const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10) * p
}

/** กราฟแท่งเปรียบเทียบรายเดือน (SVG) พร้อมคำอธิบายสำหรับ screen reader */
export function BarChart({ title, months, series, fmt = (n: number) => n.toLocaleString('th-TH') }: { title: string; months: string[]; series: BarSeries[]; fmt?: (n: number) => string }) {
  const W = 640, H = 240, L = 46, R = 8, T = 12, B = 30
  const vals = series.flatMap((s) => s.values.map((v) => v ?? 0))
  const top = Math.max(0, ...vals)
  // ข้อมูลเป็นจำนวนนับ: ให้แกนเป็นจำนวนเต็มเสมอ (ไม่ขึ้น 1.3, 3.8)
  const max = vals.every(Number.isInteger) && top <= 20 ? Math.max(4, Math.ceil(top / 4) * 4) : niceMax(top)
  const gw = (W - L - R) / Math.max(months.length, 1)
  const bw = Math.min(26, (gw * 0.8) / series.length)
  const y = (v: number) => T + (H - T - B) * (1 - v / max)
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i)
  const showVals = months.length <= 8 && series.length <= 2
  return (
    <figure className="card">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="flex flex-wrap gap-3 text-xs text-slate-600">{series.map((s) => <span key={s.name} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title}: ${months.map((m, i) => `${monthLabel(m)} ${series.map((s) => `${s.name} ${s.values[i] ?? 0}`).join(', ')}`).join('; ')}`}>
        {ticks.map((tv) => (<g key={tv}><line x1={L} x2={W - R} y1={y(tv)} y2={y(tv)} stroke="#e2e8f0" /><text x={L - 6} y={y(tv) + 4} textAnchor="end" fontSize="11" fill="#64748b">{tv >= 1000 ? `${+(tv / 1000).toFixed(1)}k` : +tv.toFixed(1)}</text></g>))}
        {months.map((m, i) => {
          const x0 = L + gw * i + (gw - bw * series.length) / 2
          return (<g key={m}>
            {series.map((s, j) => { const v = s.values[i] ?? 0; const yy = y(v); return (
              <g key={s.name}><rect x={x0 + bw * j} y={yy} width={bw - 2} height={Math.max(0, H - B - yy)} rx="3" fill={s.color}><title>{`${monthLabel(m)} · ${s.name}: ${fmt(v)}`}</title></rect>
                {showVals && v > 0 && <text x={x0 + bw * j + (bw - 2) / 2} y={yy - 4} textAnchor="middle" fontSize="10" fill="#334155">{fmt(v)}</text>}</g>) })}
            <text x={L + gw * i + gw / 2} y={H - 10} textAnchor="middle" fontSize="11" fill="#64748b">{monthLabel(m)}</text>
          </g>)
        })}
      </svg>
    </figure>
  )
}
