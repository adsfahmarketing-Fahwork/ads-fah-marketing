-- ผู้ใช้ที่สร้างผ่าน Dashboard (ไม่มี role ใน app_metadata) จะถูกตั้งเป็น "ปิดใช้งาน" โดยอัตโนมัติ เพื่อความปลอดภัย
-- สคริปต์นี้เปิดใช้งานและกำหนดเป็น Owner
-- รันครั้งเดียวใน Supabase → SQL Editor หลังสร้างผู้ใช้ Owner คนแรกใน Authentication → Users
-- (SQL Editor รันด้วยสิทธิ์ผู้ดูแล จึงข้ามตัวกัน "ยกระดับสิทธิ์ตนเอง" ได้)
update public.profiles
   set role = 'owner', status = 'active', full_name = 'ชื่อ นามสกุล ของเจ้าของ', job_title = 'เจ้าของบริษัท'
 where email = lower('owner@your-company.com');   -- <- เปลี่ยนเป็นอีเมล Owner
