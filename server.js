// ADS FAH MARKETING — เว็บไซต์ + ระบบรับสมัคร + หลังบ้าน
// ใช้ Node.js ล้วน ไม่ต้องติดตั้ง package เพิ่ม:  node server.js
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- Config (รหัสผ่านหลังบ้าน) ----------
function loadConfig() {
  let cfg = {};
  if (fs.existsSync(CONFIG_FILE)) cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (!cfg.adminPassword) {
    cfg.adminPassword = crypto.randomBytes(9).toString('base64url');
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    console.log('\n[ADMIN] สร้างรหัสผ่านหลังบ้านใหม่แล้ว — ดูได้ที่ data/config.json\n');
  }
  return cfg;
}
const config = loadConfig();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || config.adminPassword;

// ---------- Database (ไฟล์ JSON) ----------
const SEED = {
  courses: [
    {
      id: 'private-1on1',
      type: 'Private Class 1:1',
      name: 'ยิงแอด Facebook & Instagram แบบตัวต่อตัว',
      tagline: 'ยิงแอดยังไงให้รอดในยุค AI (อัปเดตล่าสุด)',
      price: 9900,
      priceNote: 'บาท / คอร์ส',
      featured: true,
      bullets: [
        'เข้าใจระบบ Facebook Ads 2026 — GEN, Meta Lattice, AI Learning',
        'ปรับแคมเปญให้ตรงกลุ่ม ลดค่าแอดด้วยโครงสร้างที่ถูกต้อง',
        'อ่านผลโฆษณาแบบมือโปร รู้ว่าแอดไหนดี ควรปิดตัวไหน',
        'ใช้ AI ช่วยวิเคราะห์กลุ่มเป้าหมายและวางโครงสร้างแคมเปญ',
        'เทคนิค Scaling เพิ่มยอดขาย ขยายงบอย่างไรไม่ให้พัง'
      ],
      dates: []
    },
    {
      id: 'group-workshop',
      type: 'Group Workshop',
      name: 'เวิร์กช็อปยิงแอดแบบกลุ่ม ลงมือทำจริง',
      tagline: 'เรียนพร้อมเพื่อนร่วมรุ่น ลงมือกับบัญชีโฆษณาของตัวเอง',
      price: null,
      priceNote: 'สอบถามราคารอบถัดไป',
      featured: false,
      bullets: [
        'ปูพื้นฐาน Business Manager, Pixel และโครงสร้างแคมเปญ',
        'Workshop ตั้งค่าแคมเปญจริงบนโน้ตบุ๊กของผู้เรียน',
        'นโยบายโฆษณาที่ต้องรู้ ป้องกันบัญชีโดนจำกัด',
        'ถาม-ตอบเคสธุรกิจของผู้เรียนแต่ละคน'
      ],
      dates: []
    },
    {
      id: 'corporate-training',
      type: 'Corporate Training',
      name: 'อบรมทีมการตลาดภายในองค์กร',
      tagline: 'หลักสูตรออกแบบเฉพาะสำหรับทีมและพาร์ทเนอร์ของบริษัท',
      price: null,
      priceNote: 'ขอใบเสนอราคา',
      featured: false,
      bullets: [
        'ออกแบบเนื้อหาตามอุตสาหกรรมและเป้าหมายของบริษัท',
        'อบรมนอกสถานที่ / โรงแรม / ออนไลน์',
        'ครอบคลุม Meta Ads Policy สำหรับธุรกิจที่มีข้อจำกัด',
        'เอกสารประกอบและสไลด์สำหรับทีม'
      ],
      dates: []
    }
  ],
  reviews: JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'reviews.json'), 'utf8')),
  leads: []
};

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(SEED, null, 2));
    return structuredClone(SEED);
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
let db = loadDB();
function saveDB() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ---------- Sessions ----------
const sessions = new Map(); // token -> expiry
const SESSION_MS = 12 * 60 * 60 * 1000;
function newSession() {
  const t = crypto.randomBytes(24).toString('hex');
  sessions.set(t, Date.now() + SESSION_MS);
  return t;
}
function getCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
// เข้าหลังบ้านจากเครื่องตัวเอง (localhost) ไม่ต้องใส่รหัส
// เมื่อขึ้นเว็บจริงและเข้าจากที่อื่น ยังต้องใส่รหัสเพื่อปกป้องข้อมูลลูกค้า
function isLocal(req) {
  const ip = req.socket.remoteAddress || '';
  return !req.headers['x-forwarded-for'] && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
}
function isAdmin(req) {
  if (isLocal(req)) return true;
  const t = getCookie(req, 'afm_admin');
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------- Rate limit (ฟอร์มสาธารณะ / login) ----------
const hits = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}

