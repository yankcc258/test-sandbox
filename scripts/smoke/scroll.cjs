// 冒烟测试（露娜）。先在仓库根目录起静态服务：python3 -m http.server 8811 --bind 127.0.0.1
// 截图写到 .artifacts/（已忽略）。地址可用环境变量 BASE 覆盖。
const BASE = process.env.BASE || 'http://127.0.0.1:8811';
const OUT = require('path').resolve(__dirname, '../../.artifacts');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/index.html?motion=0`);
  await page.waitForFunction(() => window.zhixuSpine && window.zhixuSpine.ready, null, {
    timeout: 120000,
  });
  const run = (t) => page.evaluate((t) => window.zhixuSpine.scene.run(t), t);
  await run(0.1); // 切到「动效开」的规则
  const log = [];
  await page.mouse.move(720, 450);
  // 1. 慢滚：一小格（40px）只移动一小段
  await page.mouse.wheel(0, 40);
  log.push(['slow 40px, 0.1s', await run(0.1)]);
  // 2. 停手后吸附回 0
  log.push(['idle 1.5s', await run(1.5)]);
  // 3. 快滚：连续 6 格 × 120px，期间不停顿
  for (let k = 0; k < 6; k++) {
    await page.mouse.wheel(0, 120);
    await run(0.05);
  }
  log.push(['fast 720px', await run(0.1)]);
  log.push(['settle', await run(2)]);
  // 4. 拖动到一半再反向
  await page.mouse.move(720, 600);
  await page.mouse.down();
  for (let y = 600; y >= 420; y -= 30) {
    await page.mouse.move(720, y);
    await run(0.03);
  }
  log.push(['drag up 180px', await run(0.05)]);
  for (let y = 420; y <= 620; y += 40) {
    await page.mouse.move(720, y);
    await run(0.03);
  }
  log.push(['reverse 200px', await run(0.05)]);
  await page.mouse.up();
  log.push(['release+settle', await run(2.5)]);
  // 5. 列表准确跳转、方向键
  await page.evaluate(() => document.querySelectorAll('#list button')[5].click());
  log.push(['list → 06', await run(3)]);
  await page.keyboard.press('ArrowUp');
  log.push(['ArrowUp', await run(3)]);
  console.log(log.map(([k, v]) => `${k}: s=${v.s} target=${v.target}`).join('\n'), '\nerrs', errs);
  await browser.close();
})();
