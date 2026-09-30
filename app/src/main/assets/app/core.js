/* Bridge to the native side (window.Android) + small utilities. */
'use strict';

const HH = {
  _pending: {},
  _seq: 0,
  _listeners: {},

  _id() { return 'r' + Date.now().toString(36) + (++this._seq); },

  /** Request executed inside the logged-in site page (cookies + CSRF like a real browser). */
  request(spec) {
    return new Promise((resolve) => {
      const id = this._id();
      this._pending[id] = resolve;
      Android.request(id, JSON.stringify(spec));
    });
  },

  /** Opens a site page in the hidden browser and runs a script there. */
  runInPage(url, script, waitMs = 800) {
    return new Promise((resolve) => {
      const id = this._id();
      this._pending[id] = resolve;
      Android.runInPage(id, url, script, waitMs);
    });
  },

  state() {
    try { return JSON.parse(Android.state()); } catch (e) { return { state: 'idle' }; }
  },

  on(name, fn) { (this._listeners[name] = this._listeners[name] || []).push(fn); },

  _resolve(id, result) {
    const p = this._pending[id];
    delete this._pending[id];
    if (p) p(result || { ok: false, error: 'Bo\'sh javob' });
  },

  _event(name, data) {
    (this._listeners[name] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
  },

  _back() { return typeof UI !== 'undefined' ? UI.back() : false; },
};

const KV = {
  get(key, def) {
    try {
      const v = Android.kvGet(key);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  set(key, value) {
    try { Android.kvSet(key, JSON.stringify(value)); } catch (e) { console.error(e); }
  },
};

/* ---------------------------------------------------------------- dates */

const D = {
  pad: (n) => String(n).padStart(2, '0'),
  iso(d) { d = d || new Date(); return d.getFullYear() + '-' + this.pad(d.getMonth() + 1) + '-' + this.pad(d.getDate()); },
  today() { return this.iso(new Date()); },
  add(iso, days) { const d = this.parse(iso); d.setDate(d.getDate() + days); return this.iso(d); },
  parse(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); },
  norm(v) {
    if (!v) return null;
    const s = String(v);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) return m[3] + '-' + this.pad(m[2]) + '-' + this.pad(m[1]);
    m = s.match(/\/Date\((\d+)/);
    if (m) return this.iso(new Date(Number(m[1])));
    return null;
  },
  weekdays: ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Shan'],
  months: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'],
  human(iso) {
    if (!iso) return '';
    const d = this.parse(iso);
    const t = this.today();
    if (iso === t) return 'Bugun';
    if (iso === this.add(t, -1)) return 'Kecha';
    if (iso === this.add(t, 1)) return 'Ertaga';
    return this.weekdays[d.getDay()] + ', ' + d.getDate() + '-' + this.months[d.getMonth()];
  },
  short(iso) { const d = this.parse(iso); return d.getDate() + '.' + this.pad(d.getMonth() + 1); },
};

/* ---------------------------------------------------------------- misc */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Lower-camel-cases every key (the site may answer in PascalCase). */
function camel(o) {
  if (Array.isArray(o)) return o.map(camel);
  if (o && typeof o === 'object') {
    const r = {};
    Object.keys(o).forEach((k) => { r[k.charAt(0).toLowerCase() + k.slice(1)] = camel(o[k]); });
    return r;
  }
  return o;
}

function normPhone(p) {
  if (!p) return '';
  let d = String(p).replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) return d;
  if (d.length === 9) return '+998' + d;
  if (d.length === 12 && d.startsWith('998')) return '+' + d;
  if (d.length === 11 && (d.startsWith('7') || d.startsWith('8'))) return '+7' + d.slice(1);
  return d;
}

function fmtPhone(p) {
  const m = String(p).match(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p;
}

function avg(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
function round1(x) { return x == null ? null : Math.round(x * 10) / 10; }
function pct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
function uniq(a) { return Array.from(new Set(a)); }
function latin(s) {
  // search that works for both Latin and Cyrillic spelling of names
  const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' };
  return String(s || '').toLowerCase().replace(/[а-яёўқғҳ]/g, (c) => map[c] || c).replace(/[`'ʻʼ‘’]/g, '');
}