// ---------- Helpers ----------
function send(res, status, body, headers = {}) {
  const isStr = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(isStr ? body : JSON.stringify(body));
}
function readBody(req, limit = 100_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}
const clean = (v, max = 500) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const cleanMultiline = (v, max = 2000) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, max);
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';
  const file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ['.html', '.css', '.js'].includes(ext) ? 'no-cache' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(file).pipe(res);
  });
}

const LEAD_STATUSES = ['new', 'contacted', 'confirmed', 'paid', 'cancelled'];

function toCSV(rows) {
  const cols = ['createdAt', 'kind', 'status', 'name', 'phone', 'lineId', 'email', 'business', 'courseName', 'format', 'preferredDate', 'budget', 'message', 'note'];
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // กัน CSV injection
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}

function sanitizeCourse(c) {
  return {
    id: clean(c.id, 60) || crypto.randomBytes(5).toString('hex'),
    type: clean(c.type, 60),
    name: clean(c.name, 150),
    tagline: clean(c.tagline, 200),
    price: c.price === '' || c.price === null || c.price === undefined || isNaN(Number(c.price)) ? null : Math.max(0, Number(c.price)),
    priceNote: clean(c.priceNote, 60),
    featured: !!c.featured,
    bullets: (Array.isArray(c.bullets) ? c.bullets : []).map((b) => clean(b, 200)).filter(Boolean).slice(0, 12),
    dates: (Array.isArray(c.dates) ? c.dates : []).map((d) => clean(d, 80)).filter(Boolean).slice(0, 20)
  };
}
function sanitizeReview(r) {
  return {
    id: clean(r.id, 60) || crypto.randomBytes(5).toString('hex'),
    sample: !!r.sample,
    source: r.source === 'facebook' ? 'facebook' : '',
    date: clean(r.date, 40),
    name: clean(r.name, 80),
    role: clean(r.role, 100),
    text: cleanMultiline(r.text, 1500),
    result: clean(r.result, 100),
    rating: Math.min(5, Math.max(1, Number(r.rating) || 5))
  };
}

