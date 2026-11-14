# ADS FAH MARKETING — เว็บไซต์ + ระบบรับสมัคร + หลังบ้าน

## เริ่มใช้งาน
ต้องมี Node.js 18 ขึ้นไป (ไม่ต้องติดตั้ง package เพิ่ม)

```
node server.js
```

- หน้าเว็บ: http://localhost:3000
- หลังบ้าน: http://localhost:3000/admin

รหัสผ่านหลังบ้านถูกสร้างอัตโนมัติครั้งแรกที่รัน และเก็บไว้ที่ `data/config.json`
(เปลี่ยนได้โดยแก้ไฟล์นั้น หรือตั้งค่า environment variable `ADMIN_PASSWORD`)

## โครงสร้าง
- `server.js` — เซิร์ฟเวอร์ + API (รับสมัคร, หลังบ้าน)
- `public/index.html`, `styles.css`, `app.js` — หน้าเว็บ
- `public/admin.html` — ระบบหลังบ้าน (ผู้สมัคร, คอร์ส, รีวิว, ดาวน์โหลด CSV)
- `public/images/` — ภาพจริงของครูฟ้า
- `data/db.json` — ข้อมูลคอร์ส รีวิว และผู้สมัคร (สร้างอัตโนมัติ — ควรสำรองไฟล์นี้)

## ขึ้นระบบจริง
ใช้โฮสต์ที่รัน Node.js ได้และมีดิสก์ถาวร (เช่น VPS, Render/Railway ที่มี persistent disk)
ตั้ง `PORT` และ `ADMIN_PASSWORD` แล้วเปิดผ่าน HTTPS

## ขึ้นเว็บบน Railway
1. Railway → New Project → Deploy from GitHub repo → เลือก repo นี้
2. แท็บ Settings ของ service → Volumes → Add Volume → Mount path: `/data`
3. แท็บ Variables → เพิ่ม
   - `DATA_DIR` = `/data`
   - `ADMIN_PASSWORD` = รหัสผ่านหลังบ้านที่ต้องการ (ยาวและเดายาก)
4. Settings → Networking → Generate Domain (ได้ลิงก์ .up.railway.app) หรือ Custom Domain เพื่อใช้โดเมนของตัวเอง
5. เปิดเว็บ → ทดสอบส่งฟอร์ม → เข้า `/admin` ด้วยรหัสผ่านที่ตั้งไว้

ข้อมูลผู้สมัครเก็บใน Volume (`/data/db.json`) ไม่หายเมื่อ deploy ใหม่
