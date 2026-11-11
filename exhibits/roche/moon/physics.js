// 洛希极限展品的物理核心（猫猫）。画面、CPU 回退和 scripts/check-roche.mjs 都用这一份。
// 单位：行星半径 R = 1，GM = 1，所以半径 d 的圆轨道角速度是 d^-1.5。行星固定在原点，轨道面是 x–z，轴取 +y（和展品 01 一致）。
// q = 卫星体密度 / 行星平均密度。M = R = 1 时，卫星质量 m = q · r³，洛希极限只和 q 有关，和卫星大小无关。

export const MOON_RADIUS = 0.12; // 碎石堆的名义半径（示意：真实卫星比这小得多，极限位置不受影响）
export const FILL = 0.6; // 用来定颗粒大小的名义堆积率；实际体密度按聚拢后量到的半径算
export const STIFF = 5; // 接触刚度（无量纲）：中心处颗粒互相压进去约 5%
export const DAMP = 0.35; // 法向阻尼比，对应恢复系数约 0.3；没有切向摩擦
export const DT_FACTOR = 0.25; // 步长 = DT_FACTOR / 接触振动角频率
export const NEAR_RANGE = 2.6; // 中心距在 2.6 个颗粒半径以内算「挨着」
export const FREE_BELOW = 2; // 挨着的邻居少于 2 颗：这颗碎石已经离群，它带着的冰尘随之散开

export const RIGID_COEFF = 2 ** (1 / 3); // 1.26：刚体表面一颗松石头被拉走
export const FLUID_COEFF = 2.44; // 流体、同步自转的卫星整体失去平衡（Roche 1847 的经典值）
export const HILL_COEFF = 3 ** (1 / 3); // 1.44：希尔球缩到和卫星一样大

export const rocheRigid = (q) => RIGID_COEFF * q ** (-1 / 3);
export const rocheFluid = (q) => FLUID_COEFF * q ** (-1 / 3);
export const hillOverflow = (q) => HILL_COEFF * q ** (-1 / 3);
export const hillRadius = (d, mass) => d * (mass / 3) ** (1 / 3);
export const orbitalRate = (d) => d ** -1.5;

// 共转系里卫星附近的有效势（希尔近似），长度以希尔半径为单位：
// Φ ∝ −3/ρ − (3/2)ξ² + (1/2)ζ²，ξ 指向行星连线方向，ζ 垂直轨道面。过 L1 / L2 的临界等势面取值 −4.5。
export const hillPotential = (xi, eta, zeta = 0) =>
  -3 / Math.hypot(xi, eta, zeta) - 1.5 * xi * xi + 0.5 * zeta * zeta;
export const HILL_CRITICAL = -4.5;

// 由颗粒数和密度比得到全部模拟参数。刚度随 q 一起变，所以改密度不改变碎石堆的平衡形状。
export function pileParams(n, q, rEff = MOON_RADIUS) {
  const s = MOON_RADIUS * (FILL / n) ** (1 / 3); // 颗粒半径
  const mass = q * rEff ** 3;
  const kn = (STIFF * q * rEff ** 2) / s; // 两颗完全重叠时的排斥加速度
  const omega = Math.sqrt(kn / s);
  const mp = mass / n;
  return {
    n,
    q,
    s,
    mass,
    mp,
    kn,
    cn: DAMP * omega,
    dt: DT_FACTOR / omega,
    spread: 1.7 * s, // 冰尘离所属碎石中心的最大距离
    kick: 0.5 * Math.sqrt(mp / s), // 冰尘散开时的随机速度，量级是一颗碎石的逃逸速度
  };
}

// 颗粒 j 对颗粒 i 的加速度。d = x_i − x_j，dv = v_i − v_j。
// 接触之外是牛顿引力；压在一起时引力按接触距离封顶，再加弹簧排斥和法向阻尼。
export function pairAccel(d, dv, { s, mp, kn, cn }) {
  const r = Math.hypot(d[0], d[1], d[2]),
    s2 = 2 * s,
    rc = Math.max(r, s2);
  let f = -mp / (rc * rc * rc);
  if (r < s2 && r > 1e-9) {
    const along = (d[0] * dv[0] + d[1] * dv[1] + d[2] * dv[2]) / r;
    f += (kn * (1 - r / s2) - cn * along) / r;
  }
  return [d[0] * f, d[1] * f, d[2] * f];
}

