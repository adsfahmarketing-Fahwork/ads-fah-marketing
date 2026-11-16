import { beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './db'

let t: Awaited<ReturnType<typeof createDb>>
const sum = (who: string, from = `bangkok_today() - 90`, to = `bangkok_today()`) =>
  t.as(who, `select dashboard_summary(${from}, ${to}) r`).then((r) => r[0].r)

beforeAll(async () => {
  t = await createDb()
  await t.addUser('owner', 'owner', 'เจ้าของ'); await t.addUser('mgr', 'manager', 'ผู้จัดการ'); await t.addUser('mgrrev', 'manager', 'ผู้จัดการ(รายได้)')
  await t.addUser('adminA', 'page_admin', 'แอดมินเอ'); await t.addUser('adminB', 'page_admin', 'แอดมินบี')
  await t.as('admin', `update profiles set can_view_revenue = true where id = $1`, [t.ids.mgrrev])
  const c1 = (await t.as('owner', `insert into customers (business_name, started_at) values ('[ทดสอบ] ซี1', current_date - 40) returning id`))[0].id
  const c2 = (await t.as('owner', `insert into customers (business_name, started_at) values ('[ทดสอบ] ซี2', current_date - 3) returning id`))[0].id
  const mkPage = async (c: string, n: string) => (await t.as('owner', `insert into pages (customer_id, page_name) values ($1,$2) returning id`, [c, n]))[0].id
  const p1 = await mkPage(c1, 'p1'), p2 = await mkPage(c1, 'p2'), p3 = await mkPage(c2, 'p3')
  await t.as('owner', `select set_page_assignments($1,$2::uuid[])`, [p1, [t.ids.adminA]])
  await t.as('owner', `select set_page_assignments($1,$2::uuid[])`, [p3, [t.ids.adminB]])
  const mk = async (c: string, p: string, startOffset: number, fee: number) =>
    (await t.as('owner', `select create_contract($1,'ดูแลเพจ',bangkok_today() + $2::int,30,$3,0,$4::uuid[],null) id`, [c, startOffset, fee, [p]]))[0].id
  const A = await mk(c1, p1, -60, 9000)                       // รอบ 1: T-60..T-31
  await t.as('owner', `select renew_contract($1)`, [A])      // รอบ 2: T-30..T-1 (หมดอายุ ไม่ต่อ)
  await mk(c2, p3, -3, 5000)                                  // กำลังดูแล
  const C = await mk(c1, p2, -10, 4000)                       // ยกเลิก
  await t.as('owner', `update contracts set status='cancelled', cancelled_at = bangkok_today() - 2, cancel_reason = 'ไม่คุ้มค่า' where id=$1`, [C])
  await mk(c1, p1, -25, 3000)                                 // ใกล้หมด (สิ้นสุด T+4)
  await t.as('mgr', `insert into tasks (title, page_id, assignee_id, due_date) values ('เกินกำหนด', '${p1}', '${t.ids.adminA}', bangkok_today() - 2)`)
  await t.as('mgr', `insert into tasks (title, page_id, assignee_id, due_date) values ('ปกติ', '${p3}', '${t.ids.adminB}', bangkok_today() + 5)`)
  const done = (await t.as('mgr', `insert into tasks (title, page_id, assignee_id) values ('เสร็จ', '${p1}', '${t.ids.adminA}') returning id`))[0].id
  await t.as('adminA', `update tasks set status='done' where id=$1`, [done])
  await t.as('admin', `insert into customer_briefs (customer_id, page_id, business_name, contact_name, phone) values ('${c1}','${p1}','x','y','0811111111')`)
})

describe('Dashboard (Owner)', () => {
  it('ตัวเลขหลักถูกต้อง', async () => {
    const r = await sum('owner')
    expect(r).toMatchObject({
      customers_total: 2, pages_active: 3, pages_new: 3, contracts_expiring: 1, contracts_renewed: 1, contracts_lost: 2,
      revenue: 30000, staff_active: 5, tasks_open: 2, tasks_overdue: 1, briefs_pending: 1,
    })
  })
  it('กราฟรายเดือน: ครอบคลุมอย่างน้อย 6 เดือน และผลรวมตรงกับตัวเลขรวม', async () => {
    const r = await sum('owner')
    expect(r.monthly.length).toBeGreaterThanOrEqual(6)
    const total = (k: string) => r.monthly.reduce((a: number, m: any) => a + Number(m[k] ?? 0), 0)
    expect(total('revenue')).toBe(30000); expect(total('renewed')).toBe(1); expect(total('lost')).toBe(2)
    expect(total('new_customers')).toBe(2); expect(total('new_pages')).toBe(3)
  })
  it('ช่วงที่ไม่มีข้อมูลได้ศูนย์ ไม่ error', async () => {
    const r = await sum('owner', `bangkok_today() + 400`, `bangkok_today() + 430`)
    expect(r).toMatchObject({ contracts_renewed: 0, contracts_lost: 0, revenue: 0, pages_new: 0 })
  })
  it('ตรวจช่วงวันที่ไม่ถูกต้อง', async () => {
    await expect(sum('owner', `bangkok_today()`, `bangkok_today() - 1`)).rejects.toThrow(/ไม่ถูกต้อง/)
    await expect(sum('owner', `bangkok_today() - 2000`, `bangkok_today()`)).rejects.toThrow(/3 ปี/)
  })
})

describe('สิทธิ์ในการมองเห็นรายได้และขอบเขตข้อมูล', () => {
  it('Manager ทั่วไปไม่เห็นรายได้ (null) / Manager ที่ได้รับอนุญาตเห็น', async () => {
    expect((await sum('mgr')).revenue).toBeNull()
    expect((await sum('mgr')).monthly.every((m: any) => m.revenue === null)).toBe(true)
    expect((await sum('mgrrev')).revenue).toBe(30000)
  })
  it('Page Admin เห็นเฉพาะข้อมูลของตน ไม่เห็นรายได้/จำนวนพนักงาน', async () => {
    const a = await sum('adminA'), b = await sum('adminB')
    expect(a).toMatchObject({ customers_total: 1, pages_active: 1, revenue: null, staff_active: null, tasks_open: 1, tasks_overdue: 1, briefs_pending: 1 })
    expect(b).toMatchObject({ customers_total: 1, pages_active: 1, revenue: null, tasks_open: 1, tasks_overdue: 0, briefs_pending: 0 })
  })
  it('Page Admin ดูรายงานไม่ได้ และอ่าน contract_cycles ก็ไม่เห็นเงิน', async () => {
    await expect(t.as('adminA', `select report_data(bangkok_today()-90, bangkok_today())`)).rejects.toThrow(/ไม่มีสิทธิ์/)
    const rows = await t.as('adminA', `select monthly_fee from contract_cycles`)
    expect(rows.length).toBeGreaterThan(0); expect(rows.every((r: any) => r.monthly_fee === null)).toBe(true)
    await expect(t.as('anon', `select dashboard_summary(bangkok_today(), bangkok_today())`)).rejects.toThrow()
  })
})

describe('รายงาน (report_data)', () => {
  let r: any
  beforeAll(async () => { r = (await t.as('owner', `select report_data(bangkok_today() - 90, bangkok_today()) r`))[0].r })
  it('อัตรารักษาลูกค้า = ต่อ ÷ (ต่อ + ไม่ต่อ)', () => {
    expect(r.retention).toEqual({ renewed: 1, lost: 2, rate: 33.3 })
  })
  it('เหตุผลที่ยกเลิก', () => { expect(r.cancel_reasons).toEqual([{ reason: 'ไม่คุ้มค่า', count: 1 }]) })
  it('รายชื่อสัญญาที่ต่อ / ไม่ต่อ', () => {
    expect(r.renewed_list).toHaveLength(1); expect(r.renewed_list[0].cycle_no).toBe(2)
    expect(r.lost_list.map((x: any) => x.status).sort()).toEqual(['cancelled', 'expired'])
  })
  it('เพจต่อพนักงาน และงานต่อพนักงาน', () => {
    expect(r.staff_pages.find((s: any) => s.staff === 'แอดมินเอ').pages).toBe(1)
    const a = r.staff_tasks.find((s: any) => s.staff === 'แอดมินเอ')
    expect(a).toEqual({ staff: 'แอดมินเอ', done: 1, overdue: 1, open: 1 })
  })
  it('Manager ที่ไม่มีสิทธิ์รายได้: รายงานไม่มีตัวเลขรายได้', async () => {
    const m = (await t.as('mgr', `select report_data(bangkok_today() - 90, bangkok_today()) r`))[0].r
    expect(m.summary.revenue).toBeNull()
  })
})
