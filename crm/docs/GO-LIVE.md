# ADS FAH CRM — คู่มือเตรียมเปิดใช้งานจริง (Phase 6)

ทำตามลำดับ ติ๊กทีละข้อ. ข้อที่มี ⚠️ มีผลต่อความปลอดภัยโดยตรง

## A. Supabase (ฐานข้อมูลและการยืนยันตัวตน)
- [ ] สร้างโปรเจกต์ Region **Singapore** (ใกล้ไทยที่สุด) ใช้แผน **Pro ขึ้นไป** (มี Daily backups, PITR เป็น add-on, ไม่ถูก pause)
- [ ] เปิด extension **pg_cron** (Database → Extensions) *ก่อน* รัน migration
- [ ] รัน `supabase/migrations/0001` → `0006` ตามลำดับ (SQL Editor หรือ `supabase db push`)
- [ ] ⚠️ Authentication → Providers → Email: **ปิด "Allow new users to sign up"**, เปิด "Confirm email", ตั้งความยาวรหัสผ่านขั้นต่ำ 10, เปิด "Leaked password protection" (Pro)
  - (ถึงจะเปิดสมัครโดยไม่ตั้งใจ บัญชีใหม่จะเป็น "ปิดใช้งาน" โดยอัตโนมัติ ตาม migration 0006)
- [ ] ⚠️ Authentication → URL Configuration: Site URL = โดเมนจริง; Redirect URLs = `https://โดเมน/reset-password` เท่านั้น (ลบ localhost ออก)
- [ ] ⚠️ **ตั้งค่า Custom SMTP** (Authentication → SMTP) — อีเมลเริ่มต้นของ Supabase จำกัดจำนวนมากและไม่เหมาะกับ Production (อีเมลรีเซ็ตรหัสผ่านอาจไม่ถึง)
- [ ] Authentication → Rate Limits: คงค่า/เข้มงวดขึ้นสำหรับ sign-in และ password recovery
- [ ] ⚠️ เปิด MFA (TOTP) ให้บัญชี Owner (ผ่าน Supabase Auth MFA — ปัจจุบันระบบยังไม่มีหน้า MFA ในแอป ดู "ข้อจำกัด")
- [ ] สร้างผู้ใช้ Owner (Authentication → Users → Add user, ติ๊ก Auto Confirm) แล้วรัน `supabase/scripts/bootstrap-owner.sql` (แก้อีเมลก่อน)
- [ ] Deploy Edge Function: `supabase functions deploy create-staff` และ `supabase secrets set ALLOWED_ORIGIN=https://โดเมน`
- [ ] รัน `supabase/scripts/prod-check.sql` — ผลต้องตรงตามคอมเมนต์ทุกข้อ
- [ ] ⚠️ **ห้ามรัน** `supabase/seed_dev.sql` บน Production

## B. เว็บ (Frontend)
- [ ] Deploy `crm/` (Vercel / Netlify / Cloudflare Pages): Build `npm run build`, Output `dist`, Root `crm`
- [ ] ตั้ง Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (**anon เท่านั้น**), และข้อมูลติดต่อสำหรับ PDPA `VITE_PRIVACY_CONTACT_EMAIL`, `VITE_COMPANY_PHONE`, `VITE_COMPANY_ADDRESS`
- [ ] ⚠️ ตรวจว่า security headers ทำงาน (`public/_headers` สำหรับ Netlify/Cloudflare, `vercel.json` สำหรับ Vercel): `curl -sI https://โดเมน/login` ต้องเห็น Content-Security-Policy, Strict-Transport-Security, X-Frame-Options
  - ถ้าใช้โดเมนกำหนดเองของ Supabase ให้เพิ่มโดเมนนั้นใน `connect-src`/`img-src` ของ CSP
- [ ] HTTPS บังคับ + ผูกโดเมนจริง; ตรวจ `/login`, `/privacy`, `/brief/x` เปิดได้ (SPA fallback)
- [ ] เปิดหน้า `/privacy` ตรวจข้อมูลติดต่อบริษัท และ **ให้ผู้เชี่ยวชาญด้านกฎหมาย/DPO ตรวจทานข้อความ** (เป็นร่างตามแนวทาง PDPA ทั่วไป ไม่ใช่คำแนะนำทางกฎหมาย)

