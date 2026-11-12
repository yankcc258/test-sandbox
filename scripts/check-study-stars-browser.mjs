// 理解星图样稿的画面检查：真的在浏览器里用鼠标走一遍。
// 用法（先在仓库根目录起本地预览：python -m http.server 8080 --bind 127.0.0.1）：
//   PLAYWRIGHT_PATH=<playwright 或 playwright-core 的入口> BROWSER_CHANNEL=chrome node scripts/check-study-stars-browser.mjs
// 截图写到 STARS_OUTPUT（默认 .artifacts/study-stars，不进仓库）。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { localPreview } from './roche-browser-utils.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:8080';
const out = process.env.STARS_OUTPUT || '.artifacts/study-stars';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });

async function open(options, query = '') {
  const ctx = await browser.newContext(options);
  await localPreview(ctx, origin);
  const page = await ctx.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(origin + '/preview/study-stars/' + query, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.body.dataset.ready);
  return { ctx, page, errors };
}
// 一颗星在屏幕上的位置
const at = (p, title) =>
  p.evaluate((t) => {
    const z = window.zhixuStars,
      s = z.scene.stars.find((x) => x.title === t),
      pos = z.scene.pos.get(s.id);
    return z.renderer.project(z.cam, pos.x, pos.y);
  }, title);
// 接下来一段时间里重画了几帧
const frames = (p, ms) =>
  p.evaluate(async (wait) => {
    const r = window.zhixuStars.renderer,
      draw = r.draw;
    let n = 0;
    r.draw = (...a) => (n++, draw(...a));
    await new Promise((done) => setTimeout(done, wait));
    r.draw = draw;
    return n;
  }, ms);
// 所有的星都在画面里
const allInView = (p) =>
  p.evaluate(() => {
    const z = window.zhixuStars;
    return z.scene.stars.every((s) => {
      const pos = z.scene.pos.get(s.id),
        [x, y] = z.renderer.project(z.cam, pos.x, pos.y);
      return x > 0 && y > 0 && x < innerWidth && y < innerHeight;
    });
  });
// 画布上亮的像素占多少（确认真的画出了东西）
async function lit(p) {
  const shot = await p.locator('#sky').screenshot({ type: 'png' });
  return p.evaluate(async (data) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + data;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const g = c.getContext('2d');
    g.drawImage(image, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 150) n++;
    return n / (c.width * c.height);
  }, shot.toString('base64'));
}

