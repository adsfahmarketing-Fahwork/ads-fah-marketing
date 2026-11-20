/* Service worker ของ ADS FAH CRM — ตั้งใจให้ "เบา" และปลอดภัย:
   - ไม่แคชข้อมูลใดๆ (ไม่มีข้อมูลลูกค้า/การเรียก API ถูกเก็บในเครื่อง) และไม่แคชหน้าแอป (กันค้างเวอร์ชันเก่า)
   - แคชเฉพาะหน้า offline.html เพื่อแสดงข้อความเมื่อไม่มีอินเทอร์เน็ต */
const OFFLINE = 'offline.html'
const CACHE = 'adsfah-offline-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return   // ไฟล์/คำขอ API อื่นๆ ผ่านเครือข่ายตามปกติ
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)))
})