## C. สำรองข้อมูลและกู้คืน
- [ ] เปิด Daily Backups ของ Supabase (และ PITR ถ้าต้องการ RPO ต่ำ)
- [ ] ตั้งสำรองเพิ่มด้วย `scripts/backup.sh` (cron/CI รายวัน) เก็บในที่เข้ารหัส จำกัดสิทธิ์ ลบตามระยะเวลาเก็บรักษา
- [ ] ⚠️ **ซ้อมกู้คืนอย่างน้อย 1 ครั้ง** ลงโปรเจกต์ทดสอบ: `pg_restore --no-owner -d "<db-url>" ไฟล์.dump` แล้วรัน `prod-check.sql`
- [ ] สำรองไฟล์ใน Storage (`brief-uploads`) แยกต่างหาก

## D. ทดสอบก่อนเปิด (UAT) — ทำกับโปรเจกต์ staging
1. Owner เข้าสู่ระบบ → เพิ่มพนักงาน Page Admin 2 คน (A, B) และ Manager 1 คน
2. เพิ่มลูกค้า + เพจ 2 เพจ + สัญญา → มอบหมายเพจ 1 → A, เพจ 2 → B
3. เข้าสู่ระบบเป็น A: เห็นเฉพาะเพจ/ลูกค้า/สัญญา/งานของเพจ 1; **ไม่เห็นเมนูทีมงาน/รายงาน/ตั้งค่า, ไม่เห็นค่าบริการ**; ลองพิมพ์ URL `/team` ต้องถูกส่งไปหน้า "ไม่มีสิทธิ์"
4. สร้างลิงก์ Brief เพจ 1 → เปิดในหน้าต่างไม่ระบุตัวตน → กรอกและส่ง (พร้อมแนบรูป) → A ได้แจ้งเตือน, Brief ปรากฏและเปิดดูไฟล์ได้; B ไม่เห็น
5. ลองลิงก์ที่ยกเลิก/หมดอายุ → ต้องแสดงข้อความที่ถูกต้อง
6. ต่อสัญญา → ตรวจรอบใหม่และประวัติรอบเดิม; ตั้งสัญญาให้เหลือ 7 วันแล้วรัน `select run_daily_jobs();` → ตรวจแจ้งเตือน
7. Dashboard/รายงาน → ส่งออก Excel/CSV เปิดในโปรแกรม Excel ตรวจภาษาไทย
8. ทดสอบ "ลืมรหัสผ่าน" ให้อีเมลถึงจริง และกด "ลบข้อมูลส่วนบุคคล (PDPA)" กับลูกค้าทดสอบ
9. ลบข้อมูลทดสอบทั้งหมดก่อนใช้งานจริง (รัน `prod-check.sql` ข้อ 1)

## E. การดูแลระบบต่อเนื่อง
- ตรวจ `cron.job_run_details` สัปดาห์ละครั้ง; ตั้งแจ้งเตือนเมื่องานล้มเหลว
- ทบทวนรายชื่อบัญชีและสิทธิ์รายไตรมาส; ปิดใช้งานทันทีเมื่อพนักงานลาออก (หน้า "ทีมงาน" → แก้ไข → ปิดใช้งาน)
- อัปเดต dependency: `npm audit` ใน CI; ตรวจ Supabase Advisors (Security) หลังแก้ฐานข้อมูลทุกครั้ง
- ไฟล์ใน Storage ที่ไม่มีเจ้าของ (ลูกค้าอัปโหลดแล้วไม่ส่งฟอร์ม) ควรล้างเป็นระยะ (ไฟล์ใน `links/<link_id>/` ที่ไม่มีแถวใน `attachments`)

## ข้อจำกัดที่ทราบ (ควรพิจารณาในอนาคต)
- ยังไม่มีหน้าตั้งค่า MFA ในแอป (ใช้ผ่าน Supabase Auth API ได้) และไม่มีการแจ้งเตือนผ่านอีเมล/LINE (แจ้งเตือนในระบบเท่านั้น)
- รายได้นับตามเดือนที่รอบสัญญาเริ่ม — ยังไม่มีข้อมูลการชำระเงินจริง
- Manager เห็นเพจ/ลูกค้าทั้งหมด (ไม่แยกตามทีม)
- ตัวจำกัดอัตราการส่งฟอร์มไม่นับการส่งที่ข้อมูลไม่ผ่านตรวจ (ไม่มีข้อมูลถูกบันทึก) — หากต้องการกันการยิงถล่มจริงจัง ให้ใช้ WAF/Cloudflare Turnstile หน้าโดเมน
- ไม่มี CAPTCHA บนฟอร์มสาธารณะ (ใช้ honeypot + จำกัดอัตรา)
