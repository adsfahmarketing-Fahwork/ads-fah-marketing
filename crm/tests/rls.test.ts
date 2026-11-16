import { beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './db'

let t: Awaited<ReturnType<typeof createDb>>
let cust1: string, cust2: string, pageA: string, pageB: string, contractA: string

beforeAll(async () => {
  t = await createDb()
  await t.addUser('owner', 'owner', 'เจ้าของ ทดสอบ')
  await t.addUser('mgr', 'manager', 'ผู้จัดการ ทดสอบ')
  await t.addUser('mgrrev', 'manager', 'ผู้จัดการ ดูรายได้')
  await t.addUser('adminA', 'page_admin', 'แอดมิน เอ')
  await t.addUser('adminB', 'page_admin', 'แอดมิน บี')
  await t.as('admin', `update public.profiles set can_view_revenue = true where id = $1`, [t.ids.mgrrev])

  cust1 = (await t.as('owner', `insert into customers (business_name) values ('[ทดสอบ] ร้านเอ') returning id`))[0].id
  cust2 = (await t.as('owner', `insert into customers (business_name) values ('[ทดสอบ] ร้านบี') returning id`))[0].id
  pageA = (await t.as('owner', `insert into pages (customer_id, page_name) values ($1, 'เพจเอ') returning id`, [cust1]))[0].id
  pageB = (await t.as('owner', `insert into pages (customer_id, page_name) values ($1, 'เพจบี') returning id`, [cust2]))[0].id
  await t.as('owner', `insert into page_assignments (page_id, staff_id) values ($1, $2), ($3, $4)`, [pageA, t.ids.adminA, pageB, t.ids.adminB])
  contractA = (await t.as('owner', `insert into contracts (customer_id, service_type, start_date) values ($1, 'ดูแลเพจ', '2026-12-01') returning id`, [cust1]))[0].id
  await t.as('owner', `insert into contract_pages values ($1, $2)`, [contractA, pageA])
  await t.as('owner', `insert into contract_financials (contract_id, cycle_no, monthly_fee, ad_budget) values ($1, 1, 9000, 15000)`, [contractA])
})

describe('โปรไฟล์และบทบาท', () => {
  it('สร้าง profile อัตโนมัติ พร้อมรหัสพนักงาน และ role จาก app_metadata', async () => {
    const rows = await t.as('admin', `select role, employee_code from profiles order by employee_code`)
    expect(rows).toHaveLength(5)
    expect(rows[0].employee_code).toMatch(/^E-\d{4}$/)
    expect(rows.map((r: any) => r.role)).toContain('owner')
  })
  it('Page Admin เปลี่ยนสิทธิ์ของตนเองไม่ได้', async () => {
    await expect(t.as('adminA', `update profiles set role = 'owner' where id = $1`, [t.ids.adminA])).rejects.toThrow(/ไม่มีสิทธิ์/)
    await expect(t.as('adminA', `update profiles set can_view_revenue = true where id = $1`, [t.ids.adminA])).rejects.toThrow()
  })
  it('Page Admin แก้เบอร์โทรของตนเองได้ แต่แก้ของคนอื่นไม่ได้', async () => {
    await t.as('adminA', `update profiles set phone = '0812345678' where id = $1`, [t.ids.adminA])
    const other = await t.as('adminA', `update profiles set phone = '0899999999' where id = $1 returning id`, [t.ids.adminB])
    expect(other).toHaveLength(0)
  })
  it('Manager เปลี่ยนสิทธิ์ใครไม่ได้ แต่ Owner ทำได้', async () => {
    expect(await t.as('mgr', `update profiles set role = 'owner' where id = $1 returning id`, [t.ids.adminA])).toHaveLength(0)
    expect(await t.as('owner', `update profiles set job_title = 'หัวหน้า' where id = $1 returning id`, [t.ids.adminA])).toHaveLength(1)
  })
  it('ต้องเหลือ Owner อย่างน้อย 1 คน', async () => {
    await expect(t.as('owner', `update profiles set status = 'inactive' where id = $1`, [t.ids.owner])).rejects.toThrow(/Owner/)
  })
  it('Page Admin เห็นโปรไฟล์ตนเองเท่านั้น', async () => {
    expect(await t.as('adminA', `select id from profiles`)).toHaveLength(1)
    expect(await t.as('mgr', `select id from profiles`)).toHaveLength(5)
  })
  it('staff_directory เห็นชื่อพนักงาน แต่ anon เข้าไม่ได้', async () => {
    expect((await t.as('adminA', `select * from staff_directory`)).length).toBe(5)
    await expect(t.as('anon', `select * from staff_directory`)).rejects.toThrow()
  })
})

describe('การมองเห็นข้อมูลของ Page Admin', () => {
  it('เห็นเฉพาะลูกค้า/เพจที่ได้รับมอบหมาย', async () => {
    expect((await t.as('adminA', `select page_name from pages`)).map((r: any) => r.page_name)).toEqual(['เพจเอ'])
    expect((await t.as('adminB', `select page_name from pages`)).map((r: any) => r.page_name)).toEqual(['เพจบี'])
    expect(await t.as('adminA', `select id from customers`)).toHaveLength(1)
    expect(await t.as('owner', `select id from pages`)).toHaveLength(2)
    expect(await t.as('mgr', `select id from customers`)).toHaveLength(2)
  })
  it('เห็นสัญญาเฉพาะที่เกี่ยวกับเพจของตน', async () => {
    expect(await t.as('adminA', `select id from contracts`)).toHaveLength(1)
    expect(await t.as('adminB', `select id from contracts`)).toHaveLength(0)
  })
  it('Page Admin เพิ่ม/แก้ไข/ลบ ลูกค้า เพจ สัญญา ไม่ได้', async () => {
    await expect(t.as('adminA', `insert into customers (business_name) values ('x')`)).rejects.toThrow()
    expect(await t.as('adminA', `update pages set page_name = 'hack' where id = $1 returning id`, [pageA])).toHaveLength(0)
    expect(await t.as('adminA', `delete from customers where id = $1 returning id`, [cust1])).toHaveLength(0)
    await expect(t.as('adminA', `insert into page_assignments (page_id, staff_id) values ($1, $2)`, [pageB, t.ids.adminA])).rejects.toThrow()
  })
  it('Page Admin เห็นการมอบหมายของตนเองเท่านั้น', async () => {
    expect(await t.as('adminA', `select id from page_assignments`)).toHaveLength(1)
  })
  it('anon ไม่เห็นอะไรเลย', async () => {
    for (const tbl of ['customers', 'pages', 'contracts', 'profiles', 'tasks', 'audit_logs', 'brief_links', 'customer_briefs']) {
      await expect(t.as('anon', `select * from ${tbl}`), tbl).rejects.toThrow()
    }
  })
})

describe('ข้อมูลรายได้', () => {
  it('Page Admin ไม่เห็นค่าบริการ', async () => {
    expect(await t.as('adminA', `select * from contract_financials`)).toHaveLength(0)
  })
  it('Manager ทั่วไปไม่เห็น แต่ Manager ที่ Owner อนุญาตเห็น', async () => {
    expect(await t.as('mgr', `select * from contract_financials`)).toHaveLength(0)
    expect(await t.as('mgrrev', `select * from contract_financials`)).toHaveLength(1)
    expect(await t.as('owner', `select monthly_fee from contract_financials`)).toHaveLength(1)
  })
})

describe('สัญญา: วันเริ่ม/สิ้นสุด และการต่ออายุ', () => {
  it('30 วันปฏิทิน นับวันเริ่มเป็นวันแรก: 1 ธ.ค. 2569(2026) -> 30 ธ.ค.', async () => {
    const r = await t.as('owner', `select to_char(end_date, 'YYYY-MM-DD') d, contract_no from contracts where id = $1`, [contractA])
    expect(r[0].d).toBe('2026-12-30')
    expect(r[0].contract_no).toMatch(/^CT-\d{4}-\d{4}$/)
  })
  it('แก้ระยะเวลาแล้ว end_date คำนวณใหม่', async () => {
    const r = await t.as('owner', `update contracts set duration_days = 60 where id = $1 returning to_char(end_date,'YYYY-MM-DD') d`, [contractA])
    expect(r[0].d).toBe('2027-01-29')
    await t.as('owner', `update contracts set duration_days = 30 where id = $1`, [contractA])
  })
  it('ยกเลิกบริการต้องมีเหตุผลและวันที่', async () => {
    await expect(t.as('owner', `update contracts set status = 'cancelled' where id = $1`, [contractA])).rejects.toThrow()
  })
  it('ประวัติการต่อสัญญาเพิ่มได้ แก้ไข/ลบไม่ได้ และ Page Admin เห็นประวัติของเพจตน', async () => {
    await t.as('owner', `insert into contract_renewals (contract_id, cycle_no, previous_start_date, previous_end_date, new_start_date, new_end_date)
      values ($1, 2, '2026-12-01', '2026-12-30', '2026-12-31', '2027-01-29')`, [contractA])
    await expect(t.as('owner', `update contract_renewals set notes = 'x' where contract_id = $1`, [contractA])).rejects.toThrow()
    await expect(t.as('owner', `delete from contract_renewals where contract_id = $1`, [contractA])).rejects.toThrow()
    expect(await t.as('adminA', `select id from contract_renewals`)).toHaveLength(1)
    expect(await t.as('adminB', `select id from contract_renewals`)).toHaveLength(0)
    await expect(t.as('adminA', `insert into contract_renewals (contract_id, cycle_no, previous_start_date, previous_end_date, new_start_date, new_end_date)
      values ($1, 3, '2026-12-31', '2027-01-29', '2027-01-30', '2027-02-28')`, [contractA])).rejects.toThrow()
  })
})

describe('งาน (Tasks)', () => {
  let taskA: string
  it('Page Admin เห็นเฉพาะงานของตน และแก้ได้เฉพาะสถานะ/หมายเหตุ', async () => {
    taskA = (await t.as('mgr', `insert into tasks (title, page_id, assignee_id, due_date) values ('งานทดสอบ A', $1, $2, '2026-12-05') returning id`, [pageA, t.ids.adminA]))[0].id
    await t.as('mgr', `insert into tasks (title, page_id, assignee_id) values ('งานทดสอบ B', $1, $2)`, [pageB, t.ids.adminB])
    expect(await t.as('adminA', `select id from tasks`)).toHaveLength(1)
    expect(await t.as('mgr', `select id from tasks`)).toHaveLength(2)
    const done = await t.as('adminA', `update tasks set status = 'done', notes = 'เสร็จแล้ว' where id = $1 returning completed_at`, [taskA])
    expect(done[0].completed_at).not.toBeNull()
    await expect(t.as('adminA', `update tasks set assignee_id = $2 where id = $1`, [taskA, t.ids.adminB])).rejects.toThrow(/แก้ไขได้เฉพาะ/)
    await expect(t.as('adminA', `update tasks set due_date = '2030-01-01' where id = $1`, [taskA])).rejects.toThrow()
  })
  it('แก้ไขงานของคนอื่นไม่ได้ / สร้างงานเองไม่ได้', async () => {
    expect(await t.as('adminB', `update tasks set status = 'done' where id = $1 returning id`, [taskA])).toHaveLength(0)
    await expect(t.as('adminA', `insert into tasks (title) values ('x')`)).rejects.toThrow()
  })
  it('ความคิดเห็น: เห็นเฉพาะงานของตน ใช้ชื่อตนเองเท่านั้น และแก้ไม่ได้', async () => {
    await t.as('adminA', `insert into task_comments (task_id, body, author_id) values ($1, 'อัปเดต', $2)`, [taskA, t.ids.adminA])
    await expect(t.as('adminA', `insert into task_comments (task_id, body, author_id) values ($1, 'ปลอม', $2)`, [taskA, t.ids.mgr])).rejects.toThrow()
    await expect(t.as('adminB', `insert into task_comments (task_id, body, author_id) values ($1, 'x', $2)`, [taskA, t.ids.adminB])).rejects.toThrow()
    expect(await t.as('adminB', `select id from task_comments`)).toHaveLength(0)
    await expect(t.as('adminA', `update task_comments set body = 'แก้' where task_id = $1`, [taskA])).rejects.toThrow()
  })
})

describe('การแจ้งเตือน', () => {
  it('เห็น/อ่านได้เฉพาะของตนเอง และแก้ได้เฉพาะ read_at', async () => {
    await t.as('admin', `insert into notifications (recipient_id, type, title) values ($1, 'page_assigned', 'ทดสอบ'), ($2, 'page_assigned', 'ทดสอบ')`, [t.ids.adminA, t.ids.adminB])
    expect(await t.as('adminA', `select id from notifications where title = 'ทดสอบ'`)).toHaveLength(1)
    expect(await t.as('adminA', `select id from notifications where recipient_id <> $1`, [t.ids.adminA])).toHaveLength(0)
    expect(await t.as('adminA', `update notifications set read_at = now() where title = 'ทดสอบ' returning id`)).toHaveLength(1)
    await expect(t.as('adminA', `update notifications set title = 'แก้' `)).rejects.toThrow()
    await expect(t.as('adminA', `insert into notifications (recipient_id, type, title) values ($1, 'page_assigned', 'ปลอม')`, [t.ids.adminB])).rejects.toThrow()
  })
})

describe('Audit log และลิงก์ Brief', () => {
  it('Owner เห็น audit log ผู้อื่นไม่เห็น และแก้ไม่ได้', async () => {
    const rows = await t.as('owner', `select action, table_name, actor_id from audit_logs where table_name = 'customers'`)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows[0].actor_id).toBe(t.ids.owner)
    expect(await t.as('mgr', `select id from audit_logs`)).toHaveLength(0)
    expect(await t.as('adminA', `select id from audit_logs`)).toHaveLength(0)
    await expect(t.as('owner', `delete from audit_logs`)).rejects.toThrow()
    await expect(t.as('owner', `update audit_logs set action = 'x'`)).rejects.toThrow()
  })
  it('audit log ไม่เก็บ token_hash', async () => {
    await t.as('owner', `insert into brief_links (customer_id, page_id, token_hash, expires_at) values ($1, $2, 'SECRETHASH', now() + interval '7 days')`, [cust1, pageA])
    const rows = await t.as('owner', `select new_data::text n from audit_logs where table_name = 'brief_links'`)
    expect(rows[0].n).not.toContain('SECRETHASH')
  })
  it('Page Admin เห็น/สร้างลิงก์ Brief ไม่ได้', async () => {
    expect(await t.as('adminA', `select id from brief_links`)).toHaveLength(0)
    await expect(t.as('adminA', `insert into brief_links (customer_id, token_hash, expires_at) values ($1, 'h2', now())`, [cust1])).rejects.toThrow()
  })
  it('ตารางจำกัดอัตราการส่งฟอร์ม ไม่เปิดให้ผู้ใช้ทั่วไป', async () => {
    await expect(t.as('owner', `select * from brief_submit_attempts`)).rejects.toThrow()
    await expect(t.as('anon', `insert into brief_submit_attempts (ip_hash) values ('x')`)).rejects.toThrow()
  })
})

