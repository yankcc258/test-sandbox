import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { traceProbeRay } from '../exhibits/schwarzschild/flight.js';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:8080',
  shots = process.env.SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || undefined,
  args: ['--enable-unsafe-swiftshader'],
});
const grid = Array.from({ length: 117 }, (_, i) => [
  0.08 + (i % 13) * 0.07,
  0.1 + Math.floor(i / 13) * 0.1,
]);
for (const [tag, opts] of [
  ['desktop', { viewport: { width: 1280, height: 900 } }],
  ['phone', devices['iPhone 13']],
]) {
  const ctx = await browser.newContext(opts);
  ctx.setDefaultTimeout(15000);
  const page = await ctx.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/exhibits/schwarzschild/?motion=0');
  await page.click('#film-start');
  await page.click('#film-data');
  assert.equal(await page.locator('#hole').getAttribute('data-flight'), 'true');
  assert.ok(await page.locator('#flight-play').isDisabled());
  if (tag === 'phone') {
    const width = await page.evaluate(() => innerWidth);
    const slider = await page.locator('#flight-progress').boundingBox();
    assert.ok(slider.width > width * 0.7, 'phone timeline uses full width');
    assert.ok(
      (await page.locator('.panel').boundingBox()).height < 340,
      'phone panel leaves the image visible',
    );
  }
  for (const [label, progress] of [
    ['approach', 0],
    ['orbit', 0.52],
    ['horizon', 0.88],
    ['inside', 0.96],
    ['end', 1],
  ]) {
    await page.locator('#flight-progress').fill(String(progress));
    const d = await page.evaluate((points) => {
      const rgb = window.zhixuBlackHoleProbe(points, { diagnostic: true });
      const canvas = document.querySelector('#hole'),
        gl = canvas.getContext('webgl2'),
        prog = gl.getParameter(gl.CURRENT_PROGRAM);
      const get = (name) => {
        const x = gl.getUniform(prog, gl.getUniformLocation(prog, name));
        return typeof x === 'number' ? x : Array.from(x);
      };
      return {
        rgb,
        cam: get('u_cam'),
        fwd: get('u_fwd'),
        right: get('u_right'),
        up: get('u_up'),
        beta: get('u_beta'),
        gamma: get('u_gamma'),
        tan: get('u_tan'),
        w: canvas.width,
        h: canvas.height,
      };
    }, grid);
    let light = 0;
    for (let i = 0; i < grid.length; i++) {
      const [x, y] = grid[i],
        qx = (2 * (Math.round(x * (d.w - 1)) + 0.5)) / d.w - 1,
        qy = (2 * (Math.round((1 - y) * (d.h - 1)) + 0.5)) / d.h - 1;
      const n = d.fwd.map((v, k) => v + qx * d.tan[0] * d.right[k] + qy * d.tan[1] * d.up[k]);
      const expected = traceProbeRay(d.cam, n, d.beta, d.gamma).status;
      const [r, g, b] = d.rgb[i],
        actual = r > 200 ? (b > 200 ? 'unresolved' : 'disk') : g > 200 ? 'escaped' : 'captured';
      assert.notEqual(actual, 'unresolved', `${tag} ${label} unresolved ${i}`);
      assert.equal(actual, expected, `${tag} ${label} GPU/CPU point ${i}`);
      if (actual !== 'captured') light++;
    }
    assert.ok(light > 0, `${label} still receives external light`);
    if (shots) {
      await page.click('#film-data');
      await page
        .locator('.stage')
        .screenshot({ path: `${shots}/probe-${tag}-${label}.png`, scale: 'css' });
      await page.click('#film-data');
    }
  }
  await page.click('#flight-horizon');
  assert.ok(Math.abs(Number(await page.locator('#hole').getAttribute('data-r')) - 1) < 1e-10);
  await page.click('#flight-inside');
  assert.ok(Number(await page.locator('#hole').getAttribute('data-r')) < 1);
  const before = await page.evaluate(() =>
    window.zhixuBlackHoleProbe([
      [0.5, 0.5],
      [0.4, 0.4],
      [0.6, 0.3],
    ]),
  );
  await page.locator('#hole').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  const after = await page.evaluate(() =>
    window.zhixuBlackHoleProbe([
      [0.5, 0.5],
      [0.4, 0.4],
      [0.6, 0.3],
    ]),
  );
  assert.notDeepEqual(before, after, 'turning head changes image');
  await page.keyboard.press('Home');
  await page.click('#flight-hud');
  assert.ok(await page.locator('#flight-progress').isHidden());
  await page.click('#flight-hud');
  assert.ok(await page.locator('#flight-progress').isVisible());
  if (tag === 'desktop') {
    const position = await page.locator('#hole').getAttribute('data-progress');
    await page.evaluate(() => {
      window.testLoss = document
        .querySelector('#hole')
        .getContext('webgl2')
        .getExtension('WEBGL_lose_context');
      window.testLoss.loseContext();
    });
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'fallback');
    assert.ok(await page.locator('#flight-play').isDisabled());
    await page.evaluate(() => window.testLoss.restoreContext());
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    assert.equal(await page.locator('#hole').getAttribute('data-progress'), position);
    const restored = await page.evaluate(() =>
      window.zhixuBlackHoleProbe([[0.2, 0.5]], { diagnostic: true }),
    );
    assert.ok(restored && restored[0].some((x) => x > 200), 'probe shader restored inside horizon');
  }
  await page.click('#flight-restart');
  assert.equal(await page.locator('#hole').getAttribute('data-progress'), '0');
  await page.click('#flight-exit');
  assert.ok(await page.locator('#dist').isVisible());
  assert.equal(await page.locator('#hole').getAttribute('data-flight'), 'false');
  await page.setViewportSize({ width: 320, height: 720 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, [], tag);
  await ctx.close();
  console.log(
    'PASS: probe ' + tag + ' GPU/CPU approach/orbit/horizon/interior, controls and layout',
  );
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }),
    p = await ctx.newPage();
  await p.goto(origin + '/exhibits/schwarzschild/');
  await p.click('#film-start');
  await p.click('#film-data');
  await p.waitForFunction(() => Number(document.querySelector('#hole').dataset.progress) > 0.002);
  await p.click('#flight-play');
  const at = await p.locator('#hole').getAttribute('data-progress');
  const stillImage = await p.evaluate(() =>
    window.zhixuBlackHoleProbe([
      [0.3, 0.4],
      [0.5, 0.5],
      [0.7, 0.6],
    ]),
  );
  await p.waitForTimeout(150);
  assert.equal(await p.locator('#hole').getAttribute('data-progress'), at);
  assert.deepEqual(
    await p.evaluate(() =>
      window.zhixuBlackHoleProbe([
        [0.3, 0.4],
        [0.5, 0.5],
        [0.7, 0.6],
      ]),
    ),
    stillImage,
    'paused flight freezes disk texture as well as camera',
  );
  await p.click('#flight-hud');
  await p.click('#flight-quick-pause');
  await p.waitForFunction(
    (at) => Number(document.querySelector('#hole').dataset.progress) > Number(at),
    at,
  );
  await p.click('#flight-quick-pause');
  assert.equal(await p.locator('#hole').getAttribute('data-flying'), 'false');
  await p.click('#flight-hud');
  await p.click('#flight-play');
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.waitForFunction(() => document.querySelector('#flight-play').disabled);
  assert.equal(await p.locator('#hole').getAttribute('data-flying'), 'false');
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await p.waitForFunction(() => !document.querySelector('#flight-play').disabled);
  assert.equal(await p.locator('#hole').getAttribute('data-flying'), 'false');
  await p.click('#flight-play');
  await p.locator('#infall').scrollIntoViewIfNeeded();
  await p.waitForFunction(() => document.querySelector('#hole').dataset.flying === 'false');
  await ctx.close();
  console.log('PASS: probe playback, pause, reduced motion and offscreen suspension');
}
await browser.close();
