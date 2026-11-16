import { beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './db'

let t: Awaited<ReturnType<typeof createDb>>
let cust: string, pageA: string, pageB: string, link: { link_id: string; token: string }

const payload = (over: Record<string, unknown> = {}) => JSON.stringify({ business_name: 'ร้านทดสอบ', contact_name: 'คุณทดสอบ', phone: '0812345678', consent: true, ...over })
const submit = (token: string, p: string = payload()) => t.as('anon', `select submit_brief($1, $2::jsonb) r`, [token, p])

beforeAll(async () => {
  t = await createDb()
  await t.addUser('owner', 'owner', 'เจ้าของ'); await t.addUser('mgr', 'manager', 'ผู้จัดการ')
  await t.addUser('adminA', 'page_admin', 'แอดมินเอ'); await t.addUser('adminB', 'page_admin', 'แอดมินบี')
  cust = (await t.as('owner', `insert into customers (business_name, contact_name, phone, line_id, email, notes) values ('[ทดสอบ] ร้าน PII','คุณลับ','0899999999','@secret','secret@x.com','บันทึกลับ') returning id`))[0].id
  pageA = (await t.as('owner', `insert into pages (customer_id, page_name, page_url, notes) values ($1,'เพจ PII','https://fb.com/secret','โน้ตลับ') returning id`, [cust]))[0].id
  pageB = (await t.as('owner', `insert into pages (customer_id, page_name) values ($1,'เพจบี') returning id`, [cust]))[0].id
  await t.as('owner', `select set_page_assignments($1,$2::uuid[])`, [pageA, [t.ids.adminA]])
  link = (await t.as('owner', `select * from create_brief_link($1,$2,'t',14,50)`, [cust, pageA]))[0]
})

describe('การตั้งค่าความปลอดภัยของฐานข้อมูล (audit อัตโนมัติ)', () => {
  it('anon เรียกใช้ฟังก์ชันได้เฉพาะ 3 ตัวสำหรับลูกค้าเท่านั้น', async () => {
    const rows = await t.as('admin', `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`)
    expect(rows.map((r: any) => r.proname)).toEqual(['brief_link_open', 'get_brief_link_info', 'submit_brief'])
  })
  it('ฟังก์ชันภายใน (notify, trigger, guard ฯลฯ) ผู้ใช้ที่ล็อกอินเรียกตรงไม่ได้', async () => {
    const rows = await t.as('admin', `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1`)
    const allowed = ['anonymize_customer', 'app_role', 'bangkok_today', 'brief_link_open', 'can_access_contract', 'can_access_customer', 'can_access_entity', 'can_access_page', 'can_access_task',
      'can_read_storage_object', 'can_view_revenue', 'create_brief_link', 'create_contract', 'dashboard_summary', 'get_brief_link_info', 'is_assigned_to_page', 'is_management', 'is_owner', 'is_staff',
      'refresh_contract_statuses', 'renew_contract', 'report_data', 'run_daily_jobs', 'set_page_assignments', 'submit_brief', 'task_status_label']
    expect(rows.map((r: any) => r.proname).filter((n: string) => !allowed.includes(n))).toEqual([])
    await expect(t.as('adminA', `select notify($1, 'page_assigned', 'ปลอม', null, null, null)`, [t.ids.adminB])).rejects.toThrow()
  })
  it('ฟังก์ชัน SECURITY DEFINER ทุกตัวล็อก search_path', async () => {
    const rows = await t.as('admin', `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig::text ilike '%search_path%', false)`)
    expect(rows).toEqual([])
  })
  it('ไม่มี policy ที่เปิดกว้าง (using true) และ anon ไม่มี policy ใดเลย', async () => {
    const open = await t.as('admin', `select tablename, policyname from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')`)
    expect(open).toEqual([])
    const anon = await t.as('admin', `select tablename from pg_policies where schemaname = 'public' and ('anon' = any(roles) or 'public' = any(roles))`)
    expect(anon).toEqual([])
  })
  it('anon ไม่มีสิทธิ์บนตาราง/view/sequence ใดๆ ใน public', async () => {
    const rows = await t.as('admin', `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','v','S') and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert'))`)
    expect(rows).toEqual([])
  })
})

describe('บัญชีใหม่แบบ fail-closed', () => {
  it('ผู้ใช้ที่ไม่มี role ใน app_metadata (สมัครเอง/สร้างใน Dashboard) ถูกปิดใช้งานและมองไม่เห็นข้อมูล', async () => {
    const r = await t.db.query<{ id: string }>(`insert into auth.users (email) values ('stranger@x.com') returning id`)
    t.ids.stranger = r.rows[0].id
    expect((await t.as('admin', `select status, role from profiles where id=$1`, [t.ids.stranger]))[0]).toEqual({ status: 'inactive', role: 'page_admin' })
    for (const tbl of ['customers', 'pages', 'tasks', 'customer_briefs', 'staff_directory', 'notifications'])
      expect(await t.as('stranger', `select * from ${tbl}`), tbl).toHaveLength(0)
  })
  it('app_metadata role ถูกต้อง = ใช้งานได้; ปิดใช้งานแล้วเข้าถึงข้อมูลไม่ได้ทันที', async () => {
    expect(await t.as('adminA', `select id from pages`)).toHaveLength(1)
    await t.as('owner', `update profiles set status='inactive' where id=$1`, [t.ids.adminA])
    expect(await t.as('adminA', `select id from pages`)).toHaveLength(0)
    await t.as('owner', `update profiles set status='active' where id=$1`, [t.ids.adminA])
  })
  it('user_metadata (ที่ผู้ใช้แก้เองได้) ไม่สามารถกำหนด role', async () => {
    const r = await t.db.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ('evil@x.com', '{"role":"owner","full_name":"x"}') returning id`)
    expect((await t.as('admin', `select role, status from profiles where id=$1`, [r.rows[0].id]))[0]).toEqual({ role: 'page_admin', status: 'inactive' })
  })
})

describe('ไฟล์แนบ: กันการอ้าง path ของไฟล์อื่น', () => {
  it('พนักงานลงทะเบียน attachment ได้เฉพาะ path ในโฟลเดอร์ของตนเอง', async () => {
    const id = (await submit(link.token, payload({ files: [{ path: `links/${link.link_id}/a.png`, name: 'a.png', type: 'image/png', size: 5 }] })))[0].r.id
    const brief = id as string
    await expect(t.as('adminA', `insert into attachments (entity_type, entity_id, storage_path, file_name, size_bytes) values ('brief', $1, $2, 'x', 1)`, [brief, `links/${link.link_id}/a.png`])).rejects.toThrow()
    await t.as('adminA', `insert into attachments (entity_type, entity_id, storage_path, file_name, size_bytes) values ('brief', $1, $2, 'x', 1)`, [brief, `staff/${t.ids.adminA}/x.png`])
  })
})

describe('การโจมตีผ่านฟอร์มสาธารณะ', () => {
  it('SQL injection ในข้อมูลถูกเก็บเป็นข้อความธรรมดา ตารางไม่ถูกกระทบ', async () => {
    const evil = `x'); DROP TABLE customers; --`
    const id = (await submit(link.token, payload({ business_name: evil, line_id: `' OR 1=1 --` })))[0].r.id
    expect((await t.as('admin', `select business_name from customer_briefs where id=$1`, [id]))[0].business_name).toBe(evil)
    expect((await t.as('admin', `select count(*)::int n from customers`))[0].n).toBeGreaterThan(0)
  })
  it('payload ผิดรูปแบบ (null / array / ชนิดผิด) ถูกปฏิเสธอย่างปลอดภัย ไม่ crash', async () => {
    await expect(submit(link.token, 'null')).rejects.toThrow(/ประกาศความเป็นส่วนตัว/)
    await expect(submit(link.token, '[]')).rejects.toThrow(/ประกาศความเป็นส่วนตัว/)
    await expect(submit(link.token, '"abc"')).rejects.toThrow()
    await expect(submit(link.token, payload({ provinces: 'ไม่ใช่ array', files: 'x' }))).resolves.toBeTruthy()
    await expect(submit(link.token, payload({ age_min: { a: 1 } }))).rejects.toThrow(/ตัวเลข/)
  })
  it('ต้องยอมรับประกาศความเป็นส่วนตัว และบันทึกเวลารับทราบ', async () => {
    await expect(submit(link.token, payload({ consent: false }))).rejects.toThrow(/ประกาศความเป็นส่วนตัว/)
    await expect(submit(link.token, JSON.stringify({ business_name: 'a', contact_name: 'b', phone: '0811111111' }))).rejects.toThrow(/ประกาศความเป็นส่วนตัว/)
    const id = (await submit(link.token))[0].r.id
    expect((await t.as('admin', `select consent_at is not null ok from customer_briefs where id=$1`, [id]))[0].ok).toBe(true)
  })
  it('ลิงก์ของลูกค้าหนึ่งใช้ส่งข้อมูลเข้าลูกค้า/เพจอื่นไม่ได้ (ผูกกับลิงก์เสมอ)', async () => {
    const id = (await submit(link.token, payload({ customer_id: '00000000-0000-0000-0000-000000000000', page_id: pageB, status: 'reviewed' })))[0].r.id
    expect((await t.as('admin', `select customer_id, page_id, status from customer_briefs where id=$1`, [id]))[0]).toEqual({ customer_id: cust, page_id: pageA, status: 'new' })
  })
  it('ข้อความที่มี HTML/script ถูกเก็บตามเดิม (การ escape ทำที่หน้าเว็บ)', async () => {
    const id = (await submit(link.token, payload({ extra_details: '<script>alert(1)</script>' })))[0].r.id
    expect((await t.as('admin', `select extra_details from customer_briefs where id=$1`, [id]))[0].extra_details).toBe('<script>alert(1)</script>')
  })
})

describe('ลบข้อมูลส่วนบุคคลตามคำขอ (PDPA)', () => {
  it('เฉพาะ Owner', async () => {
    await expect(t.as('mgr', `select anonymize_customer($1)`, [cust])).rejects.toThrow(/Owner/)
    await expect(t.as('adminA', `select anonymize_customer($1)`, [cust])).rejects.toThrow(/Owner/)
  })
  it('ลบข้อมูลส่วนบุคคลทั้งหมด รวมถึงใน audit log และคืนรายการไฟล์ที่ต้องลบ', async () => {
    const b = (await t.as('admin', `select id from customer_briefs where brief_link_id=$1 limit 1`, [link.link_id]))[0].id
    await t.as('owner', `insert into attachments (entity_type, entity_id, storage_path, file_name, size_bytes) values ('customer', $1, 'staff/${t.ids.owner}/c.png', 'c.png', 1)`, [cust])
    const res = (await t.as('owner', `select anonymize_customer($1) r`, [cust]))[0].r
    expect(res.storage_paths.length).toBeGreaterThanOrEqual(2)
    const dump = JSON.stringify(await t.as('admin', `select * from customers where id=$1`, [cust]))
      + JSON.stringify(await t.as('admin', `select * from pages where customer_id=$1`, [cust]))
      + JSON.stringify(await t.as('admin', `select * from customer_briefs where customer_id=$1`, [cust]))
      + JSON.stringify(await t.as('admin', `select old_data, new_data from audit_logs where record_id = $1 or record_id in (select id from pages where customer_id=$1) or record_id in (select id from customer_briefs where customer_id=$1)`, [cust]))
    for (const pii of ['คุณลับ', '0899999999', '@secret', 'secret@x.com', 'บันทึกลับ', 'fb.com/secret', 'โน้ตลับ', 'ร้านทดสอบ', 'คุณทดสอบ', '0812345678', 'DROP TABLE']) expect(dump, pii).not.toContain(pii)
    expect(await t.as('admin', `select id from attachments where entity_id = $1 or entity_id = $2`, [cust, b])).toHaveLength(0)
    expect((await t.as('owner', `select action from audit_logs where action='ANONYMIZE'`)).length).toBe(1)
    expect((await t.as('admin', `select status from customers where id=$1`, [cust]))[0].status).toBe('churned')
  })
})

describe('งานล้างข้อมูลชั่วคราว', () => {
  it('ลบบันทึกความพยายามส่งฟอร์มที่เก่ากว่า 2 วัน และแจ้งเตือนที่อ่านแล้วเก่ากว่า 180 วัน', async () => {
    await t.as('admin', `insert into brief_submit_attempts (token_hash, created_at) values ('old', now() - interval '3 days'), ('new', now())`)
    await t.as('admin', `insert into notifications (recipient_id, type, title, read_at) values ($1,'page_assigned','เก่า', now() - interval '200 days')`, [t.ids.owner])
    const r = (await t.as('admin', `select run_daily_jobs() r`))[0].r
    expect(r.purged_attempts).toBe(1); expect(r.purged_notifications).toBe(1)
    expect(await t.as('admin', `select 1 from brief_submit_attempts where token_hash='new'`)).toHaveLength(1)
  })
})

describe('ประสิทธิภาพที่ขนาด 300+ เพจ', () => {
  it('Dashboard/รายการเพจ/สัญญา ตอบเร็วเมื่อข้อมูลเยอะ (ทั้ง Owner และ Page Admin)', async () => {
    await t.db.exec(`
      insert into customers (business_name) select '[ทดสอบ] โหลด ' || g from generate_series(1, 300) g;
      insert into pages (customer_id, page_name) select c.id, 'เพจโหลด ' || row_number() over () from customers c where c.business_name like '[ทดสอบ] โหลด%';
      insert into page_assignments (page_id, staff_id) select p.id, '${t.ids.adminB}' from pages p where p.page_name like 'เพจโหลด%' and (random() < 0.5);
      insert into contracts (customer_id, service_type, start_date, duration_days, status)
        select c.id, 'ดูแลเพจ', current_date - (random()*60)::int, 30, 'active' from customers c where c.business_name like '[ทดสอบ] โหลด%';
      insert into contract_pages select ct.id, p.id from contracts ct join pages p on p.customer_id = ct.customer_id where p.page_name like 'เพจโหลด%';
      insert into contract_financials (contract_id, cycle_no, monthly_fee) select id, 1, 9000 from contracts where service_type = 'ดูแลเพจ' and id not in (select contract_id from contract_financials);
      insert into tasks (title, page_id, assignee_id, due_date) select 'งาน ' || g, p.id, '${t.ids.adminB}', current_date + (g % 20) - 10 from pages p, generate_series(1, 2) g where p.page_name like 'เพจโหลด%' and exists (select 1 from page_assignments a where a.page_id = p.id and a.staff_id = '${t.ids.adminB}');
    `)
    const time = async (who: string, sql: string) => { const s = performance.now(); const r = await t.as(who, sql); return [performance.now() - s, r] as const }
    const [d1] = await time('owner', `select dashboard_summary(current_date - 180, current_date + 30) r`)
    const [d2, pages] = await time('adminB', `select id from pages`)
    const [d3] = await time('adminB', `select dashboard_summary(current_date - 30, current_date) r`)
    const [d4] = await time('mgr', `select c.id from contracts c`)
    const [d5] = await time('owner', `select report_data(current_date - 180, current_date) r`)
    expect(pages.length).toBeGreaterThan(100)
    for (const d of [d1, d2, d3, d4, d5]) expect(d).toBeLessThan(5000)   // PGlite ช้ากว่า PostgreSQL จริงหลายเท่า
  })
})
