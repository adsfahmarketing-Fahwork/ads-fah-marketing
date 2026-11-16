import { formatThaiDate, monthLabel } from './format'
import type { Section } from './export'

export interface Summary {
  customers_total: number; pages_active: number; pages_new: number; contracts_expiring: number; contracts_renewed: number; contracts_lost: number
  revenue: number | null; staff_active: number | null; tasks_open: number; tasks_overdue: number; briefs_pending: number
  monthly: { month: string; new_customers: number; new_pages: number; renewed: number; lost: number; revenue: number | null }[]
}
export interface Report {
  summary: Summary
  retention: { renewed: number; lost: number; rate: number | null }
  staff_pages: { staff: string; code: string; pages: number }[]
  staff_tasks: { staff: string; done: number; overdue: number; open: number }[]
  cancel_reasons: { reason: string; count: number }[]
  renewed_list: { contract_no: string; customer: string; cycle_no: number; new_start_date: string; new_end_date: string; renewed_on: string }[]
  lost_list: { contract_no: string; customer: string; end_date: string; cancelled_at: string | null; status: string; cancel_reason: string | null }[]
}

/** แปลงผลรายงานเป็นตารางพร้อมส่งออก — รายได้จะไม่อยู่ในไฟล์ถ้าผู้ใช้ไม่มีสิทธิ์ (revenue = null) */
export function buildSections(r: Report, range: { from: string; to: string }): Section[] {
  const s = r.summary
  const hasRev = s.revenue !== null
  const rate = r.retention.rate === null ? '—' : `${r.retention.rate}%`
  const summary: Section = {
    key: 'summary', title: 'สรุปภาพรวม', columns: ['รายการ', 'ค่า'],
    rows: [
      ['ช่วงวันที่', `${formatThaiDate(range.from)} – ${formatThaiDate(range.to)}`],
      ['จำนวนลูกค้าทั้งหมด', s.customers_total], ['จำนวนเพจที่กำลังดูแล', s.pages_active], ['เพจที่เริ่มดูแลใหม่ในช่วง', s.pages_new],
      ['สัญญาที่ต่อในช่วง', s.contracts_renewed], ['สัญญาที่ไม่ต่อ/ยกเลิกในช่วง', s.contracts_lost], ['อัตราการรักษาลูกค้า', rate],
      ...(hasRev ? [['รายได้ค่าบริการในช่วง (บาท)', s.revenue] as (string | number | null)[]] : []),
    ],
  }
  const monthly: Section = {
    key: 'monthly', title: 'รายเดือน',
    columns: ['เดือน', 'ลูกค้าใหม่', 'เพจเริ่มดูแลใหม่', 'ต่อสัญญา', 'ไม่ต่อสัญญา', ...(hasRev ? ['รายได้ค่าบริการ (บาท)'] : [])],
    rows: s.monthly.map((m) => [monthLabel(m.month), m.new_customers, m.new_pages, m.renewed, m.lost, ...(hasRev ? [m.revenue] : [])]),
  }
  return [
    summary, monthly,
    { key: 'renewed', title: 'สัญญาที่ต่อ', columns: ['เลขที่สัญญา', 'ลูกค้า', 'รอบที่', 'เริ่มรอบใหม่', 'สิ้นสุดรอบใหม่', 'วันที่บันทึกต่อ'],
      rows: r.renewed_list.map((x) => [x.contract_no, x.customer, x.cycle_no, formatThaiDate(x.new_start_date), formatThaiDate(x.new_end_date), formatThaiDate(x.renewed_on)]) },
    { key: 'lost', title: 'ไม่ต่อสัญญา', columns: ['เลขที่สัญญา', 'ลูกค้า', 'สิ้นสุด', 'ยกเลิกเมื่อ', 'สถานะ', 'เหตุผล'],
      rows: r.lost_list.map((x) => [x.contract_no, x.customer, formatThaiDate(x.end_date), formatThaiDate(x.cancelled_at), x.status === 'cancelled' ? 'ยกเลิกบริการ' : 'หมดสัญญา', x.cancel_reason ?? '']) },
    { key: 'reasons', title: 'เหตุผลที่ยกเลิก', columns: ['เหตุผล', 'จำนวน'], rows: r.cancel_reasons.map((x) => [x.reason, x.count]) },
    { key: 'staff_pages', title: 'เพจต่อพนักงาน', columns: ['รหัส', 'พนักงาน', 'จำนวนเพจที่ดูแล'], rows: r.staff_pages.map((x) => [x.code, x.staff, x.pages]) },
    { key: 'staff_tasks', title: 'งานต่อพนักงาน', columns: ['พนักงาน', 'งานที่เสร็จในช่วง', 'งานเกินกำหนด (ปัจจุบัน)', 'งานค้างทั้งหมด'], rows: r.staff_tasks.map((x) => [x.staff, x.done, x.overdue, x.open]) },
  ]
}
