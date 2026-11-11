import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:8080',
  shots = process.env.SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || undefined,
  args: ['--enable-unsafe-swiftshader'],
});
for (const [tag, opts] of [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['phone', devices['iPhone 13']],
]) {
  const ctx = await browser.newContext(opts);
  ctx.setDefaultTimeout(20000);
  await ctx.addInitScript(() => {
    window.testAudio = [];
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(...a) {
        super(...a);
        window.testAudio.push(this);
      }
    };
  });
  const p = await ctx.newPage(),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await p.goto(origin + '/exhibits/schwarzschild/');
  await p.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  assert.ok(await p.locator('#film-intro').isVisible());
  assert.ok(await p.locator('.panel').isHidden());
  assert.equal(await p.evaluate(() => testAudio.length), 0, 'audio is opt-in');
  if (shots)
    await p
      .locator('.stage')
      .screenshot({ path: `${shots}/film-${tag}-opening.png`, scale: 'css' });
  await p.click('#film-start');
  await p.waitForFunction(() => Number(document.querySelector('#hole').dataset.progress) > 0.01);
  await p.waitForFunction(() => document.querySelector('#film-ui').classList.contains('is-quiet'));
  await p.mouse.move(100, 120);
  await p.waitForFunction(() => !document.querySelector('#film-ui').classList.contains('is-quiet'));
  assert.ok(await p.locator('#film-ui').isVisible());
  assert.ok(await p.locator('.panel').isHidden());
  await p.click('#film-play');
  assert.equal(await p.locator('#hole').getAttribute('data-flying'), 'false');
  await p.locator('#film-progress').fill('0.035');
  assert.match(await p.locator('#film-chapter-index').innerText(), /APPROACH/);
  if (shots)
    await p
      .locator('.stage')
      .screenshot({ path: `${shots}/film-${tag}-chapter.png`, scale: 'css' });
  await p.locator('#film-progress').fill('0.905');
  assert.match(await p.locator('#film-chapter-index').innerText(), /BEYOND/);
  const glError = await p.evaluate(() => {
    window.zhixuBlackHoleProbe([[0.5, 0.5]]);
    return document.querySelector('#hole').getContext('webgl2').getError();
  });
  assert.equal(glError, 0, 'postprocessing leaves no GL errors');
  if (shots)
    await p
      .locator('.stage')
      .screenshot({ path: `${shots}/film-${tag}-horizon.png`, scale: 'css' });
  await p.click('#film-data');
  assert.ok(await p.locator('.panel').isVisible());
  await p.click('#film-data');
  assert.ok(await p.locator('.panel').isHidden());
  await p.locator('#film-progress').fill('1');
  assert.ok(await p.locator('#film-end').isVisible());
  await p.click('#film-replay');
  await p.waitForFunction(() => document.querySelector('#hole').dataset.flying === 'true');
  assert.ok(await p.locator('#film-end').isHidden());
  await p.click('#film-play');
  await p.locator('#hole').focus();
  await p.keyboard.press('Space');
  assert.equal(await p.locator('#hole').getAttribute('data-flying'), 'true');
  await p.click('#film-sound');
  await p.waitForFunction(() => testAudio[0]?.state === 'running');
  assert.equal(await p.locator('#film-sound').getAttribute('aria-pressed'), 'true');
  await p.click('#film-play');
  await p.waitForFunction(() => testAudio[0].state === 'suspended');
  await p.click('#film-play');
  await p.waitForFunction(() => testAudio[0].state === 'running');
  await p.click('#film-exit');
  await p.waitForFunction(() => testAudio[0].state === 'suspended');
  assert.ok(await p.locator('#film-intro').isVisible());
  await p.click('#film-observe');
  assert.ok(await p.locator('#dist').isVisible());
  await p.click('#flight-enter');
  await p.click('#film-sound');
  assert.equal(await p.locator('#film-sound').getAttribute('aria-pressed'), 'false');
  await p.setViewportSize({ width: 320, height: 720 });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.waitForFunction(() => document.querySelector('#film-play').disabled);
  assert.equal(await p.locator('#hole').getAttribute('data-flying'), 'false');
  assert.deepEqual(errors, [], tag);
  await ctx.close();
  console.log(
    'PASS: cinema ' +
      tag +
      ' opening/chapters/end, transport/drawer/replay, GL postprocess, opt-in audio/pause/exit, reduced motion and narrow layout',
  );
}
await browser.close();
