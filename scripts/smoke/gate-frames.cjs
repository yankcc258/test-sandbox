// 竖井过渡逐帧：node scripts/smoke/gate-frames.cjs d|m down|up（用 gate.pose 停在固定时刻截图）
const { chromium } = require('playwright');
const [mode = 'd', which = 'down'] = process.argv.slice(2);
const vp = mode === 'm' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const out = require('path').join(__dirname, '../../.artifacts/gate/');
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: vp });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://127.0.0.1:8811/?region=lab', { waitUntil: 'load' });
  await p.waitForFunction(
    () => document.getElementById('canvas').dataset.modelReady === 'true',
    null,
    { timeout: 120000 },
  );
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}${mode}-lab.jpg`, quality: 70 });
  const ts =
    which === 'down'
      ? [0.25, 0.55, 0.85, 1.2, 1.6, 2.0, 2.4, 2.8]
      : [0.3, 0.8, 1.3, 1.6, 1.9, 2.2, 2.45];
  if (which === 'up') {
    await p.evaluate(() => zhixuSpine.gate.settle('review'));
    await p.evaluate(() => zhixuSpine.scene.settle(2));
  }
  for (const t of ts) {
    await p.evaluate(([w, t]) => zhixuSpine.gate.pose(w, t), [which, t]);
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${out}${mode}-${which}-${t.toFixed(2)}.jpg`, quality: 70 });
  }
  console.log(JSON.stringify(errs));
  await b.close();
})();