// GLSL 的同一公式；检查脚本会核对两边的结构没有走样。
export const PAIR_GLSL = `
vec3 pairAccel(vec3 d, vec3 dv, float s2, float mp, float kn, float cn) {
  float r = length(d);
  float rc = max(r, s2);
  float f = -mp / (rc * rc * rc);
  if (r < s2 && r > 1e-7) {
    float along = dot(d, dv) / r;
    f += (kn * (1.0 - r / s2) - cn * along) / r;
  }
  return d * f;
}`;

// ---------- 起始的松散碎石云 ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 在一个大一圈的球里随机撒 n 颗互不重叠的颗粒（堆积率约 0.3）。之后让它在自身引力下聚拢，得到随机密堆。
export function looseCloud(n, seed = 7) {
  const rand = mulberry32(seed),
    s = MOON_RADIUS * (FILL / n) ** (1 / 3),
    radius = MOON_RADIUS * (FILL / 0.3) ** (1 / 3),
    cell = 2 * s,
    grid = new Map(),
    out = new Float64Array(3 * n);
  const key = (i, j, k) => i * 73856093 + j * 19349663 + k * 83492791;
  let count = 0,
    tries = 0;
  while (count < n) {
    if (++tries > n * 4000) throw new Error('looseCloud: could not place particles');
    const x = (rand() * 2 - 1) * radius,
      y = (rand() * 2 - 1) * radius,
      z = (rand() * 2 - 1) * radius;
    if (x * x + y * y + z * z > (radius - s) ** 2) continue;
    const ci = Math.floor(x / cell),
      cj = Math.floor(y / cell),
      ck = Math.floor(z / cell);
    let free = true;
    for (let i = ci - 1; free && i <= ci + 1; i++)
      for (let j = cj - 1; free && j <= cj + 1; j++)
        for (let k = ck - 1; free && k <= ck + 1; k++)
          for (const p of grid.get(key(i, j, k)) || []) {
            const dx = out[p] - x,
              dy = out[p + 1] - y,
              dz = out[p + 2] - z;
            if (dx * dx + dy * dy + dz * dz < cell * cell) {
              free = false;
              break;
            }
          }
    if (!free) continue;
    const at = 3 * count++;
    out[at] = x;
    out[at + 1] = y;
    out[at + 2] = z;
    const id = key(ci, cj, ck);
    if (!grid.has(id)) grid.set(id, []);
    grid.get(id).push(at);
  }
  return out;
}

// ---------- CPU 参考积分（双精度） ----------
// 状态：x、v 是长度 3n 的数组，alive[i] = 0 表示已经落到行星上。
export function createState(n) {
  return {
    n,
    x: new Float64Array(3 * n),
    v: new Float64Array(3 * n),
    alive: new Uint8Array(n).fill(1),
    near: new Uint8Array(n).fill(12), // 每颗有几个挨着的邻居（最近一步）
  };
}

// 蛙跳（先踢后漂）：v += a(x, v)·dt，x += v·dt。成对的力大小相等方向相反，总动量和对行星的总角动量守恒。
// planet = false 用来在放进轨道之前让碎石聚拢；settle 是聚拢时额外的整体阻尼。
// drag 是示意用的轨道衰减：a −= drag · v，让整颗卫星慢慢螺旋向内（真实的潮汐衰减要几千万年）。
export function advance(state, params, steps, { planet = true, settle = 0, drag = 0 } = {}) {
  const { n, x, v, alive, near } = state,
    { s, mp, kn, cn, dt } = params,
    s2 = 2 * s,
    s2sq = s2 * s2,
    g0 = -mp / (s2sq * s2),
    nearSq = (NEAR_RANGE * s) ** 2,
    a = new Float64Array(3 * n);
  for (let step = 0; step < steps; step++) {
    a.fill(0);
    near.fill(0);
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const i3 = 3 * i,
        xi = x[i3],
        yi = x[i3 + 1],
        zi = x[i3 + 2];
      if (planet) {
        const r2 = xi * xi + yi * yi + zi * zi,
          f = -1 / (r2 * Math.sqrt(r2));
        a[i3] += xi * f;
        a[i3 + 1] += yi * f;
        a[i3 + 2] += zi * f;
      }
      for (let j = i + 1; j < n; j++) {
        if (!alive[j]) continue;
        const j3 = 3 * j,
          dx = xi - x[j3],
          dy = yi - x[j3 + 1],
          dz = zi - x[j3 + 2],
          r2 = dx * dx + dy * dy + dz * dz;
        if (r2 < nearSq) {
          if (near[i] < 255) near[i]++;
          if (near[j] < 255) near[j]++;
        }
        let f;
        if (r2 >= s2sq) f = -mp / (r2 * Math.sqrt(r2));
        else {
          const r = Math.sqrt(r2);
          f = g0;
          if (r > 1e-9) {
            const along =
              (dx * (v[i3] - v[j3]) + dy * (v[i3 + 1] - v[j3 + 1]) + dz * (v[i3 + 2] - v[j3 + 2])) /
              r;
            f += (kn * (1 - r / s2) - cn * along) / r;
          }
        }
        a[i3] += dx * f;
        a[i3 + 1] += dy * f;
        a[i3 + 2] += dz * f;
        a[j3] -= dx * f;
        a[j3 + 1] -= dy * f;
        a[j3 + 2] -= dz * f;
      }
    }
    const keep = 1 - settle;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const i3 = 3 * i;
      for (let c = 0; c < 3; c++) {
        v[i3 + c] = (v[i3 + c] + (a[i3 + c] - drag * v[i3 + c]) * dt) * keep;
        x[i3 + c] += v[i3 + c] * dt;
      }
      if (planet && x[i3] ** 2 + x[i3 + 1] ** 2 + x[i3 + 2] ** 2 < 1) {
        alive[i] = 0; // 落到行星上：不再参与受力
        v[i3] = v[i3 + 1] = v[i3 + 2] = 0;
      }
    }
  }
  return state;
}

