import { addMonths, monthEnd, monthStart } from './format'

export type PresetKey = 'this_month' | 'last_month' | '3m' | '6m' | 'year' | 'custom'
export const PRESETS: [PresetKey, string][] = [['this_month', 'เดือนนี้'], ['last_month', 'เดือนที่แล้ว'], ['3m', '3 เดือน'], ['6m', '6 เดือน'], ['year', 'ปีนี้'], ['custom', 'กำหนดเอง']]

/** ช่วงวันที่ของแต่ละตัวเลือก (อิงวันที่ปัจจุบันตามเวลาไทย) */
export function presetRange(key: PresetKey, today: string): { from: string; to: string } {
  const m = monthStart(today)
  switch (key) {
    case 'last_month': return { from: addMonths(m, -1), to: monthEnd(addMonths(m, -1)) }
    case '3m': return { from: addMonths(m, -2), to: monthEnd(m) }
    case '6m': return { from: addMonths(m, -5), to: monthEnd(m) }
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }
    default: return { from: m, to: monthEnd(m) }
  }
}
