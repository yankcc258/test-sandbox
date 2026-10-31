// 冒烟测试（露娜）。先在仓库根目录起静态服务：python3 -m http.server 8811 --bind 127.0.0.1
// 截图写到 .artifacts/（已忽略）。地址可用环境变量 BASE 覆盖。
const BASE = process.env.BASE || 'http://127.0.0.1:8811';
const OUT = require('path').resolve(__dirname, '../../.artifacts');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
const vp = process.argv[2] === 'm' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const tag = process.argv[2] === 'm' ? 'm' : 'd';
(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  page.on('console', (x) => {
    if (['error', 'warning'].includes(x.type())) errs.push(x.text());
  });
  await page.goto(`${BASE}/index.html?motion=0&i=1`);
  await page.waitForFunction(() => window.zhixuSpine && window.zhixuSpine.ready, null, {
    timeout: 120000,
  });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const shot = (n) => page.screenshot({ path: `${OUT}/flow-${tag}-${n}.png` });
  await shot('front');
  // 溢出检查：所有按钮都在内容面板里、在视口里
  const box = () =>
    page.evaluate(() => {
      const c = document.getElementById('content').getBoundingClientRect();
      const bad = [...document.querySelectorAll('#content button')]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return (
            r.left < c.left - 1 || r.right > c.right + 1 || r.left < 0 || r.right > innerWidth + 1
          );
        })
        .map((b) => b.textContent.trim().slice(0, 12));
      return {
        panel: [Math.round(c.left), Math.round(c.top), Math.round(c.width), Math.round(c.height)],
        bad,
        scrollW: document.documentElement.scrollWidth,
      };
    });
  const r1 = await box();
  await page.keyboard.press(' ');
  await page.waitForTimeout(400);
  await shot('back');
  const r2 = await box();
  // 心率：内容区连点 12 次不应变化
  for (let k = 0; k < 12; k++) await page.mouse.click(vp.width / 2, 40);
  const bpm = await page.evaluate(() => document.getElementById('bpm').textContent);
  // 评分整组：1 次忘了、1 次模糊，其余记得
  const keys = ['1', '2'];
  let guard = 0;
  while (guard++ < 30) {
    const done = await page.evaluate(() => !!document.querySelector('.vs-done'));
    if (done) break;
    const flipped = await page.evaluate(() => !!document.querySelector('.vs-grade'));
    if (!flipped) await page.keyboard.press(' ');
    else await page.keyboard.press(keys.shift() || '3');
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
  await shot('done');
  const summary = await page.evaluate(() => [
    document.querySelector('.vs-tally')?.innerText.replace(/\n/g, ' '),
    document.getElementById('c-meta').textContent,
  ]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => [
    document.getElementById('content').hidden,
    window.zhixuSpine && document.querySelector('#list button[aria-current]')?.textContent,
  ]);
  await shot('after');
  console.log(JSON.stringify({ r1, r2, bpm, guard, summary, after, errs }));
  await browser.close();
})();
