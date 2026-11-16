import { describe, expect, it } from 'vitest'
import { canAccessPath, navFor, thaiAuthError, validatePassword } from '../src/lib/roles'

describe('เมนูตามสิทธิ์', () => {
  it('Page Admin ไม่เห็นเมนูทีมงาน รายงาน ตั้งค่า สร้างลิงก์ Brief', () => {
    const keys = navFor('page_admin').map((n) => n.key)
    expect(keys).toEqual(['dashboard', 'customers', 'pages', 'contracts', 'tasks', 'briefs'])
  })
  it('Manager ไม่เห็นตั้งค่าระบบ', () => {
    expect(navFor('manager').map((n) => n.key)).not.toContain('settings')
    expect(navFor('manager').map((n) => n.key)).toContain('reports')
  })
  it('Owner เห็นทุกเมนู', () => expect(navFor('owner')).toHaveLength(10))
  it('ไม่มี role = ไม่เห็นเมนู / เข้าหน้าไม่ได้', () => {
    expect(navFor(null)).toEqual([])
    expect(canAccessPath(undefined, '/')).toBe(false)
  })
  it('canAccessPath', () => {
    expect(canAccessPath('page_admin', '/team')).toBe(false)
    expect(canAccessPath('manager', '/team')).toBe(true)
    expect(canAccessPath('owner', '/settings')).toBe(true)
    expect(canAccessPath('manager', '/settings')).toBe(false)
  })
})

describe('รหัสผ่านและข้อความผิดพลาด', () => {
  it('ตรวจความแข็งแรงรหัสผ่าน', () => {
    expect(validatePassword('short1')).toMatch(/10/)
    expect(validatePassword('onlyletterslong')).toMatch(/ตัวเลข/)
    expect(validatePassword('1234567890123')).toMatch(/ตัวอักษร/)
    expect(validatePassword('GoodPass12345')).toBeNull()
  })
  it('แปลข้อผิดพลาดเป็นภาษาไทย ไม่เผยข้อความดิบ', () => {
    expect(thaiAuthError('Invalid login credentials')).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    expect(thaiAuthError('weird internal jwt error xyz')).not.toContain('xyz')
  })
})
