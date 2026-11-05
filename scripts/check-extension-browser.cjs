const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shots = process.env.LAB_SHOTS || '.artifacts/v40';
fs.mkdirSync(shots, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const base = process.env.LAB_BASE_URL || 'http://127.0.0.1:8080/laboratory/';
  async function ready(url) {
    await page.goto(url);
    await page.waitForFunction(() => document.body.dataset.ready);
    assert.equal(
      await page.locator('body').getAttribute('data-ready'),
      url.includes('fallback') ? 'fallback' : 'true',
    );
  }
  async function overflow() {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  for (const id of [
    'math',
    'math-integral',
    'math-explog',
    'math-partials',
    'math-complex',
    'organic-bonds',
  ]) {
    await ready(base + '?motion=0&chapter=' + id);
    await page.getByRole('button', { name: '开始学习 →', exact: true }).click();
    await page.locator('#course-title').waitFor({ state: 'visible' });
    await overflow();
    const slider = page.locator('#observer-controls input[type=range]').first();
    if (await slider.isVisible()) {
      await slider.focus();
      await page.keyboard.press('ArrowRight');
    }
    await page.getByRole('button', { name: '标记本章读完', exact: true }).click();
    assert.match(await page.locator('#course-page-progress').innerText(), /已手动/);
    if (id === 'math-partials') {
      assert.equal(await page.locator('#case-differential').innerText(), '0.4');
      await page.getByRole('button', { name: '步长减半', exact: true }).click();
      assert.equal(await page.locator('#case-differential').innerText(), '0.2');
      await page.locator('#course-return').click();
      await page.getByRole('button', { name: '开始学习 →', exact: true }).click();
      assert.equal(await page.locator('#case-differential').innerText(), '0.2');
      await page.getByRole('button', { name: '回到原例', exact: true }).click();
      await page.locator('#course-observer').evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.screenshot({ path: path.join(shots, 'desktop.png') });
    }
    console.log('PASS course', id);
  }
  for (const size of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(size);
    await ready(base + '?motion=0&chapter=math-partials');
    await page.getByRole('button', { name: '开始学习 →', exact: true }).click();
    assert.equal(await page.locator('body').getAttribute('data-observer'), 'collapsed');
    await page.locator('#observer-toggle').click();
    await overflow();
    await page.locator('#case-dx').focus();
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await page.locator('#case-differential').innerText(), '0.4');
    await page.locator('#observer-toggle').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(shots, 'mobile-' + size.width + '.png') });
    console.log('PASS mobile', size.width);
  }
  await ready(base + '?motion=0&view=fallback&chapter=math-partials');
  await page.getByRole('button', { name: '开始学习 →', exact: true }).click();
  await page.locator('[data-course-tab="practice"]').click();
  await page.locator('#exercise-0 input').fill('12');
  await page.locator('#exercise-0 .check-answer').click();
  assert.match(await page.locator('#feedback-0').innerText(), /回答正确/);
  console.log('PASS fallback grading');

  // Intercept data only; all DOM, scene, grading and workspace code stays unchanged.
  const { COURSE_SNAPSHOT } = await import('../laboratory/course-snapshot.js');
  await page.setViewportSize({ width: 1440, height: 900 });
  for (let count = 1; count <= 10; count++) {
    const s = structuredClone(COURSE_SNAPSHOT);
    s.disciplines = Array.from({ length: count }, (_, i) => ({
      id: 'new-' + i,
      name: '新学科 ' + i,
      en: 'NEW ' + i,
      tracks: ['t-' + i],
      planned: ['方向甲', '方向乙'],
      description: '扩展验证',
    }));
    s.tracks = s.disciplines.map((d, i) => ({
      id: d.tracks[0],
      title: d.name,
      units: ['new-course-' + i],
    }));
    s.courses = s.tracks.map((t) => ({ ...s.courses[0], id: t.units[0], track: t.id }));
    await page.route('**/course-snapshot.js*', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export const COURSE_SNAPSHOT = ' + JSON.stringify(s) + ';',
      }),
    );
    await ready(base + '?motion=0&chapter=new-course-' + (count - 1));
    await page.locator('#back-stage').click();
    await page.locator('#primary-action').click();
    assert.equal(await page.locator('body').getAttribute('data-stage'), 'focus');
    await page.locator('#primary-action').click();
    assert.equal(await page.locator('body').getAttribute('data-stage'), 'observe');
    await page.locator('.chapter-labels button:visible').first().click();

    await page.getByRole('button', { name: '开始学习 →', exact: true }).click();
    assert.equal(
      await page.locator('body').getAttribute('data-course-id'),
      'new-course-' + (count - 1),
    );
    await overflow();
    await page.unroute('**/course-snapshot.js*');
    console.log('PASS browser data-only subjects', count);
  }
  assert.deepEqual(errors, []);
  await browser.close();
  fs.writeFileSync(
    path.join(shots, 'validation.txt'),
    'PASS: five math recipes, organic fallback, case state/keyboard, 390/320 mobile, no-WebGL grading, 1–10 synthetic disciplines through real scene and course page; no script errors.\n',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
