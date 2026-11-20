import { beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './db'

let t: Awaited<ReturnType<typeof createDb>>
let cust: string, pageA: string, pageB: string

const payload = (over: Record<string, unknown> = {}) => JSON.stringify({
  business_name: 'ร้านทดสอบ', contact_name: 'คุณทดสอบ', phone: '0812345678', line_id: '@test',
  fb_page_name: 'เพจทดสอบ', fb_page_url: 'https://facebook.com/test', product_category: 'อาหาร',
  ad_budget_monthly: '15000', age_min: '20', age_max: '45', provinces: ['กรุงเทพมหานคร', 'นนทบุรี'],
  target_audience: 'คนทำงาน', ad_objective: 'ข้อความ/Inbox', consent: true, ...over,
})
const link = async (who = 'owner', page = pageA, days = 14, max = 5) =>
  (await t.as(who, `select link_id, token from create_brief_link($1, $2, 'ทดสอบ', $3, $4)`, [cust, page, days, max]))[0] as { link_id: string; token: string }
const submit = (token: string, p = payload()) => t.as('anon', `select submit_brief($1, $2::jsonb) r`, [token, p])

beforeAll(async () => {
  t = await createDb()
  await t.addUser('owner', 'owner', 'เจ้าของ'); await t.addUser('mgr', 'manager', 'ผู้จัดการ')
  await t.addUser('adminA', 'page_admin', 'แอดมินเอ'); await t.addUser('adminB', 'page_admin', 'แอดมินบี')
  cust = (await t.as('owner', `insert into customers (business_name) values ('[ทดสอบ] ลูกค้า') returning id`))[0].id
  pageA = (await t.as('owner', `insert into pages (customer_id, page_name) values ($1,'เพจเอ') returning id`, [cust]))[0].id
  pageB = (await t.as('owner', `insert into pages (customer_id, page_name) values ($1,'เพจบี') returning id`, [cust]))[0].id
})

describe('มอบหมายเพจ', () => {
  it('มอบหมายหลายคน/หลายเพจ และแจ้งเตือนผู้ได้รับมอบหมาย', async () => {
    await t.as('mgr', `select set_page_assignments($1, $2::uuid[])`, [pageA, [t.ids.adminA, t.ids.adminB]])
    await t.as('mgr', `select set_page_assignments($1, $2::uuid[])`, [pageB, [t.ids.adminA]])
    expect(await t.as('adminA', `select id from pages`)).toHaveLength(2)
    expect(await t.as('adminB', `select id from pages`)).toHaveLength(1)
    const n = await t.as('adminB', `select type from notifications`)
    expect(n.map((x: any) => x.type)).toEqual(['page_assigned'])
  })
  it('เปลี่ยนผู้รับผิดชอบ: คนที่ถูกถอดเห็นเพจไม่ได้ และได้รับแจ้ง', async () => {
    await t.as('owner', `select set_page_assignments($1, $2::uuid[])`, [pageA, [t.ids.adminA]])
    expect(await t.as('adminB', `select id from pages`)).toHaveLength(0)
    expect((await t.as('adminB', `select type from notifications order by created_at`)).map((x: any) => x.type)).toContain('assignee_changed')
  })
  it('Page Admin มอบหมายเองไม่ได้; มอบหมายพนักงานที่ปิดใช้งานไม่ได้', async () => {
    await expect(t.as('adminA', `select set_page_assignments($1, $2::uuid[])`, [pageB, [t.ids.adminA]])).rejects.toThrow(/ไม่มีสิทธิ์/)
    await t.as('owner', `update profiles set status='inactive' where id=$1`, [t.ids.adminB])
    await expect(t.as('owner', `select set_page_assignments($1, $2::uuid[])`, [pageA, [t.ids.adminB]])).rejects.toThrow(/ปิดใช้งาน/)
    await t.as('owner', `update profiles set status='active' where id=$1`, [t.ids.adminB])
  })
})

describe('ลิงก์ Brief', () => {
  it('สร้างลิงก์: token ยาว สุ่ม ไม่ซ้ำ และเก็บเฉพาะ hash', async () => {
    const a = await link(), b = await link()
    expect(a.token).toMatch(/^[0-9a-f]{64}$/); expect(a.token).not.toBe(b.token)
    const row = (await t.as('owner', `select token_hash from brief_links where id=$1`, [a.link_id]))[0]
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/); expect(row.token_hash).not.toBe(a.token)
    expect(JSON.stringify(await t.as('admin', `select * from brief_links`))).not.toContain(a.token)
  })
  it('Page Admin สร้างไม่ได้; ต้องเป็นเพจของลูกค้า; วันหมดอายุ 1–90', async () => {
    await expect(link('adminA')).rejects.toThrow(/ไม่มีสิทธิ์/)
    await expect(link('owner', pageA, 0)).rejects.toThrow(/1–90/)
    await expect(t.as('owner', `select * from create_brief_link($1, null)`, [cust])).rejects.toThrow(/เลือกเพจ/)
  })
  it('get_brief_link_info: ถูกต้อง / ไม่พบ / ยกเลิก / หมดอายุ', async () => {
    const a = await link()
    const info = (await t.as('anon', `select get_brief_link_info($1) r`, [a.token]))[0].r
    expect(info).toMatchObject({ valid: true, page_name: 'เพจเอ' })
    expect((await t.as('anon', `select get_brief_link_info('nope') r`))[0].r).toMatchObject({ valid: false, reason: 'not_found' })
    await t.as('owner', `update brief_links set revoked_at = now() where id=$1`, [a.link_id])
    expect((await t.as('anon', `select get_brief_link_info($1) r`, [a.token]))[0].r.reason).toBe('revoked')
    const b = await link()
    await t.as('admin', `update brief_links set expires_at = now() - interval '1 minute' where id=$1`, [b.link_id])
    expect((await t.as('anon', `select get_brief_link_info($1) r`, [b.token]))[0].r.reason).toBe('expired')
  })
  it('anon เข้าตารางลิงก์/Brief โดยตรงไม่ได้', async () => {
    await expect(t.as('anon', `select * from brief_links`)).rejects.toThrow()
    await expect(t.as('anon', `select * from customer_briefs`)).rejects.toThrow()
    await expect(t.as('anon', `insert into customer_briefs (customer_id, business_name, contact_name, phone) values ('${cust}','x','y','0811111111')`)).rejects.toThrow()
  })
})

