import { useCallback, useEffect, useState } from 'react'

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let off = false
    setLoading(true)
    fn().then((d) => { if (!off) { setData(d); setError(null) } })
      .catch((e: { message?: string }) => { if (!off) setError(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ') })
      .finally(() => { if (!off) setLoading(false) })
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((n) => n + 1), [])
  return { data, error, loading, reload }
}

/** ตัดอักขระที่ทำให้ตัวกรอง PostgREST เพี้ยน */
export const cleanSearch = (q: string) => q.replace(/[,()%*\\]/g, ' ').trim()

export function dbError(e: { message?: string; code?: string } | null): string | null {
  if (!e) return null
  if (e.code === '42501' || /row-level security/i.test(e.message ?? '')) return 'ไม่มีสิทธิ์ทำรายการนี้'
  if (e.code === '23505') return 'ข้อมูลซ้ำกับที่มีอยู่แล้ว'
  if (e.code === '23503') return 'ลบไม่ได้ เพราะมีข้อมูลอื่นอ้างอิงอยู่'
  if (e.code === '23514') return e.message?.includes('contracts_cancel_info') ? 'ยกเลิกบริการต้องระบุเหตุผลและวันที่' : (e.message ?? 'ข้อมูลไม่ถูกต้อง')
  return /[ก-๙]/.test(e.message ?? '') ? (e.message as string) : 'บันทึกไม่สำเร็จ กรุณาลองใหม่'
}