// 聚拢后的碎石堆：以质心为原点的相对位置、量到的等效半径（均匀球 r = √(5/3 ⟨r²⟩)）和每颗的相对深度。
export function measurePile(rel, n) {
  const c = [0, 0, 0];
  for (let i = 0; i < 3 * n; i++) c[i % 3] += rel[i] / n;
  const pos = new Float64Array(3 * n),
    depth = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let r2 = 0;
    for (let k = 0; k < 3; k++) {
      pos[3 * i + k] = rel[3 * i + k] - c[k];
      r2 += pos[3 * i + k] ** 2;
    }
    depth[i] = Math.sqrt(r2);
    sum += r2;
  }
  const rEff = Math.sqrt(((5 / 3) * sum) / n);
  for (let i = 0; i < n; i++) depth[i] = Math.min(1, depth[i] / rEff);
  return { n, pos, rEff, depth };
}

export const SETTLE_TIME = 9; // 聚拢用的时间（q = 1 的单位；自由下落时间约 1）
export const SETTLE_DAMP = 0.004;

// CPU 上从松散云聚拢出一个碎石堆。平衡形状与 q 无关，所以固定用 q = 1。
export function settlePile(n, seed = 7) {
  const state = createState(n);
  state.x.set(looseCloud(n, seed));
  const params = pileParams(n, 1);
  advance(state, params, Math.ceil(SETTLE_TIME / params.dt), { planet: false, settle: SETTLE_DAMP });
  return measurePile(state.x, n);
}

// 把碎石堆放到半径 d、相位 phase 的圆轨道上，同步自转（潮汐锁定）：每颗的速度都是绕行星的刚性转动。
// 经典的流体洛希极限说的就是这种卫星。
export function placeOnOrbit(pile, d, phase = 0, state = createState(pile.n)) {
  const rate = orbitalRate(d),
    cos = Math.cos(phase),
    sin = Math.sin(phase);
  for (let i = 0; i < pile.n; i++) {
    const i3 = 3 * i,
      // 碎石堆跟着相位一起转，保证同一面朝向行星
      px = pile.pos[i3] * cos - pile.pos[i3 + 2] * sin + d * cos,
      py = pile.pos[i3 + 1],
      pz = pile.pos[i3] * sin + pile.pos[i3 + 2] * cos + d * sin;
    state.x[i3] = px;
    state.x[i3 + 1] = py;
    state.x[i3 + 2] = pz;
    // 绕 −y 转（和展品 01 的盘同向）：v = rate · (z, 0, −x)
    state.v[i3] = rate * pz;
    state.v[i3 + 1] = 0;
    state.v[i3 + 2] = -rate * px;
    state.alive[i] = 1;
    state.near[i] = 12;
  }
  return state;
}

