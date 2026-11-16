export type Role = 'owner' | 'manager' | 'page_admin'

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'เจ้าของบริษัท (Owner)',
  manager: 'ผู้จัดการ (Manager)',
  page_admin: 'พนักงานดูแลเพจ (Page Admin)',
}

export type NavKey =
  | 'dashboard' | 'customers' | 'pages' | 'contracts' | 'team'
  | 'tasks' | 'briefs' | 'brief-builder' | 'reports' | 'settings'

export interface NavItem { key: NavKey; path: string; label: string; roles: Role[]; phase: number }

/** เมนูและสิทธิ์เข้าหน้า — ใช้ทั้งแสดงเมนูและป้องกัน route (การป้องกันจริงอยู่ที่ RLS ในฐานข้อมูล) */
export const NAV: NavItem[] = [
  { key: 'dashboard',     path: '/',              label: 'ภาพรวม',          roles: ['owner', 'manager', 'page_admin'], phase: 5 },
  { key: 'customers',     path: '/customers',     label: 'ลูกค้า',          roles: ['owner', 'manager', 'page_admin'], phase: 2 },
  { key: 'pages',         path: '/pages',         label: 'เพจ',             roles: ['owner', 'manager', 'page_admin'], phase: 2 },
  { key: 'contracts',     path: '/contracts',     label: 'สัญญา',           roles: ['owner', 'manager', 'page_admin'], phase: 2 },
  { key: 'tasks',         path: '/tasks',         label: 'งาน',             roles: ['owner', 'manager', 'page_admin'], phase: 4 },
  { key: 'briefs',        path: '/briefs',        label: 'Brief ลูกค้า',    roles: ['owner', 'manager', 'page_admin'], phase: 3 },
  { key: 'brief-builder', path: '/brief-builder', label: 'สร้างลิงก์ Brief', roles: ['owner', 'manager'],               phase: 3 },
  { key: 'team',          path: '/team',          label: 'ทีมงาน',          roles: ['owner', 'manager'],               phase: 3 },
  { key: 'reports',       path: '/reports',       label: 'รายงาน',          roles: ['owner', 'manager'],               phase: 5 },
  { key: 'settings',      path: '/settings',      label: 'ตั้งค่า / ประวัติ', roles: ['owner'],                        phase: 6 },
]

export const navFor = (role: Role | undefined | null): NavItem[] =>
  role ? NAV.filter((n) => n.roles.includes(role)) : []

export const canAccessPath = (role: Role | undefined | null, path: string): boolean => {
  const item = NAV.find((n) => n.path === path)
  return !!role && !!item && item.roles.includes(role)
}

export const isManagement = (role?: Role | null) => role === 'owner' || role === 'manager'

const THAI_ERRORS: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'],
  [/email not confirmed/i, 'อีเมลนี้ยังไม่ได้ยืนยัน กรุณาติดต่อผู้ดูแลระบบ'],
  [/rate limit|too many/i, 'พยายามหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่'],
  [/network|failed to fetch/i, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต'],
  [/password should be at least|weak/i, 'รหัสผ่านไม่ปลอดภัยพอ กรุณาใช้รหัสผ่านที่ยาวและคาดเดายากขึ้น'],
  [/same password|different from the old/i, 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม'],
]
export function thaiAuthError(message: string | undefined): string {
  if (!message) return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
  return THAI_ERRORS.find(([re]) => re.test(message))?.[1] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
}

export const PASSWORD_MIN = 10
export function validatePassword(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัวอักษร`
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข'
  return null
}
