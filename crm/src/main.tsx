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
