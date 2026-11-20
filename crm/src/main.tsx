import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// โหมดสาธิต (build ด้วย VITE_DEMO=1 เท่านั้น): ใช้ข้อมูลตัวอย่างในเบราว์เซอร์ ไม่เชื่อมฐานข้อมูลจริง
if (import.meta.env.VITE_DEMO === '1') {
  const { installDemo } = await import('./demo/install')
  installDemo()
}
const { default: App } = await import('./App')

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

// PWA: ลงทะเบียน service worker (เฉพาะ build จริง ไม่ใช่โหมดสาธิต/dev) — ไม่แคชข้อมูลใดๆ ดู public/sw.js
if (import.meta.env.PROD && import.meta.env.VITE_DEMO !== '1' && 'serviceWorker' in navigator) {
  const register = () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined) }
  // (top-level await ทำให้ถึงตรงนี้หลัง load แล้วก็ได้ จึงตรวจ readyState ด้วย)
  if (document.readyState === 'complete') register(); else window.addEventListener('load', register)
}
