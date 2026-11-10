// 史瓦西黑洞展品的浏览器检查（露娜）。不在 npm run check 里（要浏览器）：
//   python -m http.server 8080 --bind 127.0.0.1   （另一个终端，在仓库根目录）
//   PLAYWRIGHT_PATH=…/playwright/index.mjs node scripts/check-schwarzschild-browser.mjs
// 检查：着色器能编译、画面就绪；中间的阴影是黑的；盘朝观察者转过来的一边比另一边亮，关掉频移后两边差不多；
// 关掉吸积盘后盘的位置只剩星空；拖动改视角、滚轮改距离、预设按钮；二维示意图：小于临界瞄准距离的光线掉进去；
// 手机宽度不横向溢出。加 SHOTS=目录 会顺便存截图。
import assert from 'node:assert/strict';
import { B_CRIT } from '../exhibits/schwarzschild/geodesic.js';
import { traceObserverRay } from '../exhibits/schwarzschild/orbit.js';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:8080';
const shots = process.env.SHOTS;
const b = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || undefined,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const lum = ([r, g, bl]) => 0.2126 * r + 0.7152 * g + 0.0722 * bl;
const grid = Array.from({ length: 13 * 9 }, (_, i) => [
  0.08 + (i % 13) * 0.07,
  0.1 + Math.floor(i / 13) * 0.1,
]);
const frame = (p) =>
  p.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const setDistance = async (p, r) => {
  await p.locator('#dist').evaluate((e, r) => {
    e.value = String(Math.log(r));
    e.dispatchEvent(new Event('input', { bubbles: true }));
  }, r);
  await frame(p);
};
// 读取实际 GPU 相机和整数像素中心，避免浏览器缩放 / DPR 造成边界误判。
const diagnostic = (p, points = grid) =>
  p.evaluate((points) => {
    const rgb = zhixuBlackHoleProbe(points, { diagnostic: true });
    const gl = document.querySelector('#hole').getContext('webgl2'),
      program = gl.getParameter(gl.CURRENT_PROGRAM);
    const uniform = (name) =>
      Array.from(gl.getUniform(program, gl.getUniformLocation(program, name)));
    return {
      rgb,
      cam: uniform('u_cam'),
      fwd: uniform('u_fwd'),
      right: uniform('u_right'),
      up: uniform('u_up'),
      tan: uniform('u_tan'),
      w: gl.canvas.width,
      h: gl.canvas.height,
    };
  }, points);