describe('ส่ง Brief (public)', () => {
  it('บันทึกลง CRM เชื่อมลูกค้า/เพจ, แจ้งเตือนผู้รับผิดชอบ+Owner/Manager, นับครั้ง', async () => {
    const a = await link()
    const res = (await submit(a.token))[0].r
    expect(res.ok).toBe(true)
    const b = (await t.as('owner', `select customer_id, page_id, status, version, provinces, age_min, ad_budget_monthly::text bud, submitted_at is not null s from customer_briefs where id=$1`, [res.id]))[0]
    expect(b).toMatchObject({ customer_id: cust, page_id: pageA, status: 'new', version: 1, age_min: 20, bud: '15000.00', s: true })
    expect(b.provinces).toEqual(['กรุงเทพมหานคร', 'นนทบุรี'])
    expect((await t.as('owner', `select submission_count from brief_links where id=$1`, [a.link_id]))[0].submission_count).toBe(1)
    for (const who of ['adminA', 'owner', 'mgr']) {
      expect((await t.as(who, `select type from notifications where entity_id=$1`, [res.id])).map((x: any) => x.type)).toEqual(['brief_submitted'])
    }
    expect(await t.as('adminB', `select id from notifications where entity_id=$1`, [res.id])).toHaveLength(0)
  })
  it('Page Admin ที่ไม่ได้ดูแลเพจนั้นไม่เห็น Brief', async () => {
    const a = await link('owner', pageA); await submit(a.token)
    expect((await t.as('adminA', `select id from customer_briefs`)).length).toBeGreaterThan(0)
    expect(await t.as('adminB', `select id from customer_briefs`)).toHaveLength(0)
  })
  it('ส่งซ้ำได้ตามจำนวนที่กำหนด แล้วหยุด; เก็บทุกเวอร์ชัน', async () => {
    const a = await link('owner', pageA, 14, 2)
    await submit(a.token); await submit(a.token, payload({ ad_budget_monthly: '20000' }))
    await expect(submit(a.token)).rejects.toThrow(/ครบจำนวน/)
    const v = await t.as('owner', `select version from customer_briefs where brief_link_id=$1 order by version`, [a.link_id])
    expect(v.map((x: any) => x.version)).toEqual([1, 2])
  })
  it('ลิงก์ยกเลิก/หมดอายุ/ไม่ถูกต้อง ส่งไม่ได้', async () => {
    const a = await link(); await t.as('owner', `update brief_links set revoked_at=now() where id=$1`, [a.link_id])
    await expect(submit(a.token)).rejects.toThrow(/ยกเลิก/)
    const b = await link(); await t.as('admin', `update brief_links set expires_at=now()-interval '1 second' where id=$1`, [b.link_id])
    await expect(submit(b.token)).rejects.toThrow(/หมดอายุ/)
    await expect(submit('totally-wrong-token')).rejects.toThrow(/ไม่ถูกต้อง/)
  })
  it('ตรวจข้อมูล: บังคับกรอก, เบอร์โทร, URL, อายุ, งบ, ความยาว', async () => {
    const a = await link('owner', pageA, 14, 50)
    await expect(submit(a.token, payload({ phone: 'abc' }))).rejects.toThrow(/เบอร์โทร/)
    await expect(submit(a.token, payload({ fb_page_url: 'javascript:alert(1)' }))).rejects.toThrow(/http/)
    await expect(submit(a.token, payload({ age_min: '60', age_max: '20' }))).rejects.toThrow(/ช่วงอายุ/)
    await expect(submit(a.token, payload({ age_min: '5' }))).rejects.toThrow(/13–100/)
    await expect(submit(a.token, payload({ ad_budget_monthly: '-5' }))).rejects.toThrow(/งบประมาณ/)
    await expect(submit(a.token, payload({ ad_budget_monthly: 'abc' }))).rejects.toThrow(/ตัวเลข/)
    await expect(submit(a.token, payload({ target_audience: 'ก'.repeat(3001) }))).rejects.toThrow(/ยาวเกิน/)
    expect((await t.as('admin', `select submission_count from brief_links where id=$1`, [a.link_id]))[0].submission_count).toBe(0)
  })
  it('honeypot: บอทได้รับ "สำเร็จ" แต่ไม่มีการบันทึก', async () => {
    const a = await link()
    expect((await submit(a.token, payload({ website: 'http://spam' })))[0].r.ok).toBe(true)
    expect(await t.as('admin', `select id from customer_briefs where brief_link_id=$1`, [a.link_id])).toHaveLength(0)
  })
  it('จำกัดอัตราต่อลิงก์: เกิน 10 ครั้ง/10 นาที ถูกบล็อก', async () => {
    const a = await link('owner', pageA, 14, 50)
    for (let i = 0; i < 10; i++) await submit(a.token)
    await expect(submit(a.token)).rejects.toThrow(/ถี่เกินไป/)
  })
  it('ไฟล์แนบ: ต้องอยู่ในโฟลเดอร์ลิงก์ตนเอง; เห็นเฉพาะผู้มีสิทธิ์', async () => {
    const a = await link()
    const bad = payload({ files: [{ path: 'links/other/x.png', name: 'x.png', type: 'image/png', size: 10 }] })
    await expect(submit(a.token, bad)).rejects.toThrow(/ไฟล์แนบ/)
    const ok = payload({ files: [{ path: `links/${a.link_id}/1.png`, name: '1.png', type: 'image/png', size: 1000 }] })
    const id = (await submit(a.token, ok))[0].r.id
    expect(await t.as('adminA', `select id from attachments where entity_id=$1`, [id])).toHaveLength(1)
    expect(await t.as('adminB', `select id from attachments where entity_id=$1`, [id])).toHaveLength(0)
    expect((await t.as('adminA', `select can_read_storage_object($1) ok`, [`links/${a.link_id}/1.png`]))[0].ok).toBe(true)
    expect((await t.as('adminB', `select can_read_storage_object($1) ok`, [`links/${a.link_id}/1.png`]))[0].ok).toBe(false)
  })
  it('Storage: ลูกค้า (anon) อัปโหลดได้เฉพาะลิงก์ที่ใช้งานได้ และอ่านไม่ได้', async () => {
    const a = await link()
    const ins = (name: string) => t.as('anon', `insert into storage.objects (bucket_id, name) values ('brief-uploads', $1)`, [name])
    await ins(`links/${a.link_id}/ok.png`)
    await expect(ins(`links/00000000-0000-0000-0000-000000000000/x.png`)).rejects.toThrow()
    await expect(ins(`other/${a.link_id}/x.png`)).rejects.toThrow()
    await expect(t.as('anon', `select * from storage.objects`)).resolves.toEqual([])
    expect((await t.as('anon', `select brief_link_open($1) ok`, [a.link_id]))[0].ok).toBe(true)
    expect((await t.as('anon', `select brief_link_open('not-a-uuid') ok`))[0].ok).toBe(false)
    await t.as('owner', `update brief_links set revoked_at=now() where id=$1`, [a.link_id])
    expect((await t.as('anon', `select brief_link_open($1) ok`, [a.link_id]))[0].ok).toBe(false)
    await expect(ins(`links/${a.link_id}/late.png`)).rejects.toThrow()
  })
})

