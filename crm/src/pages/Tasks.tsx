import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Badge, Empty, Field, Modal, PageHeader, Spinner } from '../components/ui'
import { supabase } from '../lib/supabase'
import { dbError, useAsync } from '../lib/useAsync'
import { TASK_PRIORITY, TASK_STATUS, TASK_TONE, isDueSoon, taskDisplayStatus, type TaskStatus } from '../lib/labels'
import { formatThaiDate, todayBangkok } from '../lib/format'
import { isManagement } from '../lib/roles'

interface Task {
  id: string; title: string; description: string | null; page_id: string | null; assignee_id: string | null; created_by: string | null
  due_date: string | null; priority: keyof typeof TASK_PRIORITY; status: TaskStatus; notes: string | null; created_at: string; completed_at: string | null
  pages: { page_name: string } | null
}
type Staff = { id: string; full_name: string; role: string }

function TaskForm({ initial, ref_, onDone, onClose }: { initial?: Task; ref_: { pages: { id: string; page_name: string }[]; staff: Staff[]; assign: { page_id: string; staff_id: string }[] }; onDone: () => void; onClose: () => void }) {
  const [f, setF] = useState({
    title: initial?.title ?? '', description: initial?.description ?? '', page_id: initial?.page_id ?? '', assignee_id: initial?.assignee_id ?? '',
    due_date: initial?.due_date ?? '', priority: initial?.priority ?? 'medium', status: initial?.status ?? 'todo', notes: initial?.notes ?? '',
  })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))
  const assignees = useMemo(() => ref_.staff.filter((s) => s.role !== 'page_admin' || !f.page_id || ref_.assign.some((a) => a.page_id === f.page_id && a.staff_id === s.id)), [ref_, f.page_id])

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (!f.title.trim()) return setErr('กรุณากรอกชื่องาน')
    if (!f.assignee_id) return setErr('กรุณาเลือกผู้รับผิดชอบ')
    setBusy(true); setErr(null)
    const row = { title: f.title.trim(), description: f.description.trim() || null, page_id: f.page_id || null, assignee_id: f.assignee_id, due_date: f.due_date || null, priority: f.priority, status: f.status, notes: f.notes.trim() || null }
    const { error } = initial ? await supabase.from('tasks').update(row).eq('id', initial.id) : await supabase.from('tasks').insert(row)
    setBusy(false); if (error) setErr(dbError(error)); else onDone()
  }
  return (
    <Modal title={initial ? 'แก้ไขงาน' : 'สร้างงานใหม่'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2"><Field label="ชื่องาน *"><input className="input" value={f.title} onChange={set('title')} maxLength={300} /></Field></div>
        <div className="sm:col-span-2"><Field label="รายละเอียดงาน"><textarea className="input" rows={3} value={f.description} onChange={set('description')} /></Field></div>
        <Field label="เพจ"><select className="input" value={f.page_id} onChange={(e) => setF((p) => ({ ...p, page_id: e.target.value, assignee_id: '' }))}><option value="">— ไม่ระบุ —</option>{ref_.pages.map((p) => <option key={p.id} value={p.id}>{p.page_name}</option>)}</select></Field>
        <Field label="ผู้รับผิดชอบ *" hint={f.page_id ? 'แสดงเฉพาะพนักงานที่ดูแลเพจนี้ (และผู้จัดการ/เจ้าของ)' : undefined}>
          <select className="input" value={f.assignee_id} onChange={set('assignee_id')}><option value="">— เลือก —</option>{assignees.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></Field>
        <Field label="วันครบกำหนด"><input className="input" type="date" value={f.due_date} onChange={set('due_date')} /></Field>
        <Field label="ระดับความสำคัญ"><select className="input" value={f.priority} onChange={set('priority')}>{Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="สถานะ"><select className="input" value={f.status} onChange={set('status')}>{Object.entries(TASK_STATUS).filter(([k]) => k !== 'overdue').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="หมายเหตุ"><textarea className="input" rows={2} value={f.notes} onChange={set('notes')} /></Field></div>
        {err && <div className="sm:col-span-2"><Alert>{err}</Alert></div>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={onClose}>ยกเลิก</button><button className="btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></div>
      </form>
    </Modal>
  )
}

function TaskDetail({ task, names, today, canEdit, onEdit, onClose, onChanged }: { task: Task; names: Map<string, string>; today: string; canEdit: boolean; onEdit: () => void; onClose: () => void; onChanged: () => void }) {
  const { profile } = useAuth()
  const [status, setStatus] = useState<TaskStatus>(task.status === 'overdue' ? 'todo' : task.status)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [comment, setComment] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const comments = useAsync(async () => (await supabase.from('task_comments').select('id, author_id, body, created_at').eq('task_id', task.id).order('created_at')).data ?? [], [task.id])
  const disp = taskDisplayStatus(task, today)

  async function save() {
    setBusy(true); setErr(null)
    const { error } = await supabase.from('tasks').update({ status, notes: notes.trim() || null }).eq('id', task.id)
    setBusy(false); if (error) setErr(dbError(error)); else onChanged()
  }
  async function addComment(e: FormEvent) {
    e.preventDefault()
    if (!comment.trim() || !profile) return
    const { error } = await supabase.from('task_comments').insert({ task_id: task.id, author_id: profile.id, body: comment.trim() })
    if (error) return setErr(dbError(error))
    setComment(''); comments.reload()
  }
  return (
    <Modal title={task.title} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2"><Badge tone={TASK_TONE[disp]}>{TASK_STATUS[disp]}</Badge><Badge tone={TASK_TONE[task.priority]}>ความสำคัญ: {TASK_PRIORITY[task.priority]}</Badge>
        {canEdit && <button className="ml-auto text-sm text-brand-dark hover:underline" onClick={onEdit}>แก้ไขงาน</button>}</div>
      <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">เพจ</dt><dd>{task.pages?.page_name ?? '—'}</dd></div><div><dt className="text-slate-500">ผู้รับผิดชอบ</dt><dd>{(task.assignee_id && names.get(task.assignee_id)) || '—'}</dd></div>
        <div><dt className="text-slate-500">สร้างเมื่อ</dt><dd>{formatThaiDate(task.created_at)}</dd></div><div><dt className="text-slate-500">ครบกำหนด</dt><dd>{formatThaiDate(task.due_date)}</dd></div>
        {task.description && <div className="sm:col-span-2"><dt className="text-slate-500">รายละเอียด</dt><dd className="whitespace-pre-wrap">{task.description}</dd></div>}
      </dl>
      <div className="rounded-xl bg-brand-soft p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="อัปเดตสถานะ"><select className="input" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>{Object.entries(TASK_STATUS).filter(([k]) => k !== 'overdue').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <div className="sm:col-span-2"><Field label="หมายเหตุ"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
        </div>
        <div className="mt-3 flex justify-end"><button className="btn-primary" disabled={busy} onClick={save}>บันทึกการอัปเดต</button></div>
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      <h3 className="mb-2 mt-5 font-semibold">ประวัติการอัปเดตและบันทึกการทำงาน</h3>
      <ul className="mb-3 space-y-2">
        {comments.data?.map((c) => (
          <li key={c.id} className={`rounded-lg px-3 py-2 text-sm ${c.body.startsWith('เปลี่ยนสถานะ:') ? 'bg-slate-50 text-slate-600' : 'border border-slate-200'}`}>
            <div className="mb-0.5 text-xs text-slate-400">{(c.author_id && names.get(c.author_id)) || 'ระบบ'} · {new Date(c.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}</div>
            <div className="whitespace-pre-wrap">{c.body}</div>
          </li>))}
        {!comments.data?.length && <li className="text-sm text-slate-400">ยังไม่มีบันทึก</li>}
      </ul>
      <form onSubmit={addComment} className="flex gap-2"><input className="input" placeholder="เพิ่มหมายเหตุ / บันทึกการทำงาน" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000} /><button className="btn-ghost">เพิ่ม</button></form>
    </Modal>
  )
}

const CHIPS = [['all', 'ทั้งหมด'], ['open', 'ที่ต้องทำ'], ['soon', 'ใกล้ถึงกำหนด'], ['overdue', 'เกินกำหนด'], ['done', 'เสร็จแล้ว']] as const

export function TasksPage() {
  const { profile } = useAuth()
  const canEdit = isManagement(profile?.role)
  const today = todayBangkok()
  const [chip, setChip] = useState<(typeof CHIPS)[number][0]>('open')
  const [q, setQ] = useState('')
  const [who, setWho] = useState('')
  const [pg, setPg] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [modal, setModal] = useState<{ kind: 'new' } | { kind: 'edit' | 'view'; t: Task } | null>(null)

  const { data, loading, error, reload } = useAsync(async () => {
    if (canEdit) void supabase.rpc('run_daily_jobs')
    const [tk, st, pgs, as] = await Promise.all([
      supabase.from('tasks').select('*, pages(page_name)').order('due_date', { ascending: true, nullsFirst: false }).limit(1000),
      supabase.from('staff_directory').select('id, full_name, role'),
      supabase.from('pages').select('id, page_name').neq('status', 'ended').order('page_name'),
      supabase.from('page_assignments').select('page_id, staff_id'),
    ])
    if (tk.error) throw tk.error
    const staff = (st.data ?? []) as Staff[]
    return { tasks: tk.data as unknown as Task[], staff, names: new Map(staff.map((s) => [s.id, s.full_name])), pages: pgs.data ?? [], assign: as.data ?? [] }
  }, [])

  const rows = useMemo(() => (data?.tasks ?? []).map((t) => ({ t, disp: taskDisplayStatus(t, today) })), [data, today])
  const match = (r: { t: Task; disp: TaskStatus }, c: string) =>
    c === 'all' ? true : c === 'done' ? r.t.status === 'done' : c === 'overdue' ? r.disp === 'overdue' : c === 'soon' ? isDueSoon(r.t, today) : r.t.status !== 'done'
  const filtered = rows.filter((r) => match(r, chip)
    && (!who || r.t.assignee_id === who) && (!pg || r.t.page_id === pg)
    && (!from || (r.t.due_date ?? '') >= from) && (!to || (!!r.t.due_date && r.t.due_date <= to))
    && (!q || r.t.title.toLowerCase().includes(q.toLowerCase())))
  const done = () => { setModal(null); reload() }

  return (
    <>
      <PageHeader title="งาน" subtitle={canEdit ? 'ติดตามงานของทีม' : 'งานที่ได้รับมอบหมายให้คุณ'} action={canEdit && <button className="btn-primary" onClick={() => setModal({ kind: 'new' })}>+ สร้างงาน</button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        {CHIPS.map(([k, label]) => (
          <button key={k} onClick={() => setChip(k)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${chip === k ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-brand-soft'}`}>
            {label} <span className="opacity-70">({rows.filter((r) => match(r, k)).length})</span></button>))}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input className="input" placeholder="ค้นหาชื่องาน" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" />
        {canEdit && <select className="input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="พนักงาน"><option value="">พนักงานทุกคน</option>{data?.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>}
        <select className="input" value={pg} onChange={(e) => setPg(e.target.value)} aria-label="เพจ"><option value="">ทุกเพจ</option>{data?.pages.map((p) => <option key={p.id} value={p.id}>{p.page_name}</option>)}</select>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="ครบกำหนดตั้งแต่" title="ครบกำหนดตั้งแต่" />
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="ครบกำหนดถึง" title="ครบกำหนดถึง" />
      </div>
      {error && <Alert>{dbError({ message: error })}</Alert>}
      {loading && !data ? <Spinner /> : !filtered.length ? <Empty>ไม่พบงาน</Empty> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-brand-soft text-left text-xs text-slate-600"><tr><th className="p-3">งาน</th><th className="p-3">เพจ</th><th className="p-3">ผู้รับผิดชอบ</th><th className="p-3">ครบกำหนด</th><th className="p-3">ความสำคัญ</th><th className="p-3">สถานะ</th></tr></thead>
            <tbody>{filtered.map(({ t, disp }) => (
              <tr key={t.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setModal({ kind: 'view', t })}>
                <td className="p-3 font-medium text-brand-dark">{t.title}</td><td className="p-3">{t.pages?.page_name ?? '—'}</td><td className="p-3">{(t.assignee_id && data?.names.get(t.assignee_id)) || '—'}</td>
                <td className={`p-3 whitespace-nowrap ${disp === 'overdue' ? 'font-medium text-red-600' : ''}`}>{formatThaiDate(t.due_date)}</td>
                <td className="p-3"><Badge tone={TASK_TONE[t.priority]}>{TASK_PRIORITY[t.priority]}</Badge></td><td className="p-3"><Badge tone={TASK_TONE[disp]}>{TASK_STATUS[disp]}</Badge></td></tr>))}</tbody>
          </table>
        </div>)}
      {modal?.kind === 'view' && data && <TaskDetail task={modal.t} names={data.names} today={today} canEdit={canEdit} onEdit={() => setModal({ kind: 'edit', t: modal.t })} onClose={() => setModal(null)} onChanged={done} />}
      {(modal?.kind === 'new' || modal?.kind === 'edit') && data && <TaskForm initial={modal.kind === 'edit' ? modal.t : undefined} ref_={{ pages: data.pages, staff: data.staff, assign: data.assign }} onClose={() => setModal(null)} onDone={done} />}
    </>
  )
}