// ---------- 冰尘（示意） ----------
// 每颗碎石带着 per 粒细小的冰尘。碎石还在群里时，冰尘贴着它；碎石离群（挨着的邻居少于 FREE_BELOW）以后，
// 冰尘散开，此后只受行星引力，各走各的开普勒轨道。它们不参与碎石之间的受力，只用来把环画得连续。
// 标记：x 的第 4 个分量 0 = 贴着碎石，1 = 已散开，2 = 落到行星上。显卡上是同一套规则（sim.js 的 DUST_FRAGMENT）。
export function createDust(n, per, seed = 11) {
  const rand = mulberry32(seed),
    total = n * per,
    inSphere = (out, at) => {
      const z = 2 * rand() - 1,
        angle = 2 * Math.PI * rand(),
        ring = Math.sqrt(1 - z * z),
        radius = Math.cbrt(rand());
      out[at] = ring * Math.cos(angle) * radius;
      out[at + 1] = z * radius;
      out[at + 2] = ring * Math.sin(angle) * radius;
    },
    dust = {
      total,
      per,
      offset: new Float32Array(3 * total),
      scatter: new Float32Array(3 * total),
      x: new Float32Array(4 * total),
      v: new Float32Array(4 * total),
    };
  for (let i = 0; i < total; i++) {
    inSphere(dust.offset, 3 * i);
    inSphere(dust.scatter, 3 * i);
  }
  return dust;
}
export function advanceDust(dust, state, params, steps) {
  const { total, per, offset, scatter, x, v } = dust,
    { dt, spread, kick } = params;
  for (let i = 0; i < total; i++) {
    const at = 4 * i,
      i3 = 3 * i;
    if (x[at + 3] > 1.5) continue;
    if (x[at + 3] < 0.5) {
      const parent = Math.floor(i / per),
        p3 = 3 * parent,
        release = state.near[parent] < FREE_BELOW;
      for (let k = 0; k < 3; k++) {
        x[at + k] = state.x[p3 + k] + offset[i3 + k] * spread;
        v[at + k] = state.v[p3 + k] + (release ? scatter[i3 + k] * kick : 0);
      }
      x[at + 3] = !state.alive[parent] ? 2 : release ? 1 : 0;
      continue;
    }
    for (let step = 0; step < steps; step++) {
      const r2 = x[at] ** 2 + x[at + 1] ** 2 + x[at + 2] ** 2,
        f = -dt / (r2 * Math.sqrt(r2));
      for (let k = 0; k < 3; k++) {
        v[at + k] += x[at + k] * f;
        x[at + k] += v[at + k] * dt;
      }
      if (x[at] ** 2 + x[at + 1] ** 2 + x[at + 2] ** 2 < 1) {
        x[at + 3] = 2;
        break;
      }
    }
  }
  return dust;
}

// 圆轨道上经过 time 之后的位置：绕 −y 转过 d^-1.5 · time。用来在两次读数之间预测卫星走到了哪里。
export function coast(center, time) {
  const angle = orbitalRate(Math.hypot(center[0], center[1], center[2])) * time,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  return [center[0] * cos + center[2] * sin, center[1], center[2] * cos - center[0] * sin];
}

// 还聚在一起的那一团：从预测的中心出发，数希尔球以内的颗粒，更新中心和质量，迭代几次。
// x 可以是步长 3 的双精度数组，也可以是从 GPU 读回的步长 4 的数组（第 4 个分量是 alive）。
// 第一遍的搜索半径不小于「还剩一成质量」时的希尔半径，免得预测稍有偏差就跟丢。
export function boundClump(x, n, mp, guess, { stride = 3, alive = null } = {}) {
  let center = guess.center.slice(),
    count = Math.max(guess.count, 0.1 * n);
  for (let pass = 0; pass < 5; pass++) {
    const radius = hillRadius(Math.hypot(center[0], center[1], center[2]), count * mp),
      sum = [0, 0, 0];
    let inside = 0;
    for (let i = 0; i < n; i++) {
      const at = stride * i;
      if (alive ? !alive[i] : stride === 4 && x[at + 3] < 0.5) continue;
      const dx = x[at] - center[0],
        dy = x[at + 1] - center[1],
        dz = x[at + 2] - center[2];
      if (dx * dx + dy * dy + dz * dz < radius * radius) {
        inside++;
        sum[0] += x[at];
        sum[1] += x[at + 1];
        sum[2] += x[at + 2];
      }
    }
    if (!inside) return { center, count: 0, radius };
    center = sum.map((value) => value / inside);
    count = inside;
  }
  return { center, count, radius: hillRadius(Math.hypot(...center), count * mp) };
}