describe('ตอบเฉพาะข้อมูลสำหรับยิง Ads (4 ข้อ)', () => {
  it('ส่งได้โดยไม่กรอกชื่อธุรกิจ/ผู้ติดต่อ/เบอร์ — ใช้ชื่อธุรกิจจากข้อมูลลูกค้า', async () => {
    const a = await link()
    const core = JSON.stringify({ fb_page_name: 'เพจเอ', ad_budget_monthly: '12000', age_min: '25', age_max: '40', provinces: ['กรุงเทพมหานคร', 'เขตบางนา'], target_audience: 'คนรักสุขภาพ', consent: true })
    const id = (await submit(a.token, core))[0].r.id
    const b = (await t.as('owner', `select business_name, contact_name, phone, age_min, provinces from customer_briefs where id=$1`, [id]))[0]
    expect(b).toMatchObject({ business_name: '[ทดสอบ] ลูกค้า', contact_name: null, phone: null, age_min: 25 })
    expect(b.provinces).toContain('เขตบางนา')
  })
  it('ถ้ากรอกเบอร์โทรต้องถูกรูปแบบ', async () => {
    const a = await link()
    await expect(submit(a.token, JSON.stringify({ phone: 'abc', consent: true }))).rejects.toThrow(/เบอร์โทร/)
  })
})

describe('สถานะ Brief และประวัติ', () => {
  it('ตรวจสอบแล้ว -> บันทึก reviewed_by/at; แก้ข้อมูลของลูกค้าโดย Page Admin ไม่ได้', async () => {
    const a = await link(); const id = (await submit(a.token))[0].r.id
    await expect(t.as('adminA', `update customer_briefs set business_name='แก้' where id=$1`, [id])).rejects.toThrow(/แก้ได้เฉพาะ/)
    await t.as('adminA', `update customer_briefs set status='in_review' where id=$1`, [id])
    const r = (await t.as('adminA', `update customer_briefs set status='reviewed', internal_notes='ตรวจแล้ว' where id=$1 returning reviewed_by, reviewed_at`, [id]))[0]
    expect(r.reviewed_by).toBe(t.ids.adminA); expect(r.reviewed_at).not.toBeNull()
    const hist = await t.as('owner', `select action from audit_logs where table_name='customer_briefs' and record_id=$1 order by created_at`, [id])
    expect(hist.map((h: any) => h.action)).toEqual(['INSERT', 'UPDATE', 'UPDATE'])
  })
})
