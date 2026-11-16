import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Field, Spinner } from '../components/ui'
import { supabase } from '../lib/supabase'
import { isConfigured } from '../lib/env'
import { PROVINCES } from '../lib/provinces'
import { PHONE_RE, URL_RE } from '../lib/labels'

const OBJECTIVES = ['ข้อความ / Inbox / LINE', 'ยอดขาย / ออเดอร์', 'ผู้เข้าชมเว็บไซต์', 'ยอดไลก์ / ผู้ติดตามเพจ', 'การรับรู้แบรนด์ (Awareness)', 'ลูกค้าเข้าร้าน / โทรหา', 'อื่นๆ']
const MAX_FILE = 20 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf']
const REASONS: Record<string, string> = {
  not_found: 'ลิงก์ไม่ถูกต้อง กรุณาตรวจสอบลิงก์ที่ได้รับ หรือติดต่อทีมงาน ADS FAH MARKETING',
  expired: 'ลิงก์นี้หมดอายุแล้ว กรุณาติดต่อทีมงานเพื่อขอลิงก์ใหม่',
  revoked: 'ลิงก์นี้ถูกยกเลิกการใช้งานแล้ว กรุณาติดต่อทีมงาน',
  used_up: 'ลิงก์นี้ถูกใช้ครบจำนวนครั้งที่กำหนดแล้ว กรุณาติดต่อทีมงานหากต้องการแก้ไขข้อมูล',
}

type Info = { valid: true; link_id: string; business_name: string | null; page_name: string | null } | { valid: false; reason: string }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-soft px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex justify-center"><img src={`${import.meta.env.BASE_URL}logo-full.png`} alt="ADS FAH MARKETING" className="h-32 w-auto" /></div>
        {children}
        <p className="mt-6 text-center text-xs text-slate-500">ADS FAH MARKETING Co., Ltd. · ข้อมูลของท่านจะถูกใช้เพื่อการวางแผนและให้บริการโฆษณาเท่านั้น และเก็บรักษาตามประกาศความเป็นส่วนตัว (PDPA)</p>
      </div>
    </div>
  )
}

