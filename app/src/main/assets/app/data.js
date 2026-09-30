/* Data: local store, site adapters, sync queue and analytics. */
'use strict';

const DEFAULT_SETTINGS = {
  gradeMin: 2,
  gradeMax: 5,
  autoDefault: 4,
  lowThreshold: 3.5,      // average below this = weak
  activeAttendance: 0.9,  // attendance at or above this = active
  historyDays: 120,
  teacherId: '',          // only my groups (empty = all groups the site returns)
  apiKey: '',             // optional, only if the admin ever issues one
  smsTemplate: 'Assalomu alaykum! {name} bugun ({date}) {group} darsiga kelmadi. Sababini bilsak bo\'ladimi?',
  debtSmsTemplate: 'Assalomu alaykum! {name} ning {group} bo\'yicha to\'lov muddati keldi. Iltimos, to\'lovni amalga oshiring.',
};

const ATT = {
  present: { label: 'Keldi', short: '✓', cls: 'ok' },
  late: { label: 'Kechikdi', short: '⏱', cls: 'warn' },
  excused: { label: 'Sababli', short: 'S', cls: 'info' },
  absent: { label: 'Sababsiz', short: '✗', cls: 'bad' },
};

const DB = {
  data: null,      // cache of what the site returned
  journal: null,   // what the teacher entered in the app
  queue: null,     // not yet sent to the site
  settings: null,

  load() {
    this.data = KV.get('db', null) || { groups: [], members: {}, grades: {}, fetchedAt: {}, source: '' };
    this.journal = KV.get('journal', null) || { att: {}, grades: {}, calls: {} };
    this.queue = KV.get('queue', null) || [];
    this.settings = Object.assign({}, DEFAULT_SETTINGS, KV.get('settings', {}));
  },
  saveData() { KV.set('db', this.data); },
  saveJournal() { KV.set('journal', this.journal); },
  saveQueue() { KV.set('queue', this.queue); },
  saveSettings() { KV.set('settings', this.settings); },

  group(id) { return this.data.groups.find((g) => String(g.id) === String(id)); },
  members(gid) { return this.data.members[gid] || []; },
  member(gid, sid) { return this.members(gid).find((s) => String(s.id) === String(sid)); },

  /** All students across groups, each with the list of their groups. */
  allStudents() {
    const map = {};
    this.data.groups.forEach((g) => {
      this.members(g.id).forEach((s) => {
        const m = map[s.id] || (map[s.id] = { id: s.id, name: s.name, phones: [], groups: [], debt: null });
        m.groups.push(g);
        s.phones.forEach((p) => { if (!m.phones.some((x) => x.number === p.number)) m.phones.push(p); });
        if (s.debt && s.debt.isDebtor) m.debt = s.debt;
      });
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  },

  /* ---------- attendance ---------- */

  attendance(gid, sid, date) {
    const l = (((this.journal.att[gid] || {})[date]) || {})[sid];
    if (l) return l;
    const s = this.member(gid, sid);
    return s && s.days[date] ? s.days[date] : null;
  },

  setAttendance(gid, date, entries) {
    const g = this.journal.att[gid] || (this.journal.att[gid] = {});
    const day = g[date] || (g[date] = {});
    entries.forEach((e) => { day[e.studentId] = { status: e.status, note: e.note || '', late: e.late || 0, at: Date.now() }; });
    this.saveJournal();
    this.enqueue({ type: 'att', gid, date });
  },

  /* ---------- grades ---------- */

  grades(gid, sid) {
    const local = [];
    Object.entries(this.journal.grades[gid] || {}).forEach(([date, g]) => {
      const sc = g.scores[sid];
      if (sc && sc.score != null) local.push({ date, score: Number(sc.score), topic: g.topic, comment: sc.comment || '', local: true });
    });
    const localDates = new Set(local.map((x) => x.date));
    const server = (((this.data.grades[gid] || {})[sid]) || []).filter((x) => !localDates.has(x.date));
    return server.concat(local).sort((a, b) => a.date.localeCompare(b.date));
  },

  setGrades(gid, date, topic, entries) {
    const g = this.journal.grades[gid] || (this.journal.grades[gid] = {});
    const day = g[date] || (g[date] = { topic: '', scores: {} });
    day.topic = topic;
    day.at = Date.now();
    entries.forEach((e) => { day.scores[e.studentId] = { score: e.score, comment: e.comment || '' }; });
    this.saveJournal();
    this.enqueue({ type: 'grades', gid, date });
  },

  topics(gid) {
    return Object.entries(this.journal.grades[gid] || {})
      .map(([date, g]) => ({ date, topic: g.topic }))
      .filter((x) => x.topic)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  /* ---------- calls ---------- */

  callLog(sid, date) { return ((this.journal.calls[date] || {})[sid]) || null; },
  setCall(sid, date, result, note) {
    const d = this.journal.calls[date] || (this.journal.calls[date] = {});
    d[sid] = { result, note: note || '', at: Date.now() };
    this.saveJournal();
  },

  /* ---------- queue ---------- */

  enqueue(item) {
    this.queue = this.queue.filter((q) => !(q.type === item.type && q.gid === item.gid && q.date === item.date));
    item.tries = 0;
    item.error = '';
    this.queue.push(item);
    this.saveQueue();
  },
};

/* ================================================================ site adapters */

/**
 * HolliHop "Api/V2" called from inside the logged-in browser session.
 * Works when the site accepts the session (or when an API key is set).
 */
const ApiV2 = {
  name: 'api',

  async call(method, params = {}, body = null) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) q.set(k, v); });
    if (DB.settings.apiKey) q.set('authkey', DB.settings.apiKey);
    const spec = {
      method: body ? 'POST' : 'GET',
      url: '/Api/V2/' + method + (q.toString() ? '?' + q : ''),
      headers: { Accept: 'application/json' },
    };
    if (body) { spec.body = JSON.stringify(body); spec.headers['Content-Type'] = 'application/json; charset=UTF-8'; }
    const r = await HH.request(spec);
    if (!r.ok) throw new Error(r.error || 'Tarmoq xatosi');
    const text = r.body || '';
    if (r.status === 401 || r.status === 403) throw new SourceError('API sessiyani qabul qilmadi (' + r.status + ')');
    if (/<input[^>]+type=["']?password/i.test(text)) throw new SessionError();
    let json;
    try { json = JSON.parse(text); } catch (e) { throw new SourceError('API JSON qaytarmadi (' + r.status + ')'); }
    if (r.status >= 400) throw new Error((json && (json.Error || json.error || json.Message)) || ('Xato ' + r.status));
    return camel(json);
  },

  async probe() {
    const r = await this.call('GetEdUnits', { types: 'Group', take: 1 });
    return !!(r && (r.edUnits || Array.isArray(r)));
  },

  async groups() {
    const s = DB.settings;
    const r = await this.call('GetEdUnits', {
      types: 'Group,MiniGroup,Individual',
      statuses: 'Working,Forming',
      dateFrom: D.add(D.today(), -s.historyDays),
      dateTo: D.add(D.today(), 30),
      queryDays: true,
      teacherId: s.teacherId,
    });
    return (r.edUnits || []).map((u) => {
      const sch = (u.scheduleItems || []).map((it) => {
        const days = [];
        for (let i = 0; i < 7; i++) if ((it.weekdays || 0) & (1 << i)) days.push(['Du', 'Se', 'Chor', 'Pay', 'Ju', 'Shan', 'Yak'][i]);
        return (days.join(', ') + ' ' + (it.beginTime || '') + (it.endTime ? '–' + it.endTime : '')).trim();
      });
      const teachers = uniq((u.scheduleItems || []).map((it) => it.teacher).filter(Boolean));
      const teacherIds = uniq((u.scheduleItems || []).flatMap((it) => it.teacherIds || (it.teacherId ? [it.teacherId] : [])));
      return {
        id: String(u.id),
        name: u.name || ('Guruh ' + u.id),
        subject: [u.discipline, u.level].filter(Boolean).join(' · '),
        office: u.officeOrCompanyName || '',
        teacher: teachers.join(', '),
        teacherIds,
        schedule: sch.join('; '),
        time: ((u.scheduleItems || [])[0] || {}).beginTime || '',
        lessonDates: uniq((u.days || []).map((d) => D.norm(d.date)).filter(Boolean)).sort(),
        studentsCount: u.studentsCount,
        status: u.status || '',
      };
    });
  },

  async students(gid) {
    const s = DB.settings;
    const r = await this.call('GetEdUnitStudents', {
      edUnitId: gid, queryDays: true, queryPayers: true,
      dateFrom: D.add(D.today(), -s.historyDays), dateTo: D.add(D.today(), 30),
    });
    const today = D.today();
    return (r.edUnitStudents || []).map((x) => {
      const phones = [];
      const addPhone = (n, label) => { const p = normPhone(n); if (p && !phones.some((q) => q.number === p)) phones.push({ number: p, label }); };
      addPhone(x.studentMobile, 'O\'quvchi');
      addPhone(x.studentPhone, 'O\'quvchi');
      (x.studentAgents || []).forEach((a) => {
        addPhone(a.mobile, a.whoIs || [a.firstName, a.lastName].filter(Boolean).join(' ') || 'Ota-ona');
        addPhone(a.phone, a.whoIs || 'Ota-ona');
      });
      const days = {};
      (x.days || []).forEach((d) => {
        const date = D.norm(d.date);
        if (!date || d.pass == null) return;
        const desc = d.description || '';
        let status = 'present';
        if (d.pass) status = (/sabab|уважит|excus/i.test(desc) && !/sababsiz|неуваж/i.test(desc)) || d.studentPayableMinutes === 0 ? 'excused' : 'absent';
        else if (/kechik|опозд|late/i.test(desc)) status = 'late';
        days[date] = { status, note: desc, server: true };
      });
      const payer = (x.payers || [])[(x.payers || []).length - 1];
      const debtDate = payer && D.norm(payer.debtDate);
      const end = D.norm(x.endDate);
      return {
        id: String(x.studentClientId),
        name: x.studentName || ('#' + x.studentClientId),
        phones,
        status: x.status || '',
        active: !end || end >= today,
        days,
        debt: payer ? {
          isDebtor: !!debtDate && debtDate <= today,
          soon: !!debtDate && debtDate > today && debtDate <= D.add(today, 7),
          date: debtDate || '',
          text: payer.valueRanged || payer.value || '',
        } : null,
      };
    });
  },

  async grades(gid) {
    let r;
    try {
      r = await this.call('GetEdUnitTestResults', {
        edUnitId: gid, dateFrom: D.add(D.today(), -DB.settings.historyDays), dateTo: D.add(D.today(), 1),
      });
    } catch (e) {
      if (e instanceof SessionError) throw e;
      return null;   // grades are optional
    }
    const list = r.edUnitTestResults || r.testResults || r.results || (Array.isArray(r) ? r : []);
    const out = {};
    list.forEach((t) => {
      const sid = String(t.studentClientId || t.clientId || '');
      if (!sid) return;
      const skills = (t.skills || []).map((k) => Number(k.score)).filter((n) => !isNaN(n));
      let score = t.totalScore != null ? Number(t.totalScore) : (skills.length ? avg(skills) : Number(t.score));
      if (isNaN(score)) return;
      (out[sid] = out[sid] || []).push({
        date: D.norm(t.date) || '', score, topic: t.testTypeName || t.commentHtml || '',
        testTypeId: t.testTypeId, skillId: ((t.skills || [])[0] || {}).skillId,
      });
    });
    return out;
  },

  async pushAttendance(gid, date, day) {
    const passes = Object.entries(day).map(([sid, a]) => {
      const p = { Date: date, EdUnitId: Number(gid), StudentClientId: Number(sid) };
      if (a.status === 'present') { p.Pass = false; }
      if (a.status === 'late') { p.Pass = false; p.Description = 'Kechikib keldi' + (a.late ? ' (' + a.late + ' daq)' : ''); }
      if (a.status === 'absent') { p.Pass = true; p.Payable = true; p.Description = 'Sababsiz' + (a.note ? ': ' + a.note : ''); }
      if (a.status === 'excused') { p.Pass = true; p.Payable = false; p.Description = 'Sababli' + (a.note ? ': ' + a.note : ''); }
      return p;
    });
    await this.call('SetStudentPasses', {}, passes);
  },

  async pushGrades(gid, date, g) {
    // reuse the test type / skill the school already uses for this group, if any
    let testTypeId, skillId;
    Object.values(DB.data.grades[gid] || {}).forEach((arr) => arr.forEach((x) => {
      if (x.testTypeId) testTypeId = x.testTypeId;
      if (x.skillId) skillId = x.skillId;
    }));
    for (const [sid, sc] of Object.entries(g.scores)) {
      if (sc.score == null) continue;
      const body = {
        EdUnitId: Number(gid), StudentClientId: Number(sid), Date: date,
        TestTypeName: g.topic || 'Dars bahosi',
        CommentHtml: [g.topic, sc.comment].filter(Boolean).join(' — '),
        Skills: [{ SkillName: 'Baho', Score: Number(sc.score), ScoreMax: DB.settings.gradeMax }],
      };
      if (testTypeId) body.TestTypeId = testTypeId;
      if (skillId) body.Skills[0].SkillId = skillId;
      await this.call('AddEdUnitTestResult', {}, body);
    }
  },
};

/**
 * Teacher web interface (pages the teacher uses by hand). Filled in once the
 * site pages have been examined — see "Tarmoq jurnali" in the app.
 */
const WebUI = {
  name: 'web',
  async probe() { return false; },
  notReady() { throw new SourceError('Saytning o\'qituvchi sahifalari hali ulanmagan'); },
  async groups() { this.notReady(); },
  async students() { this.notReady(); },
  async grades() { return null; },
  async pushAttendance() { this.notReady(); },
  async pushGrades() { this.notReady(); },
};

class SessionError extends Error { constructor() { super('Sessiya tugagan — qayta kirilmoqda'); } }
class SourceError extends Error { }

const Source = {
  adapter: null,
  lastError: '',

  async detect() {
    for (const a of [ApiV2, WebUI]) {
      try {
        if (await a.probe()) { this.adapter = a; DB.data.source = a.name; return a; }
      } catch (e) {
        if (e instanceof SessionError) throw e;
        this.lastError = e.message;
      }
    }
    this.adapter = null;
    throw new SourceError(this.lastError || 'Saytdan ma\'lumot olish usuli topilmadi');
  },

  async use() {
    if (this.adapter) return this.adapter;
    if (DB.data.source) {
      this.adapter = [ApiV2, WebUI].find((a) => a.name === DB.data.source) || null;
      if (this.adapter) return this.adapter;
    }
    return this.detect();
  },

  /** Runs fn(adapter); on an expired session re-logs in once and retries. */
  async run(fn) {
    try {
      return await fn(await this.use());
    } catch (e) {
      if (!(e instanceof SessionError)) throw e;
      await Session.relogin();
      return fn(await this.use());
    }
  },
};

const Session = {
  waiters: [],
  relogin() {
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      Android.ensureSession();
      setTimeout(() => this.settle(false, 'Qayta kirish vaqti tugadi'), 60000);
    });
  },
  settle(ok, err) {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((x) => (ok ? x.resolve() : x.reject(new Error(err))));
  },
};

