/* Screens and interaction. */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Delegated click handler: <button data-act="name" data-x="..."> → acts.name(dataset, el, event) */
function bindActs(root, acts) {
  root.onclick = (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = acts[el.dataset.act];
    if (fn) { ev.preventDefault(); fn(el.dataset, el, ev); }
  };
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function attBadge(a) {
  if (!a) return '<span class="badge">belgilanmagan</span>';
  const t = ATT[a.status] || ATT.present;
  return `<span class="badge ${t.cls}">${t.label}${a.late ? ' ' + a.late + 'd' : ''}</span>`;
}

function barHtml(x) {
  if (x == null) return '<div class="bar"><i style="width:0"></i></div>';
  const cls = x >= 0.85 ? '' : x >= 0.65 ? 'mid' : 'low';
  return `<div class="bar ${cls}"><i style="width:${Math.round(x * 100)}%"></i></div>`;
}

function gradeBadge(v) {
  if (v == null) return '<span class="badge">baho yo\'q</span>';
  const s = DB.settings;
  const cls = v >= s.gradeMax - 0.6 ? 'ok' : v >= s.lowThreshold ? 'warn' : 'bad';
  return `<span class="badge ${cls}">${round1(v)}</span>`;
}

function phoneButtons(phones, extra = '') {
  if (!phones || !phones.length) return '<span class="muted small">raqam yo\'q</span>';
  return phones.slice(0, 3).map((p) =>
    `<button class="call-btn" data-act="call" data-phone="${esc(p.number)}" ${extra} title="${esc(p.label)} ${esc(fmtPhone(p.number))}">☎</button>`).join('');
}

function emptyState(title, text, btn = '') {
  return `<div class="empty"><b>${esc(title)}</b>${esc(text)}${btn ? '<div style="margin-top:14px">' + btn + '</div>' : ''}</div>`;
}

const UI = {
  stack: [],
  tab: 'home',
  view: null,

  init() {
    $$('#tabs button').forEach((b) => { b.onclick = () => this.go(b.dataset.tab); });
    $('#backBtn').onclick = () => this.back();
    $('#refreshBtn').onclick = () => this.view && this.view.refresh ? this.view.refresh() : this.render();
    $('#sheet').onclick = (e) => { if (e.target.id === 'sheet') this.closeSheet(); };
  },

  go(tab) {
    this.tab = tab;
    this.stack = [];
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this.show(Views[tab]());
  },

  push(view) { if (this.view) this.stack.push(this.view); this.show(view); },

  show(view) {
    this.view = view;
    $('#backBtn').hidden = !this.stack.length;
    $('#tabs').hidden = !!view.noTabs;
    $('#refreshBtn').hidden = !!view.noTabs;
    this.render();
    $('#view').scrollTop = 0;
  },

  render() {
    const v = this.view;
    if (!v) return;
    $('#title').textContent = typeof v.title === 'function' ? v.title() : v.title;
    $('#subtitle').textContent = (typeof v.subtitle === 'function' ? v.subtitle() : v.subtitle) || '';
    const el = $('#view');
    const keep = el.scrollTop;
    v.render(el);
    if (v.keepScroll) el.scrollTop = keep;
    $$('.chips .chip.on', el).forEach((c) => { const p = c.parentElement; p.scrollLeft = c.offsetLeft - p.clientWidth / 2 + c.clientWidth / 2; });
  },

  back() {
    if (!$('#sheet').hidden) { this.closeSheet(); return true; }
    if (this.stack.length) { this.show(this.stack.pop()); return true; }
    if (this.tab !== 'home' && !this.view.noTabs) { this.go('home'); return true; }
    return false;
  },

  sheet(html, acts) {
    const s = $('#sheet');
    const body = $('.sheet-body', s);
    body.innerHTML = html;
    s.hidden = false;
    body.scrollTop = 0;
    if (acts) bindActs(body, acts);
    return body;
  },
  closeSheet() { $('#sheet').hidden = true; },

  toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(this._t);
    this._t = setTimeout(() => { t.hidden = true; }, ms);
  },

  /** Small dialog with a text field and quick choices. Resolves with the text or null. */
  ask(title, { placeholder = '', value = '', chips = [], type = 'text', okText = 'Saqlash' } = {}) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; this.closeSheet(); resolve(v); };
      const body = this.sheet(`
        <h2>${esc(title)}</h2>
        ${chips.length ? `<div class="chips">${chips.map((c) => `<button class="chip" data-act="chip" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
        <label class="field"><input class="input" id="askInput" type="${type}" placeholder="${esc(placeholder)}" value="${esc(value)}"></label>
        <div class="btns"><button class="btn ghost" data-act="cancel">Bekor</button><button class="btn" data-act="ok">${esc(okText)}</button></div>`, {
        chip: (d) => finish(d.v),
        cancel: () => finish(null),
        ok: () => finish($('#askInput').value.trim()),
      });
      const obs = new MutationObserver(() => { if ($('#sheet').hidden) { obs.disconnect(); finish(null); } });
      obs.observe($('#sheet'), { attributes: true });
      setTimeout(() => { const i = $('#askInput', body); if (i && !chips.length) i.focus(); }, 50);
    });
  },

  confirm(title, text, okText = 'Ha') {
    return new Promise((resolve) => {
      this.sheet(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
        <div class="btns"><button class="btn ghost" data-act="no">Yo'q</button><button class="btn" data-act="yes">${esc(okText)}</button></div>`, {
        no: () => { this.closeSheet(); resolve(false); },
        yes: () => { this.closeSheet(); resolve(true); },
      });
    });
  },
};

/* ================================================================ session */

