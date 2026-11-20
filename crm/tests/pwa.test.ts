import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const pub = join(__dirname, '..', 'public')
const manifest = JSON.parse(readFileSync(join(pub, 'manifest.webmanifest'), 'utf8'))

describe('PWA (ติดตั้งเป็นแอป)', () => {
  it('manifest ครบเงื่อนไขการติดตั้ง และใช้พาธสัมพัทธ์ (ใช้ได้ทั้ง root และ sub-path)', () => {
    expect(manifest).toMatchObject({ display: 'standalone', lang: 'th', theme_color: '#10B9D1', start_url: './', scope: './' })
    expect(manifest.name).toBeTruthy(); expect(manifest.short_name.length).toBeLessThanOrEqual(12)
    for (const i of manifest.icons) expect(i.src.startsWith('/') || i.src.startsWith('http')).toBe(false)
  })
  it('มีไอคอน 192 และ 512 จริง เป็นไฟล์ PNG ขนาดถูกต้อง (พื้นไม่โปร่งใส)', () => {
    for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
      const b = readFileSync(join(pub, file))
      expect(b.subarray(1, 4).toString()).toBe('PNG')
      expect(b.readUInt32BE(16)).toBe(size); expect(b.readUInt32BE(20)).toBe(size)
      expect(b[25]).toBe(2)   // color type 2 = RGB (ไม่มี alpha → iOS ไม่แสดงพื้นดำ)
    }
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes).sort()).toEqual(['192x192', '512x512'])
    for (const i of manifest.icons) expect(existsSync(join(pub, i.src))).toBe(true)
  })
  it('index.html อ้าง manifest, apple-touch-icon และ theme-color', () => {
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
    expect(html).toMatch(/rel="manifest"/); expect(html).toMatch(/rel="apple-touch-icon"/); expect(html).toMatch(/name="theme-color"/)
  })
  it('service worker ไม่แคชข้อมูล: แคชเฉพาะ offline.html และไม่แตะคำขอที่ไม่ใช่การเปิดหน้า', () => {
    const sw = readFileSync(join(pub, 'sw.js'), 'utf8')
    expect(sw).toMatch(/c\.add\(OFFLINE\)/)
    expect(sw).not.toMatch(/cache\.put|addAll|\.put\(/)
    expect(sw).toMatch(/mode !== 'navigate'\) return/)
    expect(statSync(join(pub, 'offline.html')).size).toBeGreaterThan(200)
  })
})
