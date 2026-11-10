// 轨道平面内的 Binet 积分。φ 是光线沿轨道走过的角度，不是盘绕 +y 的方位角。
// u = 1/r，w = du/dφ；w² + u² - u³ = 1/b²。逃逸边界 u=0 就是无穷远。
// 画质只调像素采样；所有设备使用同样的轨道精度，避免改变阴影的物理形状。
export const ORBIT_STEP = 0.025;
export const ORBIT_MAX_STEPS = 1024;
export const DISK_TIME_SCALE = 2.2; // 纹理的演示时间倍率，不进入频移公式

export function orbitStep([u, w], h) {
  const deriv = ([x, y]) => [y, 1.5 * x * x - x];
  const add = (a, b, s) => a.map((x, i) => x + b[i] * s);
  const s = [u, w],
    a = deriv(s),
    b = deriv(add(s, a, h / 2)),
    c = deriv(add(s, b, h / 2)),
    d = deriv(add(s, c, h));
  return s.map((x, i) => x + (h / 6) * (a[i] + 2 * b[i] + 2 * c[i] + d[i]));
}

// GLSL 的同一 RK4；浏览器测试还会把实际 GPU 的终点与解析阴影、JS 积分比对。
export const ORBIT_GLSL = `
vec2 orbitDerivative(vec2 s) { return vec2(s.y, 1.5 * s.x * s.x - s.x); }
vec2 orbitStep(vec2 s, float h) {
  vec2 a = orbitDerivative(s);
  vec2 b = orbitDerivative(s + 0.5 * h * a);
  vec2 c = orbitDerivative(s + 0.5 * h * b);
  vec2 d = orbitDerivative(s + h * c);
  return s + h / 6.0 * (a + 2.0 * b + 2.0 * c + d);
}
float escapeStep(vec2 s, float h) {
  float t = clamp(-s.x / s.y, 0.0, h);
  for (int j = 0; j < 3; j++) {
    vec2 at = orbitStep(s, t);
    t = clamp(t - at.x / at.y, 0.0, h);
  }
  return t;
}`;

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (a) => {
  const r = Math.hypot(...a);
  return a.map((x) => x / r);
};
export const orbitalDirection = (radial, tangent, phi) =>
  radial.map((x, i) => x * Math.cos(phi) + tangent[i] * Math.sin(phi));

export function observerOrbit(camera, direction) {
  const r = Math.hypot(...camera),
    radial = norm(camera),
    n = norm(direction);
  const nr = dot(n, radial),
    transverse = n.map((x, i) => x - nr * radial[i]);
  const nt = Math.hypot(...transverse),
    lapse = Math.sqrt(1 - 1 / r);
  return {
    radial,
    tangent: nt > 1e-8 ? norm(transverse) : [0, 0, 0],
    nr,
    nt,
    b: (r * nt) / lapse,
    // u' = -v_r/h；本地径向分量换为坐标分量时乘 lapse。
    state: [1 / r, nt > 1e-8 ? (-nr * lapse) / (r * nt) : 0],
    // 光线是反向追踪的；真实光子的角动量需要反号。
    lz: -(camera[2] * n[0] - camera[0] * n[2]) / lapse,
  };
}

export function traceObserverRay(
  camera,
  direction,
  { disk = true, step = ORBIT_STEP, maxSteps = ORBIT_MAX_STEPS } = {},
) {
  const ray = observerOrbit(camera, direction);
  if (ray.nt < 1e-8)
    return {
      status: ray.nr < 0 ? 'captured' : 'escaped',
      direction: norm(direction),
      steps: 0,
      phi: 0,
    };
  const { radial, tangent } = ray;
  let state = ray.state,
    phi = 0;
  let crossing = Math.atan2(-radial[1], tangent[1]);
  if (crossing <= 1e-7) crossing += Math.PI;
  if (!disk || Math.hypot(radial[1], tangent[1]) < 1e-6) crossing = Infinity;
  for (let i = 0; i < maxSteps; i++) {
    const h = Math.min(step, crossing - phi),
      next = orbitStep(state, h);
    if (next[0] >= 1) return { status: 'captured', steps: i + 1, phi: phi + h };
    if (next[0] <= 0) {
      let t = Math.max(0, Math.min(h, -state[0] / state[1]));
      for (let j = 0; j < 3; j++) {
        const at = orbitStep(state, t);
        t = Math.max(0, Math.min(h, t - at[0] / at[1]));
      }
      return {
        status: 'escaped',
        direction: orbitalDirection(radial, tangent, phi + t),
        steps: i + 1,
        phi: phi + t,
      };
    }
    phi += h;
    state = next;
    if (phi >= crossing - 1e-6) {
      const r = 1 / state[0];
      if (r >= 3 && r <= 12)
        return {
          status: 'disk',
          radius: r,
          position: orbitalDirection(radial, tangent, phi).map((x) => x * r),
          lz: ray.lz,
          steps: i + 1,
          phi,
        };
      crossing += Math.PI;
    }
  }
  // 保留未收敛这个状态，测试不能把预算耗尽当成落入视界。
  return { status: 'unresolved', steps: maxSteps, phi };
}

// 盘绕 +y 旋转；物质速度 ∝ (z, 0, -x)，纹理取样要用逆变换。
export function diskTexturePoint([x, , z], angle) {
  return [Math.cos(angle) * x - Math.sin(angle) * z, Math.sin(angle) * x + Math.cos(angle) * z];
}
