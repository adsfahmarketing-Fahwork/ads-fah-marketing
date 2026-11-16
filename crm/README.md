# ADS FAH CRM

ระบบ CRM ภายในสำหรับ ADS FAH MARKETING Co., Ltd. — React + TypeScript + Tailwind CSS + Supabase (PostgreSQL / Auth / Storage)

> โฟลเดอร์นี้แยกจากเว็บไซต์หลักของบริษัท (`../public`) ไม่กระทบกัน

## สถานะการพัฒนา
| Phase | เนื้อหา | สถานะ |
|---|---|---|
| 1 | ฐานข้อมูล · Login · สิทธิ์ผู้ใช้งาน (RLS) | ✅ เสร็จ |
| 2 | ลูกค้า · เพจ · สัญญา | ✅ เสร็จ |
| 3 | มอบหมายพนักงาน · ลิงก์ Brief | ✅ เสร็จ |
| 4 | งาน · แจ้งเตือน | ✅ เสร็จ |
| 5 | Dashboard · รายงาน | ✅ เสร็จ |
| 6 | ทดสอบความปลอดภัย · เปิดใช้งานจริง | ✅ เสร็จ (ดู `docs/GO-LIVE.md`) |

## Environment Variables
| ตัวแปร | ที่มา | หมายเหตุ |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | เปิดเผยฝั่งเว็บได้ |
| `VITE_SUPABASE_ANON_KEY` | เดียวกัน → `anon` `public` key | เปิดเผยได้ เพราะความปลอดภัยอยู่ที่ RLS |

**ห้ามใส่ `service_role` key ในตัวแปร `VITE_*` หรือในโค้ดฝั่งเว็บ** (ข้ามทุก RLS) — ใช้เฉพาะใน Edge Function (Phase 3) ผ่าน Supabase secrets

## ขั้นตอนเชื่อมต่อ Supabase
1. สร้างโปรเจกต์ที่ https://supabase.com (แนะนำ Region: Singapore `ap-southeast-1`)
2. **Authentication → Providers → Email**: เปิดใช้ Email, **ปิด "Allow new users to sign up"** (บัญชีพนักงานสร้างโดย Owner เท่านั้น), ตั้งรหัสผ่านขั้นต่ำ 10 ตัว
3. **Authentication → URL Configuration**: ใส่ Site URL เป็นโดเมนจริง และเพิ่ม `https://โดเมนของคุณ/reset-password` ใน Redirect URLs (ใช้กู้คืนรหัสผ่าน) — dev: `http://localhost:5173/reset-password`
4. **SQL Editor**: รันไฟล์ใน `supabase/migrations/` ตามลำดับ: `0001_foundation.sql` → `0002_contract_functions.sql` → `0003_assignments_briefs.sql` → `0004_tasks_notifications.sql` → `0005_dashboard_reports.sql` → `0006_security_pdpa.sql`
   - (ไม่บังคับ, เฉพาะ dev/staging) `supabase/seed_dev.sql` ใส่ข้อมูลทดสอบที่มีป้าย [ทดสอบ] — **ห้ามรันบน Production**
   - หรือใช้ Supabase CLI: `supabase link --project-ref <ref> && supabase db push`
5. **Deploy Edge Function สร้างพนักงาน** (Owner เพิ่มพนักงานจากหน้า “ทีมงาน”):
   ```bash
   supabase functions deploy create-staff
   supabase secrets set ALLOWED_ORIGIN=https://โดเมนของคุณ   # จำกัดให้เรียกจากเว็บของบริษัทเท่านั้น
   ```
   (`SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` ถูกใส่ให้อัตโนมัติ — ไม่ต้องตั้งเอง)
6. **Authentication → Users → Add user**: สร้างผู้ใช้ Owner คนแรก (ติ๊ก Auto Confirm) แล้วรัน `supabase/scripts/bootstrap-owner.sql` (แก้อีเมลก่อน)
7. คัดลอก `.env.example` เป็น `.env.local` แล้วกรอกค่า 2 ตัวข้างบน
8. **Database → Backups**: เปิด Daily backups (แผน Pro ขึ้นไป รองรับ PITR) — สำหรับ PDPA/การสำรองข้อมูล

> เขตเวลา: migration ตั้ง `Asia/Bangkok` ให้ฐานข้อมูลแล้ว

## รันในเครื่อง
```bash
cd crm
npm install
cp .env.example .env.local   # แล้วกรอกค่า
npm run dev                  # http://localhost:5173
npm test                     # ทดสอบสิทธิ์ (RLS) + กติกาเมนู
npm run build
```

