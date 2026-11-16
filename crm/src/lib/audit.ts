export const AUDIT_TABLES: Record<string, string> = {
  profiles: 'พนักงาน', customers: 'ลูกค้า', pages: 'เพจ', contracts: 'สัญญา', contract_financials: 'ค่าบริการสัญญา', contract_renewals: 'การต่อสัญญา',
  page_assignments: 'การมอบหมายเพจ', brief_links: 'ลิงก์ Brief', customer_briefs: 'Brief ลูกค้า', tasks: 'งาน',
}
export const AUDIT_ACTIONS: Record<string, string> = { INSERT: 'เพิ่ม', UPDATE: 'แก้ไข', DELETE: 'ลบ', ANONYMIZE: 'ลบข้อมูลส่วนบุคคล (PDPA)' }

type Json = Record<string, unknown> | null

/** ฟิลด์ที่เปลี่ยนระหว่างก่อน/หลัง (ไม่รวม updated_at) */
export function diffAudit(oldData: Json, newData: Json): { field: string; from: unknown; to: unknown }[] {
  if (!oldData || !newData) return []
  return Object.keys(newData).filter((k) => k !== 'updated_at' && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])).map((k) => ({ field: k, from: oldData[k], to: newData[k] }))
}

/** ชื่อที่อ่านออกของรายการ เพื่อแสดงในประวัติ */
export function auditLabel(d: Json): string {
  if (!d) return ''
  for (const k of ['business_name', 'page_name', 'title', 'contract_no', 'full_name', 'customer_code', 'label']) if (typeof d[k] === 'string' && d[k]) return d[k] as string
  return ''
}

export function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.length > 80 ? `${s.slice(0, 77)}…` : s
}
