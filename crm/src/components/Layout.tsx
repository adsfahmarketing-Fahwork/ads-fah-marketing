import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ROLE_LABEL, isManagement, navFor } from '../lib/roles'
import { NotificationBell } from './NotificationBell'
import { supabase } from '../lib/supabase'
import { useIdleLogout } from '../lib/useIdleLogout'

export function Layout() {
  const { profile, signOut, setNotice } = useAuth()
  const [open, setOpen] = useState(false)
  const items = navFor(profile?.role)

  useIdleLogout(60, () => { setNotice('ออกจากระบบอัตโนมัติ เนื่องจากไม่มีการใช้งานนานกว่า 60 นาที'); void signOut() })

  // สำรองงานประจำวัน (อัปเดตสถานะสัญญา + แจ้งเตือน) ถ้า cron ยังไม่ทำงาน — วันละครั้งต่อเบราว์เซอร์
  useEffect(() => {
    if (!isManagement(profile?.role)) return
    try {
      const key = `daily-jobs-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })}`
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch { /* ไม่มี storage ก็ข้าม */ }
    void supabase.rpc('run_daily_jobs')
  }, [profile?.role])

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="เมนูหลัก">
      {items.map((n) => (
        <NavLink key={n.key} to={n.path} end={n.path === '/'} onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `block rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-brand text-white' : 'text-slate-700 hover:bg-brand-soft'}`}>
          {n.label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-100 p-4"><img src="/logo-full.png" alt="ADS FAH MARKETING" className="mx-auto h-24 w-auto" /></div>
        {nav}
        <div className="border-t border-slate-100 p-3 text-xs text-slate-400">ADS FAH CRM</div>
      </aside>

      {/* Drawer (mobile/tablet) */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/40" aria-label="ปิดเมนู" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl">
            <div className="border-b border-slate-100 p-4"><img src="/logo-full.png" alt="ADS FAH MARKETING" className="mx-auto h-20 w-auto" /></div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <button className="btn-ghost !px-3 lg:hidden" onClick={() => setOpen(true)} aria-label="เปิดเมนู">☰</button>
          <div className="min-w-0 flex-1 lg:hidden"><img src="/logo-mark.png" alt="ADS FAH" className="h-8 w-auto" /></div>
          <div className="hidden flex-1 lg:block" />
          {profile && <NotificationBell userId={profile.id} />}
          <div className="hidden min-w-0 text-right leading-tight sm:block">
            <div className="truncate text-sm font-semibold">{profile?.full_name || profile?.email}</div>
            <div className="truncate text-xs text-slate-500">{profile && ROLE_LABEL[profile.role]}</div>
          </div>
          <button className="btn-ghost" onClick={() => void signOut()}>ออกจากระบบ</button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  )
}
