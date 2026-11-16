-- ตรวจความพร้อมก่อน/หลังเปิดใช้งานจริง — รันใน Supabase SQL Editor (ผลลัพธ์ที่ต้องการอยู่ในคอมเมนต์ของแต่ละข้อ)

-- 1) ต้องไม่มีข้อมูลทดสอบใน Production  (ต้องได้ 0 ทุกแถว)
select 'customers' as tbl, count(*) from public.customers where business_name like '[ทดสอบ]%'
union all select 'pages', count(*) from public.pages where page_name like '[ทดสอบ]%'
union all select 'briefs', count(*) from public.customer_briefs where business_name like '[ทดสอบ]%';

-- 2) ทุกตารางใน public ต้องเปิด RLS  (ต้องไม่มีแถว)
select c.relname as table_without_rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 3) ต้องมี Owner ที่ใช้งานอยู่อย่างน้อย 1 คน และไม่มีบัญชีค้าง "ปิดใช้งาน" ที่ไม่รู้จัก  (ตรวจด้วยตา)
select email, role, status, can_view_revenue from public.profiles order by role, email;

-- 4) งานประจำวัน (pg_cron) ต้องมี 1 รายการ และรันสำเร็จล่าสุด
select jobid, jobname, schedule, active from cron.job where jobname = 'ads-fah-daily-jobs';
select status, start_time, return_message from cron.job_run_details order by start_time desc limit 5;

-- 5) Storage bucket ต้องเป็น private  (public ต้องเป็น false)
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'brief-uploads';

-- 6) anon ต้องเรียกได้เฉพาะ 3 ฟังก์ชัน  (ต้องได้ brief_link_open, get_brief_link_info, submit_brief)
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1;

-- 7) เขตเวลา  (ต้องเป็น Asia/Bangkok)
show timezone;
