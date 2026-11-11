// 无推力、零角动量的试验粒子，从 R 处相对当地静止系静止释放。
// 单位 r_s=c=1；质量只用于把长度和时间换成 SI，不改变无量纲轨道。
export const C = 299792458;
export const SOLAR_GM = 1.3271244e20; // IAU 2015 B3 的名义换算常数
export const RECEIVER_R = 30;
export const SHIP_LENGTH = 20; // m；仅用于线性潮汐差，不模拟材料破坏
export const END_RADIUS = 0.65;
export const SIGNAL_END_RADIUS = 1.00001; // 接收时间播放的数值终点，不是视界

export function scales(solarMasses) {
  const radius = (2 * SOLAR_GM * solarMasses) / (C * C);
  return { radius, time: radius / C };
}
export const fallEnergy = (R) => Math.sqrt(1 - 1 / R);
export const radiusAt = (R, eta) => (R * (1 + Math.cos(eta))) / 2;
export const properTimeAt = (R, eta) => (R ** 1.5 * (eta + Math.sin(eta))) / 2;
export const etaAtRadius = (R, r) => 2 * Math.acos(Math.sqrt(Math.min(1, Math.max(0, r / R))));
export const tortoise = (r) => r + Math.log(r - 1);

// 外部 Schwarzschild t；η_h 处对数发散，固有时间仍有限。
export function coordinateTimeAt(R, eta) {
  if (eta >= etaAtRadius(R, 1)) return Infinity;
  const s = Math.sqrt(R - 1),
    z = Math.tan(eta / 2) / s;
  return s * ((1 + R / 2) * eta + (R / 2) * Math.sin(eta)) + Math.log1p(z) - Math.log1p(-z);
}

// 同一条向外径向光信号，到 r=30 静止接收器的固有到达时间。
// 接收器把最初释放信号的抵达设为零；已经包含后续光程变化 / Shapiro 延迟。
export function arrivalTimeAt(R, eta, receiver = RECEIVER_R) {
  const r = radiusAt(R, eta);
  if (eta >= etaAtRadius(R, 1) || r <= 1) return Infinity;
  return Math.sqrt(1 - 1 / receiver) * (coordinateTimeAt(R, eta) + tortoise(R) - tortoise(r));
}

// g = ν_rec/ν_emit = dτ_emit/dT_rec。
// E²-q²=A；用 A/(E+q) 避免接近视界时 E-q 的数值相消。
export function signalShift(R, r, receiver = RECEIVER_R) {
  if (r <= 1) return 0;
  const E = fallEnergy(R),
    q = Math.sqrt(Math.max(0, 1 / r - 1 / R));
  return (1 - 1 / r) / (Math.sqrt(1 - 1 / receiver) * (E + q));
}

export function etaAtTime(R, elapsed, mode = 'proper') {
  const end = etaAtRadius(R, mode === 'proper' ? END_RADIUS : SIGNAL_END_RADIUS);
  const clock = mode === 'proper' ? properTimeAt : arrivalTimeAt;
  if (elapsed <= 0) return 0;
  if (elapsed >= clock(R, end)) return end;
  let lo = 0,
    hi = end;
  for (let i = 0; i < 52; i++) {
    const mid = (lo + hi) / 2;
    if (clock(R, mid) < elapsed) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function duration(R, mode) {
  return (mode === 'proper' ? properTimeAt : arrivalTimeAt)(
    R,
    etaAtRadius(R, mode === 'proper' ? END_RADIUS : SIGNAL_END_RADIUS),
  );
}

export function infallState({ R = 8, mass = 4e6, mode = 'proper', progress = 0 } = {}) {
  const elapsed = Math.max(0, Math.min(1, progress)) * duration(R, mode);
  let eta = etaAtTime(R, elapsed, mode),
    r = radiusAt(R, eta);
  const horizon = etaAtRadius(R, 1);
  if (Math.abs(eta - horizon) < 1e-12) {
    eta = horizon;
    r = 1;
  }
  const units = scales(mass),
    proper = properTimeAt(R, eta),
    arrival = arrivalTimeAt(R, eta);
  const exterior = eta < etaAtRadius(R, 1) && r > 1;
  const g = exterior ? signalShift(R, r) : 0;
  const g0 = signalShift(R, R);
  return {
    R,
    eta,
    r,
    proper,
    arrival,
    units,
    exterior,
    g,
    properSeconds: proper * units.time,
    arrivalSeconds: arrival * units.time,
    horizonSeconds: properTimeAt(R, etaAtRadius(R, 1)) * units.time,
    // 只在视界外存在的当地静止观察者测速；不是 dr/dτ，也不是船自己的测速。
    speed: exterior ? Math.sqrt(Math.max(0, (1 / r - 1 / R) / (1 - 1 / R))) : null,
    // 固定径向光束的能量×接收速率因子；排除束散 / 距离 / 仪器响应，不是总光度。
    signalPower: (g / g0) ** 2,
    wavelength: g > 0 ? 550 / g : Infinity, // nm，船上发射 550 nm
    tidal: (C * C * SHIP_LENGTH) / (units.radius ** 2 * r ** 3),
  };
}
