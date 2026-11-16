import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface N { id: string; title: string; body: string | null; entity_type: string | null; read_at: string | null; created_at: string }
const ROUTE: Record<string, string> = { brief: '/briefs', page: '/pages', contract: '/contracts', task: '/tasks', customer: '/customers' }

export function NotificationBell({ userId }: { userId: string }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<N[]>([])
  const [unread, setUnread] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null)
    setUnread(count ?? 0)
  }, [userId])
  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications').select('id, title, body, entity_type, read_at, created_at').eq('recipient_id', userId).order('created_at', { ascending: false }).limit(30)
    setItems((data ?? []) as N[])
  }, [userId])

  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 60000); return () => clearInterval(t) }, [refresh])
  useEffect(() => {
    if (!open) return
    void load()
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off); return () => document.removeEventListener('mousedown', off)
  }, [open, load])

  async function click(n: N) {
    if (!n.read_at) { await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id); void refresh() }
    setOpen(false)
    if (n.entity_type && ROUTE[n.entity_type]) nav(ROUTE[n.entity_type])
  }
  async function readAll() {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', userId).is('read_at', null)
    void refresh(); void load()
  }

  return (
    <div className="relative" ref={box}>
      <button className="btn-ghost relative !px-3" onClick={() => setOpen(!open)} aria-label={`การแจ้งเตือน ${unread} รายการที่ยังไม่อ่าน`} aria-expanded={open}>
        🔔{unread > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><b className="text-sm">การแจ้งเตือน</b>{unread > 0 && <button className="text-xs text-brand-dark hover:underline" onClick={readAll}>อ่านทั้งหมด</button>}</div>
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}><button onClick={() => click(n)} className={`block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-brand-soft ${n.read_at ? '' : 'bg-brand-soft/50'}`}>
                <div className="flex items-start gap-2">{!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}<div className="min-w-0">
                  <div className="text-sm font-medium">{n.title}</div>{n.body && <div className="truncate text-xs text-slate-600">{n.body}</div>}
                  <div className="mt-0.5 text-[11px] text-slate-400">{new Date(n.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}</div></div></div>
              </button></li>))}
            {!items.length && <li className="px-4 py-8 text-center text-sm text-slate-400">ยังไม่มีการแจ้งเตือน</li>}
          </ul>
        </div>)}
    </div>
  )
}
