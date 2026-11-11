// 洛希极限展品 · 双星观测的浏览器检查（猫猫）。不在 npm run check 里（要浏览器）：
//   python -m http.server 8080 --bind 127.0.0.1   （另一个终端，在仓库根目录）
//   PLAYWRIGHT_PATH=…/playwright/index.mjs node scripts/check-roche-binary-browser.mjs
// 检查：页面就绪、显卡后端和高动态范围在用；时间往前走以后尖端有碎屑被扯出来，把两星拉开以后不再有；
// 读数、望远镜按钮、暂停、下半页示意图跟着滑杆变；手机宽度不横向溢出；CPU 后端和没有后期的那条路；
// 没有 WebGL2；上下文丢失和恢复。加 SHOTS=目录 会顺便存截图。
// 页面提供 window.zhixuRocheBinaryAdvance(秒)，不等动画帧直接把时间往前推，所以软件渲染下也不用干等。
import assert from 'node:assert/strict';
import { lagrange, planetShape, volumeRadius, periodHours } from '../exhibits/roche/binary.js';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:8080';
const shots = process.env.SHOTS;
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || undefined,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const MU = 0.35,
  points = lagrange(MU);
const ready = async (page, state = 'true') => {
  await page.waitForFunction((state) => document.documentElement.dataset.ready === state, state);
  if (
    state === 'true' &&
    (await page.locator('#deck-data').getAttribute('aria-expanded')) === 'false'
  )
    await page.click('#deck-data');
};
const advance = (page, seconds) =>
  page.evaluate((seconds) => window.zhixuRocheBinaryAdvance(seconds), seconds);
const setFill = (page, value, id = '#fill') =>
  page.locator(id).evaluate((node, value) => {
    node.value = String(value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
const watch = (page) => {
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
};
const shot = async (page, name) =>
  shots && page.screenshot({ path: `${shots}/roche-binary-${name}.png` });
const open = async (context, query = '') => {
  const page = await context.newPage(),
    errors = watch(page);
  await page.goto(origin + '/exhibits/roche/' + query);
  return { page, errors };
};
const desktop = () => browser.newContext({ viewport: { width: 1280, height: 800 } });

// ---------- 桌面 ----------
{
  const context = await desktop(),
    { page, errors } = await open(context);
  await ready(page);
  await page.locator('#opt-motion').click(); // 先暂停，时间由检查来推
  let state = await advance(page, 0);
  assert.equal(state.backend, 'gpu');
  assert.equal(state.count, 1024 * 1024);
  assert.equal(state.fill, 0.97);
  // 点暂停之前页面已经自己走了一小段，所以这里不要求「一粒都没有」，只要求相位没有倒退
  assert.ok(state.theta >= 2.62, 'time only moves forward');
  // 读数：间距和周期来自同一套公式
  const size = (which) => volumeRadius(MU, planetShape(MU, which, 0.97, points));
  assert.equal(
    await page.locator('#gap-out').textContent(),
    Math.round(6400 / size('A')).toLocaleString('en-US'),
  );
  assert.equal(
    await page.locator('#period-out').textContent(),
    periodHours(MU, size('B'), 3.4).toFixed(1),
  );
  // 往前走 30 秒：两颗行星的尖端都有碎屑被扯出来
  state = await advance(page, 30);
  assert.ok(state.census.fromA > 1000 && state.census.fromB > 1000, 'both tips shed debris');
  assert.ok(state.theta > 2.62 + 3, 'the planets went round');
  await shot(page, 'pair');
  // 把两星拉开：尖端够不着 L1，被扯出来的碎屑落回去以后不再有新的
  await setFill(page, 0.7);
  state = await advance(page, 120);
  assert.ok(state.census.fromA + state.census.fromB < 400, 'shedding stops when they are apart');
  assert.equal(await page.locator('#fill-out').textContent(), '70');
  assert.match(await page.locator('#lobes-result').textContent(), /离得还远/);
  await setFill(page, 0.97, '#fill2');
  assert.equal(await page.locator('#fill-out').textContent(), '97');
  // 望远镜按钮
  for (const scope of ['wide', 'bridge', 'pair']) {
    await page.locator(`.console [data-scope="${scope}"]`).click();
    assert.equal(
      await page.locator(`.console [data-scope="${scope}"]`).getAttribute('aria-pressed'),
      'true',
    );
    assert.equal((await advance(page, 0)).scope, scope);
    await shot(page, scope);
  }
  // 暂停状态下不点快进，时间不走
  const held = (await advance(page, 0)).theta;
  await page.waitForTimeout(400);
  assert.equal((await advance(page, 0)).theta, held, 'paused');
  assert.deepEqual(errors, [], 'desktop');
  console.log('PASS: desktop gpu backend');
  await context.close();
}

// ---------- 手机尺寸 ----------
{
  const context = await browser.newContext({ ...devices['iPhone 13'] }),
    { page, errors } = await open(context);
  await ready(page);
  assert.equal((await advance(page, 5)).count, 256 * 256, 'phones get fewer grains');
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'no horizontal overflow',
  );
  await shot(page, 'mobile');
  assert.deepEqual(errors, [], 'mobile');
  console.log('PASS: mobile');
  await context.close();
}

// ---------- CPU 后端、没有后期的那条路 ----------
{
  const context = await desktop(),
    { page, errors } = await open(context, '?sim=cpu&hdr=0');
  await ready(page);
  const state = await advance(page, 30);
  assert.equal(state.backend, 'cpu');
  assert.equal(state.hdr, false);
  assert.ok(state.census.fromA > 50 && state.census.fromB > 50);
  assert.deepEqual(errors, [], 'cpu');
  console.log('PASS: cpu backend without the HDR lens');
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
  const { page, errors } = await open(context);
  await ready(page, 'fallback');
  assert.ok(await page.locator('#fallback').isVisible());
  await setFill(page, 1, '#fill2');
  assert.equal(await page.locator('#lobes').getAttribute('data-fill'), '1.000');
  assert.match(await page.locator('#lobes-result').textContent(), /L₁/);
  assert.deepEqual(errors, [], 'no webgl2');
  console.log('PASS: no WebGL2 fallback');
  await context.close();
}

// ---------- 上下文丢失和恢复 ----------
{
  const context = await desktop(),
    { page } = await open(context);
  await ready(page);
  await page.evaluate(() => {
    window.testLoss = document
      .querySelector('#view')
      .getContext('webgl2')
      .getExtension('WEBGL_lose_context');
    window.testLoss.loseContext();
  });
  await ready(page, 'fallback');
  await page.evaluate(() => window.testLoss.restoreContext());
  await ready(page);
  assert.ok(await page.locator('#fallback').isHidden());
  assert.ok((await advance(page, 1)).count > 0);
  console.log('PASS: context loss and restore');
  await context.close();
}

await browser.close();
