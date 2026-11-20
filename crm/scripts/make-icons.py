#!/usr/bin/env python3
"""สร้างไอคอนแอป (PWA) จากโลโก้ — ใช้ไลบรารีมาตรฐานของ Python เท่านั้น
ใช้: python3 scripts/make-icons.py   (อ่าน public/logo-mark.png เขียน public/icon-192.png, icon-512.png, apple-touch-icon.png)"""
import struct, zlib, sys, os

def read_png(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, w, h = 8, b'', 0, 0
    while pos < len(d):
        n, t = struct.unpack('>I4s', d[pos:pos + 8]); body = d[pos + 8:pos + 8 + n]; pos += 12 + n
        if t == b'IHDR': w, h, bd, ct, _, _, il = struct.unpack('>IIBBBBB', body); assert bd == 8 and ct == 6 and il == 0, 'ต้องเป็น RGBA 8 บิต ไม่ interlace'
        elif t == b'IDAT': idat += body
    raw = zlib.decompress(idat); bpp, stride = 4, w * 4
    rows, prev = [], bytearray(stride)
    for y in range(h):
        f = raw[y * (stride + 1)]; cur = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = cur[i - bpp] if i >= bpp else 0; b = prev[i]; c = prev[i - bpp] if i >= bpp else 0
            if f == 1: cur[i] = (cur[i] + a) & 255
            elif f == 2: cur[i] = (cur[i] + b) & 255
            elif f == 3: cur[i] = (cur[i] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                cur[i] = (cur[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(cur); prev = cur
    return w, h, rows

def write_png(path, w, h, rows):
    def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def icon(src, size, frac):
    sw, sh, rows = src; tw = max(1, round(size * frac)); th = max(1, round(tw * sh / sw))
    ox, oy = (size - tw) // 2, (size - th) // 2
    out = [bytearray(b'\xff' * (size * 3)) for _ in range(size)]   # พื้นขาว (ไม่โปร่งใส เพราะ iOS แสดงพื้นโปร่งเป็นสีดำ)
    for y in range(th):
        fy = (y + 0.5) * sh / th - 0.5; y0 = max(0, min(sh - 2, int(fy))); wy = fy - y0
        for x in range(tw):
            fx = (x + 0.5) * sw / tw - 0.5; x0 = max(0, min(sw - 2, int(fx))); wx = fx - x0
            px = [0, 0, 0]
            for (yy, xx, wgt) in ((y0, x0, (1 - wy) * (1 - wx)), (y0, x0 + 1, (1 - wy) * wx), (y0 + 1, x0, wy * (1 - wx)), (y0 + 1, x0 + 1, wy * wx)):
                r, g, b, a = rows[yy][xx * 4:xx * 4 + 4]; al = a / 255
                for k, v in enumerate((r, g, b)): px[k] += wgt * (v * al + 255 * (1 - al))
            o = (ox + x) * 3; out[oy + y][o:o + 3] = bytes(min(255, round(v)) for v in px)
    return out

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
src = read_png(os.path.join(root, 'logo-mark.png'))
# any/maskable: ใส่โลโก้ในโซนปลอดภัย (~62%) ให้ไม่ถูกตัดเมื่อระบบครอบเป็นวงกลม/มุมมน
for name, size, frac in (('icon-192.png', 192, 0.62), ('icon-512.png', 512, 0.62), ('apple-touch-icon.png', 180, 0.74)):
    write_png(os.path.join(root, name), size, size, icon(src, size, frac)); print('wrote', name)
