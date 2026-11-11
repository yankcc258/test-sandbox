// 探测器第一视角。自选可验算的捕获轨道，参考 NASA 的绕行 / 坠入体验，非原片轨迹数据。
// r_s=c=1，E=1，L 略小于抛物捕获临界值 2；轨道不靠手工圆周动画拼接。
import { orbitStep, orbitalDirection, ORBIT_STEP, ORBIT_MAX_STEPS } from './orbit.js?v=2';
export const FLIGHT_E = 1;
export const FLIGHT_L = 1.9999;
export const FLIGHT_END = 0.2;
export const FLIGHT_MASS = 4.3e6;
export const FLIGHT_DURATION = 72;
export const radialVelocity = (r, E = FLIGHT_E, L = FLIGHT_L) =>
  -Math.sqrt(Math.max(0, E * E - (1 - 1 / r) * (1 + (L * L) / (r * r))));

export function fallingFrame(r, ur, L, E = 1) {
  const flow = Math.sqrt(1 / r),
    B = 1 + (L * L) / (r * r);
  // γ = (E+flow·ur)/(1−1/r)，有理化后在视界处不出现 0/0。
  const gamma = (E * E + flow * flow * B) / (E - flow * ur);
  return { gamma, radial: ur / gamma + flow, tangent: L / (r * gamma) };
}

export function buildFlight({ L = FLIGHT_L, step = 0.01, start = 18, end = FLIGHT_END } = {}) {
  let r = start,
    phi = 0,
    tau = 0;
  const samples = [{ r, phi, tau }];
  const f = ([r]) => [radialVelocity(r, 1, L), L / (r * r)];
  const add = (a, b, h) => a.map((x, i) => x + h * b[i]);
  for (let i = 0; i < 50000 && r > end; i++) {
    const h = Math.min(
      step * Math.max(r, 0.15),
      (0.2 * (r - end)) / Math.max(0.001, -radialVelocity(r, 1, L)) + 1e-7,
    );
    const s = [r, phi],
      a = f(s),
      b = f(add(s, a, h / 2)),
      c = f(add(s, b, h / 2)),
      d = f(add(s, c, h));
    [r, phi] = s.map((x, j) => x + (h / 6) * (a[j] + 2 * b[j] + 2 * c[j] + d[j]));
    tau += h;
    samples.push({ r, phi, tau });
  }
  if (r > end) throw new Error('Probe trajectory did not reach the endpoint');
  return samples;
}

