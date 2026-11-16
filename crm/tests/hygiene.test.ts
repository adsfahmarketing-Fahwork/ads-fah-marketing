import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
const root = join(__dirname, '..')
const src = walk(join(root, 'src')).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => [f, readFileSync(f, 'utf8')] as const)

describe('สุขอนามัยของโค้ดฝั่งเว็บ (ความปลอดภัย)', () => {
  it('ไม่มี console.* (ป้องกัน token/ข้อมูลลับหลุดใน Browser Logs)', () => {
    expect(src.filter(([, c]) => /\bconsole\.(log|debug|info|warn|error|trace)\b/.test(c)).map(([f]) => f)).toEqual([])
  })
  it('ไม่มี dangerouslySetInnerHTML / eval / innerHTML', () => {
    expect(src.filter(([, c]) => /dangerouslySetInnerHTML|\beval\(|new Function\(|\.innerHTML\s*=/.test(c)).map(([f]) => f)).toEqual([])
  })
  it('ไม่มี service_role key หรือรหัสลับในโค้ดฝั่งเว็บ', () => {
    expect(src.filter(([, c]) => /service_role|SERVICE_ROLE|sb_secret_/.test(c)).map(([f]) => f)).toEqual([])
    expect(src.filter(([, c]) => /eyJ[A-Za-z0-9_-]{20,}\./.test(c)).map(([f]) => f)).toEqual([])
  })
  it('.env* ที่มีค่าจริงถูก ignore และ .env.example ไม่มีคีย์จริง', () => {
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toMatch(/\.env\.local/)
    expect(readFileSync(join(root, '.env.example'), 'utf8')).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sb_secret_/)
  })
  it('ลิงก์ภายนอกที่เปิดแท็บใหม่ใช้ rel="noopener noreferrer"', () => {
    const bad = src.filter(([, c]) => (c.match(/target="_blank"/g) ?? []).length !== (c.match(/target="_blank"[^>]*rel="noopener noreferrer"/g) ?? []).length).map(([f]) => f)
    expect(bad.filter((f) => !/PublicBrief|Privacy/.test(f))).toEqual([])
  })
  it('ไม่มีข้อมูลจำลองฝังในหน้าเว็บ (ข้อมูลทดสอบอยู่ใน seed_dev.sql เท่านั้น)', () => {
    expect(src.filter(([, c]) => /\[ทดสอบ\]|lorem ipsum/i.test(c)).map(([f]) => f)).toEqual([])
  })
  it('migration ทุกไฟล์ไม่มีรหัสผ่าน/คีย์จริง และ seed_dev มีป้ายทดสอบ', () => {
    const sql = walk(join(root, 'supabase')).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(f, 'utf8')).join('\n')
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|password\s*=\s*'[^']{6,}'/i)
  })
})