// ---------- Router ----------
async function handleApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  // Public
  if (p === '/api/courses' && m === 'GET') return send(res, 200, db.courses);
  if (p === '/api/reviews' && m === 'GET') return send(res, 200, db.reviews);

  if (p === '/api/leads' && m === 'POST') {
    if (rateLimited('lead:' + clientIp(req), 8, 10 * 60 * 1000)) return send(res, 429, { error: 'ส่งข้อมูลถี่เกินไป กรุณาลองใหม่ภายหลัง' });
    let b; try { b = await readBody(req); } catch { return send(res, 400, { error: 'ข้อมูลไม่ถูกต้อง' }); }
    if (b.website) return send(res, 200, { ok: true }); // honeypot กันบอท
    const kind = b.kind === 'consult' ? 'consult' : 'enroll';
    const lead = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kind,
      status: 'new',
      name: clean(b.name, 100),
      phone: clean(b.phone, 30),
      lineId: clean(b.lineId, 60),
      email: clean(b.email, 120),
      business: clean(b.business, 150),
      courseId: clean(b.courseId, 60),
      courseName: '',
      format: clean(b.format, 60),
      preferredDate: clean(b.preferredDate, 40),
      budget: clean(b.budget, 60),
      message: cleanMultiline(b.message, 2000),
      note: ''
    };
    if (!lead.name) return send(res, 400, { error: 'กรุณากรอกชื่อ' });
    const digits = lead.phone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 12) return send(res, 400, { error: 'กรุณากรอกเบอร์โทรให้ถูกต้อง' });
    if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return send(res, 400, { error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    if (!b.consent) return send(res, 400, { error: 'กรุณายินยอมให้ติดต่อกลับ' });
    const course = db.courses.find((c) => c.id === lead.courseId);
    lead.courseName = course ? `${course.type} — ${course.name}` : (kind === 'consult' ? 'ปรึกษาการตลาด / บริการยิงแอด' : '');
    db.leads.unshift(lead);
    saveDB();
    console.log(`[LEAD] ${lead.kind} | ${lead.name} | ${lead.phone} | ${lead.courseName}`);
    return send(res, 201, { ok: true, id: lead.id });
  }

  // Auth
  if (p === '/api/admin/login' && m === 'POST') {
    if (rateLimited('login:' + clientIp(req), 10, 15 * 60 * 1000)) return send(res, 429, { error: 'ลองเข้าสู่ระบบบ่อยเกินไป รอสักครู่' });
    let b; try { b = await readBody(req); } catch { return send(res, 400, { error: 'bad request' }); }
    if (!safeEqual(b.password || '', ADMIN_PASSWORD)) return send(res, 401, { error: 'รหัสผ่านไม่ถูกต้อง' });
    const t = newSession();
    const secure = (req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
    return send(res, 200, { ok: true }, { 'Set-Cookie': `afm_admin=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}` });
  }
  if (p === '/api/admin/logout' && m === 'POST') {
    const t = getCookie(req, 'afm_admin'); if (t) sessions.delete(t);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'afm_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (!p.startsWith('/api/admin/')) return send(res, 404, { error: 'not found' });
  if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });

  // Admin
  if (p === '/api/admin/me' && m === 'GET') return send(res, 200, { ok: true, local: isLocal(req) });
  if (p === '/api/admin/leads' && m === 'GET') return send(res, 200, db.leads);
  if (p === '/api/admin/leads.csv' && m === 'GET') {
    return send(res, 200, toCSV(db.leads), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="adsfah-leads-${new Date().toISOString().slice(0, 10)}.csv"`
    });
  }
  const leadMatch = p.match(/^\/api\/admin\/leads\/([\w-]+)$/);
  if (leadMatch) {
    const lead = db.leads.find((l) => l.id === leadMatch[1]);
    if (!lead) return send(res, 404, { error: 'not found' });
    if (m === 'PATCH') {
      let b; try { b = await readBody(req); } catch { return send(res, 400, { error: 'bad request' }); }
      if (b.status !== undefined) {
        if (!LEAD_STATUSES.includes(b.status)) return send(res, 400, { error: 'bad status' });
        lead.status = b.status;
      }
      if (b.note !== undefined) lead.note = cleanMultiline(b.note, 1000);
      lead.updatedAt = new Date().toISOString();
      saveDB();
      return send(res, 200, lead);
    }
    if (m === 'DELETE') {
      db.leads = db.leads.filter((l) => l.id !== lead.id);
      saveDB();
      return send(res, 200, { ok: true });
    }
  }
  if (p === '/api/admin/courses' && m === 'PUT') {
    let b; try { b = await readBody(req, 300_000); } catch { return send(res, 400, { error: 'bad request' }); }
    if (!Array.isArray(b)) return send(res, 400, { error: 'expected array' });
    db.courses = b.slice(0, 30).map(sanitizeCourse);
    saveDB();
    return send(res, 200, db.courses);
  }
  if (p === '/api/admin/reviews' && m === 'PUT') {
    let b; try { b = await readBody(req, 300_000); } catch { return send(res, 400, { error: 'bad request' }); }
    if (!Array.isArray(b)) return send(res, 400, { error: 'expected array' });
    db.reviews = b.slice(0, 60).map(sanitizeReview);
    saveDB();
    return send(res, 200, db.reviews);
  }
  return send(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`ADS FAH MARKETING พร้อมใช้งาน  →  http://localhost:${PORT}`);
  console.log(`หลังบ้าน                       →  http://localhost:${PORT}/admin`);
});
