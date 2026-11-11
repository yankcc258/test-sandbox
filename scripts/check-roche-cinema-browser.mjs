// 洛希极限 · 双星观测的进场和实际播放检查。特蕾莎写的（2026-11-11）；同日猫猫按第五版的画面改过：
// 桌面和 iPad 横竖屏下，进场只有标题和工具条、动画真的在走（不靠检查用的快进）、暂停、仪表抽屉、
// 暂停着换望远镜档位镜头照样转过去、回全景、没有 WebGL 错误、不横向溢出。
import assert from 'node:assert/strict';
import {localPreview} from './roche-browser-utils.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
try {
  for (const [name, width, height, touch] of [
    ['desktop', 1440, 900, false],
    ['ipad-landscape', 1194, 834, true],
    ['ipad-portrait', 834, 1194, true],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
      deviceScaleFactor: touch ? 2 : 1,
    });
    await localPreview(ctx,origin);
    const p = await ctx.newPage(),
      errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await p.goto(origin + '/exhibits/roche/',{waitUntil:'commit'});
    await p.waitForFunction(() => document.documentElement.dataset.ready === 'true',{}, {timeout:120000});
    const state = () => p.evaluate(() => window.zhixuRocheProbe());
    const click = (selector) => (touch ? p.tap(selector) : p.click(selector));
    assert.ok(await p.locator('.console').isHidden());
    assert.ok(await p.locator('.readout').isHidden());
    const before = await state();
    await p.waitForTimeout(2000);
    assert.ok((await state()).time > before.time, 'real animation loop advances');
    await click('#deck-pause');
    const paused = await state();
    await p.waitForTimeout(200);
    assert.equal((await state()).time, paused.time);
    await click('#deck-data');
    assert.equal(await p.locator('#deck-data').getAttribute('aria-expanded'), 'true');
    for (const selector of ['.console', '.readout', '.deck-toolbar']) {
      const r = await p.locator(selector).boundingBox();
      assert.ok(
        r.x >= 0 && r.y >= 0 && r.x + r.width <= width + 1 && r.y + r.height <= height + 1,
        `${name}: ${selector} in viewport`,
      );
    }
    // 暂停着换档：望远镜照样慢慢转过去，时间不走，标题让开
    await click('.deck-toolbar [data-scope="nebula"]');
    await p.waitForFunction(() => window.zhixuRocheProbe().tan < 0.37);
    await p.waitForFunction(
      () => Number(getComputedStyle(document.querySelector('.title')).opacity) < 0.02,
    );
    assert.equal((await state()).time, paused.time, 'lens settles while nebula time remains paused');
    await click('#deck-data');
    assert.ok(await p.locator('.console').isHidden());
    // 仪表收着的时候，转头、回全景和暂停照样能用
    const canvas = p.locator('#view');
    await canvas.focus();
    await p.keyboard.press('ArrowLeft');
    await p.waitForFunction(() => window.zhixuRocheProbe().yaw < 0);
    await p.keyboard.press('Home');
    await p.waitForFunction(() => window.zhixuRocheProbe().scope === 'vista');
    await click('#deck-pause');
    assert.equal((await state()).paused, false);
    const glError = await p.evaluate(() =>
      document.querySelector('#view').getContext('webgl2').getError(),
    );
    assert.equal(glError, 0);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log(`PASS: ${name} cinematic entrance / real playback / drawer / pause / lens / GL`);
  }
} finally {
  await browser.close();
}
