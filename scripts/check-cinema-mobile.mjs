import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
try {
  for (const [width, height] of [
    [320, 520],
    [320, 568],
    [360, 640],
    [390, 844],
    [568, 320],
    [844, 390],
    [768, 1024],
    [1024, 768],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(origin + '/exhibits/schwarzschild/?motion=0');
    await p.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    // Synthetic safe-area values validate reserved space; this is not a real iOS browser test.
    if (width === 844 || width === 390)
      await p.locator('.stage').evaluate((el, landscape) => {
        for (const [side, value] of Object.entries(
          landscape
            ? { left: 44, right: 44, top: 0, bottom: 21 }
            : { left: 0, right: 0, top: 47, bottom: 34 },
        ))
          el.style.setProperty(`--safe-${side}`, `${value}px`);
      }, width === 844);
    const box = (selector) => p.locator(selector).boundingBox();
    const inside = async (selectors) => {
      for (const s of selectors) {
        const r = await box(s);
        assert.ok(
          r && r.x >= -1 && r.y >= -1 && r.x + r.width <= width + 1 && r.y + r.height <= height + 1,
          `${width}×${height}: ${s} stays in viewport: ${JSON.stringify(r)}`,
        );
      }
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.equal(await p.evaluate(() => scrollY), 0, 'controls do not scroll the scene away');
    };
    const separated = async (a, b) => {
      const x = await box(a),
        y = await box(b);
      assert.ok(x.y + x.height <= y.y + 1, `${width}×${height}: ${a} overlaps ${b}`);
    };
    await inside([
      '.film-brand',
      '.film-intro-copy',
      '#film-start',
      '#film-observe',
      '.film-intro-foot',
    ]);
    await separated('.film-intro-copy', '.film-intro-foot');
    await p.tap('#film-start');
    await inside(['.film-top', '.film-transport']);
    for (const s of ['#film-sound', '#film-exit', '#film-play', '#film-data', '#film-progress']) {
      const r = await box(s);
      assert.ok(r.width >= 44 && r.height >= 44, `${s} touch target`);
    }
    assert.ok(await p.locator('.gesture-touch').isVisible());
    assert.ok(await p.locator('.gesture-keyboard').isHidden());
    await p.locator('#film-progress').fill('0.035');
    await inside(['.film-chapter-card']);
    await separated('.film-top', '.film-chapter-card');
    await separated('.film-chapter-card', '.film-transport');
    await p.tap('#film-data');
    await inside(['.panel']);
    await separated('.film-top', '.panel');
    await separated('.panel', '.film-transport');
    await p.locator('.panel').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    assert.ok(await p.locator('#flight-exit').isVisible());
    await p.tap('#film-data');
    await p.locator('#film-progress').fill('1');
    await inside(['#film-end', '#film-replay']);
    await separated('#film-end', '.film-transport');
    await p.tap('#film-replay');
    await p.locator('#film-progress').fill('0.3');
    // Real browser touch dispatch exercises pointer capture, cancellation and pinch handling.
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, points) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map(([x, y, id]) => ({ x, y, id })),
      });
    const camera = () =>
      p.evaluate(() => {
        window.zhixuBlackHoleProbe([[0.5, 0.5]]);
        const gl = document.querySelector('#hole').getContext('webgl2'),
          program = gl.getParameter(gl.CURRENT_PROGRAM);
        return Object.fromEntries(
          ['u_fwd', 'u_tan'].map((n) => [
            n,
            Array.from(gl.getUniform(program, gl.getUniformLocation(program, n))),
          ]),
        );
      });
    const before = await camera();
    const x = width / 2,
      y = height / 2;
    await touch('touchStart', [[x, y, 1]]);
    await touch('touchMove', [[x + 35, y - 15, 1]]);
    await touch('touchEnd', []);
    assert.notDeepEqual((await camera()).u_fwd, before.u_fwd, 'one finger turns camera');
    const turned = await camera();
    await touch('touchStart', [
      [x - 30, y, 1],
      [x + 30, y, 2],
    ]);
    await touch('touchMove', [
      [x - 60, y, 1],
      [x + 60, y, 2],
    ]);
    await touch('touchCancel', []);
    assert.ok((await camera()).u_tan[0] < turned.u_tan[0], 'spread fingers narrows field of view');
    assert.ok(!((await p.locator('#hole').getAttribute('class')) || '').includes('dragging'));
    const afterPinch = await camera();
    await touch('touchStart', [[x, y, 1]]);
    await touch('touchMove', [[x - 30, y, 1]]);
    await touch('touchEnd', []);
    assert.notDeepEqual(
      (await camera()).u_fwd,
      afterPinch.u_fwd,
      'new drag works after cancelled pinch',
    );
    assert.equal(await p.evaluate(() => scrollY), 0);
    await p.setViewportSize({ width: height, height: width });
    await p.waitForFunction(() => document.querySelector('#hole').width > 0);
    assert.equal(
      await p.locator('#film-progress').inputValue(),
      '0.3',
      'rotation preserves progress',
    );
    assert.equal(
      await p.evaluate(() => {
        window.zhixuBlackHoleProbe([[0.5, 0.5]]);
        return document.querySelector('#hole').getContext('webgl2').getError();
      }),
      0,
    );
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log(
      `PASS: mobile ${width}×${height}, opening/controls/drawer/end, touch drag/pinch/cancel and rotation`,
    );
  }
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const p = await ctx.newPage();
  await p.goto(origin + '/exhibits/schwarzschild/');
  await p.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await p.tap('#film-start');
  await p.waitForFunction(() => document.querySelector('#film-ui').classList.contains('is-quiet'));
  const play = await p.locator('#film-play').boundingBox();
  await p.touchscreen.tap(play.x + play.width / 2, play.y + play.height / 2);
  await p.waitForFunction(() => !document.querySelector('#film-ui').classList.contains('is-quiet'));
  assert.equal(
    await p.locator('#hole').getAttribute('data-flying'),
    'true',
    'first tap reveals hidden controls without accidentally pausing',
  );
  await p.tap('#film-play');
  assert.equal(await p.locator('#hole').getAttribute('data-flying'), 'false');
  await ctx.close();
  console.log('PASS: touch wakes hidden controls; second tap activates pause');
} finally {
  await browser.close();
}