const App = {
  session: {},
  loadedOnce: false,
  loading: false,
  error: '',

  start() {
    DB.load();
    UI.init();
    HH.on('state', (s) => this.onState(s));
    HH.on('browserClosed', () => UI.render());
    this.session = HH.state();
    this.updateDot();
    const s = this.session.state;
    if (!this.session.hasCredentials && (s === 'needsLogin' || s === 'loggedOut' || s === 'idle')) UI.show(Views.login());
    else UI.go('home');
    if (s === 'loggedIn') this.afterLogin();
    // keep the site session alive while the app is open
    setInterval(() => { if (this.session.state === 'loggedIn') HH.request({ url: '/', method: 'GET' }).then(this.checkAlive); }, 8 * 60000);
  },

  checkAlive(r) {
    if (r && r.ok && /<input[^>]+type=["']?password/i.test(r.body || '')) Android.ensureSession();
  },

  onState(s) {
    const prev = this.session.state;
    this.session = s;
    this.updateDot();
    if (s.state === 'loggedIn' && prev !== 'loggedIn') {
      if (UI.view && UI.view.isLogin) UI.go('home');
      this.afterLogin();
    }
    if ((s.state === 'loginFailed' || s.state === 'needsLogin') && !s.hasCredentials) UI.show(Views.login(s.error));
    if (s.state === 'loginFailed' && UI.view && UI.view.isLogin) UI.show(Views.login(s.error));
    if (UI.view && (UI.view.isLogin || UI.tab === 'home' || UI.tab === 'more')) UI.render();
  },

  updateDot() {
    const st = this.session.state;
    const d = $('#sessionDot');
    d.className = 'dot ' + (st === 'loggedIn' ? 'on' : (st === 'login' || st === 'loading') ? 'busy' : 'off');
  },

  async afterLogin() {
    if (this.loadedOnce) { this.sync(true); return; }
    this.loadedOnce = true;
    if (!DB.data.groups.length || Data.stale('groups', 30)) await this.loadAll();
    this.sync(true);
  },

  async loadAll(full = false) {
    if (this.loading) return;
    this.loading = true;
    this.error = '';
    UI.render();
    try {
      if (full || !DB.data.groups.length) {
        await Data.refreshAll((i, n) => { this.progress = `${i}/${n}`; if (UI.tab === 'home') UI.render(); });
      } else {
        await Data.refreshGroups();
        for (const g of DB.data.groups) if (Data.stale(g.id, 60)) { try { await Data.refreshGroup(g.id); } catch (e) { if (e instanceof SourceError) throw e; } }
      }
    } catch (e) {
      this.error = e.message;
    } finally {
      this.loading = false;
      this.progress = '';
      UI.render();
    }
  },

  async sync(silent) {
    if (!DB.queue.length) return;
    const r = await Sync.run();
    if (!silent || r.sent) UI.toast(r.failed ? `Saytga yuborildi: ${r.sent}, xato: ${r.failed}` : `Saytga yuborildi: ${r.sent}`);
    UI.render();
  },

  dial(phone) { Android.dial(phone); },
};

/* ================================================================ views */

const Views = {
  /* -------------------------------------------------- login */
  login(error) {
    return {
      title: 'Kirish', noTabs: true, isLogin: true,
      render(el) {
        const s = App.session;
        const busy = s.state === 'login' || s.state === 'loading';
        const base = (s.baseUrl || 'https://sensorika.t8s.ru').replace(/^https?:\/\//, '');
        el.innerHTML = `
          <div class="login">
            <div class="logo">✓</div>
            <p class="muted" style="text-align:center;margin-top:0">HolliHop kabinetingizga haqiqiy brauzer orqali kiriladi. Sessiya telefonda saqlanadi.</p>
            ${error || s.error ? `<div class="alert bad">${esc(error || s.error)}</div>` : ''}
            <div class="card">
              <label class="field"><span>Sayt manzili</span><input class="input" id="lgBase" value="${esc(base)}" autocapitalize="off" autocorrect="off"></label>
              <label class="field"><span>Login</span><input class="input" id="lgUser" value="${esc(s.user || '')}" autocapitalize="off" autocorrect="off" autocomplete="username"></label>
              <label class="field"><span>Parol</span><input class="input" id="lgPass" type="password" autocomplete="current-password"></label>
              <label class="check"><input type="checkbox" id="lgRemember" checked> Eslab qolish (parol shifrlangan holda saqlanadi)</label>
              <button class="btn block" data-act="login" ${busy ? 'disabled' : ''}>${busy ? 'Kirilmoqda…' : 'Kirish'}</button>
            </div>
            <button class="btn ghost block" data-act="browser">Saytni brauzerda ochish</button>
          </div>`;
        bindActs(el, {
          login: () => {
            const u = $('#lgUser').value.trim(), p = $('#lgPass').value;
            if (!u || !p) { UI.toast('Login va parolni kiriting'); return; }
            Android.login($('#lgBase').value.trim(), u, p, $('#lgRemember').checked);
            App.session.state = 'login';
            App.session.error = '';
            error = '';
            UI.render();
          },
          browser: () => Android.showBrowser('/'),
        });
      },
    };
  },

  /* -------------------------------------------------- home */
  home() {
    return {
      title: 'Bugun',
      subtitle: () => D.human(D.today()) + (App.session.user ? ' · ' + App.session.user : ''),
      refresh: () => App.loadAll(),
      render(el) {
        const today = D.today();
        const groups = DB.data.groups;
        const todays = groups.filter((g) => g.lessonDates.includes(today));
        const absent = Stats.absentOn(null).filter((x) => x.date === today || x.date === D.add(today, -1));
        let weak = 0, debt = 0;
        groups.forEach((g) => { const st = Stats.group(g.id); weak += st.weak.length; debt += st.debtors.length; });
        const s = App.session;
        let status = '';
        if (App.loading) status = `<div class="alert info">Saytdan ma'lumot olinmoqda… ${esc(App.progress || '')}</div>`;
        else if (s.state === 'login' || s.state === 'loading') status = '<div class="alert info">Saytga kirilmoqda…</div>';
        else if (s.state === 'loginFailed') status = `<div class="alert bad">Kirib bo'lmadi: ${esc(s.error)} <br><button class="btn sm" data-act="relogin" style="margin-top:8px">Qayta urinish</button> <button class="btn sm ghost" data-act="loginView" style="margin-top:8px">Login/parol</button></div>`;
        if (App.error) {
          status += `<div class="alert warn"><b>Ma'lumot olinmadi:</b> ${esc(App.error)}<br>
            <span class="small">Sessiya ishlayapti, sayt esa ochiq: "Brauzer" orqali ishlashingiz mumkin. Saytda bir marta qo'lda davomat yoki baho qo'ysangiz, bu so'rovlar "Ko'proq → Tarmoq jurnali"da yozib olinadi.</span>
            <div class="btns" style="margin-top:8px"><button class="btn sm" data-act="retry">Qayta urinish</button><button class="btn sm ghost" data-act="browser">Brauzer</button></div></div>`;
        }
        if (DB.queue.length) status += `<div class="alert warn">${DB.queue.length} ta yozuv saytga yuborilmagan. <button class="btn sm" data-act="sync">Yuborish</button></div>`;

        el.innerHTML = `${status}
          <div class="stats">
            <div class="stat"><b>${groups.length}</b><span>guruh</span></div>
            <div class="stat"><b>${absent.length}</b><span>kelmagan</span></div>
            <div class="stat"><b>${debt}</b><span>qarzdor</span></div>
          </div>
          <h3 class="section">Bugungi darslar</h3>
            ${todays.length ? '' : `<div class="card muted">${groups.length ? 'Bugun dars yo\'q' : 'Guruhlar hali yuklanmagan'}</div>`}
          ${todays.length ? `<div class="list">${todays.map((g) => groupItem(g, true)).join('')}</div>` : ''}
          ${absent.length ? `<div class="row" style="margin:14px 2px 8px"><h3 class="section grow" style="margin:0">Kelmaganlar</h3><button class="btn sm" data-act="calls">Hammasi →</button></div>
            <div class="list">${absent.slice(0, 6).map((x) => absentItem(x)).join('')}</div>` : ''}
          ${weak ? `<div class="card row"><div class="grow"><b>${weak}</b> o'quvchida baho ko'rsatkichi past</div><button class="btn sm ghost" data-act="analytics">Ko'rish</button></div>` : ''}
          ${!groups.length && !App.loading ? `<button class="btn block" data-act="retry">Ma'lumotlarni yuklash</button>` : ''}`;
        bindActs(el, {
          open: (d) => UI.push(Views.group(d.gid, d.tab || 'att')),
          retry: () => App.loadAll(true),
          relogin: () => Android.ensureSession(),
          loginView: () => UI.show(Views.login()),
          browser: () => Android.showBrowser(''),
          sync: () => App.sync(false),
          calls: () => UI.go('calls'),
          analytics: () => UI.go('analytics'),
          call: (d) => App.dial(d.phone),
          student: (d) => studentSheet(d.sid),
        });
      },
    };
  },

  /* -------------------------------------------------- groups */
  groups() {
    let q = '';
    return {
      title: 'Guruhlar',
      subtitle: () => DB.data.groups.length + ' ta guruh',
      refresh: () => App.loadAll(),
      keepScroll: true,
      render(el) {
        const list = DB.data.groups.filter((g) => !q || latin(g.name + ' ' + g.subject + ' ' + g.teacher).includes(latin(q)));
        el.innerHTML = `
          <div class="search"><input class="input" id="gq" placeholder="Guruhni qidirish…" value="${esc(q)}"></div>
          ${App.loading ? '<div class="spinner"></div>' : ''}
          ${list.length ? `<div class="list">${list.map((g) => groupItem(g)).join('')}</div>`
            : emptyState('Guruh topilmadi', DB.data.groups.length ? 'Qidiruvni o\'zgartiring' : (App.error || 'Yangilash tugmasini bosing'))}`;
        const inp = $('#gq');
        inp.oninput = () => { q = inp.value; const pos = inp.selectionStart; UI.render(); const n = $('#gq'); n.focus(); n.setSelectionRange(pos, pos); };
        bindActs(el, { open: (d) => UI.push(Views.group(d.gid, d.tab || 'students')) });
      },
    };
  },

  /* -------------------------------------------------- one group */
  group(gid, tab = 'att') {
    const st = { tab, date: null, draft: {}, gdraft: {}, topic: '', loading: false, error: '' };
    const g = () => DB.group(gid) || { id: gid, name: 'Guruh', lessonDates: [] };
    const load = async (force) => {
      if (st.loading) return;
      if (!force && DB.data.members[gid] && !Data.stale(gid, 30)) return;
      st.loading = true; UI.render();
      try { await Data.refreshGroup(gid); st.error = ''; } catch (e) { st.error = e.message; }
      st.loading = false; UI.render();
    };
    const defaultDate = () => {
      const t = D.today();
      const ds = g().lessonDates;
      if (!ds.length || ds.includes(t)) return t;
      const past = ds.filter((d) => d <= t);
      return past.length ? past[past.length - 1] : t;
    };
    st.date = defaultDate();
    setTimeout(() => load(false), 0);

    return {
      title: () => g().name,
      subtitle: () => [g().subject, g().schedule].filter(Boolean).join(' · '),
      refresh: () => load(true),
      keepScroll: true,
      render(el) {
        const members = DB.members(gid).filter((s) => s.active);
        const tabs = [['att', 'Davomat'], ['grade', 'Baholash'], ['students', 'O\'quvchilar'], ['stats', 'Tahlil']];
        let body = '';
        if (st.loading && !members.length) body = '<div class="spinner"></div>';
        else if (!members.length) body = st.error ? `<div class="alert warn">${esc(st.error)}</div>` : emptyState('O\'quvchilar yo\'q', 'Yangilash tugmasini bosing');
        else if (st.tab === 'att') body = attendanceTab(gid, st, members);
        else if (st.tab === 'grade') body = gradeTab(gid, st, members);
        else if (st.tab === 'students') body = studentsTab(gid, members);
        else body = statsTab(gid);
        el.innerHTML = `<div class="subtabs">${tabs.map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</div>
          ${st.error && members.length ? `<div class="alert warn small">${esc(st.error)}</div>` : ''}${body}`;
        const topic = $('#topic');
        if (topic) topic.oninput = () => { st.topic = topic.value; };
        const dateIn = $('#dateIn');
        if (dateIn) dateIn.onchange = () => { if (dateIn.value) { st.date = dateIn.value; st.draft = {}; st.gdraft = {}; UI.render(); } };
        bindActs(el, groupActs(gid, st));
      },
    };
  },

  /* -------------------------------------------------- students search */
  students() {
    let q = '';
    let filter = 'all';
    return {
      title: 'O\'quvchilar',
      subtitle: () => DB.allStudents().length + ' ta o\'quvchi',
      refresh: () => App.loadAll(true),
      keepScroll: true,
      render(el) {
        let all = DB.allStudents();
        if (filter === 'debt') all = all.filter((s) => s.debt);
        const list = all.filter((s) => !q || latin(s.name + ' ' + s.phones.map((p) => p.number).join(' ')).includes(latin(q))).slice(0, 200);
        el.innerHTML = `
          <div class="search"><input class="input" id="sq" placeholder="Ism yoki telefon bo'yicha qidirish…" value="${esc(q)}"></div>
          <div class="chips"><button class="chip ${filter === 'all' ? 'on' : ''}" data-act="f" data-f="all">Hammasi</button><button class="chip ${filter === 'debt' ? 'on' : ''}" data-act="f" data-f="debt">Qarzdorlar</button></div>
          ${App.loading ? '<div class="spinner"></div>' : ''}
          ${list.length ? `<div class="list">${list.map((s) => `
            <div class="item tap" data-act="student" data-sid="${esc(s.id)}">
              <div class="avatar">${esc(initials(s.name))}</div>
              <div class="grow"><div class="name ellipsis">${esc(s.name)}</div>
                <div class="small muted ellipsis">${esc(s.groups.map((g) => g.name).join(', '))}</div></div>
              ${s.debt ? '<span class="badge bad">qarz</span>' : ''}
              ${phoneButtons(s.phones.slice(0, 1))}
            </div>`).join('')}</div>` : emptyState('Topilmadi', DB.data.groups.length ? 'Boshqa so\'z bilan qidiring' : 'Avval guruhlarni yuklang')}`;
        const inp = $('#sq');
        inp.oninput = () => { q = inp.value; const pos = inp.selectionStart; UI.render(); const n = $('#sq'); n.focus(); n.setSelectionRange(pos, pos); };
        bindActs(el, {
          student: (d, e, ev) => { if (!ev.target.closest('.call-btn')) studentSheet(d.sid); },
          call: (d) => App.dial(d.phone),
          f: (d) => { filter = d.f; UI.render(); },
        });
      },
    };
  },

  /* -------------------------------------------------- calls */
  calls() {
    let mode = 'absent';
    let date = null;   // null = most recent lesson of each group
    return {
      title: 'Qo\'ng\'iroqlar',
      subtitle: () => 'Kelmaganlar va qarzdorlar',
      refresh: () => App.loadAll(),
      keepScroll: true,
      render(el) {
        const today = D.today();
        let html = `<div class="subtabs">
            <button class="${mode === 'absent' ? 'on' : ''}" data-act="mode" data-m="absent">Kelmaganlar</button>
            <button class="${mode === 'often' ? 'on' : ''}" data-act="mode" data-m="often">Ko'p qoldirgan</button>
            <button class="${mode === 'debt' ? 'on' : ''}" data-act="mode" data-m="debt">Qarzdorlar</button></div>`;
        if (mode === 'absent') {
          const chips = [[null, 'Oxirgi dars'], [today, 'Bugun'], [D.add(today, -1), 'Kecha'], [D.add(today, -2), D.human(D.add(today, -2))]];
          html += `<div class="chips">${chips.map(([d, l]) => `<button class="chip ${date === d ? 'on' : ''}" data-act="date" data-d="${d || ''}">${esc(l)}</button>`).join('')}
            <input type="date" class="chip" id="callDate" value="${date || ''}"></div>`;
          const list = Stats.absentOn(date);
          const pending = list.filter((x) => !DB.callLog(x.student.id, x.date)).length;
          html += list.length
            ? `<div class="card small muted">${list.length} ta kelmagan, ${pending} tasiga hali qo'ng'iroq qilinmagan. ☎ bosing — raqam terish oynasi ochiladi.</div>
               <div class="list">${list.map((x) => absentItem(x, true)).join('')}</div>`
            : emptyState('Kelmaganlar yo\'q', 'Davomatda "Sababsiz" yoki "Sababli" belgilanganlar shu yerda chiqadi');
        } else if (mode === 'often') {
          const rows = [];
          DB.data.groups.forEach((g) => Stats.group(g.id).absentees.forEach((r) => rows.push({ g, r })));
          html += rows.length ? `<div class="list">${rows.map(({ g, r }) => `
            <div class="item"><div class="grow tap" data-act="student" data-sid="${esc(r.id)}"><div class="name">${esc(r.name)}</div>
              <div class="small muted">${esc(g.name)} · ${r.counts.absent} sababsiz, ${r.counts.excused} sababli${r.streak >= 2 ? ` · <b>ketma-ket ${r.streak}</b>` : ''}</div></div>
              ${phoneButtons(r.phones)}</div>`).join('')}</div>` : emptyState('Hammasi yaxshi', 'Ko\'p dars qoldirgan o\'quvchi yo\'q');
        } else {
          const rows = [];
          DB.data.groups.forEach((g) => Stats.group(g.id).debtors.forEach((r) => rows.push({ g, r })));
          html += rows.length ? `<div class="list">${rows.map(({ g, r }) => `
            <div class="item"><div class="grow tap" data-act="student" data-sid="${esc(r.id)}"><div class="name">${esc(r.name)}</div>
              <div class="small muted">${esc(g.name)} · ${r.debt.isDebtor ? '<span class="badge bad">qarzdor</span>' : '<span class="badge warn">muddati yaqin</span>'} ${esc(r.debt.date ? D.human(r.debt.date) : '')} ${esc(r.debt.text || '')}</div></div>
              ${r.phones[0] ? `<button class="sms-btn" data-act="smsDebt" data-phone="${esc(r.phones[0].number)}" data-sid="${esc(r.id)}" data-gid="${esc(g.id)}">SMS</button>` : ''}
              ${phoneButtons(r.phones.slice(0, 2))}</div>`).join('')}</div>` : emptyState('Qarzdorlar yo\'q', 'Sayt to\'lov ma\'lumotini bermagan bo\'lishi ham mumkin');
        }
        el.innerHTML = html;
        const cd = $('#callDate');
        if (cd) cd.onchange = () => { date = cd.value || null; UI.render(); };
        bindActs(el, {
          mode: (d) => { mode = d.m; UI.render(); },
          date: (d) => { date = d.d || null; UI.render(); },
          call: (d) => { App.dial(d.phone); if (d.sid && d.date) { DB.setCall(d.sid, d.date, 'called'); setTimeout(() => UI.render(), 500); } },
          sms: (d) => {
            const x = Stats.absentOn(d.date || null).find((y) => y.student.id === d.sid && y.group.id === d.gid) || {};
            Android.sms(d.phone, fill(DB.settings.smsTemplate, x.student, x.group, d.date));
            DB.setCall(d.sid, d.date, 'sms'); UI.render();
          },
          smsDebt: (d) => Android.sms(d.phone, fill(DB.settings.debtSmsTemplate, DB.member(d.gid, d.sid), DB.group(d.gid), D.today())),
          result: async (d) => {
            const note = d.r === 'note' ? await UI.ask('Izoh', { placeholder: 'Nima deyishdi?', chips: ['Kasal', 'Oilaviy sabab', 'Ertaga keladi', 'Ko\'tarmadi'] }) : '';
            if (d.r === 'note' && note == null) return;
            DB.setCall(d.sid, d.date, d.r === 'note' ? 'answered' : d.r, note);
            UI.render();
          },
          student: (d) => studentSheet(d.sid),
        });
      },
    };
  },

  /* -------------------------------------------------- analytics */
  analytics() {
    return {
      title: 'Tahlil',
      subtitle: () => 'Guruhlar va o\'quvchilar ko\'rsatkichlari',
      refresh: () => App.loadAll(true),
      keepScroll: true,
      render(el) {
        const groups = DB.data.groups.map((g) => ({ g, st: Stats.group(g.id) }));
        if (!groups.length) { el.innerHTML = emptyState('Ma\'lumot yo\'q', 'Avval guruhlarni yuklang', '<button class="btn" data-act="load">Yuklash</button>'); bindActs(el, { load: () => App.loadAll(true) }); return; }
        const all = (key) => groups.flatMap(({ g, st }) => st[key].map((r) => ({ g, r })));
        const weak = all('weak'), active = all('active'), absentees = all('absentees'), debtors = all('debtors'), falling = all('falling');
        const attAll = avg(groups.map((x) => x.st.attendance).filter((x) => x != null));
        const gradeAll = avg(groups.map((x) => x.st.avg).filter((x) => x != null));
        const section = (title, rows, fmt, cls) => rows.length ? `<h3 class="section">${title} (${rows.length})</h3>
          <div class="list">${rows.slice(0, 15).map(({ g, r }) => `<div class="item tap" data-act="student" data-sid="${esc(r.id)}">
            <div class="grow"><div class="name ellipsis">${esc(r.name)}</div><div class="small muted ellipsis">${esc(g.name)}</div></div>
            <span class="badge ${cls}">${fmt(r)}</span></div>`).join('')}</div>` : '';
        el.innerHTML = `
          <div class="stats">
            <div class="stat"><b>${pct(attAll)}</b><span>davomat</span></div>
            <div class="stat"><b>${gradeAll == null ? '—' : round1(gradeAll)}</b><span>o'rtacha baho</span></div>
            <div class="stat"><b>${DB.allStudents().length}</b><span>o'quvchi</span></div>
          </div>
          <div class="card"><h3>Guruhlar</h3>
            ${groups.map(({ g, st }) => `<div class="tap" data-act="group" data-gid="${esc(g.id)}" style="padding:8px 0;border-bottom:1px solid var(--line)">
              <div class="row"><b class="grow ellipsis">${esc(g.name)}</b>${gradeBadge(st.avg)}</div>
              <div class="row small muted" style="margin:4px 0"><span class="grow">Davomat ${pct(st.attendance)}</span>
                <span>past: ${st.weak.length} · aktiv: ${st.active.length} · qarz: ${st.debtors.length}</span></div>
              ${barHtml(st.attendance)}</div>`).join('')}
          </div>
          ${section('Baho ko\'rsatkichi past', weak, (r) => round1(r.avg), 'bad')}
          ${section('Bahosi tushib ketayotganlar', falling, (r) => '↓ ' + round1(-r.trend), 'warn')}
          ${section('Aktiv o\'quvchilar', active, (r) => round1(r.avg) + ' · ' + pct(r.attendance), 'ok')}
          ${section('Ko\'p dars qoldirganlar', absentees, (r) => (r.counts.absent + r.counts.excused) + ' dars', 'warn')}
          ${section('Qarzdorlar', debtors, (r) => (r.debt.isDebtor ? 'qarz' : 'yaqin'), 'bad')}`;
        bindActs(el, {
          student: (d) => studentSheet(d.sid),
          group: (d) => UI.push(Views.group(d.gid, 'stats')),
        });
      },
    };
  },

  /* -------------------------------------------------- more */
  more() {
    return {
      title: 'Ko\'proq',
      render(el) {
        const s = App.session;
        const names = { loggedIn: 'Kirilgan', login: 'Kirilmoqda', loading: 'Yuklanmoqda', loginFailed: 'Kirib bo\'lmadi', needsLogin: 'Kirilmagan', loggedOut: 'Chiqilgan', idle: '—' };
        el.innerHTML = `
          <div class="card"><h3>Sessiya</h3>
            <div class="kv"><span>Holat</span><b>${esc(names[s.state] || s.state)}</b>
              <span>Login</span><b>${esc(s.user || '—')}</b>
              <span>Sayt</span><b class="ellipsis">${esc(s.baseUrl || '')}</b>
              <span>Manba</span><b>${esc(DB.data.source === 'api' ? 'Api/V2 (sessiya orqali)' : DB.data.source || '—')}</b>
              <span>Versiya</span><b>${esc(Android.appVersion())}</b></div>
            ${s.error ? `<div class="alert bad small" style="margin-top:8px">${esc(s.error)}</div>` : ''}
          </div>
          <div class="list">
            <div class="item tap" data-act="browser"><div class="grow"><div class="name">Saytni brauzerda ochish</div><div class="small muted">Xuddi shu sessiya bilan — hamma narsani qo'lda ham qilish mumkin</div></div>›</div>
            <div class="item tap" data-act="reload"><div class="grow"><div class="name">Hamma ma'lumotni yangilash</div><div class="small muted">${DB.data.fetchedAt.groups ? 'Oxirgi: ' + new Date(DB.data.fetchedAt.groups).toLocaleString() : 'hali yuklanmagan'}</div></div>›</div>
            <div class="item tap" data-act="queue"><div class="grow"><div class="name">Yuborilmagan yozuvlar</div><div class="small muted">${DB.queue.length} ta</div></div>›</div>
            <div class="item tap" data-act="settings"><div class="grow"><div class="name">Sozlamalar</div><div class="small muted">Baho shkalasi, avto-baho, SMS matni</div></div>›</div>
            <div class="item tap" data-act="netlog"><div class="grow"><div class="name">Tarmoq jurnali</div><div class="small muted">Sayt yuborgan so'rovlar (moslashtirish uchun)</div></div>›</div>
            <div class="item"><div class="grow"><div class="name">Kompyuter rejimi</div><div class="small muted">Saytni desktop versiyada ochish</div></div>
              <input type="checkbox" id="desk" ${s.desktopMode ? 'checked' : ''} style="width:22px;height:22px"></div>
            <div class="item tap" data-act="relogin"><div class="grow"><div class="name">Qayta kirish</div></div>›</div>
            <div class="item tap" data-act="logout"><div class="grow"><div class="name" style="color:var(--bad)">Chiqish</div><div class="small muted">Cookie va saqlangan parol o'chiriladi</div></div></div>
          </div>`;
        $('#desk').onchange = (e) => { Android.setDesktopMode(e.target.checked); App.session.desktopMode = e.target.checked; };
        bindActs(el, {
          browser: () => Android.showBrowser(''),
          reload: () => { UI.go('home'); App.loadAll(true); },
          queue: () => UI.push(Views.queue()),
          settings: () => UI.push(Views.settings()),
          netlog: () => UI.push(Views.netlog()),
          relogin: () => { Android.ensureSession(); UI.toast('Saytga qayta kirilmoqda…'); },
          logout: async () => {
            if (!(await UI.confirm('Chiqish', 'Sessiya va saqlangan parol o\'chiriladi. Kiritilgan jurnal telefonda qoladi.'))) return;
            Android.logout();
            App.loadedOnce = false;
            UI.show(Views.login());
          },
        });
      },
    };
  },

  queue() {
    return {
      title: 'Yuborilmagan yozuvlar',
      render(el) {
        el.innerHTML = DB.queue.length ? `<div class="list">${DB.queue.map((q, i) => `<div class="item">
            <div class="grow"><div class="name">${q.type === 'att' ? 'Davomat' : 'Baholar'} · ${esc((DB.group(q.gid) || {}).name || q.gid)}</div>
              <div class="small muted">${esc(D.human(q.date))}${q.tries ? ' · ' + q.tries + ' urinish' : ''}</div>
              ${q.error ? `<div class="small" style="color:var(--bad)">${esc(q.error)}</div>` : ''}</div>
            <button class="btn sm ghost" data-act="del" data-i="${i}">O'chirish</button></div>`).join('')}</div>
            <button class="btn block" data-act="send">Hozir yuborish</button>
            <p class="small muted">Yozuvlar telefonda saqlangan, jurnal va tahlilda hisobga olinadi. O'chirish faqat saytga yuborishni bekor qiladi.</p>`
          : emptyState('Hammasi yuborilgan', 'Saytga yuborilmagan yozuv yo\'q');
        bindActs(el, {
          send: async () => { await App.sync(false); UI.render(); },
          del: (d) => { DB.queue.splice(Number(d.i), 1); DB.saveQueue(); UI.render(); },
        });
      },
    };
  },

  settings() {
    return {
      title: 'Sozlamalar',
      render(el) {
        const s = DB.settings;
        const teachers = {};
        DB.data.groups.forEach((g) => (g.teacherIds || []).forEach((id, i) => { teachers[id] = (g.teacher || '').split(', ')[i] || g.teacher || ('#' + id); }));
        el.innerHTML = `
          <div class="card"><h3>Baholash</h3>
            <div class="row"><label class="field grow"><span>Eng past baho</span><input class="input" type="number" id="sMin" value="${s.gradeMin}"></label>
              <label class="field grow"><span>Eng yuqori baho</span><input class="input" type="number" id="sMax" value="${s.gradeMax}"></label></div>
            <label class="field"><span>Tarixi yo'q o'quvchiga avto-baho</span><input class="input" type="number" id="sDef" value="${s.autoDefault}"></label>
            <label class="field"><span>"Past baho" chegarasi (o'rtacha shundan past)</span><input class="input" type="number" step="0.1" id="sLow" value="${s.lowThreshold}"></label>
            <label class="field"><span>"Aktiv" uchun minimal davomat, %</span><input class="input" type="number" id="sAct" value="${Math.round(s.activeAttendance * 100)}"></label>
          </div>
          <div class="card"><h3>Guruhlar</h3>
            <label class="field"><span>Faqat shu o'qituvchi guruhlari</span><select class="input" id="sTeacher">
              <option value="">Sayt bergan hamma guruhlar</option>
              ${Object.entries(teachers).map(([id, n]) => `<option value="${esc(id)}" ${String(s.teacherId) === String(id) ? 'selected' : ''}>${esc(n)}</option>`).join('')}
            </select></label>
            <label class="field"><span>Tarix (kun)</span><input class="input" type="number" id="sHist" value="${s.historyDays}"></label>
          </div>
          <div class="card"><h3>SMS matnlari</h3>
            <p class="small muted" style="margin-top:0">{name} — o'quvchi, {group} — guruh, {date} — sana</p>
            <label class="field"><span>Kelmaganlarga</span><textarea class="input" rows="3" id="sSms">${esc(s.smsTemplate)}</textarea></label>
            <label class="field"><span>Qarzdorlarga</span><textarea class="input" rows="3" id="sDebt">${esc(s.debtSmsTemplate)}</textarea></label>
          </div>
          <div class="card"><h3>Qo'shimcha</h3>
            <label class="field"><span>API kalit (ixtiyoriy — faqat admin bergan bo'lsa)</span><input class="input" id="sKey" value="${esc(s.apiKey)}" autocapitalize="off"></label>
          </div>
          <button class="btn block" data-act="save">Saqlash</button>`;
        bindActs(el, {
          save: () => {
            const n = (id, d) => { const v = Number($(id).value); return isNaN(v) ? d : v; };
            const teacherChanged = String(s.teacherId) !== $('#sTeacher').value || s.apiKey !== $('#sKey').value.trim();
            Object.assign(s, {
              gradeMin: n('#sMin', 2), gradeMax: n('#sMax', 5), autoDefault: n('#sDef', 4), lowThreshold: n('#sLow', 3.5),
              activeAttendance: n('#sAct', 90) / 100, historyDays: n('#sHist', 120), teacherId: $('#sTeacher').value,
              smsTemplate: $('#sSms').value, debtSmsTemplate: $('#sDebt').value, apiKey: $('#sKey').value.trim(),
            });
            DB.saveSettings();
            UI.toast('Saqlandi');
            if (teacherChanged) { DB.data.source = ''; Source.adapter = null; App.loadAll(true); }
            UI.back();
          },
        });
      },
    };
  },

  netlog() {
    let onlyWrites = true;
    let open = -1;
    return {
      title: 'Tarmoq jurnali',
      subtitle: 'Brauzerda sayt yuborgan so\'rovlar',
      keepScroll: true,
      refresh: () => UI.render(),
      render(el) {
        let log = [];
        try { log = JSON.parse(Android.netLog()); } catch (e) { log = []; }
        const list = log.filter((x) => !onlyWrites || (x.method || 'GET').toUpperCase() !== 'GET').reverse();
        el.innerHTML = `
          <div class="card small muted">Saytni "Brauzer"da ochib, bir marta qo'lda davomat yoki baho qo'ying. Sayt yuborgan so'rovlar shu yerda chiqadi. "Ulashish" orqali ularni dasturchiga yuborsangiz, ilova shu amalni avtomatik bajaradigan qilib moslashtiriladi. Parollar yozilmaydi.</div>
          <div class="chips"><button class="chip ${onlyWrites ? 'on' : ''}" data-act="w" data-v="1">Faqat saqlash (POST)</button>
            <button class="chip ${!onlyWrites ? 'on' : ''}" data-act="w" data-v="0">Hammasi</button></div>
          <div class="btns" style="margin-bottom:10px"><button class="btn sm" data-act="browser">Brauzer</button><button class="btn sm ghost" data-act="share">Ulashish</button><button class="btn sm ghost" data-act="clear">Tozalash</button></div>
          ${list.length ? `<div class="list">${list.map((x, i) => `<div class="item tap" data-act="open" data-i="${i}" style="display:block">
              <div class="row"><span class="badge ${x.status >= 400 ? 'bad' : 'ok'}">${esc(x.method)} ${esc(x.status)}</span><span class="grow small ellipsis">${esc(x.url)}</span></div>
              ${open === i ? `<div class="small muted">Sahifa: ${esc(x.page)} · ${new Date(x.t).toLocaleTimeString()}</div><pre class="log">${esc(x.body || '(bo\'sh)')}</pre><pre class="log">${esc(x.response || '')}</pre>` : ''}
            </div>`).join('')}</div>` : emptyState('Hali so\'rov yo\'q', 'Brauzerda saytdan foydalaning')}`;
        bindActs(el, {
          w: (d) => { onlyWrites = d.v === '1'; open = -1; UI.render(); },
          open: (d) => { open = open === Number(d.i) ? -1 : Number(d.i); UI.render(); },
          browser: () => Android.showBrowser(''),
          clear: () => { Android.clearNetLog(); UI.render(); },
          share: () => Android.share(JSON.stringify(log.slice(-150), null, 1)),
        });
      },
    };
  },
};

/* ================================================================ pieces */

function fill(tpl, student, group, date) {
  return String(tpl || '')
    .replace(/\{name\}/g, (student && student.name) || '')
    .replace(/\{group\}/g, (group && group.name) || '')
    .replace(/\{date\}/g, date ? D.human(date).toLowerCase() === 'bugun' ? D.short(date) : D.short(date) : '');
}

function groupItem(g, withActions) {
  const members = DB.members(g.id).filter((s) => s.active);
  const marked = g.lessonDates.includes(D.today()) && members.length && members.every((s) => DB.attendance(g.id, s.id, D.today()));
  return `<div class="item tap" data-act="open" data-gid="${esc(g.id)}">
    <div class="avatar">${esc(initials(g.name))}</div>
    <div class="grow"><div class="name ellipsis">${esc(g.name)}</div>
      <div class="small muted ellipsis">${esc([g.time, g.subject, (members.length || g.studentsCount || '') && (members.length || g.studentsCount) + ' o\'quvchi'].filter(Boolean).join(' · '))}</div></div>
    ${withActions ? `${marked ? '<span class="badge ok">belgilandi</span>' : '<button class="btn sm" data-act="open" data-gid="' + esc(g.id) + '" data-tab="att">Davomat</button>'}
      <button class="btn sm ghost" data-act="open" data-gid="${esc(g.id)}" data-tab="grade">Baho</button>` : '›'}
  </div>`;
}

function phoneRows(phones, attrs = '', smsAttrs = null) {
  if (!phones.length) return '<div class="small muted" style="margin-top:6px">Telefon raqami yo\'q</div>';
  return phones.slice(0, 3).map((p) => `<div class="row" style="margin-top:8px">
      <div class="grow small"><span class="muted">${esc(p.label)}</span><br><b>${esc(fmtPhone(p.number))}</b></div>
      ${smsAttrs != null ? `<button class="sms-btn" data-act="sms" data-phone="${esc(p.number)}" ${smsAttrs}>SMS</button>` : ''}
      <button class="call-btn" data-act="call" data-phone="${esc(p.number)}" ${attrs}>☎</button></div>`).join('');
}

function absentItem(x, withResult) {
  const log = DB.callLog(x.student.id, x.date);
  const res = { called: 'qo\'ng\'iroq qilindi', answered: 'gaplashildi', noanswer: 'ko\'tarmadi', sms: 'SMS yuborildi' };
  const ids = `data-sid="${esc(x.student.id)}" data-gid="${esc(x.group.id)}" data-date="${esc(x.date)}"`;
  return `<div class="item" style="display:block">
    <div class="row">
      <div class="grow tap" data-act="student" data-sid="${esc(x.student.id)}" style="min-width:0"><div class="name ellipsis">${esc(x.student.name)}</div>
        <div class="small muted ellipsis">${esc(x.group.name)} · ${esc(D.human(x.date))}</div></div>
      ${attBadge(x.att)}
    </div>
    ${phoneRows(x.student.phones, ids, ids)}
    ${withResult ? `<div class="row wrap small" style="margin-top:8px">
      ${log ? `<span class="badge ok">${esc(res[log.result] || log.result)}</span>${log.note ? `<span class="muted">${esc(log.note)}</span>` : ''}` : '<span class="badge warn">qo\'ng\'iroq qilinmagan</span>'}
      <span class="grow"></span>
      <button class="chip" data-act="result" data-r="note" ${ids}>Gaplashdim</button>
      <button class="chip" data-act="result" data-r="noanswer" ${ids}>Ko'tarmadi</button>
    </div>` : ''}
  </div>`;
}

function dateChips(gid, st) {
  const g = DB.group(gid) || { lessonDates: [] };
  const t = D.today();
  const past = g.lessonDates.filter((d) => d <= t).slice(-6);
  const dates = uniq([...past, st.date]).sort();
  return `<div class="chips">${dates.map((d) => `<button class="chip ${d === st.date ? 'on' : ''}" data-act="date" data-d="${d}">${esc(D.human(d))}</button>`).join('')}
    <input type="date" class="chip" id="dateIn" value="${esc(st.date)}"></div>`;
}

/* -------------------------------------------------- attendance tab */

function attendanceTab(gid, st, members) {
  const rows = members.map((s) => {
    const cur = st.draft[s.id] || DB.attendance(gid, s.id, st.date);
    const status = cur && cur.status;
    return `<div class="item" style="display:block">
      <div class="row"><div class="grow tap" data-act="student" data-sid="${esc(s.id)}"><div class="name ellipsis">${esc(s.name)}</div>
        <div class="small muted ellipsis">${cur && cur.note ? esc(cur.note) : (s.debt && s.debt.isDebtor ? '<span class="badge bad">qarzdor</span>' : '')}${st.draft[s.id] ? ' <span class="badge warn">saqlanmagan</span>' : ''}</div></div></div>
      <div class="seg" style="margin-top:8px">
        ${Object.entries(ATT).map(([k, t]) => `<button class="${status === k ? 'on ' + t.cls : ''}" style="flex:1" data-act="mark" data-sid="${esc(s.id)}" data-s="${k}">${t.label}</button>`).join('')}
      </div></div>`;
  }).join('');
  const changed = Object.keys(st.draft).length;
  return `${dateChips(gid, st)}
    <div class="btns" style="margin-bottom:10px">
      <button class="btn sm ghost" data-act="allPresent">Hammasi keldi</button>
      <button class="btn sm ghost" data-act="browserJournal">Saytda ochish</button>
    </div>
    <div class="list">${rows}</div>
    <div class="sticky-bottom"><button class="btn block ok" data-act="saveAtt" ${changed ? '' : 'disabled'}>Davomatni saqlash${changed ? ' (' + changed + ')' : ''}</button></div>`;
}

/* -------------------------------------------------- grading tab */

function gradeTab(gid, st, members) {
  const set = DB.settings;
  const saved = ((DB.journal.grades[gid] || {})[st.date]) || null;
  if (!st.topic && saved && saved.topic) st.topic = saved.topic;
  const scores = [];
  for (let v = set.gradeMax; v >= set.gradeMin; v--) scores.push(v);
  const prevTopics = DB.topics(gid).slice(0, 8);
  const rows = members.map((s) => {
    const att = DB.attendance(gid, s.id, st.date);
    const away = att && (att.status === 'absent' || att.status === 'excused');
    const cur = st.gdraft[s.id] || (saved && saved.scores[s.id]) || null;
    const stat = Stats.student(gid, s);
    return `<div class="item" style="display:block;${away ? 'opacity:.55' : ''}">
      <div class="row"><div class="grow tap" data-act="student" data-sid="${esc(s.id)}"><div class="name ellipsis">${esc(s.name)}</div>
        <div class="small muted ellipsis">${away ? 'darsda yo\'q · ' : ''}o'rtacha ${stat.avg == null ? '—' : round1(stat.avg)}${cur && cur.why ? ' · avto: ' + esc(cur.why) : ''}${st.gdraft[s.id] ? ' · <b>saqlanmagan</b>' : ''}</div></div>
        <button class="chip" data-act="comment" data-sid="${esc(s.id)}">${cur && cur.comment ? '✎' : '+ izoh'}</button></div>
      <div class="seg" style="margin-top:8px">
        ${scores.map((v) => `<button class="${cur && Number(cur.score) === v ? 'on brand' : ''}" style="flex:1" data-act="score" data-sid="${esc(s.id)}" data-v="${v}">${v}</button>`).join('')}
        <button data-act="score" data-sid="${esc(s.id)}" data-v="" title="Olib tashlash">✕</button>
      </div>
      ${cur && cur.comment ? `<div class="small muted" style="margin-top:4px">${esc(cur.comment)}</div>` : ''}</div>`;
  }).join('');
  const changed = Object.keys(st.gdraft).length;
  return `${dateChips(gid, st)}
    <div class="card">
      <label class="field" style="margin-bottom:6px"><span>Dars mavzusi</span><input class="input" id="topic" list="topics" value="${esc(st.topic)}" placeholder="Masalan: Present Simple"></label>
      <datalist id="topics">${prevTopics.map((t) => `<option value="${esc(t.topic)}">`).join('')}</datalist>
      ${prevTopics.length ? `<div class="small muted">Oldingi: ${prevTopics.slice(0, 3).map((t) => esc(D.short(t.date) + ' ' + t.topic)).join('; ')}</div>` : ''}
    </div>
    <div class="btns" style="margin-bottom:10px">
      <button class="btn sm" data-act="auto">⚡ Avto-baho</button>
      <button class="btn sm ghost" data-act="allScore" data-v="${set.gradeMax}">Hammaga ${set.gradeMax}</button>
      <button class="btn sm ghost" data-act="allScore" data-v="${set.gradeMax - 1}">Hammaga ${set.gradeMax - 1}</button>
    </div>
    <div class="list">${rows}</div>
    <div class="sticky-bottom"><button class="btn block" data-act="saveGrades" ${changed ? '' : 'disabled'}>Baholarni saqlash${changed ? ' (' + changed + ')' : ''}</button></div>`;
}

/* -------------------------------------------------- students tab */

function studentsTab(gid, members) {
  return `<div class="list">${members.map((s) => {
    const r = Stats.student(gid, s);
    return `<div class="item">
      <div class="avatar">${esc(initials(s.name))}</div>
      <div class="grow tap" data-act="student" data-sid="${esc(s.id)}"><div class="name ellipsis">${esc(s.name)}</div>
        <div class="small muted">davomat ${pct(r.attendance)} · qoldirgan ${r.counts.absent + r.counts.excused} ${s.debt && s.debt.isDebtor ? '· <span class="badge bad">qarz</span>' : ''}</div></div>
      ${gradeBadge(r.avg)} ${phoneButtons(s.phones.slice(0, 1))}</div>`;
  }).join('')}</div>`;
}

/* -------------------------------------------------- group stats tab */

function statsTab(gid) {
  const st = Stats.group(gid);
  const list = (title, rows, fmt, cls) => `<div class="card"><h3>${title}</h3>${rows.length
    ? rows.map((r) => `<div class="row tap" data-act="student" data-sid="${esc(r.id)}" style="padding:6px 0"><span class="grow ellipsis">${esc(r.name)}</span><span class="badge ${cls}">${fmt(r)}</span></div>`).join('')
    : '<div class="muted small">yo\'q</div>'}</div>`;
  return `<div class="stats">
      <div class="stat"><b>${pct(st.attendance)}</b><span>davomat</span></div>
      <div class="stat"><b>${st.avg == null ? '—' : round1(st.avg)}</b><span>o'rtacha baho</span></div>
      <div class="stat"><b>${st.rows.length}</b><span>o'quvchi</span></div></div>
    ${list('Baho ko\'rsatkichi past', st.weak, (r) => round1(r.avg), 'bad')}
    ${list('Aktivlar', st.active, (r) => round1(r.avg), 'ok')}
    ${list('Ko\'p qoldirganlar', st.absentees, (r) => (r.counts.absent + r.counts.excused) + ' dars', 'warn')}
    ${list('Bahosi tushayotganlar', st.falling, (r) => '↓' + round1(-r.trend), 'warn')}
    ${list('Qarzdorlar', st.debtors, (r) => r.debt.isDebtor ? 'qarz' : 'yaqin', 'bad')}
    <div class="card"><h3>Barcha o'quvchilar</h3>${st.rows.map((r) => `<div class="tap" data-act="student" data-sid="${esc(r.id)}" style="padding:6px 0">
      <div class="row"><span class="grow ellipsis">${esc(r.name)}</span><span class="small muted">${pct(r.attendance)}</span> ${gradeBadge(r.avg)}</div>${barHtml(r.attendance)}</div>`).join('')}</div>`;
}

/* -------------------------------------------------- group actions */

function groupActs(gid, st) {
  return {
    tab: (d) => { st.tab = d.t; UI.render(); },
    date: (d) => { st.date = d.d; st.draft = {}; st.gdraft = {}; st.topic = ''; UI.render(); },
    student: (d) => studentSheet(d.sid),
    call: (d) => App.dial(d.phone),
    browserJournal: () => Android.showBrowser(''),

    mark: async (d) => {
      const e = { status: d.s, note: '', late: 0 };
      if (d.s === 'late') {
        const m = await UI.ask('Necha daqiqa kechikdi?', { type: 'number', chips: ['5', '10', '15', '20', '30'], placeholder: 'daqiqa' });
        if (m == null) return;
        e.late = Number(m) || 0;
      }
      if (d.s === 'excused') {
        const r = await UI.ask('Sababi', { chips: ['Kasal', 'Oilaviy sabab', 'Musobaqa/tadbir', 'Ota-ona ogohlantirgan'], placeholder: 'Sababni yozing' });
        if (r == null) return;
        e.note = r;
      }
      st.draft[d.sid] = e;
      UI.render();
    },
    allPresent: () => {
      DB.members(gid).filter((s) => s.active).forEach((s) => {
        const cur = DB.attendance(gid, s.id, st.date);
        if (!st.draft[s.id] && !cur) st.draft[s.id] = { status: 'present', note: '', late: 0 };
      });
      UI.render();
    },
    saveAtt: async () => {
      const entries = Object.entries(st.draft).map(([sid, e]) => ({ studentId: sid, ...e }));
      if (!entries.length) return;
      DB.setAttendance(gid, st.date, entries);
      st.draft = {};
      UI.render();
      UI.toast('Saqlandi. Saytga yuborilmoqda…');
      const r = await Sync.run();
      UI.toast(r.failed ? 'Telefonda saqlandi, saytga yuborilmadi: ' + ((DB.queue[0] || {}).error || '') : 'Saytga yuborildi ✓', 3500);
      UI.render();
      const absent = entries.filter((e) => e.status === 'absent' || e.status === 'excused');
      if (absent.length) callSheet(gid, st.date, absent.map((e) => e.studentId));
    },

    score: (d) => {
      const prev = st.gdraft[d.sid] || {};
      st.gdraft[d.sid] = { score: d.v === '' ? null : Number(d.v), comment: prev.comment || '' };
      UI.render();
    },
    comment: async (d) => {
      const saved = ((DB.journal.grades[gid] || {})[st.date] || { scores: {} }).scores[d.sid] || {};
      const cur = st.gdraft[d.sid] || saved;
      const c = await UI.ask('Izoh', { value: cur.comment || '', chips: ['Faol', 'Uy vazifasi yo\'q', 'Yaxshi tayyorlangan', 'Diqqatsiz'] });
      if (c == null) return;
      st.gdraft[d.sid] = { score: cur.score == null ? null : cur.score, comment: c };
      UI.render();
    },
    auto: () => {
      let n = 0;
      DB.members(gid).filter((s) => s.active).forEach((s) => {
        const att = DB.attendance(gid, s.id, st.date);
        if (att && (att.status === 'absent' || att.status === 'excused')) return;
        const sug = Stats.suggest(gid, s);
        st.gdraft[s.id] = { score: sug.score, why: sug.why, comment: (st.gdraft[s.id] || {}).comment || '' };
        n++;
      });
      UI.toast(n + ' ta o\'quvchiga avto-baho qo\'yildi — tekshirib, saqlang');
      UI.render();
    },
    allScore: (d) => {
      DB.members(gid).filter((s) => s.active).forEach((s) => {
        const att = DB.attendance(gid, s.id, st.date);
        if (att && (att.status === 'absent' || att.status === 'excused')) return;
        st.gdraft[s.id] = { score: Number(d.v), comment: (st.gdraft[s.id] || {}).comment || '' };
      });
      UI.render();
    },
    saveGrades: async () => {
      const topicEl = $('#topic');
      if (topicEl) st.topic = topicEl.value.trim();
      if (!st.topic) {
        const t = await UI.ask('Dars mavzusi', { placeholder: 'Mavzuni kiriting', chips: DB.topics(gid).slice(0, 4).map((x) => x.topic) });
        if (t == null) return;
        st.topic = t;
      }
      const entries = Object.entries(st.gdraft).map(([sid, e]) => ({ studentId: sid, score: e.score, comment: e.comment }));
      DB.setGrades(gid, st.date, st.topic, entries);
      st.gdraft = {};
      UI.render();
      UI.toast('Saqlandi. Saytga yuborilmoqda…');
      const r = await Sync.run();
      UI.toast(r.failed ? 'Telefonda saqlandi, saytga yuborilmadi: ' + ((DB.queue[0] || {}).error || '') : 'Saytga yuborildi ✓', 3500);
      UI.render();
    },
  };
}

/* -------------------------------------------------- sheets */

function callSheet(gid, date, sids) {
  const g = DB.group(gid);
  const html = `<h2>Kelmaganlarga qo'ng'iroq</h2><p class="muted small" style="margin-top:0">${esc(g ? g.name : '')} · ${esc(D.human(date))}</p>
    <div class="list">${sids.map((sid) => {
      const s = DB.member(gid, sid);
      if (!s) return '';
      return `<div class="item" style="display:block"><div class="name">${esc(s.name)}</div>
        ${phoneRows(s.phones, `data-sid="${esc(sid)}"`, `data-sid="${esc(sid)}"`)}</div>`;
    }).join('')}</div>
    <button class="btn block ghost" data-act="close">Keyinroq</button>`;
  UI.sheet(html, {
    call: (d) => { App.dial(d.phone); DB.setCall(d.sid, date, 'called'); },
    sms: (d) => { Android.sms(d.phone, fill(DB.settings.smsTemplate, DB.member(gid, d.sid), g, date)); DB.setCall(d.sid, date, 'sms'); },
    close: () => UI.closeSheet(),
  });
}

function studentSheet(sid) {
  const st = DB.allStudents().find((s) => String(s.id) === String(sid));
  if (!st) return;
  const blocks = st.groups.map((g) => {
    const m = DB.member(g.id, sid);
    const r = Stats.student(g.id, m);
    const hist = Object.keys(m.days).concat(Object.keys((DB.journal.att[g.id]) || {})).filter((d, i, a) => a.indexOf(d) === i && d <= D.today()).sort().slice(-24)
      .map((d) => { const a = DB.attendance(g.id, sid, d); return a ? `<i class="${ATT[a.status].cls}" title="${esc(d)}">${ATT[a.status].short}</i>` : ''; }).join('');
    return `<div class="card"><div class="row"><b class="grow">${esc(g.name)}</b>${gradeBadge(r.avg)}</div>
      <div class="small muted" style="margin:4px 0">${esc(g.subject || '')} ${esc(g.schedule || '')}</div>
      <div class="kv small"><span>Davomat</span><b>${pct(r.attendance)} (${r.counts.present} keldi, ${r.counts.late} kechikdi, ${r.counts.excused} sababli, ${r.counts.absent} sababsiz)</b>
        ${m.debt ? `<span>To'lov</span><b>${m.debt.isDebtor ? '<span class="badge bad">qarzdor</span>' : m.debt.soon ? '<span class="badge warn">muddati yaqin</span>' : '<span class="badge ok">joyida</span>'} ${esc(m.debt.date ? D.human(m.debt.date) : '')} ${esc(m.debt.text || '')}</b>` : ''}
        ${m.status ? `<span>Holati</span><b>${esc(m.status)}</b>` : ''}</div>
      ${hist ? `<div class="hist">${hist}</div>` : ''}
      ${r.absences.length ? `<div class="small" style="margin-top:8px"><b>Kelmagan kunlari:</b> ${r.absences.slice(-12).reverse().map((a) => esc(D.short(a.date)) + (a.status === 'excused' ? ' (sababli' + (a.note ? ': ' + esc(a.note.replace(/^Sababli:?\s*/, '')) : '') + ')' : '')).join(', ')}</div>` : ''}
      ${r.grades.length ? `<div class="small" style="margin-top:8px"><b>Baholar:</b> ${r.grades.slice(-12).reverse().map((x) => `<span title="${esc(x.topic || '')}">${esc(D.short(x.date))}: <b>${x.score}</b>${x.topic ? ' <span class="muted">' + esc(x.topic) + '</span>' : ''}</span>`).join('; ')}</div>` : ''}
    </div>`;
  }).join('');
  UI.sheet(`<h2>${esc(st.name)}</h2>
    <div class="list">${st.phones.length ? st.phones.map((p) => `<div class="item"><div class="grow"><div class="name">${esc(fmtPhone(p.number))}</div><div class="small muted">${esc(p.label)}</div></div>
      <button class="sms-btn" data-act="sms" data-phone="${esc(p.number)}">SMS</button><button class="call-btn" data-act="call" data-phone="${esc(p.number)}">☎</button></div>`).join('')
      : '<div class="item muted">Telefon raqami yo\'q</div>'}</div>
    <h3 class="muted" style="font-size:13px;text-transform:uppercase">Guruhlari (${st.groups.length})</h3>${blocks}
    <button class="btn block ghost" data-act="close">Yopish</button>`, {
    call: (d) => App.dial(d.phone),
    sms: (d) => Android.sms(d.phone, ''),
    close: () => UI.closeSheet(),
  });
}

document.addEventListener('DOMContentLoaded', () => App.start());