const rayFor = (data, [x, y]) => {
  const qx = (2 * (Math.round(x * (data.w - 1)) + 0.5)) / data.w - 1;
  const qy = (2 * (Math.round((1 - y) * (data.h - 1)) + 0.5)) / data.h - 1;
  const v = data.fwd.map(
    (a, i) => a + qx * data.tan[0] * data.right[i] + qy * data.tan[1] * data.up[i],
  );
  return v.map((x) => x / Math.hypot(...v));
};
const statusColor = {
  captured: [0, 0, 255],
  escaped: [0, 255, 0],
  disk: [255, 0, 0],
  unresolved: [255, 0, 255],
};
for (const [tag, opts] of [
  ['desk', { viewport: { width: 1280, height: 800 } }],
  ['phone', devices['iPhone 13']],
]) {
  const ctx = await b.newContext(opts);
  ctx.setDefaultTimeout(15000);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(origin + '/exhibits/schwarzschild/?motion=0');
  await p.waitForFunction(() => document.documentElement.dataset.ready, null, { timeout: 60000 });
  assert.equal(
    await p.evaluate(() => document.documentElement.dataset.ready),
    'true',
    'WebGL2 画面就绪',
  );
  const probe = (points) => p.evaluate((pts) => zhixuBlackHoleProbe(pts), points);
  const state = () =>
    p.locator('#hole').evaluate((c) => ({
      r: Number(c.dataset.r),
      incl: Number(c.dataset.incl),
      az: Number(c.dataset.az),
    }));
  // 默认视角（距离 22 r_s、倾角 80°）：正中是阴影；盘的左右两侧
  await p.setViewportSize(tag === 'desk' ? { width: 1280, height: 800 } : p.viewportSize());
  const side = tag === 'desk' ? 0.2 : 0.3; // 离中心多远取样（手机是竖屏，盘占的横向比例更大）
  const points = [
    [0.5, 0.5],
    [0.5 - side, 0.52],
    [0.5 + side, 0.52],
  ];
  let [center, left, right] = await probe(points);
  assert.ok(lum(center) < 6, `阴影是黑的：${center}`);
  assert.ok(lum(left) > 40 && lum(right) > 15, `两侧都在盘上：${left} / ${right}`);
  assert.ok(lum(left) > lum(right) * 1.25, `朝观察者转过来的一边更亮：${left} vs ${right}`);
  if (shots) await p.screenshot({ path: `${shots}/${tag}-default.png` });
  await p.uncheck('#opt-shift');
  [center, left, right] = await probe(points);
  assert.ok(
    Math.abs(lum(left) - lum(right)) < 0.45 * Math.max(lum(left), lum(right)),
    `关掉频移后两边接近：${left} vs ${right}`,
  );
  await p.check('#opt-shift');
  await p.uncheck('#opt-disk');
  [center, left] = await probe(points);
  assert.ok(lum(center) < 6 && lum(left) < 60, `关掉吸积盘只剩星空：${left}`);
  await p.check('#opt-disk');
  // 拖动、滚轮、预设
  const before = await state();
  const box = await p.locator('#hole').boundingBox();
  const cx = box.x + box.width * 0.5,
    cy = box.y + box.height * 0.3;
  if (tag === 'desk') {
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    await p.mouse.move(cx + 160, cy + 40, { steps: 6 });
    await p.mouse.up();
    const dragged = await state();
    assert.ok(Math.abs(dragged.az - before.az) > 0.5 && dragged.incl < before.incl, '拖动改视角');
    await p.mouse.move(cx, cy);
    await p.mouse.wheel(0, 300);
    assert.ok((await state()).r > dragged.r * 1.2, '滚轮拉远');
  }
  await p.click('#view-near');
  assert.equal((await state()).r, 4);
  assert.ok(Number(await p.locator('#shadow-out').innerText()) > 60, '贴近时阴影占了很大一片天');
  if (shots) await p.screenshot({ path: `${shots}/${tag}-near.png` });
  await p.click('#view-top');
  if (shots) await p.screenshot({ path: `${shots}/${tag}-top.png` });
  await p.click('#view-home');
  assert.deepEqual(await state(), { r: 22, incl: before.incl, az: before.az });
  // 二维示意图
  const pick = async (b) => {
    await p.locator('#b').fill(String(b));
    return p.locator('#rays').evaluate((c) => ({ b: c.dataset.b, captured: c.dataset.captured }));
  };
  assert.deepEqual(await pick(2.5), { b: '2.50', captured: 'true' });
  assert.match(await p.locator('#b-result').innerText(), /掉进黑洞/);
  assert.deepEqual(await pick(2.7), { b: '2.70', captured: 'false' });
  assert.deepEqual(await pick(8), { b: '8.00', captured: 'false' });
  assert.match(await p.locator('#b-result').innerText(), /偏折 [\d.]+°[\s\S]*弱场公式/);
  if (shots) {
    await p.locator('#rays').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${shots}/${tag}-rays.png` });
  }
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    '不横向溢出',
  );
  await p.locator('#hole').scrollIntoViewIfNeeded();
  await p.uncheck('#opt-disk');
  for (const r of [1.6, 4, 22, 60]) {
    await setDistance(p, r);
    const d = await diagnostic(p),
      r0 = Math.hypot(...d.cam);
    for (let i = 0; i < grid.length; i++) {
      const n = rayFor(d, grid[i]),
        nr = n.reduce((sum, x, j) => sum + (x * d.cam[j]) / r0, 0);
      const impact = (r0 * Math.sqrt(Math.max(0, 1 - nr * nr))) / Math.sqrt(1 - 1 / r0);
      if (Math.abs(impact - B_CRIT) < 0.002) continue;
      assert.deepEqual(
        d.rgb[i],
        impact < B_CRIT ? statusColor.captured : statusColor.escaped,
        `${tag}: analytic shadow at r=${r}, pixel=${i}`,
      );
    }
    if (r === 60) {
      const sky = await probe(grid);
      assert.ok(
        sky.filter((rgb) => lum(rgb) > 1).length > grid.length * 0.7,
        `${tag}: far sky remains visible`,
      );
      if (shots) await p.screenshot({ path: `${shots}/${tag}-far.png` });
    }
  }
  await p.check('#opt-disk');
  for (const inclination of [18, 80, 86, 90]) {
    await setDistance(p, 22);
    await p.locator('#incl').fill(String(inclination));
    const d = await diagnostic(p);
    for (let i = 0; i < grid.length; i++) {
      const expected = traceObserverRay(d.cam, rayFor(d, grid[i]));
      assert.notEqual(expected.status, 'unresolved', 'CPU orbit resolves');
      assert.deepEqual(
        d.rgb[i],
        statusColor[expected.status],
        `${tag}: CPU/GPU disk crossing incl=${inclination}, pixel=${i}`,
      );
    }
  }
  if (shots) await p.screenshot({ path: `${shots}/${tag}-side.png` });
  assert.deepEqual(errs, [], tag);
  console.log('PASS: ' + tag + ' rendering and physical boundaries');
  await ctx.close();
}

// 无 WebGL2 和初始化失败都不能再调度三维绘制；二维示意图仍可交互。
for (const failure of ['unavailable', 'compile']) {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
  ctx.setDefaultTimeout(15000);
  await ctx.addInitScript((failure) => {
    if (failure === 'unavailable') {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return kind === 'webgl2' ? null : original.call(this, kind, ...args);
      };
    } else {
      WebGL2RenderingContext.prototype.compileShader = function () {
        throw new Error('test shader failure');
      };
    }
  }, failure);
  const p = await ctx.newPage(),
    errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(origin + '/exhibits/schwarzschild/');
  await p.waitForFunction(() => document.documentElement.dataset.ready === 'fallback');
  await p.click('#view-near');
  await setDistance(p, 60);
  await p.setViewportSize({ width: 700, height: 800 });
  await frame(p);
  await p.locator('#b').fill('2.5');
  assert.equal(await p.locator('#rays').getAttribute('data-captured'), 'true');
  assert.ok(await p.locator('#fallback').isVisible());
  assert.deepEqual(errs, [], failure + ' fallback');
  console.log('PASS: ' + failure + ' fallback');
  await ctx.close();
}

// 动画暂停 / 恢复、系统减弱动效、GPU 上下文丢失后交互与恢复。
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  ctx.setDefaultTimeout(15000);
  const p = await ctx.newPage(),
    errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(origin + '/exhibits/schwarzschild/');
  await p.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  const time = () =>
    p.evaluate(() => {
      const gl = document.querySelector('#hole').getContext('webgl2');
      const prog = gl.getParameter(gl.CURRENT_PROGRAM);
      return gl.getUniform(prog, gl.getUniformLocation(prog, 'u_time'));
    });
  await p.click('#opt-motion');
  await frame(p);
  const stopped = await time();
  await frame(p);
  assert.equal(await time(), stopped, 'pause freezes shader time');
  await p.click('#opt-motion');
  await frame(p);
  assert.ok((await time()) > stopped, 'resume advances shader time');
  console.log('PASS: pause and resume');
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await frame(p);
  await p.waitForFunction(() => document.querySelector('#opt-motion').disabled);
  assert.ok(await p.locator('#opt-motion').isDisabled());
  const reduced = await time();
  await frame(p);
  assert.equal(await time(), reduced, 'reduced motion stays still');
  console.log('PASS: reduced motion');
  await p.evaluate(() => {
    window.testLoss = document
      .querySelector('#hole')
      .getContext('webgl2')
      .getExtension('WEBGL_lose_context');
    if (!window.testLoss) throw new Error('context loss test unavailable');
    window.testLoss.loseContext();
  });
  await p.waitForFunction(() => document.documentElement.dataset.ready === 'fallback');
  await p.click('#view-near');
  await p.setViewportSize({ width: 1200, height: 780 });
  await frame(p);
  await p.evaluate(() => window.testLoss.restoreContext());
  await p.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await frame(p);
  assert.ok(await p.locator('#fallback').isHidden());
  assert.equal(await p.locator('#r-out').innerText(), '4.00');
  const d = await diagnostic(p, [[0.5, 0.5]]);
  assert.deepEqual(d.rgb[0], statusColor.captured, 'restored shader renders the current view');
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await p.waitForFunction(() => !document.querySelector('#opt-motion').disabled);
  const resumed = await time();
  await frame(p);
  assert.ok((await time()) > resumed, 'leaving reduced motion resumes animation');
  assert.deepEqual(errs, [], 'motion and context restore');
  await ctx.close();
}
await b.close();
console.log(
  'PASS browser: Schwarzschild — desktop/phone, analytic GPU shadow at 1.6–60 r_s, CPU/GPU disk crossings incl. 90°, far sky, frequency shift, controls, pause/reduced motion, WebGL unavailable/compile failure/context restore, 2D rays and layout.',
);
