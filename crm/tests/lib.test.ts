import { describe, expect, it } from 'vitest'
import { addDays, contractEndDate, diffDays, formatThaiDate, todayBangkok } from '../src/lib/format'
import { effectiveContractStatus } from '../src/lib/labels'
import { cleanSearch, dbError } from '../src/lib/useAsync'

describe('วันที่สัญญา (Asia/Bangkok)', () => {
  it('เริ่ม 1 ธ.ค. 2569 (2026) 30 วัน -> สิ้นสุด 30 ธ.ค.', () => {
    expect(contractEndDate('2026-12-01', 30)).toBe('2026-12-30')
    expect(formatThaiDate('2026-12-30')).toContain('2569')
  })
  it('ข้ามเดือน/ปีอธิกสุรทิน', () => {
    expect(contractEndDate('2027-01-30', 30)).toBe('2027-02-28')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(diffDays('2026-12-30', '2026-12-01')).toBe(29)
  })
  it('todayBangkok ใช้เวลาไทย (UTC+7)', () => {
    expect(todayBangkok(new Date('2026-12-01T18:00:00Z'))).toBe('2026-12-02')
    expect(todayBangkok(new Date('2026-12-01T16:59:00Z'))).toBe('2026-12-01')
  })
})

describe('สถานะสัญญาตามวัน', () => {
  const c = (status: any) => ({ status, start_date: '2026-12-01', end_date: '2026-12-30' })
  it('รอเริ่ม -> กำลังดูแล -> ใกล้หมด -> หมดสัญญา', () => {
    expect(effectiveContractStatus(c('pending_start'), '2026-11-30')).toBe('pending_start')
    expect(effectiveContractStatus(c('pending_start'), '2026-12-01')).toBe('active')
    expect(effectiveContractStatus(c('active'), '2026-12-22')).toBe('active')
    expect(effectiveContractStatus(c('active'), '2026-12-23')).toBe('expiring')
    expect(effectiveContractStatus(c('expiring'), '2026-12-30')).toBe('expiring')
    expect(effectiveContractStatus(c('active'), '2026-12-31')).toBe('expired')
  })
  it('ยกเลิกแล้วไม่เปลี่ยน; ต่อสัญญาแล้วคงสถานะจนใกล้หมด', () => {
    expect(effectiveContractStatus(c('cancelled'), '2027-06-01')).toBe('cancelled')
    expect(effectiveContractStatus(c('renewed'), '2026-12-10')).toBe('renewed')
  })
})

describe('ตัวช่วยอื่น', () => {
  it('cleanSearch ตัดอักขระอันตรายต่อตัวกรอง', () => expect(cleanSearch('a,b(c)%d*')).toBe('a b c  d'))
  it('dbError แปลเป็นไทยและไม่เผยข้อความดิบ', () => {
    expect(dbError({ code: '42501' })).toBe('ไม่มีสิทธิ์ทำรายการนี้')
    expect(dbError({ code: 'XX', message: 'internal pg stack trace' })).not.toContain('pg stack')
  })
})

import { isDueSoon, taskDisplayStatus } from '../src/lib/labels'
describe('สถานะงาน (เกินกำหนดคำนวณจากวันครบกำหนด)', () => {
  const T = (status: any, due: string | null) => ({ status, due_date: due })
  it('เลยกำหนดและยังไม่เสร็จ = เกินกำหนด; เสร็จแล้วไม่เกินกำหนด; วันนี้ยังไม่เกิน', () => {
    expect(taskDisplayStatus(T('in_progress', '2026-12-01'), '2026-12-02')).toBe('overdue')
    expect(taskDisplayStatus(T('done', '2026-12-01'), '2026-12-02')).toBe('done')
    expect(taskDisplayStatus(T('todo', '2026-12-02'), '2026-12-02')).toBe('todo')
    expect(taskDisplayStatus(T('todo', null), '2026-12-02')).toBe('todo')
  })
  it('ใกล้ถึงกำหนด ≤ 3 วัน', () => {
    expect(isDueSoon(T('todo', '2026-12-05'), '2026-12-02')).toBe(true)
    expect(isDueSoon(T('todo', '2026-12-06'), '2026-12-02')).toBe(false)
    expect(isDueSoon(T('done', '2026-12-03'), '2026-12-02')).toBe(false)
    expect(isDueSoon(T('todo', '2026-12-01'), '2026-12-02')).toBe(false)
  })
})

import { toCsv } from '../src/lib/export'
import { addMonths, monthEnd, monthStart } from '../src/lib/format'
import { presetRange } from '../src/lib/range'
import { buildSections, type Report } from '../src/lib/reportSections'

