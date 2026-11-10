// 史瓦西黑洞展品的物理检查（露娜）：不看画面，只核对光线方程给出的数。
// 画面那一半（着色器编译、阴影是黑的、盘一边亮一边暗、拖动和缩放）在 scripts/check-schwarzschild-browser.mjs，需要浏览器。
import assert from 'node:assert/strict';
import { FRAGMENT as glsl } from '../exhibits/schwarzschild/shader.js';
import {
  orbitStep,
  observerOrbit,
  traceObserverRay,
  diskTexturePoint,
} from '../exhibits/schwarzschild/orbit.js';
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

// 7) 真实着色器的方程 / 频移；GPU 终点的独立解析检查在浏览器脚本里。
for (const [what, piece] of [
  ['Binet equation', '1.5 * s.x * s.x - s.x'],
  ['static observer', 'sqrt(1.0 - 1.0 / r0)'],
  ['Kepler angular velocity', 'sqrt(0.5 / (r * r * r))'],
  ['disk shift', 'sqrt(1.0 - 1.5 / r) / (1.0 - omega * lz) / obs'],
  ['brightness ∝ g⁴', 'pow(g, 4.0)'],
])
  assert.ok(glsl.includes(piece), `shader still has the ${what}: ${piece}`);
assert.equal(stepSize(1.6), Math.min(0.6, Math.max(0.012, 0.1 * (1.6 - 0.6))));

// 8) 全距离范围内，解析阴影两侧分别落入 / 逃逸，不受距无穷远的路程影响。
for (const r of [1.6, 2, 4, 22, 60]) {
  for (const factor of [0.99, 1.01]) {
    const psi = shadowAngle(r) * factor;
    const result = traceObserverRay([r, 0, 0], [-Math.cos(psi), Math.sin(psi), 0], { disk: false });
    assert.equal(
      result.status,
      factor < 1 ? 'captured' : 'escaped',
      `shadow r=${r}, factor=${factor}`,
    );
  }
  const psi = Math.min(1.5, shadowAngle(r) * 1.2 + 0.1),
    n = [-Math.cos(psi), Math.sin(psi), 0];
  const normal = traceObserverRay([r, 0, 0], n, { disk: false });
  const fine = traceObserverRay([r, 0, 0], n, { disk: false, step: 0.0125, maxSteps: 2048 });
  assert.equal(normal.status, 'escaped');
  assert.ok(
    Math.hypot(...normal.direction.map((x, i) => x - fine.direction[i])) < 2e-5,
    'escape direction converges',
  );
  let s = observerOrbit([r, 0, 0], n).state;
  const energy = ([u, w]) => w * w + u * u - u * u * u,
    E = energy(s);
  for (let i = 0; i < 1024 && s[0] > 0 && s[0] < 1; i++) {
    s = orbitStep(s, 0.025);
    close(energy(s), E, 2e-6, 'null geodesic energy integral');
  }
}
assert.equal(traceObserverRay([22, 0, 0], [-1, 0.1, 0], { maxSteps: 1 }).status, 'unresolved');

// 9) 盘面交点用独立的笛卡尔 Verlet 小步积分核对，尤其包含接近正侧面的轨道。
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const norm = (a) => a.map((x) => x / Math.hypot(...a));
let hits = 0;
for (const degrees of [18, 80, 86, 90]) {
  for (const offset of [-0.12, 0.12, 0.35]) {
    const inc = (degrees * Math.PI) / 180,
      camera = [22 * Math.sin(inc), 22 * Math.cos(inc), 0];
    const radial = norm(camera),
      up = [-Math.cos(inc), Math.sin(inc), 0];
    const n = norm(radial.map((x, i) => -x + up[i] * offset + (i === 2 ? -0.25 : 0)));
    const orbit = traceObserverRay(camera, n);
    if (orbit.status !== 'disk') continue;
    const nr = dot(n, radial),
      p = [...camera],
      v = norm(n.map((x, i) => x + (radialStretch(22) - 1) * nr * radial[i]));
    const h2 = dot(p, p) * dot(v, v) - dot(p, v) ** 2;
    let radius = null;
    for (let i = 0; i < 100000; i++) {
      const before = [...p];
      step(p, v, h2, stepSize(Math.hypot(...p), 0.04));
      if (before[1] * p[1] < 0) {
        const t = before[1] / (before[1] - p[1]);
        const hit = before.map((x, j) => x + t * (p[j] - x)),
          r = Math.hypot(...hit);
        if (r >= 3 && r <= 12) {
          radius = r;
          break;
        }
      }
      if (Math.hypot(...p) < 1 || Math.hypot(...p) > 100) break;
    }
    assert.notEqual(radius, null, `Cartesian ray intersects disk at inclination ${degrees}`);
    close(orbit.radius, radius, 5e-4, `disk radius at inclination ${degrees}`);
    hits++;
  }
}
assert.ok(hits >= 4, 'independent disk intersection fixtures exercised');

// 10) +y 物质运动与逆向纹理取样、频移保持一致：x>0 处物质向 -z 运动。
{
  const r = 6,
    angle = 0.3,
    pos = [r * Math.cos(angle), 0, -r * Math.sin(angle)];
  const q = diskTexturePoint(pos, angle);
  close(q[0], r, 1e-12, 'advected texture stays with gas');
  assert.ok(Math.abs(q[1]) < 1e-12);
  const omega = Math.sqrt(0.5 / r ** 3),
    gasVelocity = [0, 0, -r * omega];
  assert.ok(
    gasVelocity[2] < 0 && diskShift(r, r) > diskShift(r, -r),
    'approaching -z side is blue-shifted',
  );
}

console.log(
  'PASS: Schwarzschild — weak field, critical ray, photon sphere, invariants, analytic shadow at 1.6–60 r_s, RK4 convergence, independent Cartesian disk intersections, +y rotation and frequency shift.',
);
