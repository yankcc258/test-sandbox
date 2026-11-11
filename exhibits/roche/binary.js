// 双行星洛希模型的物理核心（猫猫）。画面、CPU 回退和 scripts/check-roche-binary.mjs 都用这一份。
// 两颗行星绕共同质心做圆轨道，彼此潮汐锁定。单位：两星中心的间距 a = 1，G(M_A + M_B) = 1，所以轨道角速度是 1、周期是 2π。
// μ = M_B / (M_A + M_B)。跟着两星一起转的坐标（共转系）：u 沿 A→B 连线，w 在轨道面内垂直于连线，h 垂直轨道面。
// A 在 u = −μ，B 在 u = 1 − μ。惯性系里轨道面是 x–z，轴是 y（和展品 01 一致）。

// 共转系里的有效势（取正号的习惯写法）：两星的引力势加离心势。行星表面、洛希瓣、碎屑能去哪里，都由它的等值面决定。
export function roche(u, w, h, mu) {
  const ra = Math.hypot(u + mu, w, h),
    rb = Math.hypot(u - 1 + mu, w, h);
  return 0.5 * (u * u + w * w) + (1 - mu) / ra + mu / rb;
}
export function rocheGradient(u, w, h, mu) {
  const ra = Math.hypot(u + mu, w, h),
    rb = Math.hypot(u - 1 + mu, w, h),
    a = (1 - mu) / ra ** 3,
    b = mu / rb ** 3;
  return [u - a * (u + mu) - b * (u - 1 + mu), w - (a + b) * w, -(a + b) * h];
}

// 着色器里的同一个势。q = (u, h, w)：第二个分量是垂直轨道面的方向，和世界坐标的 y 对上。
export const ROCHE_GLSL = `
float roche(vec3 q, float mu) {
  float ra = length(q + vec3(mu, 0.0, 0.0)), rb = length(q - vec3(1.0 - mu, 0.0, 0.0));
  return 0.5 * (q.x * q.x + q.z * q.z) + (1.0 - mu) / ra + mu / rb;
}
vec3 rocheGradient(vec3 q, float mu) {
  vec3 da = q + vec3(mu, 0.0, 0.0), db = q - vec3(1.0 - mu, 0.0, 0.0);
  float ra = length(da), rb = length(db);
  return vec3(q.x, 0.0, q.z) - (1.0 - mu) * da / (ra * ra * ra) - mu * db / (rb * rb * rb);
}`;

