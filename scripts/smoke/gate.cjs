// 真实点击：实验室 → 复习区 → 实验室，跑真实动画循环；检查区域、焦点、输入屏蔽和错误
const { chromium } = require('playwright');
const mode = process.argv[2] || 'd';
const vp = mode === 'm' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const out = require('path').join(__dirname, '../../.artifacts/gate/');
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: vp, hasTouch: mode === 'm' });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://127.0.0.1:8811/?region=lab', { waitUntil: 'load' });
  await p.waitForFunction(
    () => document.getElementById('canvas').dataset.modelReady === 'true',
    null,
    { timeout: 120000 },
  );
  const r = {};
  r.start = await p.evaluate(() => ({
    region: zhixuSpine.gate.region,
    labHidden: document.getElementById('lab').hidden,
    stageInert: document.getElementById('spine').inert,
    focus: document.activeElement?.closest('[data-gateway]')
      ? 'lab-gateway'
      : document.activeElement?.id,
  }));
  // 按键在实验室里不应影响螺旋
  await p.keyboard.press('ArrowDown');
  r.countAfterKey = await p.evaluate(() => document.getElementById('count').textContent);
  const labGate = p.locator('#lab [data-gateway] summary');
  await labGate.click();
  await p.screenshot({ path: `${out}${mode}-live-menu-lab.jpg`, quality: 70 });
  await p.locator('#lab [data-region="review"]').click();
  await p.waitForTimeout(200);
  r.during = await p.evaluate(() => ({
    blocking: zhixuSpine.gate.blocking,
    moving: document.getElementById('lab').classList.contains('moving'),
  }));
  await p.waitForFunction(() => zhixuSpine.gate.region === 'review', null, { timeout: 120000 });
  await p.waitForTimeout(800);
  r.arrived = await p.evaluate(() => ({
    labHidden: document.getElementById('lab').hidden,
    stageInert: document.getElementById('spine').inert,
    focus: document.activeElement?.id,
    hud: getComputedStyle(document.querySelector('.brand')).opacity,
  }));
  await p.evaluate(() => zhixuSpine.scene.run(0.5));
  await p.screenshot({ path: `${out}${mode}-live-review.jpg`, quality: 70 });
  const revGate = p.locator('#spine [data-gateway] summary');
  await revGate.click();
  await p.screenshot({ path: `${out}${mode}-live-menu-review.jpg`, quality: 70 });
  // 进入内容后再回实验室：应先退出内容
  await p.keyboard.press('Escape');
  r.menuClosedByEsc = await p.evaluate(() => !document.querySelector('#spine [data-gateway]').open);
  await p.evaluate(() => zhixuSpine.enter());
  await p.evaluate(() => zhixuSpine.gate.goTo('lab'));
  r.leftContent = await p.evaluate(
    () => !document.getElementById('spine').classList.contains('entered'),
  );
  await p.waitForFunction(() => zhixuSpine.gate.region === 'lab', null, { timeout: 120000 });
  r.back = await p.evaluate(() => ({
    labHidden: document.getElementById('lab').hidden,
    stageInert: document.getElementById('spine').inert,
    sw: document.documentElement.scrollWidth,
  }));
  // 关闭动效：点菜单直接切换，不播过渡
  const q = await b.newPage({ viewport: vp });
  q.on('pageerror', (e) => errs.push(e.message));
  await q.goto('http://127.0.0.1:8811/?region=lab&motion=0', { waitUntil: 'load' });
  await q.locator('#lab [data-gateway] summary').click();
  await q.locator('#lab [data-region="review"]').click();
  r.stillToReview = await q.evaluate(() => [
    zhixuSpine.gate.region,
    document.getElementById('lab').hidden,
  ]);
  await q.locator('#spine [data-gateway] summary').click();
  await q.locator('#spine [data-region="lab"]').click();
  r.stillToLab = await q.evaluate(() => [
    zhixuSpine.gate.region,
    document.getElementById('lab').hidden,
  ]);
  console.log(JSON.stringify({ r, errs }, null, 1));
  await b.close();
})();
