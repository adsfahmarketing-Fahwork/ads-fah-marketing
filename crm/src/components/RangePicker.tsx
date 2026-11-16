import { PRESETS, presetRange, type PresetKey } from '../lib/range'

export function RangePicker({ preset, from, to, today, onChange }: { preset: PresetKey; from: string; to: string; today: string; onChange: (p: PresetKey, from: string, to: string) => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {PRESETS.map(([k, label]) => (
        <button key={k} onClick={() => { const r = k === 'custom' ? { from, to } : presetRange(k, today); onChange(k, r.from, r.to) }}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${preset === k ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-brand-soft'}`}>{label}</button>))}
      <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
      <input type="date" className="input !w-auto" value={from} max={to} onChange={(e) => e.target.value && onChange('custom', e.target.value, to)} aria-label="ตั้งแต่วันที่" />
      <span className="text-sm text-slate-500">ถึง</span>
      <input type="date" className="input !w-auto" value={to} min={from} onChange={(e) => e.target.value && onChange('custom', from, e.target.value)} aria-label="ถึงวันที่" />
    </div>
  )
}
