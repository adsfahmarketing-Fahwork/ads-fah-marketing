const TZ = 'Asia/Bangkok'

/** วันที่ปัจจุบันตามเขตเวลา Asia/Bangkok รูปแบบ YYYY-MM-DD */
export function todayBangkok(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const toUTC = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
export const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const addDays = (iso: string, n: number) => fromUTC(toUTC(iso) + n * 86400000)
export const diffDays = (a: string, b: string) => Math.round((toUTC(a) - toUTC(b)) / 86400000)

/** นับวันเริ่มเป็นวันแรก: เริ่ม 1 ธ.ค. + 30 วัน = สิ้นสุด 30 ธ.ค. (ตรงกับ end_date ในฐานข้อมูล) */
export const contractEndDate = (start: string, durationDays: number) => addDays(start, durationDays - 1)

export function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })
}

export const formatMoney = (n: number | string | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`
export function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`
}
export const monthEnd = (iso: string) => addDays(addMonths(iso, 1), -1)
export const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('th-TH', { month: 'short', year: '2-digit', timeZone: 'UTC' })
