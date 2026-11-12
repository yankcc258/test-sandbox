// 展品 04 · 大螺旋的画面检查：真的在浏览器里走一遍 螺旋 → 学科 → 章节 → 薄片组装 → 课程页。
// 用法（先在仓库根目录起本地预览：python -m http.server 8080 --bind 127.0.0.1）：
//   PLAYWRIGHT_PATH=<playwright 或 playwright-core 的入口> BROWSER_CHANNEL=chrome node scripts/check-spiral-browser.mjs
// 截图写到 SPIRAL_OUTPUT（默认 .artifacts/spiral，不进仓库）。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { localPreview } from './roche-browser-utils.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:8080';
const out = process.env.SPIRAL_OUTPUT || '.artifacts/spiral';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });

async function open(options = {}, query = '') {
  const ctx = await browser.newContext(options);
  await localPreview(ctx, origin);
  const page = await ctx.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(origin + '/exhibits/spiral/' + query, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.body.dataset.ready);
  return { ctx, page, errors };
}
const stage = (p) => p.evaluate(() => document.body.dataset.stage);
// 画布上亮的像素（薄片）占画布的范围：0–1 的包围盒和占比。截图在页面里解码。
async function lit(p) {
  const shot = await p.locator('#lab-canvas').screenshot({ type: 'png' });
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
    let x0 = c.width,
      x1 = -1,
      y0 = c.height,
      y1 = -1,
      n = 0;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (px[i] + px[i + 1] + px[i + 2] < 330) continue;
        n++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    return {
      width: n ? (x1 - x0 + 1) / c.width : 0,
      height: n ? (y1 - y0 + 1) / c.height : 0,
      share: n / (c.width * c.height),
    };
  }, shot.toString('base64'));
}
const groupNames = (p, selector) =>
  p.evaluate((s) => [...document.querySelectorAll(s)].map((n) => n.textContent), selector);