const bisect = (f, lo, hi) => {
  let flo = f(lo);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2,
      fm = f(mid);
    if (flo * fm <= 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
};

// 五个拉格朗日点。L1 在两星之间，L2 在 B 外侧，L3 在 A 外侧（连线上有效势的三个驻点）；L4 / L5 和两星成等边三角形。
export function lagrange(mu) {
  const slope = (u) => rocheGradient(u, 0, 0, mu)[0],
    eps = 1e-6,
    L1 = bisect(slope, -mu + eps, 1 - mu - eps),
    L2 = bisect(slope, 1 - mu + eps, 3),
    L3 = bisect(slope, -3, -mu - eps);
  return {
    L1,
    L2,
    L3,
    L4: [0.5 - mu, Math.sqrt(3) / 2],
    L5: [0.5 - mu, -Math.sqrt(3) / 2],
    C1: roche(L1, 0, 0, mu),
    C2: roche(L2, 0, 0, mu),
    C3: roche(L3, 0, 0, mu),
  };
}

// 一颗行星的形状：有效势的一个等值面。fill 说的是「朝向对方的尖端伸到了 L1 的几成」：
// fill = 1 时尖端正好碰到 L1（充满洛希瓣，再近就开始向对方流失物质）。
export function planetShape(mu, which, fill, points = lagrange(mu)) {
  const center = which === 'A' ? -mu : 1 - mu,
    toward = which === 'A' ? 1 : -1, // 朝向对方的方向
    reach = Math.abs(points.L1 - center),
    tip = center + toward * fill * reach,
    level = roche(tip, 0, 0, mu),
    // 背向对方的那一端：同一个等值面和连线的另一个交点
    far = which === 'A' ? points.L3 : points.L2,
    back = bisect((u) => roche(u, 0, 0, mu) - level, center - toward * 1e-6, far),
    // 垂直连线方向的半宽（轨道面内）和极向半高
    side = bisect((s) => roche(center, s, 0, mu) - level, 1e-6, reach * 1.5),
    pole = bisect((s) => roche(center, 0, s, mu) - level, 1e-6, reach * 1.5);
  return { which, center, toward, reach, tip, back, level, side, pole, fill };
}

// 等值面围住的体积换算成等体积球的半径（用来算密度和周期）。沿连线切片，每一片的截面用极坐标求。
export function volumeRadius(mu, shape, slices = 96) {
  const lo = Math.min(shape.tip, shape.back),
    hi = Math.max(shape.tip, shape.back);
  let volume = 0;
  for (let i = 0; i < slices; i++) {
    const u = lo + ((i + 0.5) / slices) * (hi - lo);
    let area = 0;
    for (let k = 0; k < 24; k++) {
      const angle = ((k + 0.5) / 24) * Math.PI * 2,
        cos = Math.cos(angle),
        sin = Math.sin(angle);
      if (roche(u, 1e-7 * cos, 1e-7 * sin, mu) < shape.level) continue;
      const r = bisect(
        (s) => roche(u, s * cos, s * sin, mu) - shape.level,
        1e-7,
        shape.reach * 1.6,
      );
      area += 0.5 * r * r * ((Math.PI * 2) / 24);
    }
    volume += (area * (hi - lo)) / slices;
  }
  return Math.cbrt((3 * volume) / (4 * Math.PI));
}

// Eggleton (1983) 的洛希瓣等体积半径近似，q 是这颗星与另一颗的质量比。用来和上面的数值体积对照。
export function eggleton(q) {
  const p = q ** (2 / 3);
  return (0.49 * p) / (0.6 * p + Math.log(1 + Math.cbrt(q)));
}

// 轨道周期（小时）。间距取成 1 以后，周期只由密度和形状决定：
// M_B = ρ_B · (4/3)π (r_B a)³，G(M_A + M_B) = G M_B / μ，P = 2π √(a³ / G M_total) —— a 消掉了。
export function periodHours(mu, radiusB, densityB) {
  const G = 6.674e-8; // cgs
  return (2 * Math.PI * Math.sqrt(mu / (G * densityB * (4 / 3) * Math.PI * radiusB ** 3))) / 3600;
}

// ---------- 惯性系 ↔ 共转系 ----------
// 相位 θ 时连线方向是 e1 = (cos θ, 0, sin θ)，e2 = (−sin θ, 0, cos θ)。θ 以角速度 1 增加。
export const axes = (theta) => {
  const c = Math.cos(theta),
    s = Math.sin(theta);
  return { e1: [c, 0, s], e2: [-s, 0, c] };
};
export const toRotating = (p, theta) => {
  const { e1, e2 } = axes(theta);
  return [p[0] * e1[0] + p[2] * e1[2], p[0] * e2[0] + p[2] * e2[2], p[1]]; // (u, w, h)
};
export const toInertial = ([u, w, h], theta) => {
  const { e1, e2 } = axes(theta);
  return [u * e1[0] + w * e2[0], h, u * e1[2] + w * e2[2]];
};
// 跟着共转系一起转的速度：ω × r，ω 沿 −y
export const corotation = (p) => [-p[2], 0, p[0]];

// ---------- 碎屑：圆型限制性三体问题里的试验粒子 ----------
// 碎屑不算自己的引力，只受两颗行星的引力。在惯性系里积分（先踢后漂），行星的位置由相位给出。
export function accel(p, theta, mu) {
  const { e1 } = axes(theta),
    out = [0, 0, 0];
  for (const [mass, at] of [
    [1 - mu, -mu],
    [mu, 1 - mu],
  ]) {
    const d = [p[0] - at * e1[0], p[1], p[2] - at * e1[2]],
      r = Math.hypot(d[0], d[1], d[2]),
      f = -mass / (r * r * r);
    for (let k = 0; k < 3; k++) out[k] += d[k] * f;
  }
  return out;
}
export function advance(p, v, theta, mu, dt, steps) {
  for (let i = 0; i < steps; i++) {
    const a = accel(p, theta, mu);
    for (let k = 0; k < 3; k++) {
      v[k] += a[k] * dt;
      p[k] += v[k] * dt;
    }
    theta += dt;
  }
  return theta;
}
// 雅可比常数：C = 2Ω − |共转系里的速度|²。它守恒，并且规定了碎屑能到哪里：
// 只能待在 2Ω ≥ C 的地方。C 高于 2·C1 的碎屑被关在某一颗行星的洛希瓣里，过不了 L1。
export function jacobi(p, v, theta, mu) {
  const [u, w, h] = toRotating(p, theta),
    spin = corotation(p),
    rel = [v[0] - spin[0], v[1] - spin[1], v[2] - spin[2]];
  return 2 * roche(u, w, h, mu) - (rel[0] ** 2 + rel[1] ** 2 + rel[2] ** 2);
}

export const PARTICLE_GLSL = `
// 两颗行星对一粒碎屑的引力。e1 是此刻 A→B 的方向。
vec3 pull(vec3 p, vec3 e1, float mu) {
  vec3 da = p + mu * e1, db = p - (1.0 - mu) * e1;
  float ra = length(da), rb = length(db);
  return -(1.0 - mu) * da / (ra * ra * ra) - mu * db / (rb * rb * rb);
}`;
