import assert from 'node:assert/strict';
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
    const p = await ctx.newPage(),
      errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await p.goto(origin + '/exhibits/roche/');
    await p.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    const state = () => p.evaluate(() => window.zhixuRocheBinaryProbe());
    const click = (selector) => (touch ? p.tap(selector) : p.click(selector));
    assert.ok(await p.locator('.console').isHidden());
    assert.ok(await p.locator('.readout').isHidden());
    assert.equal(await p.locator('#opt-lobes').isChecked(), false);
    assert.equal(await p.locator('#opt-marks').isChecked(), false);
    const before = await state();
    await p.waitForTimeout(2000);
    assert.ok((await state()).theta > before.theta, 'real animation loop advances');
    await click('#deck-pause');
    const paused = await state();
    await p.waitForTimeout(200);
    assert.equal((await state()).theta, paused.theta);
    await click('#deck-data');
    assert.equal(await p.locator('#deck-data').getAttribute('aria-expanded'), 'true');
    for (const selector of ['.console', '.readout', '.deck-toolbar']) {
      const r = await p.locator(selector).boundingBox();
      assert.ok(
        r.x >= 0 && r.y >= 0 && r.x + r.width <= width + 1 && r.y + r.height <= height + 1,
        `${name}: ${selector} in viewport`,
      );
    }
    await click('.console [data-scope="bridge"]');
    await p.waitForFunction(() => window.zhixuRocheBinaryProbe().fov < 0.05);
    await p.waitForFunction(
      () => Number(getComputedStyle(document.querySelector('.title')).opacity) < 0.02,
    );
    assert.equal((await state()).theta, paused.theta, 'lens settles while physics remains paused');
    await p.locator('#opt-lobes').check();
    await p.waitForFunction(
      () => document.querySelector('#lobe-line').getAttribute('d').length > 10,
    );
    await click('#deck-data');
    assert.ok(await p.locator('.console').isHidden());
    // Orbit, zoom and pause remain available without the instrument drawer.
    const canvas = p.locator('#view');
    await canvas.focus();
    await p.keyboard.press('Home');
    await p.waitForFunction(() => window.zhixuRocheBinaryProbe().scope === 'wide');
    await click('#deck-pause');
    assert.equal((await state()).paused, false);
    const glError = await p.evaluate(() =>
      document.querySelector('#view').getContext('webgl2').getError(),
    );
    assert.equal(glError, 0);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log(
      `PASS: ${name} cinematic entrance / real playback / drawer / pause / lens / labels / GL`,
    );
  }
} finally {
  await browser.close();
}