export function sampleAtTime(samples, tau) {
  let lo = 0,
    hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (hi + lo) >> 1;
    if (samples[mid].tau < tau) lo = mid;
    else hi = mid;
  }
  const a = samples[lo],
    b = samples[hi],
    t = Math.max(0, Math.min(1, (tau - a.tau) / (b.tau - a.tau)));
  return {
    r: a.r + (b.r - a.r) * t,
    phi: a.phi + (b.phi - a.phi) * t,
    tau: a.tau + (b.tau - a.tau) * t,
  };
}
export function timeAtRadius(samples, radius) {
  let lo = 0,
    hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (hi + lo) >> 1;
    if (samples[mid].r > radius) lo = mid;
    else hi = mid;
  }
  const a = samples[lo],
    b = samples[hi],
    t = (radius - a.r) / (b.r - a.r);
  return a.tau + (b.tau - a.tau) * Math.max(0, Math.min(1, t));
}
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (a) => {
  const n = Math.hypot(...a);
  return a.map((x) => x / n);
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function flightTime(samples, progress) {
  // 单调三次 Hermite 时间映射：保留检查点，连接处速度连续，内部段慢放。
  const anchors = [
    [0, 0],
    [0.3, timeAtRadius(samples, 3)],
    [0.72, timeAtRadius(samples, 1.7)],
    [0.88, timeAtRadius(samples, 1)],
    [1, samples.at(-1).tau],
  ];
  progress = Math.max(0, Math.min(1, progress));
  const h = anchors.slice(1).map((a, i) => a[0] - anchors[i][0]);
  const delta = h.map((x, i) => (anchors[i + 1][1] - anchors[i][1]) / x);
  const slopes = [delta[0]];
  for (let j = 1; j < anchors.length - 1; j++) {
    const w1 = 2 * h[j] + h[j - 1],
      w2 = h[j] + 2 * h[j - 1];
    slopes.push((w1 + w2) / (w1 / delta[j - 1] + w2 / delta[j]));
  }
  slopes.push(delta.at(-1));
  let i = 0;
  while (i < anchors.length - 2 && progress > anchors[i + 1][0]) i++;
  const [p0, t0] = anchors[i],
    [p1, t1] = anchors[i + 1];
  const x = (progress - p0) / (p1 - p0),
    x2 = x * x,
    x3 = x2 * x;
  return (
    (2 * x3 - 3 * x2 + 1) * t0 +
    (x3 - 2 * x2 + x) * h[i] * slopes[i] +
    (-2 * x3 + 3 * x2) * t1 +
    (x3 - x2) * h[i] * slopes[i + 1]
  );
}

export function flightCamera(samples, progress, yaw = 0, pitch = 0) {
  progress = Math.max(0, Math.min(1, progress));
  const s = sampleAtTime(samples, flightTime(samples, progress));
  const a = (10 * Math.PI) / 180,
    radial = [Math.cos(a) * Math.cos(s.phi), Math.sin(a) * Math.cos(s.phi), Math.sin(s.phi)],
    tangent = [-Math.cos(a) * Math.sin(s.phi), -Math.sin(a) * Math.sin(s.phi), Math.cos(s.phi)];
  const ur = radialVelocity(s.r),
    frame = fallingFrame(s.r, ur, FLIGHT_L),
    cam = radial.map((x) => x * s.r);
  const beta = radial.map((x, j) => frame.radial * x + frame.tangent * tangent[j]);
  const forward = norm(radial.map((x, j) => ur * x + (FLIGHT_L / s.r) * tangent[j]));
  const axis = [-Math.sin(a), Math.cos(a), 0],
    side = norm(cross(forward, axis));
  // 主动转向的摄影机：绕行时稍向外看，坠入段平滑回望仍可抵达的外部光。
  // 只改变取景，不改变测地线或相机速度；用户转头叠加在此基础上。
  const smooth = (a, b) => {
    const t = Math.max(0, Math.min(1, (progress - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const heading = 0.45 * (1 - smooth(0, 0.3)) - 0.55 * smooth(0.12, 0.6) - 1.1 * smooth(0.72, 1);
  const directed = forward.map((x, j) => Math.cos(heading) * x + Math.sin(heading) * side[j]);
  const sideView = norm(cross(directed, axis)),
    vertical = cross(sideView, directed);
  // 摄影机滚转把视野中的外部天空置于上方；这是取景，不是陀螺仪姿态。
  const roll = (Math.PI / 2) * (0.8 * smooth(0.12, 0.42) + 0.2 * smooth(0.72, 0.95));
  const screenRight = sideView.map((x, j) => Math.cos(roll) * x + Math.sin(roll) * vertical[j]);
  const screenUp = vertical.map((x, j) => Math.cos(roll) * x - Math.sin(roll) * sideView[j]);
  // 用户转头在屏幕标架中施加，滚转后水平拖动仍然沿屏幕水平方向。
  const horizontal = directed.map((x, j) => Math.cos(yaw) * x + Math.sin(yaw) * screenRight[j]);
  const right = screenRight.map((x, j) => Math.cos(yaw) * x - Math.sin(yaw) * directed[j]);
  const fwd = horizontal.map((x, j) => Math.cos(pitch) * x + Math.sin(pitch) * screenUp[j]);
  const up = screenUp.map((x, j) => Math.cos(pitch) * x - Math.sin(pitch) * horizontal[j]);
  const lens = 0.78 + 0.18 * smooth(0.12, 0.45) - 0.25 * smooth(0.85, 1);
  return { ...s, cam, radial, tangent, ur, beta, gamma: frame.gamma, fwd, right, up, roll, lens };
}

// 相机过去指向的零矢量 (-1,n) 先 Lorentz boost 到自由落体 PG 正交标架。
// PG 度规 ds²=-dT²+(dr+√(1/r)dT)²+r²dΩ²，视界处规则。
export function probePhoton(camera, direction, beta, gamma) {
  const r = Math.hypot(...camera),
    radial = norm(camera),
    n = norm(direction),
    b2 = dot(beta, beta),
    bn = dot(beta, n);
  const kt = gamma * (-1 + bn),
    factor = b2 > 1e-12 ? ((gamma - 1) * bn) / b2 - gamma : 0;
  const spatial = n.map((x, i) => x + factor * beta[i]),
    sr = dot(spatial, radial),
    flow = Math.sqrt(1 / r);
  const kr = sr - flow * kt,
    transverse = spatial.map((x, i) => x - sr * radial[i]),
    nt = Math.hypot(...transverse);
  const energy = -kt + flow * sr,
    ly = -(camera[2] * spatial[0] - camera[0] * spatial[2]);
  return {
    radial,
    tangent: nt > 1e-8 ? norm(transverse) : [0, 0, 0],
    nt,
    kr,
    kt,
    spatial,
    energy,
    ly,
    state: [1 / r, nt > 1e-8 ? -kr / (r * nt) : 0],
  };
}

// CPU 参考：供实际 GPU 分类、盘交点与步长收敛检查。
export function traceProbeRay(
  camera,
  direction,
  beta,
  gamma,
  { disk = true, step = ORBIT_STEP, maxSteps = ORBIT_MAX_STEPS } = {},
) {
  const ray = probePhoton(camera, direction, beta, gamma);
  if (ray.energy <= 0) return { status: 'captured' };
  const r0 = Math.hypot(...camera);
  if (r0 <= 1.5 && r0 * ray.nt > Math.sqrt(27 / 4) * ray.energy) return { status: 'captured' };
  if (ray.nt < 1e-7) return { status: ray.kr < 0 ? 'captured' : 'escaped', direction: ray.radial };
  let s = ray.state,
    phi = 0,
    exterior = Math.hypot(...camera) >= 1;
  let crossing = Math.atan2(-ray.radial[1], ray.tangent[1]);
  if (crossing <= 1e-7) crossing += Math.PI;
  if (!disk || Math.hypot(ray.radial[1], ray.tangent[1]) < 1e-6) crossing = Infinity;
  for (let i = 0; i < maxSteps; i++) {
    const h = Math.min(step / Math.max(1, s[0]), crossing - phi),
      next = orbitStep(s, h);
    if (exterior && next[0] >= 1) return { status: 'captured' };
    if (next[0] < 1) exterior = true;
    if (next[0] <= 0) {
      let t = Math.max(0, Math.min(h, -s[0] / s[1]));
      for (let j = 0; j < 3; j++) {
        const at = orbitStep(s, t);
        t = Math.max(0, Math.min(h, t - at[0] / at[1]));
      }
      return { status: 'escaped', direction: orbitalDirection(ray.radial, ray.tangent, phi + t) };
    }
    phi += h;
    s = next;
    if (phi >= crossing - 1e-6) {
      const r = 1 / s[0];
      if (r >= 3 && r <= 12)
        return {
          status: 'disk',
          radius: r,
          g: Math.sqrt(1 - 1.5 / r) / (ray.energy - Math.sqrt(0.5 / r ** 3) * ray.ly),
        };
      crossing += Math.PI;
    }
  }
  return { status: 'unresolved' };
}
