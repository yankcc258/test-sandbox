// 洛希极限展品的物理检查（猫猫）：不看画面，只核对公式、积分和「碎石堆到底碎在哪里」。
// 画面那一半（着色器编译、显卡积分、拖动和降级）目前只在浏览器里人工看过，还没有自动脚本。
import assert from 'node:assert/strict';
import {
  MOON_RADIUS,
  RIGID_COEFF,
  FLUID_COEFF,
  HILL_COEFF,
  HILL_CRITICAL,
  PAIR_GLSL,
  FREE_BELOW,
  createDust,
  advanceDust,
  rocheRigid,
  rocheFluid,
  hillOverflow,
  hillRadius,
  hillPotential,
  orbitalRate,
  pileParams,
  pairAccel,
  createState,
  advance,
  measurePile,
  settlePile,
  placeOnOrbit,
  boundClump,
  coast,
} from '../exhibits/roche/moon/physics.js';
import {
  STEP_FRAGMENT,
  DUST_FRAGMENT,
  createCpuSim,
  textureSize,
  dustSize,
} from '../exhibits/roche/moon/sim.js';
import { PILES } from '../exhibits/roche/moon/pile-data.js';

const close = (a, b, rel, what) =>
  assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: ${a} vs ${b}`);

// 1) 三个系数和密度的 1/3 次方
close(RIGID_COEFF, 1.259921, 1e-6, 'rigid coefficient 2^(1/3)');
close(HILL_COEFF, 1.44225, 1e-5, 'Hill coefficient 3^(1/3)');
assert.equal(FLUID_COEFF, 2.44);
for (const q of [0.4, 1, 3.7]) {
  close(rocheFluid(8 * q), rocheFluid(q) / 2, 1e-12, 'density scaling of the fluid limit');
  close(rocheRigid(8 * q), rocheRigid(q) / 2, 1e-12, 'density scaling of the rigid limit');
  // 希尔球正好缩到卫星表面的那个距离：r_H = d (m/3)^(1/3)，m = q r³
  close(hillRadius(hillOverflow(q), q * MOON_RADIUS ** 3), MOON_RADIUS, 1e-12, 'Hill overflow');
  // 刚体极限：朝向行星那一点上，潮汐加速度 2 r / d³ 等于自身引力 m / r²
  const d = rocheRigid(q);
  close((2 * MOON_RADIUS) / d ** 3, (q * MOON_RADIUS ** 3) / MOON_RADIUS ** 2, 1e-12, 'rigid');
}
// 土星周围：冰（0.93 g/cm³）的流体极限约 2.2 个土星半径；主环的外沿（A 环，136,775 km）按体积平均半径
// 58,232 km 折算是 2.35，两者相差约 6%
close(rocheFluid(0.93 / 0.687), 136775 / 58232, 0.07, 'fluid limit of ice vs the edge of the A ring');

// 2) 希尔近似的有效势：L1 / L2 在 ξ = ±1 是鞍点，临界等势线取值 −4.5，腰部半宽 2/3
close(hillPotential(1, 0), HILL_CRITICAL, 1e-12, 'critical potential at L2');
close(hillPotential(0, 2 / 3), HILL_CRITICAL, 1e-12, 'waist of the critical lobe');
{
  const h = 1e-5,
    slopeAlong = (hillPotential(1 + h, 0) - hillPotential(1 - h, 0)) / (2 * h),
    curveAlong = (hillPotential(1 + h, 0) - 2 * hillPotential(1, 0) + hillPotential(1 - h, 0)) / h ** 2,
    curveAcross = (hillPotential(1, h) - 2 * hillPotential(1, 0) + hillPotential(1, -h)) / h ** 2;
  assert.ok(Math.abs(slopeAlong) < 1e-6, 'no net force at L2');
  assert.ok(curveAlong < 0 && curveAcross > 0, 'L2 is a saddle');
}

// 3) 两颗颗粒之间的力
{
  const p = pileParams(1024, 1.3),
    far = pairAccel([0.3, -0.2, 0.1], [1, 2, 3], p),
    r = Math.hypot(0.3, 0.2, 0.1);
  close(Math.hypot(...far), p.mp / r ** 2, 1e-12, 'Newtonian gravity outside contact');
  assert.ok(far[0] < 0 && far[1] > 0 && far[2] < 0, 'gravity pulls i toward j');
  const back = pairAccel([-0.3, 0.2, -0.1], [-1, -2, -3], p);
  far.forEach((value, i) => close(value, -back[i], 1e-12, 'action and reaction'));
  // 刚好碰到时连续；压进去以后是排斥；互相靠近时阻尼让排斥更强
  const touch = 2 * p.s,
    outside = pairAccel([touch * (1 + 1e-9), 0, 0], [0, 0, 0], p)[0],
    inside = pairAccel([touch * (1 - 1e-9), 0, 0], [0, 0, 0], p)[0];
  close(inside, outside, 1e-5, 'continuous at first contact');
  assert.ok(pairAccel([touch * 0.9, 0, 0], [0, 0, 0], p)[0] > 0, 'overlap pushes apart');
  assert.ok(
    pairAccel([touch * 0.9, 0, 0], [-0.01, 0, 0], p)[0] >
      pairAccel([touch * 0.9, 0, 0], [0.01, 0, 0], p)[0],
    'damping resists approach',
  );
  // 着色器里是同一条公式，积分顺序也一样（先踢后漂）
  for (const piece of [
    'float rc = max(r, s2);',
    'float f = -mp / (rc * rc * rc);',
    'f += (kn * (1.0 - r / s2) - cn * along) / r;',
  ])
    assert.ok(PAIR_GLSL.includes(piece), 'GLSL pair force: ' + piece);
  assert.ok(STEP_FRAGMENT.includes(PAIR_GLSL), 'step shader uses the shared pair force');
  for (const piece of [
    'a -= p.xyz / (r2 * sqrt(r2));',
    'a -= u_drag * v.xyz;',
    'near += step(d2, u_near2);',
    'vec3 nv = (v.xyz + a * u_dt) * u_keep;',
    'vec3 np = p.xyz + nv * u_dt;',
  ])
    assert.ok(STEP_FRAGMENT.includes(piece), 'step shader: ' + piece);
}

// 4) 单颗颗粒绕行星：圆轨道保持半径，周期是 2π d^1.5，转向和 coast 的预测一致
{
  const d = 2.5,
    p = { ...pileParams(1024, 1), dt: 0.002 },
    state = createState(1);
  state.x.set([d, 0, 0]);
  state.v.set([0, 0, -orbitalRate(d) * d]);
  const quarter = Math.round((Math.PI / 2) * d ** 1.5 / p.dt);
  advance(state, p, quarter);
  const predicted = coast([d, 0, 0], quarter * p.dt);
  assert.ok(Math.hypot(...predicted.map((value, i) => value - state.x[i])) < 0.01, 'coast');
  assert.ok(state.x[2] < -2.4, 'the moon moves toward −z first');
  advance(state, p, 3 * quarter);
  close(Math.hypot(...state.x), d, 5e-3, 'circular orbit keeps its radius');
  assert.ok(Math.hypot(state.x[0] - d, state.x[2]) < 0.03, 'back at the start after one period');
}

// 5) 随页面发布的碎石堆：没有压穿的颗粒，大小对，而且已经平衡
for (const n of [1024, 4096]) {
  const bytes = Buffer.from(PILES[n], 'base64'),
    pile = measurePile(new Float32Array(bytes.buffer, bytes.byteOffset, 3 * n), n),
    p = pileParams(n, 1, pile.rEff);
  assert.deepEqual(textureSize(n), [Math.sqrt(n), Math.sqrt(n)]);
  close(pile.rEff, MOON_RADIUS, 0.1, `pile ${n} radius`);
  let nearest = Infinity;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const gap = Math.hypot(
        pile.pos[3 * i] - pile.pos[3 * j],
        pile.pos[3 * i + 1] - pile.pos[3 * j + 1],
        pile.pos[3 * i + 2] - pile.pos[3 * j + 2],
      );
      if (gap < nearest) nearest = gap;
    }
  assert.ok(nearest > 0.8 * 2 * p.s, `pile ${n}: deepest overlap ${nearest / (2 * p.s)}`);
  // 完整的碎石堆里没有离群的碎石：每颗至少挨着两个邻居。否则卫星还好好的，冰尘就会往外漏
  {
    const state = placeOnOrbit(pile, 2.9);
    advance(state, pileParams(n, 0.93 / 0.687, pile.rEff), 2);
    assert.ok(Math.min(...state.near) >= FREE_BELOW, `pile ${n}: every rock has neighbours`);
  }
  assert.equal(dustSize(n * (n > 2000 ? 64 : 32)).reduce((a, b) => a * b), n * (n > 2000 ? 64 : 32));
  if (n === 1024) {
    // 不放行星，原地走大约半个自由下落时间：整体不应该再塌或再弹
    const state = createState(n);
    state.x.set(pile.pos);
    advance(state, p, 60, { planet: false });
    close(measurePile(state.x, n).rEff, pile.rEff, 5e-3, 'shipped pile is in equilibrium');
  }
}

// 6) 现场聚拢的小碎石堆（CPU 回退用的就是这个流程）
const N = 200,
  pile = settlePile(N);
close(pile.rEff, MOON_RADIUS, 0.1, 'settled pile radius');

// 7) 卫星正在解体的时候：对行星的总角动量守恒（行星引力是有心力，颗粒之间的力成对抵消），
//    总能量只减不增（碰撞有损耗，积分不能凭空加热）。只比较还没有碎石落到行星上的这一段。
{
  const p = pileParams(N, 1, pile.rEff),
    state = placeOnOrbit(pile, 2.0),
    s2 = 2 * p.s,
    momentum = () => {
      let l = 0;
      for (let i = 0; i < N; i++)
        l += state.x[3 * i + 2] * state.v[3 * i] - state.x[3 * i] * state.v[3 * i + 2];
      return l;
    },
    energy = () => {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        const [x, y, z] = state.x.subarray(3 * i, 3 * i + 3),
          [u, v, w] = state.v.subarray(3 * i, 3 * i + 3);
        sum += p.mp * (0.5 * (u * u + v * v + w * w) - 1 / Math.hypot(x, y, z));
        for (let j = i + 1; j < N; j++) {
          const r = Math.hypot(x - state.x[3 * j], y - state.x[3 * j + 1], z - state.x[3 * j + 2]);
          // 接触以内引力封顶，对应的势能是抛物线；再加弹簧的势能
          sum -=
            r >= s2 ? (p.mp * p.mp) / r : (p.mp * p.mp * (3 - (r / s2) ** 2)) / (2 * s2);
          if (r < s2) sum += (p.mp * p.kn * (s2 - r) ** 2) / (2 * s2);
        }
      }
      return sum;
    },
    binding = (0.6 * p.mass ** 2) / pile.rEff, // 卫星自身的引力结合能，用来衡量能量变化的大小
    before = momentum();
  let previous = energy();
  for (let i = 0; i < 5; i++) {
    advance(state, p, 100);
    assert.ok(state.alive.every(Boolean), 'no debris has reached the planet yet');
    const now = energy();
    assert.ok(now <= previous + 1e-4 * binding, 'energy never increases');
    previous = now;
  }
  close(momentum(), before, 1e-11, 'angular momentum about the planet');
}

// 8) 碎在哪里。放在距离 k · q^(-1/3) 的圆轨道上转三圈，看还剩多少聚在一起。
function survives(k, q, orbits = 3) {
  const d = k * q ** (-1 / 3),
    p = pileParams(N, q, pile.rEff),
    state = placeOnOrbit(pile, d),
    chunk = Math.ceil((2 * Math.PI * d ** 1.5) / 12 / p.dt);
  let clump = { center: [d, 0, 0], count: N };
  for (let i = 0; i < 12 * orbits; i++) {
    advance(state, p, chunk);
    clump = boundClump(
      state.x,
      N,
      p.mp,
      { center: coast(clump.center, chunk * p.dt), count: clump.count },
      { alive: state.alive },
    );
    if (!clump.count) return 0;
  }
  return clump.count / N;
}
// 密度不同，极限按 q^(-1/3) 移动：在流体极限上都还完整，在 2.0 倍处都散了
for (const q of [0.5, 0.93 / 0.687, 4]) {
  assert.ok(survives(FLUID_COEFF, q) > 0.97, `intact at the fluid limit, q=${q}`);
  assert.ok(survives(2.0, q) < 0.1, `torn apart at 2.0, q=${q}`);
}
// 二分找出一半以上质量留不住的位置：应该在两条线之间，靠近流体极限
let inner = 2.0,
  outer = FLUID_COEFF;
for (let i = 0; i < 5; i++) {
  const middle = (inner + outer) / 2;
  if (survives(middle, 1) > 0.5) outer = middle;
  else inner = middle;
}
const critical = (inner + outer) / 2;
assert.ok(critical > RIGID_COEFF && critical < FLUID_COEFF, 'breakup lies between the two limits');
close(critical, 2.2, 0.06, 'rubble pile breakup distance (in units of R q^-1/3)');

// 9) 影片里示意用的轨道衰减：a −= γ v 让圆轨道按 d(t) = d₀ e^(−2γt) 螺旋向内
{
  const p = { ...pileParams(1024, 1), dt: 0.002 },
    state = createState(1),
    drag = 0.0027,
    steps = 30000;
  state.x.set([2.9, 0, 0]);
  state.v.set([0, 0, -orbitalRate(2.9) * 2.9]);
  advance(state, p, steps, { drag });
  close(Math.hypot(...state.x), 2.9 * Math.exp(-2 * drag * steps * p.dt), 0.01, 'orbital decay');
}

// 10) 冰尘（示意）：贴着碎石 → 碎石离群就散开 → 散开后只受行星引力
{
  const p = pileParams(N, 1, pile.rEff),
    state = placeOnOrbit(pile, 3.2),
    dust = createDust(N, 8),
    reach = (grain) => {
      const parent = Math.floor(grain / 8);
      return Math.hypot(
        dust.x[4 * grain] - state.x[3 * parent],
        dust.x[4 * grain + 1] - state.x[3 * parent + 1],
        dust.x[4 * grain + 2] - state.x[3 * parent + 2],
      );
    };
  advance(state, p, 20);
  advanceDust(dust, state, p, 20);
  for (let grain = 0; grain < dust.total; grain++) {
    assert.equal(dust.x[4 * grain + 3], 0, 'dust stays attached to an intact moon');
    assert.ok(reach(grain) <= p.spread * 1.0001, 'attached dust sits within reach of its rock');
  }
  // 人为让 0 号碎石离群：它的 8 粒冰尘散开，别的不动
  state.near[0] = 0;
  advanceDust(dust, state, p, 0);
  for (let grain = 0; grain < dust.total; grain++)
    assert.equal(dust.x[4 * grain + 3], grain < 8 ? 1 : 0, 'only the stray rock releases its dust');
  // 散开以后走开普勒轨道：比能守恒（步长误差以内），不再跟着碎石
  const energy = (grain) => {
    const at = 4 * grain,
      v2 = dust.v[at] ** 2 + dust.v[at + 1] ** 2 + dust.v[at + 2] ** 2;
    return v2 / 2 - 1 / Math.hypot(dust.x[at], dust.x[at + 1], dust.x[at + 2]);
  };
  const before = energy(3);
  state.near[0] = 12;
  advance(state, p, 400);
  advanceDust(dust, state, p, 400);
  assert.equal(dust.x[4 * 3 + 3], 1, 'released dust stays released');
  close(energy(3), before, 2e-3, 'free dust keeps its orbital energy');
  // 所属碎石落到行星上，贴着它的冰尘也跟着消失
  state.alive[5] = 0;
  advanceDust(dust, state, p, 1);
  assert.equal(dust.x[4 * 40 + 3], 2, 'dust of a rock that hit the planet is gone');
  for (const piece of [
    'bool release = pv.w < u_free;',
    'vec3 nv = dv.xyz - d.xyz / (r2 * sqrt(r2)) * u_dt;',
    'vec3 np = d.xyz + nv * u_dt;',
  ])
    assert.ok(DUST_FRAGMENT.includes(piece), 'dust shader: ' + piece);
}

// 11) CPU 后端和参考积分是同一回事
{
  const sim = createCpuSim(null, N),
    p = pileParams(N, 1, pile.rEff),
    reference = placeOnOrbit(pile, 2.8),
    x = new Float32Array(4 * N),
    v = new Float32Array(4 * N);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++) {
      x[4 * i + k] = reference.x[3 * i + k];
      v[4 * i + k] = reference.v[3 * i + k];
    }
    x[4 * i + 3] = 1;
  }
  sim.load(x, v);
  // 载入时经过了单精度，参考也从同样的数出发
  for (let i = 0; i < N; i++)
    for (let k = 0; k < 3; k++) {
      reference.x[3 * i + k] = x[4 * i + k];
      reference.v[3 * i + k] = v[4 * i + k];
    }
  sim.step(40, p);
  advance(reference, p, 40);
  const out = sim.read();
  for (let i = 0; i < N; i++) close(out.x[4 * i], reference.x[3 * i], 1e-6, 'cpu backend');
  assert.equal(boundClump(out.x, N, p.mp, { center: coast([2.8, 0, 0], 40 * p.dt), count: N }, { stride: 4 }).count, N);
}

console.log(
  `PASS: Roche — limit coefficients, Hill lobe, pair force, orbit, shipped piles, conservation, decay, dust; ` +
    `rubble pile breaks at ${critical.toFixed(2)} R·q^(-1/3) (rigid ${RIGID_COEFF.toFixed(2)}, fluid ${FLUID_COEFF}).`,
);