## Deploy
เว็บเป็น SPA (Vite) — Build แล้วนำโฟลเดอร์ `dist/` ขึ้น host ใดก็ได้ที่รองรับ SPA fallback (ทุก path ชี้ไป `index.html`):
- **Vercel / Netlify / Cloudflare Pages**: Build command `npm run build`, Output `dist`, Root directory `crm`, ใส่ env 2 ตัวใน Dashboard
- ต้องใช้ HTTPS เสมอ และเพิ่มโดเมนใน Supabase Redirect URLs

## การทดสอบ (`npm test`)
ชุดทดสอบรัน migration จริงบน PostgreSQL (PGlite) แล้วจำลองผู้ใช้แต่ละสิทธิ์ผ่าน RLS จริง:
- Page Admin เห็นเฉพาะเพจ/ลูกค้า/สัญญา/งาน/Brief ที่ได้รับมอบหมาย, แก้สิทธิ์ตนเองไม่ได้, ไม่เห็นรายได้
- Manager เห็นรายได้เมื่อ Owner อนุญาตเท่านั้น
- anon เข้าถึงตารางใดไม่ได้เลย
- สัญญา 30 วัน: เริ่ม 1 ธ.ค. → สิ้นสุด 30 ธ.ค., ประวัติต่อสัญญาแก้ไข/ลบไม่ได้
- audit log: Owner อ่านอย่างเดียว, ไม่เก็บ token_hash
- ทุกตารางเปิด RLS, เขตเวลา Asia/Bangkok

## ความปลอดภัยและ PDPA (Phase 6)
- **คู่มือเปิดใช้งานจริง + เช็กลิสต์ UAT: [`docs/GO-LIVE.md`](docs/GO-LIVE.md)** · ตรวจสถานะ Production ด้วย `supabase/scripts/prod-check.sql`
- บัญชีใหม่ที่ไม่ได้สร้างผ่านระบบ (ไม่มี role ใน app_metadata) = **ปิดใช้งานอัตโนมัติ** (fail-closed) — ผู้ใช้ที่สร้างใน Dashboard ต้องรัน `bootstrap-owner.sql` หรือสร้างผ่านหน้า “ทีมงาน”
- หน้า `/privacy` (ประกาศความเป็นส่วนตัว) + ช่องรับทราบก่อนส่ง Brief (บันทึก `consent_at`), Owner ลบข้อมูลส่วนบุคคลตามคำขอได้ที่หน้ารายละเอียดลูกค้า (`anonymize_customer` ลบทั้งใน audit log และไฟล์แนบ)
- Owner ดูประวัติการแก้ไขข้อมูล (audit log) และเปลี่ยนรหัสผ่านได้ที่ “ตั้งค่า / ประวัติ”; ระบบออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน 60 นาที
- Security headers + CSP (`public/_headers`, `vercel.json`), สำรองข้อมูล `scripts/backup.sh`, CI (`.github/workflows/crm-ci.yml`)
- `npm test` มีชุดตรวจความปลอดภัยอัตโนมัติ: สิทธิ์ของ anon/authenticated ต่อทุกฟังก์ชันและตาราง, search_path ของ SECURITY DEFINER, ไม่มี policy เปิดกว้าง, SQL injection/payload ผิดรูป, ไม่มี console/service_role/innerHTML ในโค้ดเว็บ, ทดสอบประสิทธิภาพที่ 300+ เพจ

## Dashboard และรายงาน
- ตัวเลขทั้งหมดคำนวณในฐานข้อมูล (`dashboard_summary`, `report_data`) แบบ **security invoker** — RLS ของผู้ใช้บังคับตามปกติ: Page Admin เห็นเฉพาะเพจ/ลูกค้า/งานของตน, รายได้เป็น `null` สำหรับผู้ไม่มีสิทธิ์ (ทั้งการ์ด กราฟ และไฟล์ส่งออก), รายงานเปิดได้เฉพาะ Owner/Manager
- นิยามตัวเลข: **รายได้** = ค่าบริการของรอบสัญญาที่ *เริ่ม* ในช่วง · **ไม่ต่อสัญญา** = รอบสุดท้ายที่สิ้นสุดแล้วในช่วงและไม่มีรอบถัดไป หรือยกเลิกบริการในช่วง · **อัตรารักษาลูกค้า** = ต่อ ÷ (ต่อ + ไม่ต่อ) · **เพจเริ่มดูแลใหม่** = วันเริ่มสัญญาแรกของเพจอยู่ในช่วง
- เลือกช่วงวันที่ได้ (เดือนนี้/เดือนที่แล้ว/3/6 เดือน/ปีนี้/กำหนดเอง ไม่เกิน 3 ปี) กราฟรายเดือนแสดงอย่างน้อย 6 เดือนเสมอ
- ส่งออก **CSV** (UTF-8 BOM เปิดภาษาไทยใน Excel ได้, กัน formula injection) และ **Excel .xlsx** (หลายชีต)

