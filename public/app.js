(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LINE_URL = 'https://line.me/ti/p/~adsfahmarketing';
  // Language helpers (i18n.js). T = translate a Thai string, L = pick Thai or English text
  const T = (th) => (window.I18N ? window.I18N.t(th) : th);
  const L = (th, en) => (window.I18N ? window.I18N.L(th, en) : th);

  $('#year').textContent = new Date().getFullYear();

  // ---------- Nav ----------
  const nav = $('.nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 20);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  const toggle = $('.nav__toggle');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open);
  });
  $$('.nav__links a').forEach((a) => a.addEventListener('click', () => { nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }));

  // ---------- Reveal ----------
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;
  const observe = (el) => (io ? io.observe(el) : el.classList.add('is-in'));
  $$('.reveal').forEach(observe);

  // ---------- Courses ----------
  let courses = [];
  const fmtPrice = (n) => Number(n).toLocaleString('th-TH');

  function renderCourses() {
    const grid = $('#courseGrid');
    if (!courses.length) {
      grid.innerHTML = `<p class="empty-note">กำลังอัปเดตคอร์สเรียน — สอบถามรอบเรียนล่าสุดได้ทาง <a href="${LINE_URL}" target="_blank" rel="noopener"><b>LINE: adsfahmarketing</b></a></p>`;
      return;
    }
    grid.innerHTML = courses.map((c) => `
      <article class="course-card reveal ${c.featured ? 'course-card--featured' : ''}">
        ${c.featured ? '<span class="course-card__ribbon">ยอดนิยม</span>' : ''}
        <span class="course-card__type">${esc(c.type)}</span>
        <h3>${esc(c.name)}</h3>
        <p class="course-card__tag">${esc(c.tagline)}</p>
        <div class="course-card__price">
          ${c.price != null
            ? `<b>${fmtPrice(c.price)}</b><span>${esc(c.priceNote || 'บาท')}</span>`
            : `<b class="is-text">${esc(c.priceNote || 'สอบถามราคา')}</b>`}
        </div>
        <ul>${(c.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        ${c.dates && c.dates.length ? `<div class="course-card__dates"><b>รอบอบรมที่เปิดรับ</b>${c.dates.map((d) => `<span>${esc(d)}</span>`).join('')}</div>` : ''}
        <a href="#booking" class="btn ${c.featured ? 'btn--primary' : 'btn--dark'} btn--block" data-course="${esc(c.id)}">${c.price != null ? 'สมัครคอร์สนี้' : 'สอบถาม / จองรอบ'}</a>
      </article>`).join('');
    $$('.reveal', grid).forEach(observe);
    fillCourseSelect();
  }

  function fillCourseSelect() {
    const sel = $('#courseSelect');
    const current = sel.value;
    sel.innerHTML = `<option value="">${esc(T('— เลือกคอร์ส —'))}</option>` + courses.map((c) =>
      `<option value="${esc(c.id)}">${esc(c.type)} · ${esc(T(c.name))}${c.price != null ? ` (${fmtPrice(c.price)} ${T('บาท')})` : ''}</option>`).join('');
    if (current) sel.value = current;
    updateDateHint();
  }

  function updateDateHint() {
    const c = courses.find((x) => x.id === $('#courseSelect').value);
    const hint = $('#dateHint');
    if (c && c.dates && c.dates.length) {
      hint.hidden = false;
      hint.textContent = T('รอบที่เปิดรับ') + ': ' + c.dates.join(' · ');
    } else hint.hidden = true;
  }
  $('#courseSelect').addEventListener('change', updateDateHint);
  document.addEventListener('langchange', () => { if (courses.length) fillCourseSelect(); });

  // ---------- Reviews ----------
  function renderReviews(list) {
    const grid = $('#reviewGrid');
    if (!list.length) { $('#reviews').hidden = true; return; }
    grid.innerHTML = list.map((r) => `
      <article class="review reveal ${r.sample ? 'review--sample' : ''}">
        ${r.sample ? '<span class="review__sample">ตัวอย่าง</span>' : ''}
        ${r.source === 'facebook'
          ? `<div class="review__fb"><span class="review__fbicon">f</span><span><span>รีวิวบน Facebook</span>${r.date ? ` · <time>${esc(r.date)}</time>` : ''}</span></div>`
          : `<div class="review__stars" aria-label="${r.rating} ดาว">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>`}
        <p class="review__text">${esc(r.text)}</p>
        ${r.result ? `<span class="review__result">${esc(r.result)}</span>` : ''}
        <div class="review__who">
          <span class="review__avatar">${esc((r.name || '?').trim().charAt(0))}</span>
          <div><b>${esc(r.name)}</b><small>${esc(r.role)}</small></div>
        </div>
      </article>`).join('');
    $$('.reveal', grid).forEach(observe);
  }

  // ใช้ API เมื่อมีเซิร์ฟเวอร์ — ถ้าเปิดบนโฮสต์ฟรีแบบไฟล์อย่างเดียว ใช้ไฟล์ใน data/ แทน
  const isJson = (r) => r.ok && (r.headers.get('content-type') || '').includes('json');
  const loadData = (api, file) => fetch(api)
    .then((r) => (isJson(r) ? r.json() : Promise.reject()))
    .catch(() => fetch(file).then((r) => (r.ok ? r.json() : [])))
    .catch(() => []);
  loadData('/api/courses', 'data/courses.json').then((d) => { courses = d; renderCourses(); });
  loadData('/api/reviews', 'data/reviews.json').then(renderReviews);

  // ---------- Tabs / CTA routing ----------
  const form = $('#leadForm');
  function setKind(kind) {
    form.kind.value = kind;
    $$('.tab').forEach((t) => { const on = t.dataset.kind === kind; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on); });
    $('.only-enroll').hidden = kind !== 'enroll';
    $('.only-consult').hidden = kind !== 'consult';
    $('#submitBtn').textContent = kind === 'enroll' ? 'ส่งใบสมัคร' : 'ส่งคำขอปรึกษา';
    $('#formMsg').textContent = '';
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => setKind(t.dataset.kind)));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tab],[data-course]');
    if (!a) return;
    if (a.dataset.course) {
      setKind('enroll');
      $('#courseSelect').value = a.dataset.course;
      updateDateHint();
    } else setKind(a.dataset.tab);
  });

  // date min = today
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  $('#dateInput').min = d.toISOString().slice(0, 10);

  // ---------- Submit ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#formMsg');
    msg.className = 'form-msg'; msg.textContent = '';
    $$('.field', form).forEach((f) => f.classList.remove('is-invalid'));

    const data = Object.fromEntries(new FormData(form).entries());
    data.consent = form.consent.checked;
    const errs = [];
    if (!data.name.trim()) errs.push(['name', 'กรุณากรอกชื่อ']);
    const digits = (data.phone || '').replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 12) errs.push(['phone', 'กรุณากรอกเบอร์โทรให้ถูกต้อง']);
    if (data.kind === 'enroll' && !data.courseId) errs.push(['courseId', 'กรุณาเลือกคอร์สที่สนใจ']);
    if (!data.consent) errs.push(['consent', 'กรุณายินยอมให้ติดต่อกลับ']);
    if (errs.length) {
      errs.forEach(([n]) => form[n]?.closest('.field')?.classList.add('is-invalid'));
      msg.classList.add('is-err'); msg.textContent = errs[0][1];
      form[errs[0][0]]?.focus();
      return;
    }
    if (data.kind === 'consult') { delete data.courseId; delete data.format; delete data.preferredDate; }

    const btn = $('#submitBtn');
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'กำลังส่ง...';
    let res;
    try {
      res = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    } catch { res = null; }
    // ไม่มีเซิร์ฟเวอร์ (โฮสต์ฟรี) → ให้ลูกค้าส่งข้อมูลทางอีเมล / LINE แทน
    const hasApi = res && (res.headers.get('content-type') || '').includes('json');
    if (!hasApi) { showManualSend(data); return; }
    try {
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'ส่งไม่สำเร็จ');
      showSuccess(data);
    } catch (err) {
      msg.classList.add('is-err');
      msg.innerHTML = `${esc(T(err.message === 'Failed to fetch' ? 'เชื่อมต่อระบบไม่ได้' : err.message))} — ${L('หรือทัก', 'or message')} <a href="${LINE_URL}" target="_blank" rel="noopener"><b>LINE: adsfahmarketing</b></a> ${L('ได้ทันที', 'right away')}`;
      btn.disabled = false; btn.textContent = label;
    }
  });

  function showSuccess(data) {
    const card = $('.form-card');
    card.innerHTML = `
      <div class="success">
        <div class="success__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <h3>${L(`ได้รับข้อมูลแล้ว ขอบคุณค่ะ คุณ${esc(data.name)}`, `Thank you, ${esc(data.name)}! We’ve received your details`)}</h3>
        <p>${L(`ทีมงาน ADS FAH MARKETING จะติดต่อกลับที่เบอร์ ${esc(data.phone)} ภายใน 24 ชั่วโมง<br>ถ้าต้องการคำตอบเร็วขึ้น ทัก LINE ได้เลยค่ะ`, `The ADS FAH MARKETING team will call you at ${esc(data.phone)} within 24 hours.<br>For a faster reply, message us on LINE.`)}</p>
        <a class="btn btn--primary" href="${LINE_URL}" target="_blank" rel="noopener">${L('แชท LINE', 'Chat on LINE')}: adsfahmarketing</a>
      </div>`;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showManualSend(data) {
    const course = courses.find((c) => c.id === data.courseId);
    const lines = [
      data.kind === 'consult' ? 'ขอปรึกษาการตลาด / บริการยิงแอด' : 'สมัครเรียน',
      `ชื่อ: ${data.name}`,
      `เบอร์โทร: ${data.phone}`,
      data.lineId && `LINE ID: ${data.lineId}`,
      data.email && `อีเมล: ${data.email}`,
      course && `คอร์ส: ${course.type} — ${course.name}`,
      data.format && `รูปแบบการเรียน: ${data.format}`,
      data.preferredDate && `วันที่สะดวก: ${data.preferredDate}`,
      data.business && `ธุรกิจ/เพจ: ${data.business}`,
      data.budget && `งบโฆษณาต่อเดือน: ${data.budget}`,
      data.message && `รายละเอียด: ${data.message}`
    ].filter(Boolean).join('\n');
    const subject = `[เว็บไซต์] ${data.kind === 'consult' ? 'ขอปรึกษาการตลาด' : 'สมัครเรียน'} — ${data.name}`;
    const mailto = `mailto:adsfahmarketing@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines)}`;
    const card = $('.form-card');
    card.innerHTML = `
      <div class="success">
        <div class="success__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/></svg></div>
        <h3>${L(`อีกขั้นเดียว คุณ${esc(data.name)}`, `One more step, ${esc(data.name)}`)}</h3>
        <p>${L('กดปุ่มด้านล่างเพื่อส่งข้อมูลถึงทีมงาน ADS FAH MARKETING', 'Choose how to send your details to the ADS FAH MARKETING team')}</p>
        <div class="manual-send">
          <a class="btn btn--primary btn--block" href="${mailto}">${L('ส่งทางอีเมล', 'Send by email')}</a>
          <button type="button" class="btn btn--dark btn--block" id="copyLine">${L('คัดลอกข้อมูล แล้วเปิด LINE', 'Copy details and open LINE')}</button>
          <a class="btn btn--ghost btn--block" href="tel:0618266465">${L('โทร', 'Call')} 061-826-6465</a>
        </div>
        <pre class="manual-send__text" data-no-i18n>${esc(lines)}</pre>
        <p class="manual-send__hint" id="copyHint" hidden>${L('คัดลอกแล้ว — วางข้อความในแชท LINE ได้เลยค่ะ', 'Copied — paste it into the LINE chat')}</p>
      </div>`;
    $('#copyLine').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(lines); $('#copyHint').hidden = false; } catch { /* ignore */ }
      window.open(LINE_URL, '_blank', 'noopener');
    });
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
})();

