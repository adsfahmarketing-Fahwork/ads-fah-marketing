import { Link, useLocation } from 'react-router-dom'
import { NAV } from '../lib/roles'
import { PageHeader } from '../components/ui'

export function ComingSoon() {
  const { pathname } = useLocation()
  const item = NAV.find((n) => n.path === pathname)
  return (
    <>
      <PageHeader title={item?.label ?? 'หน้านี้'} />
      <div className="card text-center text-slate-600">
        <p className="font-medium">หน้านี้จะพัฒนาใน Phase {item?.phase ?? '-'}</p>
        <p className="mt-1 text-sm">โครงสร้างฐานข้อมูลและสิทธิ์พร้อมแล้ว</p>
      </div>
    </>
  )
}

export function NoAccessPage() {
  return (
    <div className="card mx-auto mt-10 max-w-md text-center">
      <h1 className="mb-2 text-xl font-bold">ไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
      <p className="mb-4 text-sm text-slate-600">บัญชีของคุณไม่ได้รับอนุญาตให้ดูข้อมูลส่วนนี้ หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อ Owner</p>
      <Link to="/" className="btn-primary">กลับหน้าหลัก</Link>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <div className="card mx-auto mt-10 max-w-md text-center">
      <h1 className="mb-2 text-xl font-bold">ไม่พบหน้าที่ต้องการ</h1>
      <Link to="/" className="btn-primary mt-2">กลับหน้าหลัก</Link>
    </div>
  )
}
