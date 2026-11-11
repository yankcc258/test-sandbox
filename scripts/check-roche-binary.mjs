// 洛希极限展品 · 双星观测的物理检查（猫猫）：不看画面，只核对有效势、拉格朗日点、行星的形状和碎屑的积分。
// 画面那一半在 scripts/check-roche-binary-browser.mjs（要浏览器）。
import assert from 'node:assert/strict';
import {
  roche,
  rocheGradient,
  lagrange,
  planetShape,
  volumeRadius,
  eggleton,
  periodHours,
  toRotating,
  toInertial,
  corotation,
  accel,
  advance,
  jacobi,
  ROCHE_GLSL,
  PARTICLE_GLSL,
} from '../exhibits/roche/binary.js';
import { DUST_STEP, STREAM_EVERY, seedDust, createCpuDust } from '../exhibits/roche/scene.js';

const close = (a, b, rel, what) =>
  assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: ${a} vs ${b}`);
const MU = 0.35,
  L = lagrange(MU);

// 1) 五个拉格朗日点都是有效势的驻点；L1 在两星之间，L2、L3 在外侧；L4 / L5 和两星成等边三角形
for (const [u, w] of [[L.L1, 0], [L.L2, 0], [L.L3, 0], L.L4, L.L5]) {
  const g = rocheGradient(u, w, 0, MU);
  assert.ok(Math.hypot(...g) < 1e-9, `no net force at (${u}, ${w})`);
}
assert.ok(-MU < L.L1 && L.L1 < 1 - MU && L.L2 > 1 - MU && L.L3 < -MU);
close(Math.hypot(L.L4[0] + MU, L.L4[1]), 1, 1e-12, 'L4 is one separation from A');
close(Math.hypot(L.L4[0] - 1 + MU, L.L4[1]), 1, 1e-12, 'L4 is one separation from B');
assert.ok(L.C1 > L.C2 && L.C2 > L.C3, 'the neck at L1 opens first, then L2, then L3');
// 解析梯度和数值差分一致
{
  const p = [0.4, -0.3, 0.2],
    h = 1e-6,
    g = rocheGradient(...p, MU);
  for (let k = 0; k < 3; k++) {
    const hi = p.slice(),
      lo = p.slice();
    hi[k] += h;
    lo[k] -= h;
    close((roche(...hi, MU) - roche(...lo, MU)) / (2 * h), g[k], 1e-6, 'gradient component ' + k);
  }
}
// 两星等质量时一切对称，L1 在正中间
{
  const even = lagrange(0.5);
  assert.ok(Math.abs(even.L1) < 1e-9 && Math.abs(even.L2 + even.L3) < 1e-9);
}
// 小质量极限：L1、L2 到小天体的距离趋近希尔半径 (μ/3)^(1/3)
{
  const mu = 1e-6,
    tiny = lagrange(mu),
    hill = Math.cbrt(mu / 3);
  close(1 - mu - tiny.L1, hill, 0.01, 'L1 at the Hill radius');
  close(tiny.L2 - (1 - mu), hill, 0.01, 'L2 at the Hill radius');
}

// 2) 行星的形状：fill = 1 时尖端正好在 L1，表面等势值就是 L1 的值；充满洛希瓣时的等体积半径和 Eggleton 公式一致
for (const which of ['A', 'B']) {
  const full = planetShape(MU, which, 1, L),
    q = which === 'A' ? (1 - MU) / MU : MU / (1 - MU);
  close(full.tip, L.L1, 1e-9, 'tip reaches L1');
  close(full.level, L.C1, 1e-9, 'surface is the critical equipotential');
  close(volumeRadius(MU, full), eggleton(q), 0.01, `Roche lobe radius of ${which}`);
  // 靠得越近（fill 越大）行星越大、越尖；始终是「朝向对方最长、垂直轨道面最短」
  let before = 0;
  for (const fill of [0.6, 0.75, 0.9, 1]) {
    const shape = planetShape(MU, which, fill, L),
      size = volumeRadius(MU, shape);
    assert.ok(size > before, 'closer means larger in units of the separation');
    before = size;
    assert.ok(Math.abs(shape.tip - shape.center) > shape.side && shape.side > shape.pole, 'teardrop');
    // 表面上的几个点确实在同一个等势面上
    close(roche(shape.back, 0, 0, MU), shape.level, 1e-9, 'back');
    close(roche(shape.center, shape.side, 0, MU), shape.level, 1e-9, 'side');
    close(roche(shape.center, 0, shape.pole, MU), shape.level, 1e-9, 'pole');
  }
}
// 周期只由密度和形状决定：密度变成 4 倍，周期减半；量级是几个小时
{
  const size = volumeRadius(MU, planetShape(MU, 'B', 0.97, L)),
    hours = periodHours(MU, size, 3.4);
  close(periodHours(MU, size, 13.6), hours / 2, 1e-12, 'period scales as density^-1/2');
  assert.ok(hours > 4 && hours < 8, `orbital period ${hours} h`);
}

// 3) 坐标变换和积分
{
  const p = [0.7, 0.2, -1.1];
  toInertial(toRotating(p, 1.3), 1.3).forEach((value, i) => close(value, p[i], 1e-12, 'frames'));
  // 行星自己在惯性系里的速度就是共转速度
  const b = toInertial([1 - MU, 0, 0], 0.4),
    ahead = toInertial([1 - MU, 0, 0], 0.4 + 1e-6);
  corotation(b).forEach((value, i) => close(value, (ahead[i] - b[i]) / 1e-6 || 0, 1e-5, 'co-rotation'));
  // 离两星都远时，合引力趋近质心处一个单位质量的引力
  const far = accel([30, 0, 0], 0.7, MU);
  close(far[0], -1 / 900, 1e-3, 'far-field gravity');
}
// 雅可比常数守恒：绕双星的碎屑走 10 圈，漂移远小于 L1 和 L2 的势差
{
  const p = [2.2, 0.01, 0],
    v = [0, 0, Math.sqrt(1 / 2.2)],
    before = jacobi(p, v, 0, MU),
    theta = advance(p, v, 0, MU, 0.004, Math.round((2 * Math.PI * 10) / 0.004));
  assert.ok(Math.abs(jacobi(p, v, theta, MU) - before) < 1e-3, 'Jacobi constant');
  assert.ok(Math.hypot(p[0], p[2]) > 1.9 && Math.hypot(p[0], p[2]) < 2.6, 'stays in the belt');
}
// 零速度面：雅可比常数高于 2·C1 的碎屑被关在出发的那个洛希瓣里，过不了 L1
{
  // 绕着望舒转的一粒：在共转系里是半径 0.12 的近圆轨道
  const start = toInertial([1 - MU - 0.12, 0, 0], 0),
    spin = corotation(start),
    p = start.slice(),
    v = [spin[0], 0.02, spin[2] + Math.sqrt(MU / 0.12)];
  assert.ok(jacobi(p, v, 0, MU) > 2 * L.C1, 'starts below the neck');
  let theta = 0;
  for (let i = 0; i < 400; i++) {
    theta = advance(p, v, theta, MU, 0.002, 25);
    assert.ok(toRotating(p, theta)[0] > L.L1, 'never crosses L1');
  }
}
// 行星带：2.4 倍间距以外绕 12 圈仍在带里；1.5 倍处的会被扯走（落到行星上或离开原来的轨道）
{
  const fate = (r) => {
    const p = [r, 0, 0],
      v = [0, 0, Math.sqrt(1 / r)];
    advance(p, v, 0, MU, 0.004, Math.round((2 * Math.PI * 12) / 0.004));
    return Math.hypot(p[0], p[2]);
  };
  for (const r of [2.4, 3, 3.6]) close(fate(r), r, 0.12, `belt at ${r} is stable`);
  assert.ok(Math.abs(fate(1.5) - 1.5) > 0.3, 'the inner edge is torn away');
}

// 4) 着色器里是同一个势和同一个积分顺序
for (const piece of [
  'return 0.5 * (q.x * q.x + q.z * q.z) + (1.0 - mu) / ra + mu / rb;',
  'return vec3(q.x, 0.0, q.z) - (1.0 - mu) * da / (ra * ra * ra) - mu * db / (rb * rb * rb);',
])
  assert.ok(ROCHE_GLSL.includes(piece), 'GLSL potential: ' + piece);
assert.ok(
  PARTICLE_GLSL.includes('return -(1.0 - mu) * da / (ra * ra * ra) - mu * db / (rb * rb * rb);'),
);
for (const piece of [
  ROCHE_GLSL,
  PARTICLE_GLSL,
  'vec3 nv = v.xyz + pull(p.xyz, was, u_mu) * u_dt;',
  'vec3 np = p.xyz + nv * u_dt;',
  'length(q + vec3(u_mu, 0.0, 0.0)) < u_reach.x && value > u_level.x',
])
  assert.ok(DUST_STEP.includes(piece), 'dust step shader: ' + piece.slice(0, 40));

// 5) 碎屑的规则（CPU 后端，和着色器同一套）
{
  const { x } = seedDust(6000);
  for (let i = 0; i < 6000; i++) {
    const r = Math.hypot(x[4 * i], x[4 * i + 2]);
    if (i % STREAM_EVERY === 0) assert.equal(x[4 * i + 3], 3, 'stream grains start parked');
    else assert.ok(x[4 * i + 3] === 0 && r > 1.84 && r < 3.96, 'belt grains start in the belt');
  }
  const shapes = ['A', 'B'].map((which) => planetShape(MU, which, 0.97, L)),
    frame = (theta, emit) => ({
      theta,
      mu: MU,
      level: shapes.map((s) => s.level),
      reach: shapes.map((s) => s.reach),
      tip: shapes.map((s) => s.tip),
      emit,
    }),
    dust = createCpuDust(null, 60, 60);
  // 没有碎屑被扯出来时，待命的一直待命
  let theta = 0;
  for (let i = 0; i < 40; i++) {
    dust.step(frame(theta, 0), 0.01);
    theta += 0.01;
  }
  assert.equal(dust.census().waiting, 600);
  // 打开以后，尖端的碎屑出现在 L1 附近，两颗行星各出一半
  dust.step(frame(theta, 1), 0.01);
  theta += 0.01;
  const now = dust.census();
  assert.equal(now.waiting, 0);
  assert.equal(now.fromA, 300);
  assert.equal(now.fromB, 300);
  for (let i = 0; i < 3600; i += STREAM_EVERY) {
    const [u, w, h] = toRotating([dust.data.x[4 * i], dust.data.x[4 * i + 1], dust.data.x[4 * i + 2]], theta);
    assert.ok(Math.abs(u - L.L1) < 0.03 && Math.hypot(w, h) < 0.1, 'born at the tips, next to L1');
  }
  // 走上三圈：没有任何碎屑待在行星里面
  for (let i = 0; i < 1900; i++) {
    dust.step(frame(theta, 0.02), 0.01);
    theta += 0.01;
  }
  for (let i = 0; i < 3600; i++) {
    const at = 4 * i;
    if (dust.data.x[at + 3] > 2.5) continue;
    const [u, w, h] = toRotating([dust.data.x[at], dust.data.x[at + 1], dust.data.x[at + 2]], theta),
      value = roche(u, w, h, MU);
    assert.ok(
      !(Math.hypot(u + MU, w, h) < shapes[0].reach && value > shapes[0].level) &&
        !(Math.hypot(u - 1 + MU, w, h) < shapes[1].reach && value > shapes[1].level),
      'no grain inside a planet',
    );
  }
  const after = dust.census();
  assert.equal(after.belt, 3000, 'belt grains that are torn away are replaced');
}

console.log(
  `PASS: Roche binary — Lagrange points, teardrop shapes vs Eggleton lobes, period, frames, Jacobi constant, ` +
    `zero-velocity confinement, belt stability, shader formulas and dust rules (L1 at ${L.L1.toFixed(4)} for μ = ${MU}).`,
);
