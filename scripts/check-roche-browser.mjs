// 洛希极限展品的浏览器检查（猫猫）。不在 npm run check 里（要浏览器）：
//   python -m http.server 8080 --bind 127.0.0.1   （另一个终端，在仓库根目录）
//   PLAYWRIGHT_PATH=…/playwright/index.mjs node scripts/check-roche-browser.mjs
// 检查：打开后停在开场、等人点开始；影片从「撕开」前一刻放到片尾并交给自由观察；自由观察里远处的卫星完整、
// 移到极限以内被撕开、换成岩石后同一距离撑得住、暂停、视角按钮、希尔球示意图的读数；手机宽度不横向溢出；
// 没有后期（?hdr=0）、CPU 后端、没有 WebGL2、上下文丢失和恢复。加 SHOTS=目录 会顺便存截图。
// 用到的地址参数：?n=1024 指定碎石数，?free=1 直接进自由观察，?play=1 自动开始影片，?skip=1 从「撕开」前一刻开始，
// ?sim=cpu 强制 CPU 后端，?hdr=0 强制不用后期。
import assert from 'node:assert/strict';
import { hillOverflow, rocheFluid } from '../exhibits/roche/moon/physics.js';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:8080';
const shots = process.env.SHOTS;
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || undefined,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const PLANET_DENSITY = 0.687,
  SLOW = { timeout: 300000 }; // 软件渲染很慢，等待都给足时间
const probe = (page) => page.evaluate(() => window.zhixuRocheProbe());
const ready = (page, state = 'true') =>
  page.waitForFunction((state) => document.documentElement.dataset.ready === state, state);
const setDistance = (page, d) =>
  page.locator('#dist').evaluate((node, d) => {
    node.value = String(d);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }, d);
const watch = (page) => {
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
};
const shot = async (page, name) => shots && page.screenshot({ path: `${shots}/roche-${name}.png` });
const open = async (context, query) => {
  const page = await context.newPage(),
    errors = watch(page);
  await page.goto(origin + '/exhibits/roche/moon/' + query);
  return { page, errors };
};
const desktop = () => browser.newContext({ viewport: { width: 1280, height: 800 } });

// ---------- 开场：停着等人点开始 ----------
{
  const context = await desktop(),
    { page, errors } = await open(context, '?n=1024');
  await ready(page);
  const start = await probe(page);
  assert.equal(start.mode, 'intro');
  assert.equal(start.backend, 'gpu');
  assert.equal(start.dust, 1024 * 32);
  assert.ok(await page.locator('#film-play').isVisible());
  assert.ok(await page.locator('.panel').isHidden(), 'controls stay out of the way before the film');
  await shot(page, 'intro');
  await page.locator('#film-play').click();
  assert.equal((await probe(page)).mode, 'film');
  // 点「自己动手」随时离开影片
  await page.locator('#film-free').click();
  assert.equal((await probe(page)).mode, 'free');
  assert.ok(await page.locator('.panel').isVisible());
  assert.deepEqual(errors, [], 'intro');
  console.log('PASS: intro, start and leave');
  await context.close();
}

// ---------- 影片：从「撕开」前一刻到片尾 ----------
{
  const context = await desktop(),
    { page, errors } = await open(context, '?n=1024&play=1&skip=1');
  await ready(page);
  assert.equal((await probe(page)).mode, 'film');
  // 卫星先是完整的，然后真的被撕开（不是到点就播动画）
  await page.waitForFunction(() => window.zhixuRocheProbe().bound < 0.6, null, SLOW);
  assert.match(await page.locator('#caption').textContent(), /\S/);
  await shot(page, 'film-torn');
  // 片尾交给自由观察，控制面板出现
  await page.waitForFunction(() => window.zhixuRocheProbe().mode === 'free', null, SLOW);
  assert.ok(await page.locator('.panel').isVisible());
  assert.ok(await page.locator('#film').isHidden());
  await shot(page, 'film-end');
  // 重看影片：换回一颗完整的卫星
  await page.locator('#film-again').click();
  const again = await probe(page);
  assert.equal(again.mode, 'film');
  assert.equal(again.bound, 1);
  assert.deepEqual(errors, [], 'film');
  console.log('PASS: film to the end and replay');
  await context.close();
}

