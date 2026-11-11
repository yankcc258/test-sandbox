// 洛希极限展品 · 星云与独立洛希瓣模型观测的浏览器检查（猫猫）。不在 npm run check 里（要浏览器）：
//   python -m http.server 8080 --bind 127.0.0.1   （另一个终端，在仓库根目录）
//   PLAYWRIGHT_PATH=…/playwright/index.mjs node scripts/check-roche-binary-browser.mjs
// 检查：页面就绪、画面不是黑的（行星带是亮的、恒星是亮的、窗框是暗的）；读数和公式对得上；时间按倍速走、暂停不走；
// 望远镜两档、转头和回正；滑杆改形状和读数；仪表抽屉、隐藏界面；平板横竖两种尺寸（手机不在范围里）；
// 没有浮点渲染目标的那条路；没有 WebGL2；上下文丢失和恢复。加 SHOTS=目录 会顺便存截图。
// 页面提供 window.zhixuRocheAdvance(秒)，不等动画帧直接把时间往前推。
import assert from 'node:assert/strict';
import {localPreview} from './roche-browser-utils.mjs';
import { lagrange, planetShape, volumeRadius, periodHours } from '../exhibits/roche/binary.js';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:8080';
const shots = process.env.SHOTS;
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || undefined,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const MU = 0.35,
  points = lagrange(MU);
const ready = (page, state = 'true') =>
  page.waitForFunction((state) => document.documentElement.dataset.ready === state, state, {timeout:120000});
const advance = (page, seconds) =>
  page.evaluate((seconds) => window.zhixuRocheAdvance(seconds), seconds);
const setFill = (page, value, id = '#fill2') =>
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
  await localPreview(context,origin);
  const page = await context.newPage(),
    errors = watch(page);
  await page.goto(origin + '/exhibits/roche/' + query,{waitUntil:'commit'});
  return { page, errors };
};
const desktop = () => browser.newContext({ viewport: { width: 1280, height: 800 } });
// 画一帧，马上读画布上一小块里最亮的颜色（x、y 是比例，y 从上往下）
const brightest = (page, x, y) =>
  page.evaluate(
    ([x, y]) => {
      window.zhixuRocheAdvance(0);
      const canvas = document.querySelector('#view'),
        gl = canvas.getContext('webgl2'),
        size = Math.round(canvas.height * 0.06),
        data = new Uint8Array(4 * size * size);
      gl.readPixels(
        Math.round(canvas.width * x - size / 2),
        Math.round(canvas.height * (1 - y) - size / 2),
        size,
        size,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
      const peak = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4)
        for (let k = 0; k < 3; k++) peak[k] = Math.max(peak[k], data[i + k]);
      return peak;
    },
    [x, y],
  );
const picture = async (page, label) => {
  const belt = await brightest(page, 0.65, 0.40), // 行星带内缘最亮的那一段
    star = await brightest(page, 0.125, 0.725), // 地平线上的恒星
    wall = await brightest(page, 0.975, 0.5); // 右边的舱壁
  assert.ok(belt[2] > 110 && belt[2] > belt[0], `${label}: the belt glows blue (${belt})`);
  assert.ok(star[0] > 170, `${label}: the star is bright (${star})`);
  // The refined titanium shoulder is readable but remains much dimmer than the nebula.
  assert.ok(Math.max(...wall) < 65 && Math.max(...wall) < Math.max(...belt)*0.5, `${label}: the matte window frame stays subdued (${wall})`);
};

