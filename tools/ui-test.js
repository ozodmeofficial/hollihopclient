// Drives the app UI in Chromium with the mock bridge and saves screenshots to tools/out.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 820 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript({ path: path.join(__dirname, 'mock.js') });
  await page.goto('file://' + path.join(__dirname, '../app/src/main/assets/app/index.html'));
  await page.waitForFunction(() => DB.data.groups.length === 3 && Object.keys(DB.data.members).length === 3, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const shot = (n) => page.screenshot({ path: path.join(out, n + '.png') });
  await shot('1-home');

  await page.click('#tabs [data-tab=groups]'); await shot('2-groups');
  await page.click('.item[data-gid="101"]'); await page.waitForTimeout(200); await page.click('.subtabs [data-t=att]'); await shot('3-attendance');
  // mark attendance
  await page.click('[data-act=allPresent]');
  const sids = await page.$$eval('[data-act=mark][data-s=absent]', (b) => b.map((x) => x.dataset.sid));
  await page.click(`[data-act=mark][data-s=absent][data-sid="${sids[0]}"]`);
  await page.click(`[data-act=mark][data-s=late][data-sid="${sids[1]}"]`);
  await page.click('#sheet [data-act=chip][data-v="10"]');
  await page.click(`[data-act=mark][data-s=excused][data-sid="${sids[2]}"]`);
  await page.click('#sheet [data-act=chip][data-v="Kasal"]');
  await shot('4-attendance-marked');
  await page.click('[data-act=saveAtt]');
  await page.waitForTimeout(600);
  await shot('5-call-sheet');
  await page.click('#sheet .call-btn');
  const dialed = await page.evaluate(() => window.__dialed);
  await page.click('#sheet [data-act=close]');

  // grading
  await page.click('.subtabs [data-t=grade]');
  await page.fill('#topic', 'Qo\'shish va ayirish');
  await page.click('[data-act=auto]');
  await page.waitForTimeout(200);
  await shot('6-grading-auto');
  await page.click(`[data-act=score][data-sid="${sids[3]}"][data-v="3"]`);
  await page.click('[data-act=saveGrades]');
  await page.waitForTimeout(600);
  await page.click('.subtabs [data-t=stats]'); await shot('7-group-stats');
  await page.click('.subtabs [data-t=students]'); await shot('8-group-students');

  await page.click('#tabs [data-tab=students]'); await page.fill('#sq', 'karim'); await page.waitForTimeout(100); await shot('9-search');
  await page.click('.item[data-act=student]'); await page.waitForTimeout(150); await shot('10-student-sheet');
  await page.click('#sheet [data-act=close]');
  await page.click('#tabs [data-tab=calls]'); await shot('11-calls');
  await page.click('[data-act=mode][data-m=debt]'); await shot('12-debtors');
  await page.click('#tabs [data-tab=analytics]'); await shot('13-analytics');
  await page.click('#tabs [data-tab=more]'); await shot('14-more');
  await page.click('[data-act=settings]'); await shot('15-settings');
  await page.click('#backBtn');
  await page.click('[data-act=netlog]'); await shot('16-netlog');

  const posted = await page.evaluate(() => window.__posted);
  const queue = await page.evaluate(() => DB.queue.length);
  console.log(JSON.stringify({ errors, dialed, queue, posted: posted.map((p) => ({ m: p.method, n: Array.isArray(p.body) ? p.body.length : 1, sample: Array.isArray(p.body) ? p.body.slice(0, 3) : p.body })) }, null, 1).slice(0, 3000));
  await browser.close();
  if (errors.length) process.exit(1);
})();
