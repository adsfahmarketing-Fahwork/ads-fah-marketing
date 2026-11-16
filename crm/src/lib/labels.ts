import { diffDays } from './format'

export const CUSTOMER_STATUS = { lead: 'ผู้สนใจ', active: 'ใช้บริการ', paused: 'พักบริการ', churned: 'เลิกใช้บริการ' } as const
export const PAGE_STATUS = { active: 'กำลังดูแล', paused: 'พักดูแล', ended: 'สิ้นสุดแล้ว' } as const
export const PLATFORM = { facebook: 'Facebook', instagram: 'Instagram' } as const
export const CONTRACT_STATUS = {
  pending_start: 'รอเริ่มงาน', active: 'กำลังดูแล', expiring: 'ใกล้หมดสัญญา',
  expired: 'หมดสัญญา', renewed: 'ต่อสัญญาแล้ว', cancelled: 'ยกเลิกบริการ',
} as const
export type ContractStatus = keyof typeof CONTRACT_STATUS

export const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700', renewed: 'bg-brand-soft text-brand-dark',
  pending_start: 'bg-slate-100 text-slate-600', expiring: 'bg-amber-50 text-amber-700',
  expired: 'bg-red-50 text-red-700', cancelled: 'bg-slate-200 text-slate-600',
  lead: 'bg-slate-100 text-slate-600', paused: 'bg-amber-50 text-amber-700', churned: 'bg-slate-200 text-slate-600', ended: 'bg-slate-200 text-slate-600',
}

/** สถานะที่แสดงผลตามวันที่จริง (ตรงกับ refresh_contract_statuses ในฐานข้อมูล) */
export function effectiveContractStatus(
  c: { status: ContractStatus; start_date: string; end_date: string }, today: string,
): ContractStatus {
  if (c.status === 'cancelled' || c.status === 'expired') return c.status
  if (today > c.end_date) return 'expired'
  let s = c.status
  if (s === 'pending_start' && c.start_date <= today) s = 'active'
  if ((s === 'active' || s === 'renewed') && diffDays(c.end_date, today) <= 7) s = 'expiring'
  return s
}

export const daysLeft = (endDate: string, today: string) => diffDays(endDate, today)

export const PHONE_RE = /^[0-9+\-\s()]{6,20}$/
export const URL_RE = /^https?:\/\//i
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export const TASK_STATUS = { todo: 'รอดำเนินการ', in_progress: 'กำลังดำเนินการ', in_review: 'รอตรวจสอบ', done: 'เสร็จสิ้น', overdue: 'เกินกำหนด' } as const
export const TASK_PRIORITY = { low: 'ต่ำ', medium: 'ปกติ', high: 'สูง', urgent: 'ด่วนมาก' } as const
export type TaskStatus = keyof typeof TASK_STATUS

export const TASK_TONE: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-600', in_progress: 'bg-brand-soft text-brand-dark', in_review: 'bg-amber-50 text-amber-700',
  done: 'bg-emerald-50 text-emerald-700', overdue: 'bg-red-50 text-red-700',
  low: 'bg-slate-100 text-slate-600', medium: 'bg-slate-100 text-slate-700', high: 'bg-amber-50 text-amber-700', urgent: 'bg-red-50 text-red-700',
}

/** สถานะที่แสดง: งานที่ยังไม่เสร็จและเลยวันครบกำหนด (ตามเวลาไทย) = เกินกำหนด */
export function taskDisplayStatus(t: { status: TaskStatus; due_date: string | null }, today: string): TaskStatus {
  if (t.status !== 'done' && t.due_date && t.due_date < today) return 'overdue'
  return t.status === 'overdue' ? 'todo' : t.status
}
export const isDueSoon = (t: { status: TaskStatus; due_date: string | null }, today: string, days = 3) =>
  t.status !== 'done' && !!t.due_date && t.due_date >= today && diffDays(t.due_date, today) <= days
