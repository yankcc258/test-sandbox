// 与主站保持一致：深色外壳，东京时段只改变环境光。
export const PALETTES = {
  day: {
    bg: '#191f22',
    surface: '#21292c',
    glow: '#35434a',
    key: '#edf2f2',
    fill: '#bfd0d6',
    sky: '#263b49',
    horizon: '#596f74',
    gain: 1.1,
    keyStrength: 3.2,
    fillStrength: 1.05,
    rimStrength: 0.85,
    environment: 0.92,
    sunlight: 450,
    nightlight: 0.16,
  },
  dusk: {
    bg: '#211d1c',
    surface: '#2a2523',
    glow: '#4a3b31',
    key: '#f1e6d8',
    fill: '#c7bab0',
    sky: '#303d4c',
    horizon: '#977969',
    gain: 1.02,
    keyStrength: 2.5,
    fillStrength: 0.66,
    rimStrength: 0.8,
    environment: 0.76,
    sunlight: 80,
    nightlight: 0.44,
  },
  night: {
    bg: '#15191b',
    surface: '#1d2325',
    glow: '#28363c',
    key: '#e6edf2',
    fill: '#aec4d1',
    sky: '#101f2e',
    horizon: '#354853',
    gain: 1,
    keyStrength: 2.15,
    fillStrength: 0.45,
    rimStrength: 0.7,
    environment: 0.66,
    sunlight: 0,
    nightlight: 0.62,
  },
};
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export function atmosphere(date = new Date(), override = 'auto') {
  const parts = clock.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  const phase = hour >= 6 && hour < 16 ? 'day' : hour >= 16 && hour < 19 ? 'dusk' : 'night';
  if (Object.hasOwn(PALETTES, override)) return { ...PALETTES[override], phase: override };
  const start = phase === 'day' ? 360 : phase === 'dusk' ? 960 : 1140;
  const previous = phase === 'day' ? 'night' : phase === 'dusk' ? 'day' : 'dusk';
  const t = Math.max(
    0,
    Math.min(1, ((hour < 6 ? hour * 60 + minute + 1440 : hour * 60 + minute) - start) / 30),
  );
  const blend = t * t * (3 - 2 * t);
  const from = PALETTES[previous],
    to = PALETTES[phase];
  const mixed = { phase };
  for (const key of Object.keys(to))
    if (typeof to[key] === 'number') mixed[key] = from[key] + (to[key] - from[key]) * blend;
  for (const key of ['bg', 'surface', 'glow', 'key', 'fill', 'sky', 'horizon']) {
    mixed[key] =
      '#' +
      [1, 3, 5]
        .map((i) =>
          Math.round(
            parseInt(from[key].slice(i, i + 2), 16) +
              (parseInt(to[key].slice(i, i + 2), 16) - parseInt(from[key].slice(i, i + 2), 16)) *
                blend,
          )
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
  }
  return mixed;
}

// 计时以真实经过时间计算；切后台不会丢失时间，暂停不会累计。
export function createFocusTimer(now = () => Date.now(), seconds = 25 * 60) {
  let remaining = seconds,
    deadline = null;
  const left = () =>
    deadline === null ? remaining : Math.max(0, Math.ceil((deadline - now()) / 1000));
  return {
    get seconds() {
      return left();
    },
    get running() {
      return deadline !== null && left() > 0;
    },
    start() {
      if (deadline !== null || remaining <= 0) return;
      deadline = now() + remaining * 1000;
    },
    pause() {
      remaining = left();
      deadline = null;
    },
    reset() {
      deadline = null;
      remaining = seconds;
    },
  };
}