HH.on('state', (s) => {
  if (s.state === 'loggedIn') Session.settle(true);
  if (s.state === 'loginFailed' || s.state === 'needsLogin') Session.settle(false, s.error || 'Kirish amalga oshmadi');
});

/* ================================================================ loading */

const Data = {
  async refreshGroups() {
    const groups = await Source.run((a) => a.groups());
    DB.data.groups = groups.sort((a, b) => a.name.localeCompare(b.name));
    DB.data.fetchedAt.groups = Date.now();
    DB.saveData();
    return groups;
  },

  async refreshGroup(gid) {
    const [members, grades] = await Source.run(async (a) => [await a.students(gid), await a.grades(gid)]);
    DB.data.members[gid] = members.sort((a, b) => a.name.localeCompare(b.name));
    if (grades) DB.data.grades[gid] = grades;
    DB.data.fetchedAt[gid] = Date.now();
    DB.saveData();
    return members;
  },

  async refreshAll(onProgress) {
    await this.refreshGroups();
    const gs = DB.data.groups;
    for (let i = 0; i < gs.length; i++) {
      if (onProgress) onProgress(i + 1, gs.length, gs[i]);
      try { await this.refreshGroup(gs[i].id); } catch (e) { if (e instanceof SourceError) throw e; }
    }
  },

  stale(key, minutes) { return !DB.data.fetchedAt[key] || Date.now() - DB.data.fetchedAt[key] > minutes * 60000; },
};