// ---------- 桌面 ----------
{
  const context = await desktop(),
    started = Date.now(),
    { page, errors } = await open(context);
  await ready(page);
  // 着色器要在几秒内准备好。体积采样的循环次数曾经写成常量，被显卡驱动整段展开，第一次打开要等 25 秒
  assert.ok(Date.now() - started < 20000, `the scene is ready in seconds (${Date.now() - started} ms)`);
  // 进场只有标题和工具条，仪表收着
  assert.ok(await page.locator('.console').isHidden());
  assert.ok(await page.locator('.readout').isHidden());
  await page.locator('#deck-pause').click(); // 先暂停，时间由检查来推
  let state = await advance(page, 0);
  // 暂停并且镜头停稳以后是完整画质：体积云满分辨率、128 层
  assert.deepEqual([state.quality, state.layers], [1, 128], 'a paused frame is drawn at full effort');
  assert.equal(state.hdr, true);
  assert.equal(state.fill, 0.97);
  assert.equal(state.scope, 'vista');
  await picture(page, 'desktop');
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

  // 艺术化画面时间：倍速同时影响星云旋转与汇流；暂停时不走
  const before = state.time;
  const cloudPixels=async()=>page.evaluate(()=>{
    window.zhixuRocheAdvance(0);
    const canvas=document.querySelector('#view'),gl=canvas.getContext('webgl2');
    const pixels=new Uint8Array(32*32*4);
    gl.readPixels(Math.round(canvas.width*.67),Math.round(canvas.height*.60),32,32,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    return Array.from(pixels);
  });
  const oldCloud=await cloudPixels();
  state = await advance(page, 30);
  assert.notDeepEqual(await cloudPixels(),oldCloud,'the nebula pixels animate, not only the clock');
  assert.ok(Math.abs(state.time - before - 30) < 1e-9, '30 scene seconds');
  await page.locator('#deck-data').click();
  assert.equal(await page.locator('#deck-data').getAttribute('aria-expanded'), 'true');
  assert.ok(await page.locator('.console').isVisible());
  await page.locator('#opt-speed').click();
  state = await advance(page, 30);
  assert.ok(Math.abs(state.time - before - 30 - 120) < 1e-9, '×4');
  await page.waitForTimeout(400);
  assert.equal((await advance(page, 0)).time, state.time, 'paused');
  // 望远镜：对准双星，标题让开；Home 回全景
  await page.locator('.deck-toolbar [data-scope="nebula"]').click();
  state = await advance(page, 0);
  assert.equal(state.scope, 'nebula');
  assert.ok(state.tan < 0.4);
  assert.equal(await page.locator('#view').getAttribute('data-telescope'), 'nebula');
  await page.waitForFunction(
    () => Number(getComputedStyle(document.querySelector('.title')).opacity) < 0.02,
  );
  await shot(page, 'nebula');
  await page.locator('#view').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  state = await advance(page, 0);
  assert.ok(state.yaw < 0 && state.pitch > 0, 'arrow keys turn the camera');
  await page.keyboard.press('Home');
  state = await advance(page, 0);
  assert.ok(state.scope === 'vista' && state.yaw === 0 && state.pitch === 0, 'Home goes back');
  await shot(page, 'vista');
  // 把两星拉开：读数、下半页的示意图跟着变；画面照常
  const tips = await page.locator('#tips-out').textContent();
  await setFill(page, 0.7);
  assert.equal(await page.locator('#fill2-out').textContent(), '70');
  assert.notEqual(await page.locator('#tips-out').textContent(), tips);
  assert.match(await page.locator('#lobes-result').textContent(), /离得还远/);
  assert.equal(await page.locator('#lobes').getAttribute('data-fill'), '0.700');
  assert.equal((await advance(page,0)).time,state.time,'teaching slider leaves visual time alone');
  await setFill(page, 0.97, '#fill2');
  assert.equal(await page.locator('#fill2-out').textContent(), '97');
  // 隐藏界面：按钮和 H 键
  await page.locator('#opt-bare').click();
  await page.waitForFunction(
    () => Number(getComputedStyle(document.querySelector('.title')).opacity) < 0.02,
  );
  assert.equal(await page.locator('#deck-data').evaluate((n) => getComputedStyle(n).opacity), '0');
  await page.keyboard.press('h');
  assert.ok(!(await page.locator('#deck').evaluate((node) => node.classList.contains('bare'))));
  assert.deepEqual(errors, [], 'desktop');
  console.log('PASS: desktop');
  await context.close();
}

// ---------- 平板：竖着拿和横着拿 ----------
for (const [name, width, height] of [
  ['tablet-portrait', 820, 1180],
  ['tablet-landscape', 1180, 820],
]) {
  const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      hasTouch: true,
    }),
    { page, errors } = await open(context);
  await ready(page);
  assert.ok((await advance(page, 5)).time > 0.55);
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'no horizontal overflow',
  );
  // 展开仪表：工具条、控制台和读数都还在画面里，控制台不压着标题和读数
  await page.locator('#deck-data').tap();
  const boxes = await page.evaluate(() =>
    ['.console', '.readout', '.title', '.deck-toolbar'].map((selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return [r.left, r.top, r.right, r.bottom];
    }),
  );
  for (const [left, top, right, bottom] of boxes)
    assert.ok(left >= 0 && top >= 0 && right <= width && bottom <= height, name + ' panels fit');
  assert.ok(boxes[0][1] >= boxes[1][3] && boxes[0][1] >= boxes[2][3], name + ' console sits below');
  await page.locator('.deck-toolbar [data-scope="nebula"]').tap();
  assert.equal((await advance(page, 0)).scope, 'nebula');
  await shot(page, name);
  assert.deepEqual(errors, [], name);
  console.log('PASS: ' + name);
  await context.close();
}

// ---------- 没有浮点渲染目标：用 8 位目标照样画 ----------
{
  const context = await desktop();
  await context.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function (name) {
      return /color_buffer/.test(name) ? null : original.call(this, name);
    };
  });
  const { page, errors } = await open(context, '?motion=0');
  await ready(page);
  assert.equal((await advance(page, 10)).hdr, false);
  await picture(page, 'no float targets');
  assert.deepEqual(errors, [], 'no float targets');
  console.log('PASS: without float render targets');
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
  await picture(page, 'restored');
  console.log('PASS: context loss and restore');
  await context.close();
}

await browser.close();
