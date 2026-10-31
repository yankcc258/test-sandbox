// 冒烟测试（露娜）。先在仓库根目录起静态服务：python3 -m http.server 8811 --bind 127.0.0.1
// 截图写到 .artifacts/（已忽略）。地址可用环境变量 BASE 覆盖。
const BASE = process.env.BASE || 'http://127.0.0.1:8811';
const OUT = require('path').resolve(__dirname, '../../.artifacts');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
const pre = process.argv[2];
const shots = [
  ['d-vocab', { width: 1440, height: 900 }, 1],
  ['d-mid', { width: 1440, height: 900 }, 1.5],
  ['d-quiz', { width: 1440, height: 900 }, 4],
  ['m-vocab', { width: 390, height: 844 }, 1],
];
(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  for (const [name, vp, at] of shots) {
    const page = await browser.newPage({ viewport: vp });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${BASE}/index.html?motion=0`);
    await page.waitForFunction(() => window.zhixuSpine && window.zhixuSpine.ready, null, {
      timeout: 120000,
    });
    await page.waitForTimeout(500);
    await page.evaluate((at) => {
      const sc = window.zhixuSpine.scene;
      sc.settle(at, false);
      sc.advance(14);
    }, at);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${pre}-${name}.png` });
    console.log(pre, name, errs.join('|'));
    await page.close();
  }
  await browser.close();
})();