try {
  // ---- 电脑：从没有星走到点开一颗星 ----
  {
    const {
      ctx,
      page: p,
      errors,
    } = await open({ viewport: { width: 1440, height: 900 } }, '?stage=empty');
    // 一开始：只有板块，没有星
    assert.equal(await p.textContent('#count'), '还没有星');
    assert.ok(await p.locator('#empty-hint').isVisible());
    const emptyLit = await lit(p);
    await p.screenshot({ path: path.join(out, 'empty.jpg'), type: 'jpeg', quality: 88 });
    // 平时不动：放着一秒，不重画
    await p.waitForTimeout(600);
    assert.equal(await frames(p, 1000), 0, '没有操作时不应该重画');

    // 聊了十天：有星了，星云亮起来
    await p.click('[data-stage="days"]');
    assert.equal(await p.textContent('#count'), '5 颗星 · 4 条连线');
    assert.ok(!(await p.locator('#empty-hint').isVisible()));
    assert.ok((await lit(p)) > emptyLit * 1.5, '有星以后画面应该比只有板块时亮');
    assert.ok(await allInView(p));

    // 长一颗星：动画播一次就停，镜头退到能看到所有的星
    await p.click('[data-grow]');
    assert.ok(await p.evaluate(() => !!window.zhixuStars.scene.grow));
    await p.waitForFunction(() => !window.zhixuStars.scene.grow && !document.hidden);
    await p.waitForTimeout(700);
    assert.equal(await p.textContent('#count'), '6 颗星 · 4 条连线');
    assert.ok(await allInView(p));
    assert.equal(await frames(p, 800), 0, '动画播完就停');

    // 点一颗星：打开星的页面
    await p.mouse.click(...(await at(p, '导数')));
    await p.waitForTimeout(700);
    assert.equal(await p.textContent('#star-panel h2'), '导数');
    assert.equal(await p.locator('#star-panel .take').count(), 2);
    assert.equal(await p.locator('#star-panel .compare .diff').count(), 3);
    assert.ok(await p.locator('#star-panel math').isVisible());
    assert.equal(await p.locator('#star-panel .links li').count(), 4);
    await p.screenshot({ path: path.join(out, 'star.jpg'), type: 'jpeg', quality: 88 });
    // 从星的页面点到连着的星
    await p.click('#star-panel .links button >> nth=0');
    await p.waitForTimeout(700);
    assert.equal(await p.textContent('#star-panel h2'), '切线与割线');

    // 拖动、滚轮缩放
    const before = await p.evaluate(() => ({ ...window.zhixuStars.cam }));
    await p.mouse.move(300, 520);
    await p.mouse.down();
    await p.mouse.move(420, 580, { steps: 5 });
    await p.mouse.up();
    const after = await p.evaluate(() => ({ ...window.zhixuStars.cam }));
    assert.ok(Math.abs((before.x - after.x) * after.k - 120) < 8, '拖多少，画面跟多少');
    assert.ok(await p.evaluate(() => !!window.zhixuStars.scene.selected), '拖动不应该取消选中');
    await p.mouse.wheel(0, -400);
    assert.ok((await p.evaluate(() => window.zhixuStars.cam.k)) > after.k);
    // Esc 关上
    await p.keyboard.press('Escape');
    assert.ok(await p.locator('#star-panel').isHidden());

    // 列表：画面之外也能点开星的页面
    await p.click('#toggle-list');
    assert.equal(await p.locator('#star-list [data-star]').count(), 6);
    await p.locator('#star-list [data-star]', { hasText: '极限' }).click();
    assert.equal(await p.textContent('#star-panel h2'), '极限');
    await p.keyboard.press('Escape');

    // 学一个新东西：已经有的直接打开；没有的开一颗新的
    await p.fill('#new-title', '求导');
    await p.click('#new-star button');
    assert.equal(await p.textContent('#star-panel h2'), '导数', '别名对得上就打开那一颗');
    await p.keyboard.press('Escape');
    await p.fill('#new-title', '定积分');
    await p.click('#new-star button');
    await p.waitForFunction(() => !window.zhixuStars.scene.grow);
    assert.equal(await p.textContent('#count'), '7 颗星 · 4 条连线');

    // 几个月以后
    await p.click('[data-stage="grown"]');
    assert.equal(await p.textContent('#count'), '36 颗星 · 32 条连线');
    assert.ok(await allInView(p));
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(out, 'grown.jpg'), type: 'jpeg', quality: 88 });
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log(
      'PASS: desktop / idle stillness / growth / star page / drag / zoom / list / new star',
    );
  }

  // ---- iPad 竖屏，触摸：星的页面从下面出来 ----
  {
    const {
      ctx,
      page: p,
      errors,
    } = await open(
      {
        viewport: { width: 834, height: 1194 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
      '?stage=grown',
    );
    assert.ok(await allInView(p));
    await p.touchscreen.tap(...(await at(p, '导数')));
    await p.waitForTimeout(700);
    assert.equal(await p.textContent('#star-panel h2'), '导数');
    const box = await p.locator('#star-panel').boundingBox();
    assert.ok(box.y > 400 && box.width > 800, '窄屏上星的页面在下面');
    assert.ok(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      '不应该出现横向滚动',
    );
    await p.screenshot({ path: path.join(out, 'ipad-star.jpg'), type: 'jpeg', quality: 88 });
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log('PASS: ipad-portrait / touch / bottom sheet');
  }

  // ---- 关闭动效：长星、点星都直接到位 ----
  {
    const {
      ctx,
      page: p,
      errors,
    } = await open(
      { viewport: { width: 1194, height: 834 }, reducedMotion: 'reduce' },
      '?stage=days&open=导数',
    );
    assert.equal(await p.textContent('#star-panel h2'), '导数');
    await p.keyboard.press('Escape');
    await p.click('[data-grow]');
    assert.equal(await p.evaluate(() => window.zhixuStars.scene.grow), null);
    assert.equal(await frames(p, 500), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log('PASS: reduced motion / direct star link');
  }
} finally {
  await browser.close();
}
