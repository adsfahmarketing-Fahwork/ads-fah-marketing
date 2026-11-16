import { useEffect } from 'react'

/** ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งานตามเวลาที่กำหนด (ป้องกันเครื่องที่ลืมออกจากระบบ) */
export function useIdleLogout(minutes: number, onIdle: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout>
    let last = 0
    const reset = () => {
      const now = Date.now()
      if (now - last < 1000) return   // throttle
      last = now
      clearTimeout(timer)
      timer = setTimeout(onIdle, minutes * 60_000)
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, reset)) }
  }, [minutes, onIdle, enabled])
}
