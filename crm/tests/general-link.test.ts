import { beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './db'

let t: Awaited<ReturnType<typeof createDb>>
let gen: { link_id: string; token: string }
let cust: string, page: string

const body = (over: Record<string, unknown> = {}) => JSON.stringify({
  business_name: 'ร้านลูกค้าใหม่', contact_name: 'คุณใหม่', phone: '0899998888', fb_page_name: 'เพจใหม่',
  ad_budget_monthly: '8000', age_min: '20', age_max: '35', provinces: ['เชียงใหม่'], target_audience: 'นักท่องเที่ยว', consent: true, ...over,
})
const submit = (token: string, p = body()) => t.as('anon', `select submit_brief($1, $2::jsonb) r`, [token, p])

beforeAll(async () => {
  t = await createDb()
  await t.addUser('owner', 'owner', 'เจ้าของ'); await t.addUser('mgr', 'manager', 'ผู้จัดการ')
  await t.addUser('adminA', 'page_admin', 'แอดมินเอ'); await t.addUser('adminB', 'page_admin', 'แอดมินบี')
  cust = (await t.as('owner', `insert into customers (business_name) values ('[ทดสอบ] ลูกค้า') returning id`))[0].id
  page = (await t.as('owner', `insert into pages (customer_id, page_name) values ($1,'เพจเอ') returning id`, [cust]))[0].id
  await t.as('owner', `select set_page_assignments($1,$2::uuid[])`, [page, [t.ids.adminA]])
  gen = (await t.as('owner', `select * from create_general_brief_link('ทดสอบลิงก์กลาง')`))[0]
})

describe('ลิงก์กลาง (ใช้ได้ตลอด ทุกลูกค้า)', () => {
  it('Owner/Manager สร้างได้, Page Admin สร้างไม่ได้; ไม่มีวันหมดอายุ; เก็บเฉพาะ hash', async () => {
    await expect(t.as('adminA', `select * from create_general_brief_link('x')`)).rejects.toThrow(/ไม่มีสิทธิ์/)
    expect((await t.as('mgr', `select * from create_general_brief_link('จาก manager')`))[0].token).toMatch(/^[0-9a-f]{64}$/)
    const row = (await t.as('owner', `select is_general, expires_at, customer_id, token_hash from brief_links where id=$1`, [gen.link_id]))[0]
    expect(row).toMatchObject({ is_general: true, expires_at: null, customer_id: null })
    expect(row.token_hash).not.toBe(gen.token)
  })
  it('get_brief_link_info บอกว่าเป็นลิงก์กลาง', async () => {
    expect((await t.as('anon', `select get_brief_link_info($1) r`, [gen.token]))[0].r).toMatchObject({ valid: true, general: true, business_name: null, page_name: null })
  })
  it('ลูกค้าส่งได้โดยไม่ต้องล็อกอิน: เข้าเป็น Brief "ยังไม่จับคู่" และแจ้ง Owner/Manager เท่านั้น', async () => {
    const id = (await submit(gen.token))[0].r.id
    const b = (await t.as('owner', `select customer_id, page_id, status, business_name, contact_name, phone, consent_at is not null c from customer_briefs where id=$1`, [id]))[0]
    expect(b).toMatchObject({ customer_id: null, page_id: null, status: 'new', business_name: 'ร้านลูกค้าใหม่', contact_name: 'คุณใหม่', phone: '0899998888', c: true })
    for (const who of ['owner', 'mgr']) expect(await t.as(who, `select 1 from notifications where entity_id=$1`, [id])).toHaveLength(1)
    for (const who of ['adminA', 'adminB']) expect(await t.as(who, `select 1 from notifications where entity_id=$1`, [id])).toHaveLength(0)
    expect(await t.as('adminA', `select id from customer_briefs where id=$1`, [id])).toHaveLength(0)   // Page Admin ไม่เห็น Brief ที่ยังไม่จับคู่
    expect(await t.as('mgr', `select id from customer_briefs where id=$1`, [id])).toHaveLength(1)
  })
  it('ต้องระบุชื่อธุรกิจ ผู้ติดต่อ และเบอร์โทร (ไม่เช่นนั้นทีมจับคู่ไม่ได้)', async () => {
    await expect(submit(gen.token, body({ business_name: '' }))).rejects.toThrow(/ชื่อธุรกิจ/)
    await expect(submit(gen.token, body({ contact_name: '  ' }))).rejects.toThrow(/ผู้ติดต่อ/)
    await expect(submit(gen.token, body({ phone: '' }))).rejects.toThrow(/เบอร์โทร/)
    await expect(submit(gen.token, body({ phone: 'abc' }))).rejects.toThrow(/เบอร์โทร/)
    await expect(submit(gen.token, body({ consent: false }))).rejects.toThrow(/ประกาศความเป็นส่วนตัว/)
  })
  it('ใช้ซ้ำได้หลายราย ไม่จำกัดจำนวนครั้งตามลิงก์รายลูกค้า (เกิน 10 และ 50) แต่มีเพดาน 60 ครั้ง/10 นาที', async () => {
    for (let i = 0; i < 55; i++) await submit(gen.token, body({ business_name: `ร้าน ${i}` }))
    expect((await t.as('owner', `select submission_count from brief_links where id=$1`, [gen.link_id]))[0].submission_count).toBeGreaterThan(50)
    await expect((async () => { for (let i = 0; i < 20; i++) await submit(gen.token) })()).rejects.toThrow(/ถี่เกินไป/)
  })
  it('honeypot ใช้ได้ และ SQL injection ถูกเก็บเป็นข้อความ', async () => {
    const g2 = (await t.as('owner', `select * from create_general_brief_link('ลิงก์สอง')`))[0]
    const evil = `x'); DROP TABLE customers; --`
    const id = (await submit(g2.token, body({ business_name: evil })))[0].r.id
    expect((await t.as('admin', `select business_name from customer_briefs where id=$1`, [id]))[0].business_name).toBe(evil)
    expect((await submit(g2.token, body({ website: 'http://spam' })))[0].r.ok).toBe(true)
  })
  it('ทีมจับคู่ Brief กับลูกค้า/เพจ แล้วผู้ดูแลเพจเห็น; Page Admin จับคู่เองไม่ได้', async () => {
    const g3 = (await t.as('owner', `select * from create_general_brief_link('ลิงก์สาม')`))[0]
    const id = (await submit(g3.token))[0].r.id
    await expect(t.as('adminA', `update customer_briefs set customer_id=$2, page_id=$3 where id=$1 returning id`, [id, cust, page])).resolves.toHaveLength(0)
    await t.as('mgr', `update customer_briefs set customer_id=$2, page_id=$3 where id=$1`, [id, cust, page])
    expect(await t.as('adminA', `select id from customer_briefs where id=$1`, [id])).toHaveLength(1)
    expect(await t.as('adminB', `select id from customer_briefs where id=$1`, [id])).toHaveLength(0)
  })
  it('ยกเลิกลิงก์กลางได้ทันที และลิงก์รายลูกค้าเดิมยังทำงาน/ถูกจำกัดตามเดิม', async () => {
    const g4 = (await t.as('owner', `select * from create_general_brief_link('จะยกเลิก')`))[0]
    await submit(g4.token)
    await t.as('owner', `update brief_links set revoked_at = now() where id=$1`, [g4.link_id])
    await expect(submit(g4.token)).rejects.toThrow(/ยกเลิก/)
    const one = (await t.as('owner', `select * from create_brief_link($1,$2,'x',14,2)`, [cust, page]))[0]
    await submit(one.token, JSON.stringify({ ad_budget_monthly: '1000', consent: true })); await submit(one.token, JSON.stringify({ consent: true }))
    await expect(submit(one.token, JSON.stringify({ consent: true }))).rejects.toThrow(/ครบจำนวน/)
  })
  it('ลิงก์รายลูกค้าต้องมีลูกค้า+วันหมดอายุ (constraint)', async () => {
    await expect(t.as('admin', `insert into brief_links (token_hash, is_general) values ('h1', false)`)).rejects.toThrow()
  })
})