const Sync = {
  running: false,
  async run() {
    if (this.running || !DB.queue.length) return { sent: 0, failed: 0 };
    this.running = true;
    let sent = 0, failed = 0;
    try {
      for (const item of DB.queue.slice()) {
        try {
          await Source.run((a) => (item.type === 'att'
            ? a.pushAttendance(item.gid, item.date, (DB.journal.att[item.gid] || {})[item.date] || {})
            : a.pushGrades(item.gid, item.date, (DB.journal.grades[item.gid] || {})[item.date] || { scores: {} })));
          DB.queue = DB.queue.filter((q) => q !== item);
          sent++;
        } catch (e) {
          item.tries++;
          item.error = e.message;
          failed++;
        }
        DB.saveQueue();
      }
    } finally { this.running = false; }
    return { sent, failed };
  },
};

/* ================================================================ analytics */

const Stats = {
  /** Per-student numbers for one group. */
  student(gid, s) {
    const g = DB.group(gid);
    const dates = uniq([...(g ? g.lessonDates : []), ...Object.keys(s.days), ...Object.keys((DB.journal.att[gid]) || {})])
      .filter((d) => d <= D.today()).sort();
    const c = { present: 0, late: 0, excused: 0, absent: 0 };
    const absences = [];
    let streak = 0;
    dates.forEach((d) => {
      const a = DB.attendance(gid, s.id, d);
      if (!a) return;
      c[a.status] = (c[a.status] || 0) + 1;
      if (a.status === 'absent' || a.status === 'excused') { absences.push({ date: d, status: a.status, note: a.note }); streak++; } else streak = 0;
    });
    const marked = c.present + c.late + c.excused + c.absent;
    const grades = DB.grades(gid, s.id);
    const scores = grades.map((x) => x.score);
    const recent = scores.slice(-3), older = scores.slice(-6, -3);
    const trend = recent.length && older.length ? avg(recent) - avg(older) : 0;
    return {
      id: s.id, name: s.name, phones: s.phones, debt: s.debt, active: s.active,
      counts: c, marked,
      attendance: marked ? (c.present + c.late) / marked : null,
      absences, streak,
      grades, avg: avg(scores), last: scores[scores.length - 1], trend,
    };
  },

  group(gid) {
    const members = DB.members(gid).filter((s) => s.active);
    const rows = members.map((s) => this.student(gid, s));
    const set = DB.settings;
    const att = rows.map((r) => r.attendance).filter((x) => x != null);
    const avgs = rows.map((r) => r.avg).filter((x) => x != null);
    return {
      rows,
      attendance: avg(att),
      avg: avg(avgs),
      weak: rows.filter((r) => r.avg != null && r.avg < set.lowThreshold).sort((a, b) => a.avg - b.avg),
      active: rows.filter((r) => (r.attendance == null || r.attendance >= set.activeAttendance) && r.avg != null && r.avg >= set.gradeMax - 0.6)
        .sort((a, b) => b.avg - a.avg),
      absentees: rows.filter((r) => r.counts.absent + r.counts.excused >= 2 || r.streak >= 2)
        .sort((a, b) => (b.counts.absent + b.counts.excused) - (a.counts.absent + a.counts.excused)),
      debtors: rows.filter((r) => r.debt && (r.debt.isDebtor || r.debt.soon)),
      falling: rows.filter((r) => r.trend <= -0.7),
    };
  },

  /** Suggested grade from a student's previous results and attendance. */
  suggest(gid, s) {
    const set = DB.settings;
    const st = this.student(gid, s);
    const g = st.grades;
    let base, why;
    if (g.length) {
      // recent grades weigh more
      let w = 0, sum = 0;
      g.slice(-10).forEach((x, i, arr) => { const k = Math.pow(0.8, arr.length - 1 - i); w += k; sum += k * x.score; });
      base = sum / w;
      why = 'o\'rtacha ' + round1(base);
    } else {
      base = set.autoDefault;
      why = 'baho tarixi yo\'q';
    }
    if (st.attendance != null && st.attendance < 0.6) { base -= 0.5; why += ', davomat ' + pct(st.attendance); }
    if (st.counts.late >= 3) { base -= 0.25; why += ', ko\'p kechikadi'; }
    const score = Math.max(set.gradeMin, Math.min(set.gradeMax, Math.round(base)));
    return { score, why };
  },

  /** Students absent on a date (default: most recent lesson up to today) across all groups. */
  absentOn(date) {
    const out = [];
    DB.data.groups.forEach((g) => {
      let d = date;
      if (!d) {
        const past = uniq([...g.lessonDates, ...Object.keys(DB.journal.att[g.id] || {})]).filter((x) => x <= D.today()).sort();
        d = past[past.length - 1];
      }
      if (!d) return;
      DB.members(g.id).filter((s) => s.active).forEach((s) => {
        const a = DB.attendance(g.id, s.id, d);
        if (a && (a.status === 'absent' || a.status === 'excused')) out.push({ group: g, student: s, date: d, att: a });
      });
    });
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.student.name.localeCompare(b.student.name));
  },
};
