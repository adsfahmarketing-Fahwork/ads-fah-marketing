/* eslint-disable @typescript-eslint/no-explicit-any */
// โหมดสาธิต: จำลอง Supabase API ในเบราว์เซอร์ด้วยข้อมูลตัวอย่าง (ไม่ติดต่อเซิร์ฟเวอร์ใดๆ และไม่บันทึกข้อมูล)
// ไฟล์นี้ถูกโหลดเฉพาะเมื่อ build ด้วย VITE_DEMO=1 เท่านั้น — build จริงไม่มีโค้ดส่วนนี้
import { addDays, todayBangkok } from '../lib/format'

export const DEMO_PASSWORD = 'demo'
export const DEMO_USERS = [
  { id: 'u1', email: 'owner@demo.example', label: 'Owner (เจ้าของ)' },
  { id: 'u2', email: 'manager@demo.example', label: 'Manager (ผู้จัดการ)' },
  { id: 'u3', email: 'admin@demo.example', label: 'Page Admin (พนักงานดูแลเพจ)' },
] as const

const DEMO_MSG = 'โหมดสาธิต — ไม่สามารถบันทึกข้อมูลได้ (เป็นข้อมูลตัวอย่างเท่านั้น)'
const tag = ' [ตัวอย่าง]'

function build(T: string) {
  const d = (n: number) => addDays(T, n)
  const staff = [
    { id: 'u1', employee_code: 'E-0001', full_name: 'ฟ้า (เจ้าของ)' + tag, job_title: 'เจ้าของบริษัท', email: 'owner@demo.example', phone: '0800000001', role: 'owner', status: 'active', can_view_revenue: true, start_date: d(-600) },
    { id: 'u2', employee_code: 'E-0002', full_name: 'มาลี ผู้จัดการ' + tag, job_title: 'ผู้จัดการ', email: 'manager@demo.example', phone: '0800000002', role: 'manager', status: 'active', can_view_revenue: false, start_date: d(-420) },
    { id: 'u3', employee_code: 'E-0003', full_name: 'สมชาย แอดมินเพจ' + tag, job_title: 'แอดมินเพจ', email: 'admin@demo.example', phone: '0800000003', role: 'page_admin', status: 'active', can_view_revenue: false, start_date: d(-300) },
    { id: 'u4', employee_code: 'E-0004', full_name: 'สุดา แอดมินเพจ' + tag, job_title: 'แอดมินเพจ', email: 'admin2@demo.example', phone: null, role: 'page_admin', status: 'active', can_view_revenue: false, start_date: d(-120) },
  ]
  const customers = ([
    ['c1', 'C-00001', 'ร้านกาแฟบ้านสวน', 'คุณนก', '0811111111', 'ร้านอาหาร/เครื่องดื่ม', d(-190), 'active'],
    ['c2', 'C-00002', 'คลินิกความงามใสปิ๊ง', 'คุณแพร', '0822222222', 'ความงาม', d(-137), 'active'],
    ['c3', 'C-00003', 'ฟิตเนส พลัสแอคทีฟ', 'คุณบอส', '0833333333', 'ฟิตเนส', d(-60), 'active'],
    ['c4', 'C-00004', 'ร้านเสื้อผ้าแฟชั่นมินิมอล', 'คุณมิ้น', '0844444444', 'แฟชั่น', d(-25), 'active'],
    ['c5', 'C-00005', 'โรงแรมริมน้ำ', 'คุณต้น', '0855555555', 'ท่องเที่ยว', d(-260), 'churned'],
  ] as const).map(([id, customer_code, n, contact_name, phone, business_type, started_at, status]) => ({ id, customer_code, business_name: n + tag, contact_name, phone, line_id: '@' + id, email: null, business_type, started_at, status, notes: null }))
  const cust = (id: string) => customers.find((c) => c.id === id)!
  const pages = ([['p1', 'c1', 'บ้านสวนคาเฟ่', 'u3'], ['p2', 'c2', 'ใสปิ๊ง คลินิก', 'u3'], ['p3', 'c2', 'ใสปิ๊ง โปรโมชั่น', 'u4'], ['p4', 'c3', 'Plus Active Fitness', 'u4'], ['p5', 'c4', 'Minimal Wear', 'u3'], ['p6', 'c5', 'โรงแรมริมน้ำ', null]] as const)
    .map(([id, customer_id, name, a]) => ({ id, customer_id, platform: 'facebook', page_name: name + tag, page_url: 'https://www.facebook.com/', instagram_url: null, status: id === 'p6' ? 'ended' : 'active',
      notes: id === 'p1' ? 'ลูกค้าชอบโพสต์ช่วงเช้า ห้ามใช้รูปสต็อก' : null, _a: a }))
  const page = (id: string) => pages.find((p) => p.id === id)!
  const contracts = ([
    ['k1', 'CT-2026-0001', 'c1', 'p1', d(-15), d(14), 'active', 1, 9000], ['k2', 'CT-2026-0002', 'c2', 'p2', d(-45), d(-16), 'expired', 2, 12000],
    ['k3', 'CT-2026-0003', 'c3', 'p4', d(-3), d(26), 'active', 1, 7500], ['k4', 'CT-2026-0004', 'c4', 'p5', d(-26), d(3), 'expiring', 1, 8000], ['k5', 'CT-2026-0005', 'c5', 'p6', d(-240), d(-211), 'cancelled', 1, 6000],
  ] as const).map(([id, contract_no, customer_id, pid, start_date, end_date, status, cycle_no, fee]) => ({
    id, contract_no, customer_id, service_type: 'ดูแลเพจ + ยิงโฆษณา', start_date, end_date, duration_days: 30, status, cycle_no,
    cancel_reason: status === 'cancelled' ? 'งบประมาณไม่พอ' : null, cancelled_at: status === 'cancelled' ? d(-220) : null, notes: null, _p: pid,
    customers: { business_name: cust(customer_id).business_name }, contract_pages: [{ page_id: pid, pages: { page_name: page(pid).page_name } }], contract_financials: [{ cycle_no, monthly_fee: fee, ad_budget: 15000 }] }))
  const tasks = ([['t1', 'ทำโพสต์โปรโมชั่นปลายปี', 'p1', 'u3', d(-4), 'high', 'in_progress'], ['t2', 'รายงานผลโฆษณาประจำเดือน', 'p2', 'u3', d(2), 'medium', 'todo'], ['t3', 'ออกแบบแบนเนอร์เปิดสาขาใหม่', 'p4', 'u4', d(9), 'urgent', 'in_review'],
    ['t4', 'ตอบแชทลูกค้าค้างคิว', 'p5', 'u3', d(-6), 'high', 'todo'], ['t5', 'อัปเดตปกเพจ', 'p3', 'u4', d(-11), 'low', 'done']] as const)
    .map(([id, title, page_id, assignee_id, due_date, priority, status]) => ({ id, title, description: null, page_id, assignee_id, created_by: 'u2', due_date, priority, status, notes: null, created_at: `${d(-12)}T03:00:00Z`, completed_at: null, pages: { page_name: page(page_id).page_name } }))
  const briefs = [
    { id: 'b1', _p: 'p4', status: 'new', version: 1, submitted_at: `${d(-1)}T05:00:00Z`, reviewed_at: null, internal_notes: null, business_name: 'ฟิตเนส พลัสแอคทีฟ' + tag, contact_name: 'คุณบอส', phone: '0833333333', line_id: '@boss', fb_page_name: 'Plus Active Fitness', fb_page_url: 'https://www.facebook.com/', instagram_url: null, product_category: 'ฟิตเนส / คลาสออกกำลังกาย', ad_budget_monthly: 15000, age_min: 22, age_max: 45, provinces: ['กรุงเทพมหานคร', 'นนทบุรี'], target_audience: 'คนทำงานออฟฟิศที่ต้องการลดน้ำหนัก', ad_objective: 'ข้อความ / Inbox / LINE', promote_items: 'แพ็กเกจ 3 เดือน', current_promotion: 'สมัครวันนี้ลด 20%', contact_link: '@boss', extra_details: null, customers: { business_name: cust('c3').business_name }, pages: { page_name: page('p4').page_name } },
    { id: 'b2', _p: 'p5', status: 'reviewed', version: 1, submitted_at: `${d(-8)}T05:00:00Z`, reviewed_at: `${d(-7)}T05:00:00Z`, internal_notes: 'ตรวจแล้ว', business_name: 'ร้านเสื้อผ้าแฟชั่นมินิมอล' + tag, contact_name: 'คุณมิ้น', phone: '0844444444', line_id: null, fb_page_name: null, fb_page_url: null, instagram_url: null, product_category: 'แฟชั่น', ad_budget_monthly: 10000, age_min: 18, age_max: 34, provinces: ['ทั่วประเทศ'], target_audience: null, ad_objective: 'ยอดขาย / ออเดอร์', promote_items: null, current_promotion: null, contact_link: null, extra_details: null, customers: { business_name: cust('c4').business_name }, pages: { page_name: page('p5').page_name } }]
  const links = [{ id: 'l1', label: 'ลิงก์รอบแรก', expires_at: `${d(13)}T00:00:00Z`, revoked_at: null, max_submissions: 5, submission_count: 1, created_at: `${d(-4)}T00:00:00Z`, customers: { business_name: cust('c3').business_name }, pages: { page_name: page('p4').page_name } }]
  const notifications = [
    { id: 'n1', recipient_id: '*', title: 'ลูกค้าส่ง Brief ใหม่', body: 'Plus Active Fitness' + tag, entity_type: 'brief', read_at: null, created_at: `${T}T05:00:00Z` },
    { id: 'n2', recipient_id: '*', title: 'สัญญาใกล้หมดอายุ', body: 'ร้านเสื้อผ้าแฟชั่นมินิมอล · CT-2026-0004 · เหลือ 3 วัน', entity_type: 'contract', read_at: null, created_at: `${T}T00:05:00Z` },
    { id: 'n3', recipient_id: '*', title: 'คุณได้รับมอบหมายงานใหม่', body: 'รายงานผลโฆษณาประจำเดือน', entity_type: 'task', read_at: `${d(-2)}T00:00:00Z`, created_at: `${d(-3)}T05:00:00Z` },
  ]
  const [y, m] = T.split('-').map(Number)
  const months = Array.from({ length: 6 }, (_, i) => { const t = y * 12 + (m - 1) - (5 - i); return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` })
  const monthly = months.map((month, i) => ({ month, new_customers: [1, 2, 1, 2, 3, 2][i], new_pages: [1, 3, 1, 2, 4, 3][i], renewed: [0, 1, 2, 2, 3, 4][i], lost: [0, 0, 1, 0, 1, 1][i], revenue: [18000, 27000, 33000, 42000, 54000, 63000][i] }))
  const audit = [
    { id: 'a1', actor_id: 'u1', action: 'UPDATE', table_name: 'contracts', record_id: 'k4', old_data: { status: 'active', updated_at: '1' }, new_data: { status: 'expiring', contract_no: 'CT-2026-0004', updated_at: '2' }, created_at: `${T}T00:05:00Z` },
    { id: 'a2', actor_id: 'u2', action: 'INSERT', table_name: 'customers', record_id: 'c4', old_data: null, new_data: { business_name: cust('c4').business_name }, created_at: `${d(-25)}T03:00:00Z` },
  ]
  const report = (rev: boolean) => ({
    summary: { monthly: monthly.map((x) => ({ ...x, revenue: rev ? x.revenue : null })), revenue: rev ? 63000 : null, customers_total: 5, pages_active: 5, pages_new: 3, contracts_expiring: 1, contracts_renewed: 4, contracts_lost: 1, staff_active: 4, tasks_open: 4, tasks_overdue: 2, briefs_pending: 1 },
    retention: { renewed: 12, lost: 2, rate: 85.7 },
    staff_pages: [{ staff: staff[2].full_name, code: 'E-0003', pages: 3 }, { staff: staff[3].full_name, code: 'E-0004', pages: 2 }],
    staff_tasks: [{ staff: staff[2].full_name, done: 9, overdue: 2, open: 3 }, { staff: staff[3].full_name, done: 6, overdue: 0, open: 1 }],
    cancel_reasons: [{ reason: 'งบประมาณไม่พอ', count: 2 }, { reason: 'ไม่เห็นผลลัพธ์', count: 1 }],
    renewed_list: [{ contract_no: 'CT-2026-0002', customer: cust('c2').business_name, cycle_no: 2, new_start_date: d(-45), new_end_date: d(-16), renewed_on: d(-46) }],
    lost_list: [{ contract_no: 'CT-2026-0005', customer: cust('c5').business_name, end_date: d(-211), cancelled_at: d(-220), status: 'cancelled', cancel_reason: 'งบประมาณไม่พอ' }],
  })
  return { staff, customers, pages, contracts, tasks, briefs, links, notifications, audit, report, T, d }
}

const strip = (r: any) => { const o: any = {}; for (const k of Object.keys(r)) if (!k.startsWith('_')) o[k] = r[k]; return o }

/** ข้อมูลที่ผู้ใช้แต่ละสิทธิ์มองเห็น (จำลอง RLS) */
export function scoped(uid: string | null, T = todayBangkok()) {
  const D = build(T)
  const me = D.staff.find((s) => s.id === uid)
  if (!me) return { me: null, D, tables: {} as Record<string, any[]>, summary: null }
  const mgmt = me.role !== 'page_admin'
  const myPages = new Set<string>(D.pages.filter((p) => p._a === me.id).map((p) => p.id))
  const pages = mgmt ? D.pages : D.pages.filter((p) => myPages.has(p.id))
  const pageIds = new Set<string>(pages.map((p) => p.id))
  const customers = mgmt ? D.customers : D.customers.filter((c) => pages.some((p) => p.customer_id === c.id))
  const contracts = mgmt ? D.contracts : D.contracts.filter((k) => pageIds.has(k._p))
  const tasks = mgmt ? D.tasks : D.tasks.filter((t) => t.assignee_id === me.id)
  const briefs = mgmt ? D.briefs : D.briefs.filter((b) => pageIds.has(b._p))
  const canRev = me.role === 'owner' || (me.role === 'manager' && me.can_view_revenue)
  const nPages = (cid: string) => pages.filter((p) => p.customer_id === cid)
  const hide = (k: any) => canRev ? k : { ...k, contract_financials: [] }
  const tables: Record<string, any[]> = {
    customers: customers.map((c) => ({ ...c, pages: nPages(c.id).map((p) => ({ id: p.id, page_name: p.page_name })) })),
    pages: pages.map((p) => ({ ...p, customers: { id: p.customer_id, business_name: D.customers.find((c) => c.id === p.customer_id)!.business_name, customer_code: D.customers.find((c) => c.id === p.customer_id)!.customer_code }, page_assignments: mgmt ? (p._a ? [{ staff_id: p._a }] : []) : (p._a === me.id ? [{ staff_id: me.id }] : []) })),
    contracts: contracts.map(hide), tasks,
    profiles: mgmt ? D.staff : [me],
    staff_directory: D.staff.map(({ id, full_name, role }) => ({ id, full_name, role })),
    customer_briefs: briefs, brief_links: mgmt ? D.links : [],
    notifications: D.notifications.map((n) => ({ ...n, recipient_id: me.id })),
    page_assignments: D.pages.filter((p) => p._a && (mgmt || p._a === me.id)).map((p) => ({ page_id: p.id, staff_id: p._a })),
    audit_logs: me.role === 'owner' ? D.audit : [], task_comments: [{ id: 'm1', author_id: 'u2', body: 'เปลี่ยนสถานะ: รอดำเนินการ → กำลังดำเนินการ', created_at: `${D.d(-5)}T03:00:00Z` }], attachments: [],
  }
  const open = tasks.filter((t) => t.status !== 'done')
  const rep = D.report(canRev)
  const summary = {
    ...rep.summary, customers_total: customers.length, pages_active: pages.filter((p) => p.status === 'active').length,
    contracts_expiring: contracts.filter((k) => !['cancelled', 'expired'].includes(k.status) && k.end_date >= T && k.end_date <= D.d(7)).length,
    staff_active: mgmt ? 4 : null, tasks_open: open.length, tasks_overdue: open.filter((t) => t.due_date < T).length,
    briefs_pending: briefs.filter((b) => b.status !== 'reviewed').length, ...(mgmt ? {} : { contracts_renewed: 0, contracts_lost: 0, pages_new: 0 }),
  }
  return { me, D, tables, summary, canRev, mgmt }
}

// ---------- ตัวกรองแบบ PostgREST อย่างง่าย ----------
function passes(row: any, key: string, raw: string): boolean {
  const v = row[key]
  const [op, ...rest] = raw.split('.'); const arg = rest.join('.')
  switch (op) {
    case 'eq': return String(v) === arg
    case 'neq': return String(v) !== arg
    case 'is': return arg === 'null' ? v === null || v === undefined : v === (arg === 'true')
    case 'gte': return v !== null && v >= arg
    case 'lte': return v !== null && v <= arg
    case 'lt': return v !== null && v < arg
    case 'gt': return v !== null && v > arg
    case 'ilike': return String(v ?? '').toLowerCase().includes(arg.replace(/%/g, '').toLowerCase())
    case 'in': return arg.slice(1, -1).split(',').includes(String(v))
    case 'not': { const [op2, ...r2] = rest; return !passes(row, key, `${op2}.${r2.join('.')}`) }
    default: return true
  }
}
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'or', 'and', 'columns'])

function userFromAuth(h: Headers): string | null {
  try {
    const t = (h.get('authorization') ?? '').replace(/^Bearer /i, '').split('.')[1]
    return t ? JSON.parse(atob(t.replace(/-/g, '+').replace(/_/g, '/'))).sub ?? null : null
  } catch { return null }
}
const b64u = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
export function demoSession(uid: string) {
  const u = DEMO_USERS.find((x) => x.id === uid)!
  const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 86400
  const jwt = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: uid, exp, role: 'authenticated', aud: 'authenticated' })}.demo`
  return { access_token: jwt, refresh_token: 'demo', expires_at: exp, expires_in: 10 * 365 * 86400, token_type: 'bearer', user: { id: uid, aud: 'authenticated', email: u.email, app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' } }
}

const J = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } })
const fail = (message: string, code = 'DEMO', status = 400) => J({ code, message }, status)

export async function handleDemo(req: Request, T = todayBangkok()): Promise<Response> {
  const url = new URL(req.url)
  const p = url.pathname
  if (p.startsWith('/auth/v1/token')) {
    const body: any = await req.json().catch(() => ({}))
    const u = DEMO_USERS.find((x) => x.email === String(body.email ?? '').toLowerCase())
    return u && body.password === DEMO_PASSWORD ? J(demoSession(u.id)) : J({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400)
  }
  if (p.startsWith('/auth/v1/logout')) return J(null, 204)
  if (p.startsWith('/auth/v1/user')) return req.method === 'PUT' ? fail(DEMO_MSG) : J({ id: userFromAuth(req.headers), aud: 'authenticated' })
  if (p.startsWith('/functions/v1/')) return J({ error: DEMO_MSG }, 403)
  if (p.startsWith('/storage/v1/')) return J({ message: DEMO_MSG, error: 'demo', statusCode: '403' }, 403)

  const uid = userFromAuth(req.headers)
  const S = scoped(uid, T)

  if (p.startsWith('/rest/v1/rpc/')) {
    const fn = p.slice('/rest/v1/rpc/'.length)
    if (fn === 'get_brief_link_info') return J({ valid: true, link_id: '11111111-1111-1111-1111-111111111111', business_name: 'ฟิตเนส พลัสแอคทีฟ' + tag, page_name: 'Plus Active Fitness' + tag })
    if (fn === 'submit_brief') return J({ ok: true, id: 'demo' })
    if (!S.me) return fail('กรุณาเข้าสู่ระบบ', '42501', 401)
    if (fn === 'dashboard_summary') return J(S.summary)
    if (fn === 'report_data') return S.mgmt ? J(S.D.report(!!S.canRev)) : fail('ไม่มีสิทธิ์ดูรายงาน', '42501', 403)
    if (fn === 'run_daily_jobs' || fn === 'refresh_contract_statuses') return J({})
    return fail(DEMO_MSG)
  }
  if (p.startsWith('/rest/v1/')) {
    const table = p.slice('/rest/v1/'.length)
    if (!S.me) return J(req.method === 'HEAD' ? null : [], 200)
    if (req.method === 'PATCH' && table === 'notifications') return J(null, 204)
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(DEMO_MSG)
    let rows = (S.tables[table] ?? []).map((r) => r)
    for (const [k, v] of url.searchParams) if (!SKIP.has(k)) rows = rows.filter((r) => passes(r, k, v))
    const order = url.searchParams.get('order')
    if (order) { const [col, dir] = order.split('.'); rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1)) }
    const lim = Number(url.searchParams.get('limit')); if (lim) rows = rows.slice(0, lim)
    rows = rows.map(strip)
    const range = `0-${Math.max(rows.length - 1, 0)}/${rows.length}`
    if (req.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': range } })
    if (/pgrst\.object/.test(req.headers.get('accept') ?? '')) return rows[0] ? J(rows[0]) : J({ code: 'PGRST116', message: 'no rows' }, 406)
    return J(rows, 200, { 'content-range': range })
  }
  return J({ message: 'not found' }, 404)
}

/** ติดตั้งตัวดักจับ fetch: เฉพาะคำขอไปยังโดเมนจำลอง ส่วนอื่น (เช่น ฟอนต์) ผ่านตามปกติ */
export function installDemoFetch(baseUrl: string) {
  const real = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    return req.url.startsWith(baseUrl) ? handleDemo(req) : real(input, init)
  }
}

