// Supabase Edge Function: create-staff
// Owner เท่านั้นที่สร้างบัญชีพนักงานได้ — ใช้ service_role ฝั่งเซิร์ฟเวอร์ (ไม่เคยอยู่ในเว็บ)
// Deploy: supabase functions deploy create-staff   (SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY ถูกใส่ให้อัตโนมัติ)
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ error: 'กรุณาเข้าสู่ระบบ' }, 401)
  const { data: me } = await caller.from('profiles').select('role, status').eq('id', user.id).maybeSingle()
  if (me?.role !== 'owner' || me.status !== 'active') return json({ error: 'เฉพาะ Owner เท่านั้นที่เพิ่มพนักงานได้' }, 403)

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400) }
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '')
  const email = str('email').toLowerCase(), password = str('password'), full_name = str('full_name')
  const role = str('role') || 'page_admin'

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'อีเมลไม่ถูกต้อง' }, 400)
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    return json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัว และมีทั้งตัวอักษรกับตัวเลข' }, 400)
  if (!full_name) return json({ error: 'กรุณากรอกชื่อ-นามสกุล' }, 400)
  if (!['owner', 'manager', 'page_admin'].includes(role)) return json({ error: 'สิทธิ์ไม่ถูกต้อง' }, 400)
  const phone = str('phone') || null
  if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) return json({ error: 'เบอร์โทรไม่ถูกต้อง' }, 400)
  const start_date = str('start_date') || null
  if (start_date && !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) return json({ error: 'วันที่เริ่มงานไม่ถูกต้อง' }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { role }, user_metadata: { full_name },
  })
  if (error || !created.user) {
    const dup = /already|registered|exists/i.test(error?.message ?? '')
    return json({ error: dup ? 'อีเมลนี้มีบัญชีอยู่แล้ว' : 'สร้างบัญชีไม่สำเร็จ' }, dup ? 409 : 400)
  }
  // trigger handle_new_user สร้าง profile ให้แล้ว — เติมข้อมูลที่เหลือ
  const { error: upErr } = await admin.from('profiles').update({
    full_name, job_title: str('job_title') || null, phone, start_date,
    can_view_revenue: role === 'manager' && b.can_view_revenue === true,
  }).eq('id', created.user.id)
  if (upErr) return json({ error: 'สร้างบัญชีแล้ว แต่บันทึกข้อมูลเพิ่มเติมไม่สำเร็จ กรุณาแก้ไขในหน้าทีมงาน', id: created.user.id }, 207)
  return json({ id: created.user.id })
})