describe('ช่วงวันที่ของรายงาน', () => {
  it('เดือน/ข้ามปี/ปีอธิกสุรทิน', () => {
    expect(addMonths('2026-11-16', 3)).toBe('2027-02-01'); expect(addMonths('2026-01-10', -2)).toBe('2025-11-01')
    expect(monthEnd('2028-02-10')).toBe('2028-02-29'); expect(monthEnd('2026-12-05')).toBe('2026-12-31'); expect(monthStart('2026-12-05')).toBe('2026-12-01')
  })
  it('presets', () => {
    expect(presetRange('this_month', '2026-11-16')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(presetRange('last_month', '2026-01-16')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(presetRange('6m', '2026-11-16')).toEqual({ from: '2026-06-01', to: '2026-11-30' })
    expect(presetRange('year', '2026-11-16')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })
})

describe('ส่งออก CSV/Excel', () => {
  it('ใส่ BOM, escape เครื่องหมายคำพูด/คอมมา/ขึ้นบรรทัดใหม่', () => {
    const c = toCsv([{ key: 'a', title: 'ก', columns: ['ชื่อ', 'ค่า'], rows: [['ร้าน "เอ", สาขา 1', 5], ['บรรทัด\nใหม่', null]] }])
    expect(c.charCodeAt(0)).toBe(0xfeff)
    expect(c).toContain('"ร้าน ""เอ"", สาขา 1",5'); expect(c).toContain('"บรรทัด\nใหม่",')
  })
  it('กัน CSV/Formula injection', () => {
    const c = toCsv([{ key: 'a', title: 'ก', columns: ['x'], rows: [['=HYPERLINK("http://evil")'], ['+1+1'], ['@SUM(A1)'], ['-2+3'], [-5]] }])
    expect(c).toContain("'=HYPERLINK"); expect(c).toContain("'+1+1"); expect(c).toContain("'@SUM"); expect(c).toContain("'-2+3"); expect(c).toContain('\r\n-5\r\n')
  })
  it('หลายส่วนมีหัวข้อคั่น', () => {
    const c = toCsv([{ key: 'a', title: 'ส่วนหนึ่ง', columns: ['x'], rows: [[1]] }, { key: 'b', title: 'ส่วนสอง', columns: ['y'], rows: [[2]] }])
    expect(c).toContain('ส่วนหนึ่ง'); expect(c).toContain('ส่วนสอง')
  })
  const rep = (revenue: number | null): Report => ({
    summary: { customers_total: 1, pages_active: 1, pages_new: 0, contracts_expiring: 0, contracts_renewed: 0, contracts_lost: 0, revenue, staff_active: 1, tasks_open: 0, tasks_overdue: 0, briefs_pending: 0, monthly: [{ month: '2026-11', new_customers: 1, new_pages: 0, renewed: 0, lost: 0, revenue }] },
    retention: { renewed: 0, lost: 0, rate: null }, staff_pages: [], staff_tasks: [], cancel_reasons: [], renewed_list: [], lost_list: [],
  })
  it('ไม่มีสิทธิ์รายได้ = ไม่มีคอลัมน์/ตัวเลขรายได้ในไฟล์ส่งออก', () => {
    const noRev = JSON.stringify(buildSections(rep(null), { from: '2026-11-01', to: '2026-11-30' }))
    expect(noRev).not.toContain('รายได้')
    const withRev = JSON.stringify(buildSections(rep(9000), { from: '2026-11-01', to: '2026-11-30' }))
    expect(withRev).toContain('รายได้'); expect(withRev).toContain('9000')
  })
})

import { auditLabel, diffAudit, fmtVal } from '../src/lib/audit'
describe('ประวัติการแก้ไข (audit viewer)', () => {
  it('diff แสดงเฉพาะฟิลด์ที่เปลี่ยน ไม่รวม updated_at', () => {
    expect(diffAudit({ a: 1, b: 'x', updated_at: '1' }, { a: 2, b: 'x', updated_at: '2' })).toEqual([{ field: 'a', from: 1, to: 2 }])
    expect(diffAudit(null, { a: 1 })).toEqual([])
  })
  it('ป้ายชื่อ + การตัดข้อความยาว', () => {
    expect(auditLabel({ business_name: 'ร้านเอ', id: 'x' })).toBe('ร้านเอ'); expect(auditLabel(null)).toBe('')
    expect(fmtVal('ก'.repeat(200)).length).toBe(78); expect(fmtVal(null)).toBe('—')
  })
})
