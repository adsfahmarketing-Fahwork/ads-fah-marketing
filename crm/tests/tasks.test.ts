import { beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './db'

let t: Awaited<ReturnType<typeof createDb>>
let cust: string, pageA: string, pageB: string

const notes = (who: string, where = '1=1') => t.as(who, `select type, title, body from notifications where ${where} order by created_at`)
const mkTask = (who: string, title: string, page: string, assignee: string, due = '2099-01-01') =>
  t.as(who, `insert into tasks (title, page_id, assignee_id, due_date) values ($1,$2,$3,$4::date) returning id`, [title, page, t.ids[assignee], due])

beforeAll(async () => {
  t = await createDb()
  await t.addUser('owner', 'owner', 'เจ้าของ'); await t.addUser('mgr', 'manager', 'ผู้จัดการ')
  await t.addUser('adminA', 'page_admin', 'แอดมินเอ'); await t.addUser('adminB', 'page_admin', 'แอดมินบี')
  cust = (await t.as('owner', `insert into customers (business_name) values ('[ทดสอบ] ลูกค้า') returning id`))[0].id
  pageA = (await t.as('owner', `insert into pages (customer_id, page_name) values ($1,'เพจเอ') returning id`, [cust]))[0].id
  pageB = (await t.as('owner', `insert into pages (customer_id, page_name) values ($1,'เพจบี') returning id`, [cust]))[0].id
  await t.as('owner', `select set_page_assignments($1,$2::uuid[])`, [pageA, [t.ids.adminA]])
  await t.as('owner', `select set_page_assignments($1,$2::uuid[])`, [pageB, [t.ids.adminB]])
})

describe('งาน: มอบหมายและตรวจสอบ', () => {
  it('มอบหมายงานแล้วผู้รับผิดชอบได้รับแจ้งเตือน', async () => {
    await mkTask('mgr', 'ทำโพสต์', pageA, 'adminA')
    expect((await notes('adminA', `type = 'task_assigned'`)).map((n: any) => n.body)).toEqual(['ทำโพสต์'])
  })
  it('มอบงานของเพจให้พนักงานที่ไม่ได้ดูแลเพจนั้นไม่ได้', async () => {
    await expect(mkTask('mgr', 'x', pageA, 'adminB')).rejects.toThrow(/ไม่ได้รับผิดชอบเพจ/)
  })
  it('พนักงานสร้างงานเอง/แก้งานคนอื่นไม่ได้', async () => {
    await expect(t.as('adminA', `insert into tasks (title) values ('x')`)).rejects.toThrow()
  })
})

describe('งาน: อัปเดตสถานะ ประวัติ และแจ้งเตือน', () => {
  let id: string
  beforeAll(async () => { id = (await mkTask('mgr', 'งานอัปเดต', pageA, 'adminA'))[0].id })
  it('เปลี่ยนสถานะ: บันทึกประวัติ + แจ้งผู้สร้างงาน ไม่แจ้งผู้ทำรายการเอง', async () => {
    await t.as('adminA', `update tasks set status='in_progress' where id=$1`, [id])
    await t.as('adminA', `update tasks set status='done', notes='เรียบร้อย' where id=$1`, [id])
    const hist = await t.as('adminA', `select body, author_id from task_comments where task_id=$1 order by created_at`, [id])
    expect(hist.map((h: any) => h.body)).toEqual(['เปลี่ยนสถานะ: รอดำเนินการ → กำลังดำเนินการ', 'เปลี่ยนสถานะ: กำลังดำเนินการ → เสร็จสิ้น'])
    expect(hist[0].author_id).toBe(t.ids.adminA)
    const m = await notes('mgr', `type = 'task_status_changed'`)
    expect(m).toHaveLength(2); expect(m[1].body).toContain('เสร็จสิ้น')
    expect(await notes('adminA', `type = 'task_status_changed'`)).toHaveLength(0)
  })
  it('พนักงานอื่นไม่เห็นงาน/ประวัติ', async () => {
    expect(await t.as('adminB', `select id from tasks where id=$1`, [id])).toHaveLength(0)
    expect(await t.as('adminB', `select id from task_comments where task_id=$1`, [id])).toHaveLength(0)
  })
  it('ย้ายงานไปมอบให้คนอื่น: ผู้รับใหม่ได้แจ้งเตือน', async () => {
    await t.as('owner', `select set_page_assignments($1,$2::uuid[])`, [pageA, [t.ids.adminA, t.ids.adminB]])
    await t.as('mgr', `update tasks set assignee_id=$2 where id=$1`, [id, t.ids.adminB])
    expect((await notes('adminB', `type='task_assigned'`)).map((n: any) => n.body)).toContain('งานอัปเดต')
    await t.as('owner', `select set_page_assignments($1,$2::uuid[])`, [pageA, [t.ids.adminA]])
  })
})

describe('งานประจำวัน: งานเกินกำหนด', () => {
  it('แจ้งผู้รับผิดชอบ+ผู้สร้างครั้งเดียว (ไม่ซ้ำเมื่อรันอีก) และไม่แจ้งงานที่เสร็จแล้ว', async () => {
    await (mkTask('mgr', 'งานช้า', pageB, 'adminB', '2020-01-01'))
    const done = (await mkTask('mgr', 'งานเสร็จแล้วแต่เลยกำหนด', pageB, 'adminB', '2020-01-01'))[0].id
    await t.as('adminB', `update tasks set status='done' where id=$1`, [done])
    const r1 = (await t.as('mgr', `select run_daily_jobs() r`))[0].r
    expect(r1.overdue_task_notices).toBe(2)
    const again = (await t.as('mgr', `select run_daily_jobs() r`))[0].r
    expect(again.overdue_task_notices).toBe(0)
    expect((await notes('adminB', `type='task_overdue'`)).map((n: any) => n.body)).toEqual([expect.stringContaining('งานช้า')])
    expect(await notes('mgr', `type='task_overdue'`)).toHaveLength(1)
  })
  it('Page Admin เรียกงานประจำวันไม่ได้', async () => {
    await expect(t.as('adminA', `select run_daily_jobs()`)).rejects.toThrow(/ไม่มีสิทธิ์/)
  })
  it('cron (ไม่มีผู้ใช้) เรียกได้', async () => {
    await t.as('admin', `select run_daily_jobs()`)
  })
})

describe('แจ้งเตือนสัญญา 7/3/1 วัน, หมดอายุ, ต่อสัญญา', () => {
  let cid: string
  const setLeft = (days: number) => t.as('admin', `update contracts set start_date = bangkok_today() + $2::int - 29 where id=$1`, [cid, days])
  const run = () => t.as('admin', `select run_daily_jobs() r`).then((r) => r[0].r)
  const exp = (who: string) => notes(who, `type='contract_expiring'`).then((r) => r.map((n: any) => n.body as string))

  beforeAll(async () => {
    cid = (await t.as('owner', `select create_contract($1,'ดูแลเพจ',bangkok_today(),30,9000,0,$2::uuid[],null) id`, [cust, [pageA]]))[0].id
  })
  it('เหลือ 8 วัน: ยังไม่แจ้ง', async () => { await setLeft(8); await run(); expect(await exp('adminA')).toHaveLength(0) })
  it('เหลือ 7 วัน: แจ้ง Page Admin ของเพจ + Owner + Manager', async () => {
    await setLeft(7); expect((await run()).contract_notices).toBe(3)
    for (const w of ['adminA', 'owner', 'mgr']) expect((await exp(w))[0]).toContain('เหลือ 7 วัน')
    expect(await exp('adminB')).toHaveLength(0)
  })
  it('เหลือ 5 วัน: ไม่แจ้งซ้ำขั้น 7', async () => { await setLeft(5); expect((await run()).contract_notices).toBe(0) })
  it('เหลือ 3 วัน และ 1 วัน: แจ้งขั้นละครั้ง', async () => {
    await setLeft(3); expect((await run()).contract_notices).toBe(3)
    await setLeft(1); expect((await run()).contract_notices).toBe(3)
    await setLeft(0); expect((await run()).contract_notices).toBe(0)
    expect(await exp('adminA')).toHaveLength(3)
  })
  it('หมดอายุ: แจ้งหนึ่งครั้ง', async () => {
    await setLeft(-1); expect((await run()).contract_notices).toBe(3)
    expect((await run()).contract_notices).toBe(0)
    expect(await notes('adminA', `type='contract_expired'`)).toHaveLength(1)
  })
  it('ต่อสัญญา: แจ้งผู้เกี่ยวข้อง และรอบใหม่เริ่มแจ้ง 7/3/1 ใหม่ได้', async () => {
    await t.as('mgr', `select renew_contract($1, bangkok_today())`, [cid])
    expect((await notes('adminA', `type='contract_renewed'`))[0].body).toContain('รอบที่ 2')
    expect(await notes('adminB', `type='contract_renewed'`)).toHaveLength(0)
    await t.as('admin', `update contracts set start_date = bangkok_today() - 22 where id=$1`, [cid])   // เหลือ 7 วัน (รอบที่ 2)
    expect((await run()).contract_notices).toBe(3)
  })
})
