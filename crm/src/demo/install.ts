import { DEMO_USERS, demoSession, installDemoFetch } from './mockApi'
import { SUPABASE_URL } from '../lib/env'

const KEY = 'demo-auth'

/** เก็บ session สาธิตใน sessionStorage (ถ้าใช้ไม่ได้ใช้หน่วยความจำ) และตั้งค่าเริ่มต้นเป็น Owner */
export function installDemo() {
  const mem = new Map<string, string>()
  const storage = {
    getItem: (k: string) => { try { return sessionStorage.getItem(k) } catch { return mem.get(k) ?? null } },
    setItem: (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { mem.set(k, v) } },
    removeItem: (k: string) => { try { sessionStorage.removeItem(k) } catch { mem.delete(k) } },
  }
  ;(window as unknown as { __demoStorage: typeof storage }).__demoStorage = storage
  if (!storage.getItem(KEY) && !location.hash.startsWith('#/brief/') && !location.hash.startsWith('#/privacy')) {
    storage.setItem(KEY, JSON.stringify(demoSession(DEMO_USERS[0].id)))
  }
  installDemoFetch(SUPABASE_URL)
}
