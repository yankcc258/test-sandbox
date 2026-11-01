// 第谷体系的星图示意：地球不动，太阳和 Luna 绕地球，水金火木土绕太阳。
// 周期、偏心率、轨道倾角、近日点、转轴倾角用 NASA 行星资料表的数值；轨道大小和自转快慢按画面需要压缩。
// 打开时各星体在平黄经上的位置接近「此刻」（J2000 平黄经加上经过的天数），之后按真实周期比例加速推进。
export const DAYS_PER_SECOND = 0.8;
const J2000 = Date.UTC(2000, 0, 1, 12);
// center：绕谁转；a：画面里的轨道半长轴；au：真实半长轴；period：恒星周期（天）；
// L0：J2000 平黄经；peri：近日点黄经；node：升交点黄经；incl：轨道倾角；tilt：转轴倾角；spin：画面里自转一圈的秒数（负数为逆向）。
export const BODIES = [
  { id: 'earth', radius: 0.55, tilt: 23.44, spin: 60 },
  {
    id: 'sun',
    center: 'earth',
    a: 4.2,
    au: 1,
    e: 0.0167,
    period: 365.256,
    L0: 280.46,
    peri: 282.94,
    node: 0,
    incl: 0,
    radius: 0.55,
    tilt: 7.25,
    spin: 900,
  },
  {
    id: 'luna',
    center: 'earth',
    a: 1.45,
    e: 0.0549,
    period: 27.3217,
    L0: 218.32,
    peri: 83.35,
    node: 125.08,
    incl: 5.14,
    radius: 0.15,
    tilt: 6.68,
    spin: 0,
  },
  {
    id: 'mercury',
    center: 'sun',
    a: 1.45,
    au: 0.387,
    e: 0.2056,
    period: 87.969,
    L0: 252.25,
    peri: 77.46,
    node: 48.33,
    incl: 7.0,
    radius: 0.14,
    tilt: 0.034,
    spin: 600,
  },
  {
    id: 'venus',
    center: 'sun',
    a: 2.5,
    au: 0.723,
    e: 0.0068,
    period: 224.701,
    L0: 181.98,
    peri: 131.53,
    node: 76.68,
    incl: 3.39,
    radius: 0.26,
    tilt: 177.36,
    spin: -900,
  },
  {
    id: 'mars',
    center: 'sun',
    a: 6.1,
    au: 1.524,
    e: 0.0934,
    period: 686.98,
    L0: 355.45,
    peri: 336.04,
    node: 49.56,
    incl: 1.85,
    radius: 0.2,
    tilt: 25.19,
    spin: 62,
  },
  {
    id: 'jupiter',
    center: 'sun',
    a: 10.6,
    au: 5.203,
    e: 0.0489,
    period: 4332.59,
    L0: 34.4,
    peri: 14.75,
    node: 100.46,
    incl: 1.3,
    radius: 0.62,
    tilt: 3.13,
    spin: 25,
  },
  {
    id: 'saturn',
    center: 'sun',
    a: 14.8,
    au: 9.537,
    e: 0.0565,
    period: 10759.22,
    L0: 49.94,
    peri: 92.43,
    node: 113.66,
    incl: 2.49,
    radius: 0.52,
    tilt: 26.73,
    spin: 27,
  },
];
export const body = (id) => BODIES.find((b) => b.id === id);
const rad = Math.PI / 180;
// 轨道倾角放大 1.6 倍，画面上才看得出各条轨道不在同一个平面。
const INCLINE = 1.6;
// 平黄经按周期匀速推进；再用中心差把平近点角换成真近点角，近日点附近自然走得快（开普勒第二定律）。
export function longitude(b, now, time = 0) {
  const days = (now - J2000) / 86400000 + time * DAYS_PER_SECOND,
    M = (b.L0 + (360 * days) / b.period - b.peri) * rad,
    nu = M + 2 * b.e * Math.sin(M) + 1.25 * b.e * b.e * Math.sin(2 * M);
  return (((b.peri + nu / rad) % 360) + 360) % 360;
}
// 黄道坐标（x 指向春分点，y 在黄道面内，z 指向黄北极）换成场景坐标：y 朝上，黄道面是 xz 平面。
export function orbitOffset(b, lon) {
  const r = (b.a * (1 - b.e * b.e)) / (1 + b.e * Math.cos((lon - b.peri) * rad)),
    u = (lon - b.node) * rad,
    O = b.node * rad,
    i = b.incl * INCLINE * rad;
  const x = r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i)),
    y = r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i)),
    z = r * Math.sin(u) * Math.sin(i);
  return [x, z, -y];
}
export function position(id, now, time = 0) {
  const b = body(id);
  if (!b.center) return [0, 0, 0];
  const c = position(b.center, now, time),
    o = orbitOffset(b, longitude(b, now, time));
  return [c[0] + o[0], c[1] + o[1], c[2] + o[2]];
}
