// 冒烟测试（露娜）。先在仓库根目录起静态服务：python3 -m http.server 8811 --bind 127.0.0.1
// 截图写到 .artifacts/（已忽略）。地址可用环境变量 BASE 覆盖。
const BASE = process.env.BASE || 'http://127.0.0.1:8811';
const OUT = require('path').resolve(__dirname, '../../.artifacts');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  for (const [tag, vp] of [
    ['d', { width: 1440, height: 900 }],
    ['m', { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport: vp });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (x) => {
      if (['error', 'warning'].includes(x.type())) errs.push(x.text());
    });
    await page.goto(`${BASE}/index.html?motion=0&i=2`);
    await page.waitForFunction(() => window.zhixuSpine && window.zhixuSpine.ready, null, {
      timeout: 120000,
    });
    await page.waitForTimeout(500);
    const r = {};
    // 播放音乐：波形应从直线变成曲线
    const flat = await page.$eval('#dock-wave path', (p) => p.getAttribute('d'));
    await page.click('#dock-wave');
    await page.waitForTimeout(1500);
    const curved = await page.$eval('#dock-wave path', (p) => p.getAttribute('d'));
    r.waveChanged = flat !== curved;
    r.playing = await page.$eval('#dock', (d) => d.classList.contains('playing'));
    await page.click('#dock-next');
    r.track = await page.$eval('#dock-track span', (s) => s.textContent);
    await page.screenshot({
      path: `${OUT}/dock-${tag}-playing.png`,
      clip: {
        x: vp.width - (tag === 'd' ? 520 : 390),
        y: 0,
        width: tag === 'd' ? 520 : 390,
        height: 140,
      },
    });
    // 心率不应因点胶囊而上升
    r.bpm = await page.$eval('#bpm', (b) => b.textContent);
    // ARCHIVE 回到 01
    await page.click('#dock-archive');
    await page.waitForTimeout(400);
    r.afterArchive = await page.$eval('#count', (c) => c.textContent);
    // 关于页
    await page.click('#dock-about');
    await page.waitForTimeout(800);
    r.aboutOpen = await page.$eval('#about', (a) => !a.hidden);
    r.aboutBtn = await page.$eval('#dock-about', (b) => b.textContent.trim());
    await page.screenshot({ path: `${OUT}/dock-${tag}-about.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    r.aboutClosedByEsc = await page.$eval('#about', (a) => a.hidden);
    // 再暂停：波形回到直线
    await page.click('#dock-wave');
    await page.waitForTimeout(1500);
    r.flatAgain = (await page.$eval('#dock-wave path', (p) => p.getAttribute('d')))
      .split('L')
      .every((pt) => Math.abs(+pt.split(',')[1] - 11) < 0.05);
    console.log(tag, JSON.stringify(r), errs.slice(0, 3).join(' | '));
    await page.close();
  }
  await browser.close();
})();
