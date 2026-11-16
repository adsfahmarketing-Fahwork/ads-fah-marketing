import { describe, expect, it } from 'vitest'
import { DEMO_PASSWORD, handleDemo } from '../src/demo/mockApi'
import { demoSession } from '../src/demo/mockApi'

const T = '2026-11-16'
const call = async (uid: string | null, path: string, init: RequestInit = {}) => {
  const h = new Headers(init.headers); if (uid) h.set('authorization', `Bearer ${demoSession(uid).access_token}`)
  const r = await handleDemo(new Request(`https://demo.supabase.invalid${path}`, { ...init, headers: h }), T)
  return { status: r.status, body: r.status === 204 || init.method === 'HEAD' ? null : await r.json() }
}

describe('โหมดสาธิต: จำลองสิทธิ์เหมือนระบบจริง', () => {
  it('Page Admin เห็นเฉพาะเพจ/ลูกค้า/งานของตน และไม่เห็นรายได้ในข้อมูลสัญญา', async () => {
    const pages = (await call('u3', '/rest/v1/pages')).body
    expect(pages.map((p: any) => p.id).sort()).toEqual(['p1', 'p2', 'p5'])
    expect((await call('u3', '/rest/v1/tasks')).body.every((t: any) => t.assignee_id === 'u3')).toBe(true)
    expect((await call('u3', '/rest/v1/customers')).body.length).toBe(3)
    const k = (await call('u3', '/rest/v1/contracts')).body
    expect(k.every((x: any) => x.contract_financials.length === 0)).toBe(true)
    expect((await call('u3', '/rest/v1/profiles')).body).toHaveLength(1)
    expect((await call('u3', '/rest/v1/audit_logs')).body).toHaveLength(0)
    expect((await call('u3', '/rest/v1/brief_links')).body).toHaveLength(0)
  })
  it('Dashboard: Owner เห็นรายได้, Manager/Page Admin ไม่เห็น', async () => {
    const s = async (u: string) => (await call(u, '/rest/v1/rpc/dashboard_summary', { method: 'POST' })).body
    expect((await s('u1')).revenue).toBe(63000)
    expect((await s('u2')).revenue).toBeNull()
    const a = await s('u3'); expect(a.revenue).toBeNull(); expect(a.staff_active).toBeNull(); expect(a.pages_active).toBe(3)
  })
  it('รายงาน: Page Admin ไม่มีสิทธิ์ / Manager ไม่มีรายได้ / ไม่ล็อกอินเห็นข้อมูลไม่ได้', async () => {
    expect((await call('u3', '/rest/v1/rpc/report_data', { method: 'POST' })).status).toBe(403)
    expect((await call('u2', '/rest/v1/rpc/report_data', { method: 'POST' })).body.summary.revenue).toBeNull()
    expect((await call(null, '/rest/v1/customers')).body).toEqual([])
    expect((await call(null, '/rest/v1/rpc/dashboard_summary', { method: 'POST' })).status).toBe(401)
  })
  it('ไม่บันทึกข้อมูลจริง: การเขียนทุกชนิดถูกปฏิเสธด้วยข้อความภาษาไทย', async () => {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const r = await call('u1', '/rest/v1/customers', { method, body: '{}' })
      expect(r.status).toBe(400); expect(r.body.message).toMatch(/โหมดสาธิต/)
    }
    expect((await call('u1', '/rest/v1/rpc/create_contract', { method: 'POST', body: '{}' })).body.message).toMatch(/โหมดสาธิต/)
    expect((await call('u1', '/functions/v1/create-staff', { method: 'POST', body: '{}' })).status).toBe(403)
  })
  it('เข้าสู่ระบบด้วยบัญชีตัวอย่างเท่านั้น', async () => {
    const ok = await call(null, '/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: 'ADMIN@demo.example', password: DEMO_PASSWORD }) })
    expect(ok.body.user.id).toBe('u3')
    expect((await call(null, '/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: 'admin@demo.example', password: 'x' }) })).status).toBe(400)
  })
  it('ฟอร์มลูกค้า (public) ใช้ได้โดยไม่ต้องล็อกอิน และตัวกรอง/นับจำนวนทำงาน', async () => {
    expect((await call(null, '/rest/v1/rpc/get_brief_link_info', { method: 'POST' })).body.valid).toBe(true)
    expect((await call(null, '/rest/v1/rpc/submit_brief', { method: 'POST', body: '{}' })).body.ok).toBe(true)
    expect((await call('u1', '/rest/v1/tasks?status=neq.done')).body).toHaveLength(4)
    expect((await call('u1', '/rest/v1/customers?id=eq.c2', { headers: { accept: 'application/vnd.pgrst.object+json' } })).body.id).toBe('c2')
  })
  it('ข้อมูลทุกรายการมีป้าย [ตัวอย่าง] และวันที่อิงวันปัจจุบัน', async () => {
    const cs = (await call('u1', '/rest/v1/customers')).body
    expect(cs.every((c: any) => c.business_name.includes('[ตัวอย่าง]'))).toBe(true)
    const k4 = (await call('u1', '/rest/v1/contracts?id=eq.k4')).body[0]
    expect(k4.end_date).toBe('2026-11-19')
  })
})