describe('Brief และไฟล์แนบ', () => {
  it('Page Admin เห็น Brief เฉพาะเพจของตน; ลบ/แทรกเองไม่ได้', async () => {
    await t.as('admin', `insert into customer_briefs (customer_id, page_id, business_name, contact_name, phone) values
      ($1, $2, 'ร้านเอ', 'คุณเอ', '0811111111'), ($3, $4, 'ร้านบี', 'คุณบี', '0822222222')`, [cust1, pageA, cust2, pageB])
    expect(await t.as('adminA', `select business_name from customer_briefs`)).toHaveLength(1)
    expect(await t.as('mgr', `select id from customer_briefs`)).toHaveLength(2)
    await expect(t.as('adminA', `insert into customer_briefs (customer_id, business_name, contact_name, phone) values ($1, 'x', 'y', '0811111111')`, [cust1])).rejects.toThrow()
    await expect(t.as('owner', `delete from customer_briefs`)).rejects.toThrow()
  })
  it('ไฟล์แนบ: เห็นเฉพาะของเพจตน', async () => {
    const b = (await t.as('admin', `select id from customer_briefs where page_id = $1`, [pageA]))[0].id
    await t.as('owner', `insert into attachments (entity_type, entity_id, storage_path, file_name, size_bytes) values ('brief', $1, 'staff/${t.ids.owner}/1.png', '1.png', 1000)`, [b])
    expect(await t.as('adminA', `select id from attachments`)).toHaveLength(1)
    expect(await t.as('adminB', `select id from attachments`)).toHaveLength(0)
  })
})

describe('RLS เปิดครบทุกตาราง', () => {
  it('ทุกตารางใน public เปิด RLS', async () => {
    const rows = await t.as('admin', `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)
    expect(rows).toEqual([])
  })
  it('มีตารางหลักครบ 13 ตาม spec', async () => {
    const need = ['profiles','customers','pages','contracts','contract_renewals','page_assignments','customer_briefs','brief_links','tasks','task_comments','notifications','attachments','audit_logs']
    const rows = await t.as('admin', `select tablename from pg_tables where schemaname = 'public'`)
    for (const n of need) expect(rows.map((r: any) => r.tablename)).toContain(n)
  })
  it('เขตเวลาเป็น Asia/Bangkok', async () => {
    const r = await t.as('admin', `show timezone`)
    expect(r[0].TimeZone ?? r[0].timezone).toBe('Asia/Bangkok')
  })
})
