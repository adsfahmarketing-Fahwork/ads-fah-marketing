/** พาธฐานของเว็บ เช่น "/ads-fah-marketing/crm" (ว่างถ้าโฮสต์ที่ root หรือเป็นโหมดสาธิต) */
export const BASE_PATH = import.meta.env.BASE_URL.startsWith('/') ? import.meta.env.BASE_URL.replace(/\/$/, '') : ''

/**
 * โฮสต์ที่ไม่มี SPA fallback (เช่น GitHub Pages ใน sub-path) ใช้ลิงก์แบบ hash: /crm/#/brief/xxx
 * เปิดด้วย VITE_HASH_ROUTER=1 (โหมดสาธิตใช้เสมอ) — Vercel/Netlify ใช้ path ปกติได้
 */
export const HASH_ROUTER = import.meta.env.VITE_DEMO === '1' || import.meta.env.VITE_HASH_ROUTER === '1'

/** URL เต็มของหน้าในเว็บนี้ เช่น appUrl('/brief/abc') */
export const appUrl = (path: string) =>
  HASH_ROUTER ? `${window.location.origin}${BASE_PATH}/#${path}` : `${window.location.origin}${BASE_PATH}${path}`

/** URL ที่อีเมลรีเซ็ตรหัสผ่านพากลับมา: โหมด hash ต้องกลับมาที่หน้าแรกเพราะ Supabase แนบ token ใน hash */
export const resetPasswordRedirect = () => (HASH_ROUTER ? `${window.location.origin}${BASE_PATH}/` : appUrl('/reset-password'))
