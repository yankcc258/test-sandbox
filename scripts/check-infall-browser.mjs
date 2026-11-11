import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:8080';
const shots = process.env.SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const b = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || undefined,
  args: ['--enable-unsafe-swiftshader'],
});
const state = (p) =>
  p
    .locator('#infall')
    .evaluate((e) =>
      Object.fromEntries(
        Object.entries(e.dataset).map(([k, v]) => [
          k,
          ['mode', 'playing'].includes(k) ? v : Number(v),
        ]),
      ),
    );
for (const [tag, opts, fallback] of [
  ['desktop', { viewport: { width: 1280, height: 900 } }, false],
  ['phone', devices['iPhone 13'], false],
  ['no-webgl', { viewport: { width: 1000, height: 800 } }, true],
]) {
  const ctx = await b.newContext(opts);
  ctx.setDefaultTimeout(15000);
  if (fallback)
    await ctx.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return kind === 'webgl2' ? null : original.call(this, kind, ...args);
      };
    });
  const p = await ctx.newPage(),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(origin + '/exhibits/schwarzschild/?motion=0');
  await p.locator('#infall').scrollIntoViewIfNeeded();
  assert.equal((await state(p)).radius, 8);
  assert.ok(await p.locator('#ship-play').isDisabled());
  if (shots && !fallback)
    await p.locator('#infall').screenshot({ path: `${shots}/ship-${tag}-start.png`, scale: 'css' });
  await p.locator('#ship-progress').fill('0.45');
  const before = await state(p);
  await p.click('#ship-received');
  const received = await state(p);
  assert.ok(
    Math.abs(received.radius - before.radius) < 1e-9,
    'clock switch preserves emission event',
  );
  await p.click('#ship-proper');
  await p.selectOption('#ship-mass', '10');
  const stellar = await state(p);
  assert.ok(Math.abs(stellar.radius - before.radius) < 1e-9);
  assert.ok(Math.abs(before.proper / stellar.proper - 400000) < 0.001);
  assert.ok(Math.abs(stellar.tide / before.tide / 400000 ** 2 - 1) < 1e-10);
  await p.selectOption('#ship-mass', '4000000');
  await p.click('#ship-horizon');
  assert.equal((await state(p)).radius, 1);
  assert.match(await p.locator('#ship-arrival-out').innerText(), /∞/);
  assert.match(await p.locator('#ship-speed').innerText(), /无静止参考系/);
  if (shots && !fallback)
    await p
      .locator('#infall')
      .screenshot({ path: `${shots}/ship-${tag}-horizon.png`, scale: 'css' });
  await p.locator('#ship-progress').fill('1');
  const inside = await state(p);
  assert.ok(inside.radius < 1 && inside.shift === 0 && inside.arrival === Infinity);
  assert.match(await p.locator('#ship-explanation').innerText(), /已越过视界/);
  await p.click('#ship-received');
  const last = await state(p);
  assert.ok(last.radius > 1 && last.shift > 0 && Number.isFinite(last.arrival));
  assert.match(await p.locator('#ship-signal-out').innerText(), /红外/);
  if (shots && !fallback)
    await p
      .locator('#infall')
      .screenshot({ path: `${shots}/ship-${tag}-signal.png`, scale: 'css' });
  await p.click('#ship-reset');
  assert.equal((await state(p)).radius, 8);
  await p.locator('#ship-release').fill('16');
  assert.equal((await state(p)).radius, 16);
  assert.equal((await state(p)).progress, 0);
  if (fallback)
    assert.equal(await p.evaluate(() => document.documentElement.dataset.ready), 'fallback');
  await p.setViewportSize({ width: 320, height: 720 });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'narrow screen does not overflow',
  );
  assert.deepEqual(errors, [], tag);
  await ctx.close();
  console.log('PASS: mission ' + tag + ' clocks, horizon, signals, mass, scrub and reset');
}
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  ctx.setDefaultTimeout(15000);
  const p = await ctx.newPage(),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(origin + '/exhibits/schwarzschild/');
  await p.locator('#infall').scrollIntoViewIfNeeded();
  await p.click('#ship-play');
  await p.waitForFunction(() => Number(document.querySelector('#infall').dataset.progress) > 0.01);
  await p.click('#ship-play');
  const paused = await state(p);
  await p.waitForTimeout(100);
  assert.equal((await state(p)).progress, paused.progress);
  await p.click('#ship-play');
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.waitForFunction(() => document.querySelector('#ship-play').disabled);
  assert.equal((await state(p)).playing, 'false');
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await p.waitForFunction(() => !document.querySelector('#ship-play').disabled);
  assert.equal((await state(p)).playing, 'false', 'does not auto-resume after changing preference');
  await p.click('#ship-play');
  await p.evaluate(() => scrollTo(0, 0));
  await p.waitForFunction(() => document.querySelector('#infall').dataset.playing === 'false');
  assert.deepEqual(errors, []);
  await ctx.close();
}
await b.close();
console.log('PASS: mission playback, pause, reduced motion and offscreen suspension.');
