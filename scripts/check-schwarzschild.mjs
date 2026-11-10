// 史瓦西黑洞展品的物理检查（露娜）：不看画面，只核对光线方程给出的数。
// 画面那一半（着色器编译、阴影是黑的、盘一边亮一边暗、拖动和缩放）在 scripts/check-schwarzschild-browser.mjs，需要浏览器。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  RS,
  PHOTON_SPHERE,
  ISCO,
  B_CRIT,
  step,
  stepSize,
  traceRay,
  weakDeflection,
  radialStretch,
  impactParameter,
  shadowAngle,
  diskShift,
} from '../exhibits/schwarzschild/geodesic.js';

const close = (a, b, rel, what) =>
  assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: ${a} vs ${b}`);

// 1) 常数：光子球 1.5 r_s、最内稳定圆轨道 3 r_s、临界瞄准距离 (3√3/2) r_s
assert.deepEqual([RS, PHOTON_SPHERE, ISCO], [1, 1.5, 3]);
close(B_CRIT, 2.598076, 1e-6, 'critical impact parameter');

// 2) 弱场：离得远的光线，偏折角和教科书的 2 r_s/b（加二阶项）一致。起点放远一点，不然入射段的偏折没算进去
for (const b of [40, 80, 200]) {
  const r = traceRay(b, { start: 6000, far: 6000 });
  assert.equal(r.captured, false);
  close(r.deflection, weakDeflection(b), 4e-3, `weak-field deflection at b=${b}`);
}
// 太阳边缘掠过的光：b = 太阳半径 / 太阳的史瓦西半径 ≈ 235,700 r_s，偏折 ≈ 1.75 角秒（1919 年日食量的就是它）
close((weakDeflection(6.957e8 / 2953.25) * 180 * 3600) / Math.PI, 1.75, 5e-3, 'solar limb, arcsec');

// 3) 临界瞄准距离：比它小一点掉进去，大一点飞走；越接近临界，绕得越多
assert.equal(traceRay(B_CRIT - 0.01).captured, true);
assert.equal(traceRay(B_CRIT + 0.01).captured, false);
assert.equal(traceRay(1).captured, true);
const turns = [B_CRIT + 0.5, B_CRIT + 0.05, B_CRIT + 0.005].map((b) => traceRay(b).deflection);
assert.ok(turns[0] < turns[1] && turns[1] < turns[2], 'deflection grows toward the critical value');
assert.ok(
  turns[2] > Math.PI * 1.5,
  'just outside the critical value the ray goes most of the way round',
);
// 上下对称
close(traceRay(-5).deflection, traceRay(5).deflection, 1e-9, 'mirror symmetry');

// 4) 光子球：在 r = 1.5 r_s 沿切向出发的光一直绕圈（不稳定，所以只要求绕一圈内半径基本不变）
{
  const p = [PHOTON_SPHERE, 0, 0],
    v = [0, 1, 0],
    h2 = PHOTON_SPHERE ** 2;
  let angle = 0,
    worst = 0;
  while (angle < 2 * Math.PI) {
    const before = Math.atan2(p[1], p[0]);
    step(p, v, h2, 0.002);
    let d = Math.atan2(p[1], p[0]) - before;
    if (d < -Math.PI) d += 2 * Math.PI;
    angle += d;
    worst = Math.max(worst, Math.abs(Math.hypot(p[0], p[1]) - PHOTON_SPHERE));
  }
  assert.ok(worst < 2e-3, 'photon sphere orbit stays at 1.5 r_s for a full turn: ' + worst);
}
// 角动量守恒（积分器没有把轨道平面和 h 弄丢）
{
  const p = [-30, 4, 1],
    v = [1, 0.02, -0.01],
    L0 = [p[1] * v[2] - p[2] * v[1], p[2] * v[0] - p[0] * v[2], p[0] * v[1] - p[1] * v[0]],
    h2 = L0.reduce((s, x) => s + x * x, 0);
  for (let i = 0; i < 3000; i++) step(p, v, h2, stepSize(Math.hypot(...p), 0.5));
  const L1 = [p[1] * v[2] - p[2] * v[1], p[2] * v[0] - p[0] * v[2], p[0] * v[1] - p[1] * v[0]];
  L0.forEach((x, i) => close(L1[i] + 10, x + 10, 1e-6, 'angular momentum component ' + i));
}

// 5) 静止观察者：远处看阴影的角半径 ≈ b_c / r；正好在光子球上时阴影占半边天
close(shadowAngle(1000), B_CRIT / 1000, 1e-3, 'shadow far away');
close(shadowAngle(PHOTON_SPHERE), Math.PI / 2, 1e-6, 'shadow at the photon sphere');
close(
  impactParameter(20, Math.sin(shadowAngle(20))),
  B_CRIT,
  1e-9,
  'shadow edge is the critical ray',
);
close(radialStretch(2), Math.SQRT1_2, 1e-12, 'radial stretch at 2 r_s');

// 6) 吸积盘的频移：正对着看（L_z = 0）只有引力红移和横向多普勒，ISCO 上是 1/√2；
//    朝观察者转过来的一边变蓝变亮，远离的一边变红变暗
close(diskShift(ISCO, 0), Math.SQRT1_2, 1e-12, 'face-on shift at the ISCO');
assert.ok(diskShift(6, 5) > 1 && diskShift(6, -5) < diskShift(6, 0));
assert.ok(diskShift(100, 0) > 0.99, 'far out the shift vanishes');

// 7) 着色器和这里用的是同一个方程、同一条步长规则、同样的频移公式（两边各写了一遍，别改了一边忘了另一边）
const glsl = await readFile(
  new URL('../exhibits/schwarzschild/shader.js', import.meta.url),
  'utf8',
);
for (const [what, piece] of [
  ['geodesic acceleration', '-1.5 * h2 * x / pow(r, 5.0)'],
  ['step rule', 'clamp(0.1 * (r - 0.6), 0.012, 0.6)'],
  ['static observer', 'sqrt(1.0 - 1.0 / r0)'],
  ['Kepler angular velocity', 'sqrt(0.5 / (r * r * r))'],
  ['disk shift', 'sqrt(1.0 - 1.5 / r) / (1.0 - omega * lz) / obs'],
  ['brightness ∝ g⁴', 'pow(g, 4.0)'],
])
  assert.ok(glsl.includes(piece), `shader still has the ${what}: ${piece}`);
assert.equal(stepSize(1.6), Math.min(0.6, Math.max(0.012, 0.1 * (1.6 - 0.6))));

console.log(
  'PASS: Schwarzschild exhibit — constants, weak-field deflection (incl. 1.75″ at the solar limb), critical impact parameter, photon-sphere orbit, angular momentum, static-observer shadow, disk frequency shift, shader matches the JS equation.',
);
