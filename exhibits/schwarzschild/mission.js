import { infallState, duration, properTimeAt, etaAtRadius } from './infall.js?v=1';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '无法抵达';
  if (seconds === 0) return '0 s';
  if (seconds < 0.001) return (seconds * 1e6).toPrecision(3) + ' μs';
  if (seconds < 1) return (seconds * 1000).toPrecision(3) + ' ms';
  if (seconds < 60) return seconds.toFixed(2) + ' s';
  if (seconds < 3600) return (seconds / 60).toFixed(2) + ' min';
  return (seconds / 3600).toFixed(2) + ' h';
}
const number = (x) =>
  x === 0 ? '0' : x < 0.001 || x >= 1e5 ? x.toExponential(2) : x.toPrecision(3);

export function initMission(root) {
  if (!root) return;
  const $ = (id) => root.querySelector('#' + id);
  const canvas = $('ship-scene'),
    ctx = canvas.getContext('2d');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = media.matches,
    R = 8,
    mass = 4e6,
    mode = 'proper',
    progress = 0;
  let playing = false,
    frame = 0,
    last = 0,
    state = infallState();
  const locked = () => reduced || new URLSearchParams(location.search).get('motion') === '0';
  const setText = (id, value) => {
    const el = $(id);
    if (el.textContent !== value) el.textContent = value;
  };
  const stop = () => {
    playing = false;
    last = 0;
    cancelAnimationFrame(frame);
    frame = 0;
  };

  function update() {
    state = infallState({ R, mass, mode, progress });
    const atHorizon = Math.abs(state.r - 1) < 1e-7;
    Object.assign(root.dataset, {
      mode,
      radius: state.r,
      progress,
      playing,
      shift: state.g,
      proper: state.properSeconds,
      arrival: state.arrivalSeconds,
      tide: state.tidal,
    });
    $('ship-progress').value = String(progress);
    $('ship-progress').setAttribute(
      'aria-valuetext',
      `${mode === 'proper' ? '船上时间' : '接收时间'} ${formatTime((mode === 'proper' ? state.proper : state.arrival) * state.units.time)}`,
    );
    $('ship-play').disabled = locked();
    setText(
      'ship-play',
      locked()
        ? '静态推演'
        : playing
          ? '暂停实验'
          : progress >= 1
            ? '再放一次'
            : progress > 0
              ? '继续实验'
              : '释放探测船',
    );
    $('ship-proper').setAttribute('aria-pressed', String(mode === 'proper'));
    $('ship-received').setAttribute('aria-pressed', String(mode === 'received'));
    setText(
      'ship-view-label',
      mode === 'proper' ? '船上时间 · 位置示意' : '接收信号 · 发射位置示意',
    );
    setText('ship-clock-label', mode === 'proper' ? '推进船上时间' : '推进接收器时间');
    setText('ship-horizon', mode === 'proper' ? '到达视界' : '接近视界');
    setText('ship-progress-out', (progress * 100).toFixed(0) + '%');
    setText('ship-release-out', `${R} rₛ`);
    setText('ship-radius', state.r.toFixed(state.r < 1.01 && mode === 'received' ? 5 : 3) + ' rₛ');
    setText('ship-proper-out', formatTime(state.properSeconds));
    setText('ship-arrival-out', atHorizon ? '趋于 ∞' : formatTime(state.arrivalSeconds));
    setText(
      'ship-speed',
      atHorizon || state.speed === null
        ? '无静止参考系'
        : state.speed > 0.9995
          ? '< 1 c'
          : state.speed.toFixed(3) + ' c',
    );
    setText('ship-tide', number(state.tidal / 9.80665) + ' g₀');
    setText(
      'ship-timescale',
      `演示 16 秒 ≈ ${mode === 'proper' ? '船上' : '接收器'} ${formatTime(duration(R, mode) * state.units.time)}；g₀ = 9.80665 m/s²。`,
    );
    setText(
      'ship-wavelength',
      !state.exterior || atHorizon
        ? '无可达信号'
        : state.wavelength < 1e4
          ? state.wavelength.toFixed(0) + ' nm'
          : number(state.wavelength / 1000) + ' μm',
    );
    $('ship-spectrum-marker').style.left =
      clamp(((state.wavelength - 380) / 400) * 100, 0, 100) + '%';
    setText(
      'ship-signal-out',
      !state.exterior || atHorizon
        ? '此处向外发出的信号无法到达外部接收器。'
        : `g = ${number(state.g)} · 能量×到达率因子 ${number(state.signalPower * 100)}%${state.wavelength > 780 ? ' · 已移到红外' : ''}`,
    );
    const status =
      progress === 0
        ? '等待释放 · 引擎关闭'
        : atHorizon
          ? '越过边界的这一刻'
          : !state.exterior
            ? '视界内 · 仅显示坐标'
            : state.g < 0.03
              ? '信号极度红移'
              : '自由落体 · 无推力';
    setText('ship-status', status);
    let explanation;
    if (mode === 'received')
      explanation =
        '这里显示每条已到达信号的发射位置，已计入传播延迟。越接近视界，信号越红、间隔越长；有限接收时间里不会看到穿越。飞船图标是定位标记，不是光学影像。';
    else if (atHorizon)
      explanation = `船上的钟在 ${formatTime(state.horizonSeconds)} 时经过视界，仍正常走动。这不是一堵墙；外部接收器无法收到在边界及其内侧向外发出的信号。`;
    else if (!state.exterior)
      explanation =
        '飞船已越过视界，船上时间继续推进。这里显示的是轨迹计算，不代表外面能看见它；视界内部不存在保持半径不变的静止观察者。';
    else
      explanation = `在同一 r/rₛ 处，大黑洞的潮汐差按质量平方反比减小。当前模型的视界穿越时刻为船上 ${formatTime(state.horizonSeconds)}；质心加速度计读零，船头与船尾仍有潮汐差。`;
    setText('ship-explanation', explanation);
    draw();
  }

  function ship(x, y, angle, ghost) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(0.8, 0.8);
    ctx.globalAlpha = ghost ? 0.42 : 1;
    // 金属探测舱、双翼仪器板与天线。几何图标，未把船长按 r_s 比例画出。
    ctx.fillStyle = '#1b394d';
    ctx.strokeStyle = '#6d939e';
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.fillRect(-18, side < 0 ? -34 : 18, 29, 16);
      ctx.strokeRect(-18, side < 0 ? -34 : 18, 29, 16);
      for (let n = 1; n < 4; n++) {
        ctx.beginPath();
        ctx.moveTo(-18 + n * 7, side < 0 ? -34 : 18);
        ctx.lineTo(-18 + n * 7, side < 0 ? -18 : 34);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-4, side * 8);
      ctx.lineTo(-4, side * 18);
      ctx.stroke();
    }
    const hull = ctx.createLinearGradient(0, -12, 0, 12);
    hull.addColorStop(0, '#e3e8e6');
    hull.addColorStop(0.45, '#879ba4');
    hull.addColorStop(1, '#263845');
    ctx.fillStyle = hull;
    ctx.strokeStyle = '#b0c3c9';
    ctx.beginPath();
    ctx.moveTo(29, 0);
    ctx.lineTo(12, -11);
    ctx.lineTo(-21, -10);
    ctx.lineTo(-27, -5);
    ctx.lineTo(-27, 5);
    ctx.lineTo(-21, 10);
    ctx.lineTo(12, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c6ac78';
    ctx.fillRect(-13, -9, 6, 18);
    ctx.fillStyle = '#203b49';
    ctx.fillRect(8, -4, 10, 8);
    ctx.strokeStyle = '#98b0b9';
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(-39, 0);
    ctx.moveTo(-39, -7);
    ctx.lineTo(-39, 7);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    const w = canvas.clientWidth,
      h = canvas.clientHeight,
      dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const scale = (w - 80) / (R + 1.7),
      cx = 1.7 * scale + 15,
      cy = h * 0.51,
      angle = -0.13;
    ctx.fillStyle = '#778c9a';
    for (let i = 0; i < 65; i++) {
      const px = (((i * 127.13) % 997) / 997) * w,
        py = (((i * 73.71) % 499) / 499) * h;
      ctx.globalAlpha = 0.12 + (i % 4) * 0.07;
      ctx.fillRect(px, py, 1, 1);
    }
    ctx.globalAlpha = 1;
    for (const [r, color, dash] of [
      [1.5, '#88b8ce44', [2, 6]],
      [1, '#d3b98299', [4, 5]],
    ]) {
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#020406';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, scale - 1), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9db3bd30';
    ctx.beginPath();
    ctx.moveTo(cx + 0.65 * scale * Math.cos(angle), cy + 0.65 * scale * Math.sin(angle));
    ctx.lineTo(cx + R * scale * Math.cos(angle), cy + R * scale * Math.sin(angle));
    ctx.stroke();
    ctx.font = '10px Inter, sans-serif';
    for (let r = 2; r <= R; r += 2) {
      const x = cx + r * scale * Math.cos(angle),
        y = cy + r * scale * Math.sin(angle);
      ctx.strokeStyle = '#61778466';
      ctx.beginPath();
      ctx.moveTo(x, y + 17);
      ctx.lineTo(x, y + 23);
      ctx.stroke();
      ctx.fillStyle = '#78909e';
      ctx.fillText(String(r), x - 3, y + 38);
    }
    ctx.fillStyle = '#c9b084';
    ctx.fillText('视界 · 1 rₛ', 18, h - 45);
    ctx.fillStyle = '#7495a7';
    ctx.fillText('光子球 · 1.5 rₛ', 18, h - 26);
    ctx.fillStyle = '#6d8492';
    ctx.fillText('坐标半径 r / rₛ', w - 114, h - 26);
    const x = cx + state.r * scale * Math.cos(angle),
      y = cy + state.r * scale * Math.sin(angle);
    const faded = mode === 'received' && state.wavelength > 780;
    ship(x, y, Math.PI + angle, faded || !state.exterior);
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#b2c5ce';
    const label = state.exterior
      ? faded
        ? '信标已移到红外'
        : '探测船 · 无推力'
      : state.r === 1
        ? '视界位置'
        : '视界内的计算位置';
    ctx.fillText(label, clamp(x - 35, 16, w - 128), y - 48);
    // 仅画信标的可见光颜色；移到红外后不把它假画成永远可见的红灯。
    const visible = state.exterior && state.wavelength <= 780;
    if (visible) {
      const hue = clamp(((700 - state.wavelength) / 150) * 100, 0, 100);
      ctx.fillStyle = 'hsl(' + hue + ' 65% 65%)';
      ctx.globalAlpha = Math.pow(state.signalPower, 0.25);
      ctx.beginPath();
      ctx.arc(x + 30, y + 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#8d9b9f';
    ctx.fillText('← 径向落入', 18, 38);
  }

  function tick(now) {
    frame = 0;
    if (!playing || document.hidden || locked()) {
      stop();
      update();
      return;
    }
    if (last) progress = Math.min(1, progress + Math.min((now - last) / 1000, 0.1) / 16);
    last = now;
    if (progress >= 1) stop();
    update();
    if (playing) frame = requestAnimationFrame(tick);
  }
  $('ship-play').onclick = () => {
    if (locked()) return;
    if (playing) stop();
    else {
      if (progress >= 1) progress = 0;
      playing = true;
      last = 0;
      frame = requestAnimationFrame(tick);
    }
    update();
  };
  $('ship-reset').onclick = () => {
    stop();
    progress = 0;
    update();
  };
  $('ship-progress').oninput = (event) => {
    stop();
    progress = Number(event.target.value);
    update();
  };
  $('ship-release').oninput = (event) => {
    stop();
    R = Number(event.target.value);
    progress = 0;
    update();
  };
  $('ship-mass').onchange = (event) => {
    mass = Number(event.target.value);
    update();
  };
  $('ship-horizon').onclick = () => {
    stop();
    progress = mode === 'proper' ? properTimeAt(R, etaAtRadius(R, 1)) / duration(R, mode) : 1;
    update();
  };
  for (const nextMode of ['proper', 'received'])
    $(nextMode === 'proper' ? 'ship-proper' : 'ship-received').onclick = () => {
      stop();
      const elapsed = nextMode === 'proper' ? state.proper : state.arrival;
      mode = nextMode;
      progress = Number.isFinite(elapsed) ? clamp(elapsed / duration(R, mode), 0, 1) : 1;
      update();
    };
  media.addEventListener('change', (event) => {
    reduced = event.matches;
    if (reduced) stop();
    update();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
      update();
    }
  });
  new ResizeObserver(draw).observe(canvas);
  new IntersectionObserver(
    ([entry]) => {
      if (entry.intersectionRatio < 0.001 && playing) {
        stop();
        update();
      }
    },
    { threshold: 0.001 },
  ).observe(root);
  update();
}