// ---------- 自由观察：显卡后端 ----------
{
  const context = await desktop(),
    { page, errors } = await open(context, '?n=1024&free=1');
  await ready(page);
  assert.equal((await probe(page)).mode, 'free');
  assert.equal(
    await page.locator('#fluid-out').textContent(),
    rocheFluid(0.93 / PLANET_DENSITY).toFixed(2),
  );
  // 2.9 R：在流体极限外面，转一会儿仍然完整
  await page.waitForFunction(() => window.zhixuRocheProbe().orbits > 0.2, null, SLOW);
  assert.ok((await probe(page)).bound > 0.97, 'intact outside the limit');
  // 希尔球示意图的读数跟着距离走
  await setDistance(page, 2.5);
  const hill = Number(await page.locator('#lobe').getAttribute('data-hill'));
  assert.ok(Math.abs(hill - 2.5 / hillOverflow(0.93 / PLANET_DENSITY)) < 2e-3, 'Hill radius');
  // 1.9 R：在极限以内。开到 16 倍速，等它散掉
  await setDistance(page, 1.9);
  for (let i = 0; i < 3 && (await probe(page)).speed !== 16; i++)
    await page.locator('#opt-speed').click();
  assert.equal((await probe(page)).speed, 16);
  await page.waitForFunction(() => window.zhixuRocheProbe().bound < 0.1, null, SLOW);
  assert.match(await page.locator('#state-out').textContent(), /撕开/);
  await shot(page, 'torn');
  // 同一距离换成岩石（3.0 g/cm³）：极限移到 1.49 R，重新放一颗就撑得住
  await page.locator('.materials button[data-rho="3"]').click();
  assert.equal(
    await page.locator('#fluid-out').textContent(),
    rocheFluid(3 / PLANET_DENSITY).toFixed(2),
  );
  await page.locator('#reset').click();
  await page.waitForFunction(() => window.zhixuRocheProbe().orbits > 0.5, null, SLOW);
  assert.ok((await probe(page)).bound > 0.97, 'rock survives where ice was torn apart');
  // 暂停以后模拟时间不再走；视角按钮会标出当前选中的那个
  await page.locator('#opt-motion').click();
  const held = (await probe(page)).orbits;
  await page.waitForTimeout(400);
  assert.equal((await probe(page)).orbits, held, 'paused');
  await page.locator('#view-wide').click();
  assert.equal(await page.locator('#view-wide').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#view-follow').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(errors, [], 'free');
  console.log('PASS: free exploration on the gpu backend');
  await context.close();
}

// ---------- 手机尺寸 ----------
{
  const context = await browser.newContext({ ...devices['iPhone 13'] }),
    { page, errors } = await open(context, '');
  await ready(page);
  assert.equal((await probe(page)).n, 1024, 'phones get the smaller pile');
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'no horizontal overflow',
  );
  await shot(page, 'mobile');
  assert.deepEqual(errors, [], 'mobile');
  console.log('PASS: mobile');
  await context.close();
}

// ---------- 没有后期的那条路、CPU 后端 ----------
for (const [query, expect] of [
  ['?n=1024&free=1&hdr=0', { backend: 'gpu', hdr: false }],
  ['?free=1&sim=cpu', { backend: 'cpu', n: 400 }],
]) {
  const context = await desktop(),
    { page, errors } = await open(context, query);
  await ready(page);
  const start = await probe(page);
  for (const [key, value] of Object.entries(expect)) assert.equal(start[key], value, query);
  await setDistance(page, 1.9);
  for (let i = 0; i < 3 && (await probe(page)).speed !== 16; i++)
    await page.locator('#opt-speed').click();
  await page.waitForFunction(() => window.zhixuRocheProbe().bound < 0.5, null, SLOW);
  assert.deepEqual(errors, [], query);
  console.log('PASS: ' + query);
  await context.close();
}

// ---------- 没有 WebGL2：只剩二维示意 ----------
{
  const context = await desktop();
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind === 'webgl2' ? null : original.call(this, kind, ...args);
    };
  });
  const { page, errors } = await open(context, '');
  await ready(page, 'fallback');
  assert.ok(await page.locator('#fallback').isVisible());
  assert.equal(await probe(page), null);
  await page.locator('#dist2').evaluate((node) => {
    node.value = '1.6';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.locator('#d2-out').textContent(), '1.60');
  assert.match(await page.locator('#lobe-result').textContent(), /希尔球/);
  assert.deepEqual(errors, [], 'no webgl2');
  console.log('PASS: no WebGL2 fallback');
  await context.close();
}

// ---------- 上下文丢失和恢复 ----------
{
  const context = await desktop(),
    { page } = await open(context, '?n=1024&free=1');
  await ready(page);
  await page.evaluate(() => {
    window.testLoss = document
      .querySelector('#scene')
      .getContext('webgl2')
      .getExtension('WEBGL_lose_context');
    window.testLoss.loseContext();
  });
  await ready(page, 'fallback');
  assert.ok(await page.locator('#fallback').isVisible());
  await page.evaluate(() => window.testLoss.restoreContext());
  await ready(page);
  assert.ok(await page.locator('#fallback').isHidden());
  assert.equal((await probe(page)).bound, 1, 'a fresh moon after the context comes back');
  console.log('PASS: context loss and restore');
  await context.close();
}

await browser.close();
