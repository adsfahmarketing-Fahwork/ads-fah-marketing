import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { DEMO_PASSWORD, DEMO_USERS } from './mockApi'

/** แถบแจ้งโหมดสาธิต + สลับมุมมองตามสิทธิ์ */
export default function DemoBanner() {
  const { profile } = useAuth()
  async function switchTo(email: string) {
    await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
    window.location.hash = '#/'
    window.location.reload()
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-black px-4 py-2 text-xs text-white">
      <b className="text-brand">โหมดสาธิต</b>
      <span className="opacity-80">ข้อมูลตัวอย่างเท่านั้น · บันทึกไม่ได้</span>
      <label className="ml-auto flex items-center gap-2">ดูในมุมมอง
        <select className="rounded bg-white/10 px-2 py-1 text-white" value={DEMO_USERS.find((u) => u.email === profile?.email)?.email ?? ''} onChange={(e) => void switchTo(e.target.value)}>
          {DEMO_USERS.map((u) => <option key={u.id} value={u.email} className="text-black">{u.label}</option>)}
        </select>
      </label>
    </div>
  )
}
