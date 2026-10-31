// 冒烟测试（露娜）。先在仓库根目录起静态服务：python3 -m http.server 8811 --bind 127.0.0.1
// 截图写到 .artifacts/（已忽略）。地址可用环境变量 BASE 覆盖。
const BASE = process.env.BASE || 'http://127.0.0.1:8811';
const OUT = require('path').resolve(__dirname, '../../.artifacts');
require('fs').mkdirSync(OUT, { recursive: true });
const { chromium } = require('playwright');
async function check(browser, label, vp, init) {
  const page = await browser.newPage({
    viewport: vp,
    hasTouch: vp.width < 760,
    isMobile: vp.width < 760,
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  if (init) await page.addInitScript(init);
  await page.goto(`${BASE}/index.html?motion=0`);
  await page.waitForFunction(() => window.zhixuSpine, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  // 按真实坐标点击，看最上层元素是不是按钮本身
  const tapAt = async (sel) => {
    const b = await page.$eval(sel, (el) => {
      const r = el.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    });
    const top = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.id || el.className || el.tagName : null;
    }, b);
    if (vp.width < 760) await page.touchscreen.tap(b[0], b[1]);
    else await page.mouse.click(b[0], b[1]);
    await page.waitForTimeout(500);
    return top;
  };
  const r = {};
  r.waveTop = await tapAt('#dock-wave');
  r.playing = await page.$eval('#dock', (d) => d.classList.contains('playing'));
  r.nextTop = await tapAt('#dock-next');
  r.track = await page.$eval('#dock-track span', (s) => s.textContent);
  r.aboutTop = await tapAt('#dock-about');
  r.aboutOpen = await page.$eval('#about', (a) => !a.hidden);
  await tapAt('#dock-about');
  r.listTop = await tapAt('#list li:nth-child(4) button');
  r.count = await page.$eval('#count', (c) => c.textContent);
  r.archiveTop = await tapAt('#dock-archive');
  r.countAfterArchive = await page.$eval('#count', (c) => c.textContent);
  r.bootError = await page.$eval('#boot-error', (e) => (e.hidden ? '' : e.textContent));
  console.log(label, JSON.stringify(r), errs.slice(0, 2).join(' | '));
  await page.close();
}
(async () => {
  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  await check(browser, 'desktop', { width: 1440, height: 900 });
  await check(browser, 'phone', { width: 390, height: 844 });
  // 模拟立体场景初始化时出错
  await check(browser, 'scene-crash', { width: 1440, height: 900 }, () => {
    window.ResizeObserver = function () {
      throw new Error('模拟：场景初始化失败');
    };
  });
  await browser.close();
})();
