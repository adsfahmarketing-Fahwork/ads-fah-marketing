-- ⚠️ ข้อมูลทดสอบสำหรับ Development/Staging เท่านั้น — ห้ามรันบน Production
-- ทุกรายการขึ้นต้นด้วย "[ทดสอบ]" เพื่อให้แยกจากข้อมูลจริงได้ชัดเจน
insert into public.customers (business_name, contact_name, phone, business_type, notes) values
  ('[ทดสอบ] ร้านกาแฟตัวอย่าง', 'คุณทดสอบ หนึ่ง', '0800000001', 'ร้านอาหาร/เครื่องดื่ม', 'ข้อมูลทดสอบ'),
  ('[ทดสอบ] คลินิกความงามตัวอย่าง', 'คุณทดสอบ สอง', '0800000002', 'ความงาม', 'ข้อมูลทดสอบ');
insert into public.pages (customer_id, page_name, page_url)
  select id, '[ทดสอบ] เพจ ' || business_name, 'https://www.facebook.com/example-test' from public.customers where business_name like '[ทดสอบ]%';
