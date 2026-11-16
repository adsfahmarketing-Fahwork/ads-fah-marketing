import { useState } from 'react'
import { Alert, Modal, Spinner } from '../components/ui'
import { supabase } from '../lib/supabase'
import { dbError, useAsync } from '../lib/useAsync'
import { ROLE_LABEL, type Role } from '../lib/roles'

/** เลือกพนักงานที่รับผิดชอบเพจ (ฝั่งเพจ) — เรียก RPC set_page_assignments */
export function AssignStaffModal({ page, onDone, onClose }: { page: { id: string; page_name: string }; onDone: () => void; onClose: () => void }) {
  const { data, loading } = useAsync(async () => {
    const [st, cur] = await Promise.all([
      supabase.from('profiles').select('id, full_name, job_title, role').eq('status', 'active').order('full_name'),
      supabase.from('page_assignments').select('staff_id').eq('page_id', page.id),
    ])
    return { staff: (st.data ?? []) as { id: string; full_name: string; job_title: string | null; role: Role }[], current: new Set((cur.data ?? []).map((x) => x.staff_id)) }
  }, [page.id])
  const [sel, setSel] = useState<Set<string> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const chosen = sel ?? data?.current ?? new Set<string>()
  async function save() {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('set_page_assignments', { p_page_id: page.id, p_staff_ids: [...chosen] })
    setBusy(false); if (error) setErr(dbError(error)); else onDone()
  }
  return (
    <Modal title={`มอบหมายผู้รับผิดชอบเพจ: ${page.page_name}`} onClose={onClose}>
      {loading || !data ? <Spinner /> : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            {data.staff.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input type="checkbox" checked={chosen.has(s.id)} onChange={(e) => { const n = new Set(chosen); e.target.checked ? n.add(s.id) : n.delete(s.id); setSel(n) }} />
                <span className="font-medium">{s.full_name || '(ไม่ระบุชื่อ)'}</span><span className="text-xs text-slate-500">{s.job_title ?? ROLE_LABEL[s.role].split(' (')[0]}</span>
              </label>))}
          </div>
          <p className="text-xs text-slate-500">เพจหนึ่งมีผู้รับผิดชอบได้หลายคน — ผู้ที่ถูกเพิ่ม/ถอดจะได้รับแจ้งเตือน</p>
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></div>
        </div>)}
    </Modal>
  )
}
