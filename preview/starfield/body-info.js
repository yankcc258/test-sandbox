import { SKY_TOKYO } from './orbit-sky.js?v=29.1';

// Short, independently written summaries of NASA's linked fact pages. Periods
// below are physical reference values, unrelated to the accelerated scene.
export const BODY_INFO = {
  earth: {
    name: '地球',
    en: 'EARTH',
    kind: '岩质行星 · 观测起点',
    description: '海洋与大气包裹着岩石表面。我们从这颗行星的东京上空，观察其余星体的升落。',
    facts: [
      ['赤道直径', '约 12,756 km'],
      ['自转周期', '约 23.9 小时'],
      ['绕日公转', '约 365.25 天'],
      ['自转轴倾角', '约 23.4°'],
    ],
    source: { label: 'NASA · 地球档案', url: 'https://science.nasa.gov/earth/facts/' },
  },
  sun: {
    name: '太阳',
    en: 'SUN',
    kind: 'G2 V 型恒星',
    description: '炽热的等离子体构成太阳。它没有固体表面，不同纬度的自转速度也不相同。',
    facts: [
      ['半径', '约 70 万 km'],
      ['赤道自转', '约 25 天'],
      ['极区自转', '约 36 天'],
      ['绕银河系中心', '约 2.3 亿年'],
    ],
    source: { label: 'NASA · 太阳档案', url: 'https://science.nasa.gov/sun/facts/' },
  },
  luna: {
    name: '月球',
    en: 'LUNA',
    kind: '地球的天然卫星',
    description: '月球的自转与绕地公转保持同步。我们看到的明暗变化来自日光照亮的部分随视角改变。',
    facts: [
      ['半径', '约 1,740 km'],
      ['自转周期', '约 27 天'],
      ['绕地公转', '约 27 天'],
      ['平均距地球', '约 384,400 km'],
    ],
    source: { label: 'NASA · 月球档案', url: 'https://science.nasa.gov/moon/facts/' },
  },
  mercury: {
    name: '水星',
    en: 'MERCURY',
    kind: '岩质行星',
    description: '最近太阳的行星，表面保留着密集的撞击痕迹。巨大的金属核心藏在较薄的岩石外层之下。',
    facts: [
      ['半径', '约 2,440 km'],
      ['自转周期', '约 59 天'],
      ['绕日公转', '约 88 天'],
      ['昼夜循环', '约 176 天'],
    ],
    source: { label: 'NASA · 水星档案', url: 'https://science.nasa.gov/mercury/facts/' },
  },
  venus: {
    name: '金星',
    en: 'VENUS',
    kind: '岩质行星',
    description:
      '浓厚的大气遮住了金星的地表。它缓慢地逆向自转，一次自转所需的时间比绕太阳一周还长。',
    facts: [
      ['自转周期', '约 243 天 · 逆向'],
      ['绕日公转', '约 225 天'],
      ['大气主体', '二氧化碳'],
      ['天然卫星', '无'],
    ],
    source: { label: 'NASA · 金星档案', url: 'https://science.nasa.gov/venus/venus-facts/' },
  },
  mars: {
    name: '火星',
    en: 'MARS',
    kind: '岩质行星',
    description: '表面的含铁矿物氧化，让火星呈现红色。它也有季节，但一年比地球漫长得多。',
    facts: [
      ['半径', '约 3,390 km'],
      ['自转周期', '约 24.6 小时'],
      ['绕日公转', '约 687 天'],
      ['天然卫星', '火卫一 · 火卫二'],
    ],
    source: { label: 'NASA · 火星档案', url: 'https://science.nasa.gov/mars/facts/' },
  },
  jupiter: {
    name: '木星',
    en: 'JUPITER',
    kind: '气态巨行星',
    description: '氢与氦构成这颗巨行星的主体。云带向不同方向流动，大红斑是一场持续已久的巨大风暴。',
    facts: [
      ['平均半径', '约 69,911 km'],
      ['自转周期', '约 9.9 小时'],
      ['绕日公转', '约 12 年'],
      ['主要成分', '氢 · 氦'],
    ],
    source: { label: 'NASA · 木星档案', url: 'https://science.nasa.gov/jupiter/jupiter-facts/' },
  },
  saturn: {
    name: '土星',
    en: 'SATURN',
    kind: '气态巨行星',
    description:
      '明亮的环由大量冰与岩石颗粒组成。环中的颗粒各自绕土星运行，并非一张完整的固体圆盘。',
    facts: [
      ['赤道直径', '约 120,500 km'],
      ['自转周期', '约 10.7 小时'],
      ['绕日公转', '约 29.4 年'],
      ['环的物质', '冰 · 岩石 · 尘埃'],
    ],
    source: { label: 'NASA · 土星档案', url: 'https://science.nasa.gov/saturn/facts/' },
  },
};

const ASTRO_NAME = {
  sun: 'Sun',
  luna: 'Moon',
  mercury: 'Mercury',
  venus: 'Venus',
  mars: 'Mars',
  jupiter: 'Jupiter',
  saturn: 'Saturn',
};

// Current, topocentric viewing direction in degrees: azimuth is clockwise from
// north; altitude includes the library's standard atmospheric refraction.
// Distance is separately geocentric. Rise/set are NEXT events within 48 hours.
// API definitions: https://github.com/cosinekitty/astronomy/tree/master/source/js
export function calculateBodyObservation(A, id, timestamp) {
  if (!Object.hasOwn(BODY_INFO, id)) throw new RangeError('Unknown celestial body');
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime()))
    throw new RangeError('Invalid observation time');
  if (id === 'earth') return { id, timestamp, observer: true };

  const date = new Date(timestamp);
  const name = ASTRO_NAME[id];
  const observer = new A.Observer(SKY_TOKYO.lat, SKY_TOKYO.lon, SKY_TOKYO.height);
  const equatorial = A.Equator(name, date, observer, true, true);
  const horizontal = A.Horizon(date, observer, equatorial.ra, equatorial.dec, 'normal');
  const observation = {
    id,
    timestamp,
    distanceKm: A.GeoVector(name, date, true).Length() * A.KM_PER_AU,
    altitude: horizontal.altitude,
    azimuth: horizontal.azimuth,
    rise: A.SearchRiseSet(name, observer, 1, date, 2)?.date ?? null,
    set: A.SearchRiseSet(name, observer, -1, date, 2)?.date ?? null,
  };
  if (id === 'luna') observation.illumination = A.Illumination(name, date).phase_fraction;
  return observation;
}