// ---------- Gallery lightbox ----------
(() => {
  const box = document.getElementById('lightbox');
  if (!box) return;
  const figs = [...document.querySelectorAll('.gallery__grid .g')];
  const img = box.querySelector('img'), cap = box.querySelector('figcaption');
  let i = 0, lastFocus = null;
  const show = (n) => {
    i = (n + figs.length) % figs.length;
    const src = figs[i].querySelector('img');
    img.src = src.src; img.alt = src.alt;
    cap.textContent = figs[i].querySelector('figcaption').textContent;
  };
  const open = (n) => { lastFocus = document.activeElement; show(n); box.hidden = false; document.body.style.overflow = 'hidden'; box.querySelector('.lightbox__close').focus(); };
  const close = () => { box.hidden = true; document.body.style.overflow = ''; lastFocus && lastFocus.focus(); };
  figs.forEach((f, n) => f.querySelector('.g__btn').addEventListener('click', () => open(n)));
  box.querySelector('.lightbox__close').addEventListener('click', close);
  box.querySelector('.lightbox__nav--prev').addEventListener('click', () => show(i - 1));
  box.querySelector('.lightbox__nav--next').addEventListener('click', () => show(i + 1));
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === 'ArrowRight') show(i + 1);
  });
})();

// ---------- Package CTA: prefill consult form / poster lightbox ----------
(() => {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-msg]');
    if (!a) return;
    const msg = document.querySelector('#leadForm textarea[name="message"]');
    if (msg && !msg.value.includes(a.dataset.msg)) msg.value = a.dataset.msg + (msg.value ? '\n' + msg.value : '');
  });
  const btn = document.querySelector('.package__img');
  const box = document.getElementById('lightbox');
  if (!btn || !box) return;
  btn.addEventListener('click', () => {
    const img = btn.querySelector('img');
    box.querySelector('img').src = img.src;
    box.querySelector('img').alt = img.alt;
    box.querySelector('figcaption').textContent = 'Package Facebook & Instagram 30 Days · 10,000 บาท/เดือน';
    box.querySelectorAll('.lightbox__nav').forEach((n) => (n.hidden = true));
    box.hidden = false; document.body.style.overflow = 'hidden';
    box.querySelector('.lightbox__close').focus();
  });
  // restore nav arrows for gallery
  document.querySelectorAll('.gallery__grid .g__btn').forEach((b) => b.addEventListener('click', () => box.querySelectorAll('.lightbox__nav').forEach((n) => (n.hidden = false)), true));
})();