export function PublicBriefPage() {
  const { token = '' } = useParams()
  const [info, setInfo] = useState<Info | null>(null)
  const [f, setF] = useState<Record<string, string>>({ website: '' })
  const [prov, setProv] = useState<string[]>([])
  const [areaText, setAreaText] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [err, setErr] = useState<Record<string, string>>({})
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [consent, setConsent] = useState(false)
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))

  useEffect(() => {
    if (!isConfigured) return setInfo({ valid: false, reason: 'not_found' })
    supabase.rpc('get_brief_link_info', { p_token: token }).then(({ data, error }) => {
      if (error || !data) return setInfo({ valid: false, reason: 'not_found' })
      const i = data as Info
      setInfo(i)
      if (i.valid) setF((p) => ({ ...p, business_name: i.business_name ?? '', fb_page_name: i.page_name ?? '' }))
    })
  }, [token])

  if (!info) return <Shell><Spinner /></Shell>
  if (!info.valid) return <Shell><div className="card"><Alert>{REASONS[info.reason] ?? REASONS.not_found}</Alert></div></Shell>
  if (done) return (
    <Shell><div className="card text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-2xl text-brand-dark">✓</div>
      <h1 className="mb-2 text-xl font-bold">ส่งข้อมูลสำเร็จ</h1>
      <p className="text-sm text-slate-600">ขอบคุณที่กรอกข้อมูล ทีมงาน ADS FAH MARKETING ได้รับข้อมูลของท่านแล้ว และจะติดต่อกลับเพื่อวางแผนการโฆษณาต่อไป</p>
    </div></Shell>)

  function validate() {
    const e: Record<string, string> = {}
    if (!f.business_name?.trim()) e.business_name = 'กรุณากรอกชื่อธุรกิจ'
    if (!f.contact_name?.trim()) e.contact_name = 'กรุณากรอกชื่อผู้ติดต่อ'
    if (!f.phone?.trim() || !PHONE_RE.test(f.phone.trim())) e.phone = 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง'
    for (const k of ['fb_page_url', 'instagram_url']) if (f[k]?.trim() && !URL_RE.test(f[k].trim())) e[k] = 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://'
    if (f.contact_link?.trim() && !/^(https?:\/\/|@|[0-9+\-\s()]{6,20}$)/i.test(f.contact_link.trim())) e.contact_link = 'กรอกเป็นลิงก์เว็บไซต์/LINE หรือเบอร์โทร'
    if (f.ad_budget_monthly && !(Number(f.ad_budget_monthly) >= 0)) e.ad_budget_monthly = 'กรุณากรอกตัวเลข'
    const a = Number(f.age_min), b = Number(f.age_max)
    if ((f.age_min && !(a >= 13 && a <= 100)) || (f.age_max && !(b >= 13 && b <= 100))) e.age = 'ช่วงอายุต้องอยู่ระหว่าง 13–100 ปี'
    else if (f.age_min && f.age_max && a > b) e.age = 'อายุเริ่มต้นต้องไม่มากกว่าอายุสูงสุด'
    if (!consent) e.consent = 'กรุณารับทราบประกาศความเป็นส่วนตัวก่อนส่งข้อมูล'
    if (files.length > 10) e.files = 'แนบไฟล์ได้ไม่เกิน 10 ไฟล์'
    for (const x of files) { if (!ALLOWED.includes(x.type)) e.files = `ไฟล์ ${x.name} ไม่รองรับ (รองรับรูปภาพ วิดีโอ MP4/MOV และ PDF)`; else if (x.size > MAX_FILE) e.files = `ไฟล์ ${x.name} ใหญ่เกิน 20 MB` }
    if (['fb_page_url', 'instagram_url', 'contact_link', 'files'].some((k) => e[k])) setMoreOpen(true)
    setErr(e); return !Object.keys(e).length
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (!validate() || !info || !info.valid) return
    setBusy(true); setFormErr(null)
    const uploaded: { path: string; name: string; type: string; size: number }[] = []
    for (const file of files) {
      const ext = (file.name.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase()
      const path = `links/${info.link_id}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('brief-uploads').upload(path, file, { contentType: file.type, upsert: false })
      if (error) { setBusy(false); return setFormErr(`อัปโหลดไฟล์ ${file.name} ไม่สำเร็จ กรุณาลองใหม่ หรือส่งข้อมูลโดยไม่แนบไฟล์`) }
      uploaded.push({ path, name: file.name, type: file.type, size: file.size })
    }
    const { error } = await supabase.rpc('submit_brief', { p_token: token, p_payload: { ...f, provinces: prov, files: uploaded, consent: true } })
    setBusy(false)
    if (error) return setFormErr(/[ก-๙]/.test(error.message) ? error.message : 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    setDone(true)
  }

  const addArea = () => {
    const v = areaText.trim().slice(0, 100)
    if (v && !prov.includes(v) && prov.length < 77) setProv([...prov, v])
    setAreaText('')
  }

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-6" noValidate>
        <div className="card">
          <h1 className="text-xl font-bold">ขอข้อมูลเพื่อ Record รายละเอียด</h1>
          <p className="mb-3 font-medium text-brand-dark">(ดูแลเพจ 30 วัน)</p>
          <p className="text-sm leading-relaxed text-slate-700">ขอทราบข้อมูลเบื้องต้นไว้นะคะ นอกนั้นเดี๋ยวเป็นหน้าที่ของทางทีมฟ้านำส่งโฆษณา หากลุ่มเป้าหมายให้เองค่ะ</p>
          <div className="mt-3"><Alert kind="info">🔒 กรุณา<b>อย่ากรอกรหัสผ่าน Facebook หรือ Access Token</b> ในแบบฟอร์มนี้ ทีมงานจะไม่ขอข้อมูลดังกล่าวผ่านแบบฟอร์ม</Alert></div>
        </div>

        <section className="card grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><h2 className="font-semibold text-brand-dark">📍 ข้อมูลสำหรับยิง Ads</h2><p className="text-sm text-slate-500">“สำหรับยิงแอดโฆษณา”</p></div>
          <div className="sm:col-span-2"><Field label="Page"><input className="input" value={f.fb_page_name ?? ''} onChange={set('fb_page_name')} maxLength={200} /></Field></div>
          <Field label="1. งบประมาณต่อเดือน (บาท)" error={err.ad_budget_monthly}><input className="input" inputMode="decimal" value={f.ad_budget_monthly ?? ''} onChange={set('ad_budget_monthly')} /></Field>
          <Field label="2. ช่วงอายุของลูกค้า (ปี)" error={err.age}>
            <div className="flex items-center gap-2"><input className="input" inputMode="numeric" placeholder="จาก" value={f.age_min ?? ''} onChange={set('age_min')} /><span>–</span><input className="input" inputMode="numeric" placeholder="ถึง" value={f.age_max ?? ''} onChange={set('age_max')} /></div>
          </Field>
          <div className="sm:col-span-2">
            <span className="label">3. บริเวณ / เขตพื้นที่ที่ต้องการยิง</span>
            <div className="grid gap-2 sm:grid-cols-2">
              <select className="input" value="" onChange={(e) => { const v = e.target.value; if (v && !prov.includes(v)) setProv([...prov, v]) }} aria-label="เลือกจังหวัด">
                <option value="">— เลือกจังหวัด (เลือกได้หลายจังหวัด) —</option>{PROVINCES.filter((x) => !prov.includes(x)).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <div className="flex gap-2"><input className="input" placeholder="หรือพิมพ์เขต/อำเภอ/พื้นที่ แล้วกด เพิ่ม" value={areaText} onChange={(e) => setAreaText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addArea() } }} maxLength={100} /><button type="button" className="btn-ghost" onClick={addArea}>เพิ่ม</button></div>
            </div>
            {!!prov.length && <div className="mt-2 flex flex-wrap gap-2">{prov.map((x) => <button type="button" key={x} onClick={() => setProv(prov.filter((y) => y !== x))} className="rounded-full bg-brand-soft px-3 py-1 text-sm text-brand-dark">{x} ✕</button>)}</div>}
          </div>
          <div className="sm:col-span-2"><Field label="4. Target เป็นกลุ่มคนไหน" hint="ข้อมูลเบื้องต้นก็เพียงพอ ทีมงานจะช่วยวิเคราะห์และหากลุ่มเป้าหมายให้"><textarea className="input" rows={3} maxLength={3000} value={f.target_audience ?? ''} onChange={set('target_audience')} /></Field></div>
        </section>

        <section className="card grid gap-4 sm:grid-cols-2">
          <h2 className="font-semibold text-brand-dark sm:col-span-2">ข้อมูลติดต่อ</h2>
          <div className="sm:col-span-2"><Field label="ชื่อธุรกิจ *" error={err.business_name}><input className="input" value={f.business_name ?? ''} onChange={set('business_name')} maxLength={200} /></Field></div>
          <Field label="ชื่อผู้ติดต่อ *" error={err.contact_name}><input className="input" value={f.contact_name ?? ''} onChange={set('contact_name')} maxLength={200} /></Field>
          <Field label="เบอร์โทรศัพท์ *" error={err.phone}><input className="input" inputMode="tel" value={f.phone ?? ''} onChange={set('phone')} /></Field>
          <div className="sm:col-span-2"><Field label="LINE ID"><input className="input" value={f.line_id ?? ''} onChange={set('line_id')} maxLength={100} /></Field></div>
        </section>

        <details className="card" open={moreOpen} onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer font-semibold text-brand-dark">ข้อมูลเพิ่มเติม (ไม่บังคับ — ช่วยให้ทีมงานวางแผนได้แม่นยำขึ้น)</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="ลิงก์ Facebook Page" error={err.fb_page_url}><input className="input" inputMode="url" placeholder="https://" value={f.fb_page_url ?? ''} onChange={set('fb_page_url')} /></Field></div>
            <div className="sm:col-span-2"><Field label="ลิงก์ Instagram" error={err.instagram_url}><input className="input" inputMode="url" placeholder="https://" value={f.instagram_url ?? ''} onChange={set('instagram_url')} /></Field></div>
            <div className="sm:col-span-2"><Field label="ประเภทสินค้าและบริการ"><input className="input" value={f.product_category ?? ''} onChange={set('product_category')} maxLength={500} /></Field></div>
            <div className="sm:col-span-2"><Field label="วัตถุประสงค์การยิงโฆษณา"><select className="input" value={f.ad_objective ?? ''} onChange={set('ad_objective')}><option value="">— เลือก —</option>{OBJECTIVES.map((o) => <option key={o}>{o}</option>)}</select></Field></div>
            <div className="sm:col-span-2"><Field label="สินค้าหรือบริการที่ต้องการโปรโมต"><textarea className="input" rows={2} maxLength={3000} value={f.promote_items ?? ''} onChange={set('promote_items')} /></Field></div>
            <div className="sm:col-span-2"><Field label="โปรโมชั่นปัจจุบัน"><textarea className="input" rows={2} maxLength={3000} value={f.current_promotion ?? ''} onChange={set('current_promotion')} /></Field></div>
            <div className="sm:col-span-2"><Field label="ลิงก์เว็บไซต์หรือ LINE สำหรับติดต่อ" error={err.contact_link}><input className="input" value={f.contact_link ?? ''} onChange={set('contact_link')} maxLength={500} /></Field></div>
            <div className="sm:col-span-2"><Field label="รูปภาพหรือวิดีโอประกอบ" hint="รูปภาพ, วิดีโอ MP4/MOV หรือ PDF · ไม่เกิน 10 ไฟล์ · ไฟล์ละไม่เกิน 20 MB" error={err.files}>
              <input type="file" multiple accept={ALLOWED.join(',')} className="input" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></Field>
              {!!files.length && <p className="mt-1 text-xs text-slate-500">เลือกแล้ว {files.length} ไฟล์</p>}</div>
            <div className="sm:col-span-2"><Field label="รายละเอียดเพิ่มเติม"><textarea className="input" rows={3} maxLength={5000} value={f.extra_details ?? ''} onChange={set('extra_details')} /></Field></div>
          </div>
        </details>

        {/* honeypot: ซ่อนจากผู้ใช้จริง บอทมักกรอก */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>เว็บไซต์<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label></div>

        <div className="card">
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>ข้าพเจ้าได้อ่านและรับทราบ <Link to="/privacy" target="_blank" className="text-brand-dark underline">ประกาศความเป็นส่วนตัว</Link> และยินยอมให้ ADS FAH MARKETING เก็บ ใช้ และประมวลผลข้อมูลข้างต้นเพื่อการวางแผนและให้บริการโฆษณา</span></label>
          {err.consent && <p className="mt-2 text-xs text-red-600">{err.consent}</p>}
        </div>
        {formErr && <Alert>{formErr}</Alert>}
        <button className="btn-primary w-full !py-3 text-base" disabled={busy}>{busy ? 'กำลังส่งข้อมูล…' : 'ส่งข้อมูล'}</button>
      </form>
    </Shell>
  )
}
