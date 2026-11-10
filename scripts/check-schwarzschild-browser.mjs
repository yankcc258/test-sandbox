// 史瓦西黑洞展品的浏览器检查（露娜）。不在 npm run check 里（要浏览器）：
//   python -m http.server 8080 --bind 127.0.0.1   （另一个终端，在仓库根目录）
//   PLAYWRIGHT_PATH=…/playwright/index.mjs node scripts/check-schwarzschild-browser.mjs
// 检查：着色器能编译、画面就绪；中间的阴影是黑的；盘朝观察者转过来的一边比另一边亮，关掉频移后两边差不多；
// 关掉吸积盘后盘的位置只剩星空；拖动改视角、滚轮改距离、预设按钮；二维示意图：小于临界瞄准距离的光线掉进去；
// 手机宽度不横向溢出。加 SHOTS=目录 会顺便存截图。
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:8080';
const shots = process.env.SHOTS;
const b = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const lum = ([r, g, bl]) => 0.2126 * r + 0.7152 * g + 0.0722 * bl;
for (const [tag, opts] of [
  ['desk', { viewport: { width: 1280, height: 800 } }],
  ['phone', devices['iPhone 13']],
]) {
  const ctx = await b.newContext(opts);
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
  assert.deepEqual(errs, [], tag);
  await ctx.close();
}
await b.close();
console.log(
  'PASS browser: Schwarzschild exhibit — shader compiles, black shadow, approaching side brighter (and not when shift is off), disk toggle, drag / wheel / presets, 2D rays captured below the critical impact parameter; desktop and phone.',
);
