import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createDb } from './db'

let t: Awaited<ReturnType<typeof createDb>>
let cust: string, pg1: string, pg2: string, other: string

const create = (who: string, start: string, dur = 30, pages = [pg1]) =>
  t.as(who, `select create_contract($1, 'ดูแลเพจรายเดือน', $2::date, $3, 9000, 15000, $4::uuid[], null) id`, [cust, start, dur, pages])

beforeAll(async () => {
  t = await createDb()
  await t.addUser('owner', 'owner', 'เจ้าของ')
  await t.addUser('mgr', 'manager', 'ผู้จัดการ')
  await t.addUser('adm', 'page_admin', 'แอดมิน')
  cust = (await t.as('owner', `insert into customers (business_name) values ('[ทดสอบ] ก') returning id`))[0].id
  const o = (await t.as('owner', `insert into customers (business_name) values ('[ทดสอบ] ข') returning id`))[0].id
  pg1 = (await t.as('owner', `insert into pages (customer_id, page_name) values ($1,'p1') returning id`, [cust]))[0].id
  pg2 = (await t.as('owner', `insert into pages (customer_id, page_name) values ($1,'p2') returning id`, [cust]))[0].id
  other = (await t.as('owner', `insert into pages (customer_id, page_name) values ($1,'p3') returning id`, [o]))[0].id
})

describe('create_contract', () => {
  it('สร้างสัญญา + เพจ + ค่าบริการรอบแรก; 1 ธ.ค. -> 30 ธ.ค.', async () => {
    const id = (await create('owner', '2099-12-01', 30, [pg1, pg2]))[0].id
    const c = (await t.as('owner', `select to_char(end_date,'YYYY-MM-DD') e, cycle_no, status from contracts where id=$1`, [id]))[0]
    expect(c).toMatchObject({ e: '2099-12-30', cycle_no: 1, status: 'pending_start' })
    expect(await t.as('owner', `select 1 from contract_pages where contract_id=$1`, [id])).toHaveLength(2)
    expect((await t.as('owner', `select monthly_fee from contract_financials where contract_id=$1`, [id]))[0].monthly_fee).toBe('9000.00')
  })
  it('สัญญาที่เริ่มแล้วเป็น "กำลังดูแล"', async () => {
    const id = (await create('mgr', (await t.as('admin', `select bangkok_today()::text d`))[0].d, 30))[0].id
    expect((await t.as('owner', `select status from contracts where id=$1`, [id]))[0].status).toBe('active')
  })
  it('Page Admin สร้างไม่ได้ / เพจของลูกค้าอื่นไม่ได้ / ไม่เลือกเพจไม่ได้', async () => {
    await expect(create('adm', '2099-01-01')).rejects.toThrow(/ไม่มีสิทธิ์/)
    await expect(create('owner', '2099-01-01', 30, [other])).rejects.toThrow(/ไม่ได้เป็นของลูกค้า/)
    await expect(create('owner', '2099-01-01', 30, [])).rejects.toThrow(/อย่างน้อย/)
  })
})

describe('renew_contract', () => {
  let id: string
  beforeAll(async () => { id = (await create('owner', '2099-12-01'))[0].id })
  it('ต่อสัญญา: รอบใหม่ต่อจากวันสิ้นสุดเดิม และเก็บประวัติรอบเดิม', async () => {
    await t.as('mgr', `select renew_contract($1)`, [id])
    const c = (await t.as('owner', `select to_char(start_date,'YYYY-MM-DD') s, to_char(end_date,'YYYY-MM-DD') e, cycle_no from contracts where id=$1`, [id]))[0]
    expect(c).toEqual({ s: '2099-12-31', e: '2100-01-29', cycle_no: 2 })
    const h = (await t.as('owner', `select to_char(previous_start_date,'YYYY-MM-DD') ps, to_char(previous_end_date,'YYYY-MM-DD') pe, cycle_no from contract_renewals where contract_id=$1`, [id]))[0]
    expect(h).toEqual({ ps: '2099-12-01', pe: '2099-12-30', cycle_no: 2 })
  })
  it('ค่าบริการเดิมของรอบ 1 ยังอยู่ และรอบ 2 สืบค่าจากรอบก่อน (หรือกำหนดใหม่ได้)', async () => {
    await t.as('owner', `select renew_contract($1, null, 45, 12000, null)`, [id])
    const f = await t.as('owner', `select cycle_no, monthly_fee::text m, ad_budget::text b from contract_financials where contract_id=$1 order by cycle_no`, [id])
    expect(f).toEqual([{ cycle_no: 1, m: '9000.00', b: '15000.00' }, { cycle_no: 2, m: '9000.00', b: '15000.00' }, { cycle_no: 3, m: '12000.00', b: '15000.00' }])
    expect((await t.as('owner', `select duration_days, to_char(end_date,'YYYY-MM-DD') e from contracts where id=$1`, [id]))[0]).toEqual({ duration_days: 45, e: '2100-03-15' })
  })
  it('Page Admin ต่อสัญญาไม่ได้; วันเริ่มซ้อนทับไม่ได้; ยกเลิกแล้วต่อไม่ได้', async () => {
    await expect(t.as('adm', `select renew_contract($1)`, [id])).rejects.toThrow(/ไม่มีสิทธิ์/)
    await expect(t.as('owner', `select renew_contract($1, '2099-12-31')`, [id])).rejects.toThrow(/หลังวันสิ้นสุด/)
    await t.as('owner', `update contracts set status='cancelled', cancelled_at=current_date, cancel_reason='ไม่คุ้ม' where id=$1`, [id])
    await expect(t.as('owner', `select renew_contract($1)`, [id])).rejects.toThrow(/ยกเลิกแล้ว/)
  })
})

describe('refresh_contract_statuses', () => {
  it('ใกล้หมด (<=7 วัน) / หมดสัญญา / ยังไม่เริ่ม', async () => {
    const mk = async (offsetStart: number, dur: number) => {
      const d = (await t.as('admin', `select (bangkok_today() + $1::int)::text d`, [offsetStart]))[0].d
      return (await create('owner', d, dur))[0].id as string
    }
    const near = await mk(-24, 30)   // เหลือ 5 วัน
    const far = await mk(-5, 30)     // เหลือ 25 วัน
    const old = await mk(-40, 30)    // หมดแล้ว
    const fut = await mk(10, 30)
    await t.as('mgr', `select refresh_contract_statuses()`)
    const st = async (i: string) => (await t.as('owner', `select status from contracts where id=$1`, [i]))[0].status
    expect(await st(near)).toBe('expiring')
    expect(await st(far)).toBe('active')
    expect(await st(old)).toBe('expired')
    expect(await st(fut)).toBe('pending_start')
  })
  it('Page Admin เรียกไม่ได้', async () => {
    await expect(t.as('adm', `select refresh_contract_statuses()`)).rejects.toThrow(/ไม่มีสิทธิ์/)
  })
})

describe('ข้อมูลทดสอบ (seed_dev.sql)', () => {
  it('รันได้และทุกแถวมีป้าย [ทดสอบ]', async () => {
    await t.db.exec(readFileSync(join(__dirname, '..', 'supabase', 'seed_dev.sql'), 'utf8'))
    const rows = await t.as('admin', `select business_name from customers where notes = 'ข้อมูลทดสอบ'`)
    expect(rows.length).toBe(2)
    for (const r of rows) expect(r.business_name).toMatch(/^\[ทดสอบ\]/)
  })
})
