// Browser-only stand-in for the Android bridge, used by tools/ui-test.js.
// Simulates a logged-in HolliHop site answering Api/V2 in PascalCase.
(function () {
  const iso = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const names = ['Aliyev Jasur', 'Karimova Madina', 'Toshmatov Bekzod', 'Rahimova Nilufar', 'Yusupov Sardor', 'Ergasheva Dilnoza',
    'Qodirov Otabek', 'Saidova Mohira', 'Nazarov Shoxrux', 'Abdullayeva Zarina', 'Ismoilov Doston', 'Hamidova Sevara'];
  const groups = [
    { Id: 101, Name: 'Sensorika 1A', Discipline: 'Mental arifmetika', Level: 'Boshlang\'ich', wd: [1, 3, 5], time: '09:00' },
    { Id: 102, Name: 'Sensorika 2B', Discipline: 'Mental arifmetika', Level: 'O\'rta', wd: [2, 4, 6], time: '14:00' },
    { Id: 103, Name: 'Logopediya', Discipline: 'Logopediya', Level: '', wd: [0, 1, 2, 3, 4, 5, 6], time: '16:30' },
  ];
  const dates = (wd) => { const a = []; for (let i = 60; i >= -10; i--) { const d = new Date(today); d.setDate(d.getDate() - i); if (wd.includes(d.getDay())) a.push(iso(d)); } return a; };
  const students = {}, results = {};
  groups.forEach((g, gi) => {
    g.dates = dates(g.wd);
    students[g.Id] = names.slice(gi * 3, gi * 3 + 7).map((n, i) => {
      const id = 5000 + gi * 100 + i;
      const skill = 0.5 + rnd() * 0.5;
      const days = g.dates.filter((d) => d < iso(today)).map((d) => {
        const r = rnd();
        return { Date: d + 'T00:00:00', Minutes: 90, Pass: r > skill + 0.25, StudentPayableMinutes: r > 0.97 ? 0 : 90, Description: r > 0.97 ? 'Sababli: kasal' : '' };
      });
      results[id] = g.dates.filter((d) => d < iso(today)).slice(-8).map((d) => ({
        EdUnitId: g.Id, StudentClientId: id, Date: d, TestTypeId: 3, TestTypeName: 'Dars bahosi',
        Skills: [{ SkillId: 9, SkillName: 'Baho', Score: Math.max(2, Math.min(5, Math.round(skill * 5 + rnd() - 0.3))) }],
      }));
      return {
        EdUnitId: g.Id, StudentClientId: id, StudentName: n, StudentMobile: '+99890' + (1000000 + id * 37),
        StudentAgents: [{ FirstName: 'Onasi', WhoIs: 'Onasi', Mobile: '+99893' + (2000000 + id * 41) }],
        BeginDate: '2025-09-01', Status: 'Normal', Days: days,
        Payers: [{ ClientId: id, DebtDate: i % 4 === 0 ? iso(new Date(today.getTime() - 86400000 * 3)) : (i % 5 === 1 ? iso(new Date(today.getTime() + 86400000 * 4)) : null), Value: '350 000 so\'m' }],
      };
    });
  });
  const posted = [];
  const api = (method, q, body) => {
    if (method === 'GetEdUnits') return { EdUnits: groups.map((g) => ({ Id: g.Id, Type: 'Group', Name: g.Name, Discipline: g.Discipline, Level: g.Level, OfficeOrCompanyName: 'Sensorika markazi', StudentsCount: students[g.Id].length,
      ScheduleItems: [{ BeginTime: g.time, EndTime: '10:30', Weekdays: g.wd.reduce((m, d) => m | (1 << ((d + 6) % 7)), 0), Teacher: 'Ozodbek Sobirjonov', TeacherId: 77 }],
      Days: g.dates.map((d) => ({ Date: d + 'T00:00:00', Minutes: 90 })) })) };
    if (method === 'GetEdUnitStudents') return { EdUnitStudents: students[q.get('edUnitId')] || [] };
    if (method === 'GetEdUnitTestResults') return { EdUnitTestResults: (students[q.get('edUnitId')] || []).flatMap((s) => results[s.StudentClientId]) };
    if (method === 'SetStudentPasses' || method === 'AddEdUnitTestResult') { posted.push({ method, body }); return { Success: true }; }
    return null;
  };
  window.__posted = posted;
  window.Android = {
    state: () => JSON.stringify({ state: 'loggedIn', user: 'ozodbek', baseUrl: 'https://sensorika.t8s.ru', hasCredentials: true, desktopMode: false }),
    request: (id, specJson) => {
      const spec = JSON.parse(specJson);
      const u = new URL(spec.url, 'https://sensorika.t8s.ru');
      const m = u.pathname.match(/\/Api\/V2\/(\w+)/);
      const res = m ? api(m[1], u.searchParams, spec.body && JSON.parse(spec.body)) : '<html>ok</html>';
      setTimeout(() => HH._resolve(id, res == null ? { ok: true, status: 404, body: 'not found' } : { ok: true, status: 200, body: typeof res === 'string' ? res : JSON.stringify(res) }), 60);
    },
    runInPage: (id) => setTimeout(() => HH._resolve(id, { ok: false, error: 'mock' }), 10),
    login: () => {}, ensureSession: () => {}, logout: () => {}, showBrowser: (u) => console.log('showBrowser', u),
    setDesktopMode: () => {}, dial: (p) => { window.__dialed = p; }, sms: (p, t) => { window.__sms = [p, t]; }, openUrl: () => {}, share: () => {},
    kvGet: (k) => localStorage.getItem('kv_' + k), kvSet: (k, v) => localStorage.setItem('kv_' + k, v),
    netLog: () => JSON.stringify([{ type: 'xhr', method: 'POST', url: '/Journal/Save', status: 200, body: 'a=1', response: '{"ok":1}', page: '/', t: Date.now() }]),
    clearNetLog: () => {}, toast: () => {}, appVersion: () => 'mock',
  };
})();