try {
  // ---- 电脑：完整走一遍 ----
  {
    const { ctx, page: p, errors } = await open({ viewport: { width: 1440, height: 900 } });
    assert.equal(await p.evaluate(() => document.body.dataset.ready), 'true', '应使用 WebGL 场景');
    assert.equal(await stage(p), 'overview');
    await p.waitForTimeout(1500);
    // 正式站 v3.0.1 的样子：螺旋大而居中，高度至少占画布的六成；螺旋上不挂文字标签。
    const overview = await lit(p);
    assert.ok(overview.height > 0.6, `总览里螺旋太小：高度占 ${overview.height.toFixed(2)}`);
    assert.ok(overview.share > 0.03, `总览里几乎没有薄片：${overview.share.toFixed(4)}`);
    assert.equal(await p.locator('.model-anchor').isVisible(), false);
    await p.screenshot({ path: path.join(out, 'spiral.jpg'), type: 'jpeg', quality: 88 });

    // 学科 → 聚焦 → 展开成章节目录
    await p.locator('#discipline-list').getByText('数学', { exact: false }).first().click();
    assert.equal(await stage(p), 'focus');
    await p.waitForTimeout(1800);
    await p.screenshot({ path: path.join(out, 'spiral-focus.jpg'), type: 'jpeg', quality: 88 });
    await p.click('#primary-action');
    assert.equal(await stage(p), 'observe');
    // 目录分大类（正式站 v3.2）
    const expected = ['微积分', '线性代数 · 规划中', '其他'];
    assert.deepEqual(await groupNames(p, '#chapter-list .archive-group'), expected);
    assert.deepEqual(await groupNames(p, '.chapter-group'), expected);
    assert.equal(await p.locator('#chapter-list .chapter-entry').count(), 5);
    assert.deepEqual(await groupNames(p, '#archive-track option'), ['全部大类', '微积分', '其他']);
    // 电脑上章节挂在螺旋旁边（.chapter-labels）；按大类筛选时换成右侧的文字列表
    assert.ok(await p.locator('.chapter-labels').isVisible());
    await p.selectOption('#archive-track', { label: '其他' });
    assert.equal(await p.locator('#chapter-list .chapter-entry').count(), 1);
    assert.ok(await p.locator('#chapter-list .chapter-entry').isVisible());
    await p.selectOption('#archive-track', { label: '全部大类' });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: path.join(out, 'spiral-directory.jpg'), type: 'jpeg', quality: 88 });

    // 选一章：薄片沿测量环汇入，组成观察模型（流星组装）
    await p.click('.chapter-labels [data-chapter="math-integral"]');
    await p.waitForFunction(() =>
      document.getElementById('specimen-note').textContent.includes('中点和'),
    );
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(out, 'spiral-assembling.jpg'), type: 'jpeg', quality: 88 });
    await p.waitForTimeout(4500);
    const model = await lit(p);
    assert.ok(model.share > 0.01, `定积分模型没有组装出来：${model.share.toFixed(4)}`);
    await p.screenshot({ path: path.join(out, 'spiral-model.jpg'), type: 'jpeg', quality: 88 });
    // 拖滑杆：读数跟着变
    const before = await p.locator('#specimen-note').textContent();
    await p.locator('#probe-controls input[type="range"]').first().press('ArrowRight');
    await p.waitForFunction(
      (text) => document.getElementById('specimen-note').textContent !== text,
      before,
    );

    // 进课程页：正文、练习都在；作答只留在本页
    await p.locator('#chapter-detail button', { hasText: '开始学习' }).click();
    assert.equal(await stage(p), 'lesson');
    assert.equal(await p.locator('#course-title').textContent(), '定积分：从小片累积到总量');
    assert.match(await p.locator('#course-scope').textContent(), /仅本页有效/);
    assert.ok((await p.locator('#course-toc').locator('a, button').count()) > 5);
    await p.click('[data-course-tab="practice"]');
    assert.equal(await p.locator('#exercise-list form').count(), 5);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(out, 'spiral-course.jpg'), type: 'jpeg', quality: 88 });

    // Esc 两次退回总览（课程页 → 目录 → 总览），螺旋收拢
    for (const expectedStage of ['observe', 'overview']) {
      await p.keyboard.press('Escape');
      await p.waitForFunction((s) => document.body.dataset.stage === s, expectedStage);
    }
    await p.waitForTimeout(4000);
    const back = await lit(p);
    assert.ok(back.height > 0.6, `收拢后螺旋没回到原来的大小：${back.height.toFixed(2)}`);
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log('PASS: desktop / big spiral / groups / assembly / probe / course page / collapse');
  }

  // ---- iPad 竖屏，触摸 ----
  {
    const { ctx, page: p, errors } = await open({
      viewport: { width: 834, height: 1194 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await p.waitForTimeout(1500);
    assert.ok((await lit(p)).share > 0.02);
    await p.tap('#skip-study');
    assert.equal(await stage(p), 'observe');
    assert.ok((await p.locator('#chapter-list .chapter-entry').count()) > 0);
    assert.ok(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      '竖屏不应出现横向滚动',
    );
    await p.waitForTimeout(3500); // 等螺旋松开成测量环上的薄片再截图
    await p.screenshot({ path: path.join(out, 'spiral-ipad.jpg'), type: 'jpeg', quality: 88 });
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log('PASS: ipad-portrait / touch / directory');
  }

  // ---- 关闭动效、没有 WebGL：文字目录照常可用 ----
  {
    const { ctx, page: p, errors } = await open(
      { viewport: { width: 1194, height: 834 }, reducedMotion: 'reduce' },
      '?chapter=math-partials',
    );
    assert.equal(await stage(p), 'observe');
    assert.ok(await p.evaluate(() => document.body.classList.contains('motion-off')));
    assert.match(await p.locator('#specimen-note').textContent(), /\S/);
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log('PASS: reduced motion / direct chapter link');
  }
  {
    const { ctx, page: p } = await open({ viewport: { width: 1194, height: 834 } }, '?view=fallback');
    assert.equal(await p.evaluate(() => document.body.dataset.ready), 'fallback');
    assert.ok(await p.locator('#fallback').isVisible());
    await p.click('#skip-study');
    assert.ok((await p.locator('#chapter-list .chapter-entry').count()) > 0);
    await ctx.close();
    console.log('PASS: fallback / text directory');
  }
} finally {
  await browser.close();
}