## งานและการแจ้งเตือน
- งานสร้างโดย Owner/Manager; พนักงานเห็นเฉพาะงานของตน แก้ได้เฉพาะ **สถานะและหมายเหตุ** และเพิ่มบันทึกการทำงานได้ — ทุกการเปลี่ยนสถานะถูกบันทึกเป็นประวัติในงาน
- **“เกินกำหนด” คำนวณจากวันครบกำหนด** (เวลาไทย) ไม่เขียนทับสถานะจริง เพื่อไม่ให้สูญเสียสถานะเดิม
- แจ้งเตือนในระบบ (กระดิ่ง): Brief ใหม่, มอบหมาย/เปลี่ยนผู้รับผิดชอบเพจ, มอบหมายงาน, อัปเดตสถานะงาน, สัญญาใกล้หมด (เหลือ 7/3/1 วัน), สัญญาหมดอายุ, ต่อสัญญา, งานเกินกำหนด — ส่งเฉพาะผู้ที่เกี่ยวข้องและมีสิทธิ์เห็นข้อมูลนั้น และไม่ส่งซ้ำ (dedupe ต่อรอบสัญญา)
- งานประจำวัน `run_daily_jobs()` ตั้งเวลาด้วย **pg_cron** เวลา 00:05 น. (ไทย) อัตโนมัติ — ต้องเปิด extension `pg_cron` ที่ Supabase → Database → Extensions ก่อนรัน migration 0004 (ถ้าไม่เปิด ระบบจะข้ามการตั้งเวลา) และมีตัวสำรอง: Owner/Manager เปิดระบบวันละครั้งจะเรียกงานนี้ให้
- ตรวจสอบว่าตั้ง cron แล้ว: `select * from cron.job;`

## ฟอร์ม Brief ของลูกค้า
- Owner/Manager สร้างลิงก์ที่หน้า “สร้างลิงก์ Brief” → ได้ URL `https://โดเมน/brief/<token>` (แสดงครั้งเดียว; DB เก็บเฉพาะ SHA-256 hash)
- ลิงก์กำหนดวันหมดอายุ (1–90 วัน) และจำนวนครั้งส่งสูงสุดได้ ยกเลิกได้ทันที
- ลูกค้าไม่ต้องล็อกอิน: หน้าเว็บเรียกได้เฉพาะ RPC `get_brief_link_info` / `submit_brief` (ไม่มีสิทธิ์อ่านตารางใดๆ โดยตรง)
- จำกัดอัตรา: 10 ครั้ง/10 นาที ต่อลิงก์ และ 300 ครั้ง/10 นาที ทั้งระบบ, honeypot กันบอท, ตรวจข้อมูลที่ฐานข้อมูล
- ไฟล์แนบเก็บใน Storage bucket `brief-uploads` (private, ≤20 MB/ไฟล์, เฉพาะรูป/วิดีโอ/PDF) อ่านได้เฉพาะผู้มีสิทธิ์เห็น Brief นั้น
- ข้อจำกัดที่ทราบ: การส่งที่ไม่ผ่านการตรวจข้อมูลไม่ถูกนับในตัวจำกัดอัตรา (เพราะ transaction ถูก rollback) แต่ไม่มีข้อมูลถูกบันทึก

## หลักความปลอดภัยที่ใช้
- สิทธิ์บังคับที่ฐานข้อมูล (RLS + trigger) ไม่ใช่แค่ซ่อนเมนู
- ตัวเลขเงินแยกตาราง `contract_financials` ที่ Page Admin อ่านไม่ได้ในระดับฐานข้อมูล
- role กำหนดผ่าน `app_metadata` (แก้ได้เฉพาะ service role) ผู้ใช้ยกระดับสิทธิ์ตนเองไม่ได้
- Brief token เก็บเป็น hash (ตาราง `brief_links`), ลูกค้าส่งฟอร์มผ่าน RPC ที่จำกัดอัตรา (Phase 3)
- ไม่ log token/session ลง console

## ข้อสมมติที่ควรยืนยัน
1. **Manager เห็นเพจ/ลูกค้าทั้งหมด** (บริษัทขนาดเล็ก) — หากต้องการให้เห็นเฉพาะทีมของตน ให้เพิ่มคอลัมน์ผู้จัดการในเพจใน Phase 3
2. เพิ่มตาราง `contract_financials` (ตารางที่ 14) เพื่อซ่อนค่าบริการจาก Page Admin
3. “ลบพนักงาน” ใช้การปิดใช้งาน (soft) เพื่อรักษาประวัติและ audit log — ปิดแล้วเข้าสู่ระบบ/เข้าถึงข้อมูลไม่ได้ทันที
