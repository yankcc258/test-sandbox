// 史瓦西黑洞里光线怎么走（露娜）。单位：史瓦西半径 r_s = 2GM/c² = 1。
//
// 史瓦西度规下，光子的轨道在一个平面里，令 u = 1/r，轨道方程是
//     d²u/dφ² + u = (3/2) r_s u²                                   （Binet 形式）
// 右边那一项就是广义相对论多出来的；没有它，解是一条直线。
// 二维示意图与独立参考检查把它写成三维直角坐标的加速度形式：
//     d²x/dλ² = -(3/2) r_s h² x / r⁵ ，  h = |x × dx/dλ|（守恒）
// 用 Binet 公式可以验证这个力给出的轨道形状正好满足上面的方程（和初速度大小无关，只和方向有关）。
// 页面上的三维画面（shader.js）和下面二维的示意图用的是同一个方程；scripts/check-schwarzschild.mjs 拿它核对
// 弱场偏折角 2r_s/b、临界瞄准距离 (3√3/2) r_s 和光子球 1.5 r_s。
export const RS = 1;
export const PHOTON_SPHERE = 1.5 * RS; // 光子能绕圈的半径（不稳定）
export const ISCO = 3 * RS; // 有质量物体最内的稳定圆轨道，吸积盘的内边缘
export const B_CRIT = ((3 * Math.sqrt(3)) / 2) * RS; // 临界瞄准距离：比它小的光线掉进去；远处看到的阴影半径

// 一步（速度 Verlet）。p = [x, y, z]，v = [vx, vy, vz]，h2 = |p × v|²（整条光线不变，调用的人算一次）
export function step(p, v, h2, dt) {
  const acc = (q) => {
    const r2 = q[0] * q[0] + q[1] * q[1] + q[2] * q[2],
      k = (-1.5 * RS * h2) / (r2 * r2 * Math.sqrt(r2));
    return [q[0] * k, q[1] * k, q[2] * k];
  };
  const a0 = acc(p);
  for (let i = 0; i < 3; i++) v[i] += a0[i] * dt * 0.5;
  for (let i = 0; i < 3; i++) p[i] += v[i] * dt;
  const a1 = acc(p);
  for (let i = 0; i < 3; i++) v[i] += a1[i] * dt * 0.5;
}
// 笛卡尔参考积分的步长；实时着色器改用 orbit.js 中的角度步长 RK4。
export const stepSize = (r, scale = 1) => Math.min(0.6, Math.max(0.012, 0.1 * (r - 0.6))) * scale;

// 从很远的左边水平射来、瞄准距离 b 的一条光线（在 xy 平面里）。
// 返回 { points, captured, deflection }：points 是轨迹，deflection 是偏折角（弧度，掉进去时为 null）。
export function traceRay(b, { start = 400, far = 400, scale = 0.25, keep = 2 } = {}) {
  const p = [-start, b, 0],
    v = [1, 0, 0],
    h2 = b * b; // |p × v|² = b²
  const points = [[p[0], p[1]]];
  let captured = false,
    n = 0,
    turned = 0, // 方向一共转了多少（绕圈的也算进去，不折回 0–2π）
    heading = 0;
  for (let i = 0; i < 400000; i++) {
    const r = Math.hypot(p[0], p[1]);
    if (r <= RS * 1.001) {
      captured = true;
      break;
    }
    if (r > far && p[0] * v[0] + p[1] * v[1] > 0 && i > 10) break;
    step(p, v, h2, stepSize(r, scale));
    const now = Math.atan2(v[1], v[0]);
    let d = now - heading;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    turned += d;
    heading = now;
    if (++n % keep === 0) points.push([p[0], p[1]]);
  }
  points.push([p[0], p[1]]);
  // 向黑洞弯：b > 0 时方向顺时针转（角度变小），偏折角取正值
  return { points, captured, deflection: captured ? null : -turned * Math.sign(b || 1) };
}
// 弱场近似（到二阶）：α ≈ 2 r_s/b + (15π/16)(r_s/b)²。b 很大时和上面的数值结果应该一致。
export const weakDeflection = (b) => (2 * RS) / b + ((15 * Math.PI) / 16) * (RS / b) ** 2;

// 静止在 r0 的观察者，本地看到的单位方向 n（相对径向的分量 nr、切向分量 nt）对应的坐标方向：
// 径向的本地长度是 dr/√(1 - r_s/r)，所以径向分量要乘 √(1 - r_s/r0)。离得远时几乎没差别，贴近时差很多。
export const radialStretch = (r0) => Math.sqrt(1 - RS / r0);
// 这条光线的瞄准距离 b = L/E：b = r0 sinψ / √(1 - r_s/r0)，ψ 是本地方向和径向的夹角
export const impactParameter = (r0, sinPsi) => (r0 * sinPsi) / radialStretch(r0);
// 从 r0 处静止观察者看，黑洞阴影边缘和径向的夹角 ψ：sinψ = (B_CRIT / r0) √(1 - r_s/r0)（r0 ≥ 1.5 r_s）
export const shadowAngle = (r0) => Math.asin(Math.min(1, (B_CRIT / r0) * radialStretch(r0)));

// 吸积盘上绕圈的气体发出的光，到远处观察者那里频率变成原来的 g 倍（g < 1 变红变暗，g > 1 变蓝变亮）：
//     g = √(1 - 3M/r) / (1 - Ω L_z/E) ，  M = r_s/2，Ω = √(M/r³)
// 分子是引力红移加上横向多普勒，分母是视线方向的多普勒。lz 是光子绕盘轴的角动量 L_z/E（和盘同向为正）。
export function diskShift(r, lz) {
  const M = RS / 2,
    omega = Math.sqrt(M / (r * r * r));
  return Math.sqrt(1 - (3 * M) / r) / (1 - omega * lz);
}
