// 洛希极限展品 · 双星观测的页面逻辑（猫猫）：两颗虚构的行星、观测舱的视角和读数、碎屑的推进，以及下半页的等势线示意图。
// 物理在 binary.js；碎屑积分和画面在 scene.js。
import {
  lagrange,
  planetShape,
  volumeRadius,
  periodHours,
  roche,
  toInertial,
} from './binary.js?v=1';
import {
  createRenderer,
  createGpuDust,
  createCpuDust,
  gpuDustAvailable,
  project,
} from './scene.js?v=2';

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rad = (x) => (x * Math.PI) / 180;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------- 两颗虚构的行星 ----------
const MU = 0.35, // 望舒占总质量的份额；烛阴占 65%
  RADIUS_A_KM = 6400, // 烛阴的等体积半径：用它把「间距 = 1」换成千米
  DENSITY_B = 3.4, // 望舒的密度（g/cm³）：周期由它和形状算出
  POINTS = lagrange(MU),
  STATION = 13, // 观测舱离双星质心多远（以两星间距为单位）
  ORBIT_SECONDS = 55, // 一倍速时，两颗行星互绕一圈用多少秒
  SPEEDS = [1, 4, 16];
const model = { fill: 0.97 };
let shapeA, shapeB, sizeA, sizeB;
function reshape() {
  shapeA = planetShape(MU, 'A', model.fill, POINTS);
  shapeB = planetShape(MU, 'B', model.fill, POINTS);
  sizeA = volumeRadius(MU, shapeA);
  sizeB = volumeRadius(MU, shapeB);
}
reshape();
const kilometres = () => RADIUS_A_KM / sizeA; // 一个间距是多少千米

// ---------- 观测 ----------
const SCOPES = {
  wide: { fov: rad(33), aim: () => [0, 0, 0] },
  pair: { fov: rad(6.4), aim: () => toInertial([0.12, 0, 0], theta) },
  bridge: { fov: rad(2.8), aim: () => toInertial([POINTS.L1, 0, 0], theta) },
};
const view = {
  scope: 'pair',
  az: 4.19, // 逆着光看：恒星在行星后面偏一侧
  elev: rad(9), // 略高于轨道面，看到前景尘带与远处逆光边缘
  zoom: 1,
  fov: SCOPES.pair.fov,
  aim: [0, 0, 0],
  lobes: false,
  marks: false,
};

// ---------- 运行状态 ----------
const canvas = $('view');
const gl = (() => {
  try {
    return canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
})();
let status = 'loading', // loading | ready | unavailable | lost
  renderer = null,
  dust = null,
  theta = 2.62, // 两星连线的相位；开始时两颗行星在画面里一左一右
  clock = 0,
  paused = reduced.matches || query.get('motion') === '0',
  speed = 1,
  quality = 1, // 画布分辨率的折扣和行星求交的步数，按帧时间自动调
  frame = 0,
  last = 0,
  slow = 0,
  fast = 0,
  matrix = null;

function build() {
  renderer = createRenderer(gl, { allowHdr: query.get('hdr') !== '0' });
  if (query.get('sim') !== 'cpu' && gpuDustAvailable(gl)) {
    // 宽屏 105 万粒，中等 26 万粒，窄屏 6.5 万粒
    const side = innerWidth < 700 ? 256 : innerWidth < 1100 ? 512 : 1024;
    dust = createGpuDust(gl, side, side);
  } else dust = createCpuDust(gl, 128, 128); // 没有浮点渲染目标：CPU 上推 1.6 万粒
}
// 这一刻两颗行星的样子，给碎屑积分和画面用
function frameInfo(dt = 0) {
  const centers = [toInertial([-MU, 0, 0], theta), toInertial([1 - MU, 0, 0], theta)],
    rate = 2.4 * smooth(0.88, 0.99, model.fill); // 尖端伸到九成左右开始有碎屑被扯出来（示意）
  return {
    theta,
    mu: MU,
    level: [shapeA.level, shapeB.level],
    reach: [shapeA.reach, shapeB.reach],
    tip: [shapeA.tip, shapeB.tip],
    emit: 1 - Math.exp(-rate * dt),
    heat: smooth(0.7, 1, model.fill),
    l1: POINTS.L1,
    centers,
    radii: [shapeA.side, shapeB.side],
  };
}
function advance(seconds) {
  const total = ((2 * Math.PI) / ORBIT_SECONDS) * speed * seconds,
    steps = clamp(Math.ceil(total / 0.008), 1, 24),
    dt = Math.min(total / steps, 0.012);
  for (let i = 0; i < steps; i++) {
    dust.step(frameInfo(dt), dt);
    theta += dt;
  }
}

// ---------- 画面 ----------
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2) * quality,
    w = Math.max(2, Math.round(canvas.clientWidth * dpr)),
    h = Math.max(2, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
function draw(seconds) {
  resize();
  // 望远镜慢慢转向新的目标、慢慢变焦
  const scope = SCOPES[view.scope],
    ease = seconds ? 1 - Math.exp(-seconds * 2.0) : 1,
    goal = scope.aim();
  view.fov += (clamp(scope.fov * view.zoom, rad(1.6), rad(48)) - view.fov) * ease;
  view.aim = view.aim.map((value, i) => value + (goal[i] - value) * ease);
  // 观测舱自己也在很慢地绕着这个系统走
  const az = view.az + clock * 0.0015,
    c = Math.cos(view.elev),
    eye = [STATION * c * Math.cos(az), STATION * Math.sin(view.elev), STATION * c * Math.sin(az)],
    textures = dust.textures();
  matrix = renderer.draw({
    eye,
    target: view.aim,
    fov: view.fov,
    roll: -0.22,
    frame: frameInfo(),
    dust: { pos: textures.pos, vel: textures.vel, size: dust.size, count: dust.count },
    grain: dust.count > 500000 ? 0.0019 : dust.count > 100000 ? 0.0027 : 0.0042,
    steps: quality < 0.8 ? 20 : 30,
    time: clock,
    exposure: 0.82,
    bloom: 0.28,
  });
  overlay();
}

// 叠在画面上的线和字：洛希瓣的轮廓、五个拉格朗日点、两颗行星的名字
const LOBE = (() => {
  // 轨道面里过 L1 的那条等势线：从每颗行星的中心朝各个方向找它
  const outline = (center, reach) => {
    const out = [];
    for (let i = 0; i <= 72; i++) {
      const angle = (i / 72) * 2 * Math.PI,
        cos = Math.cos(angle),
        sin = Math.sin(angle);
      let lo = 1e-4,
        hi = reach * 1.001;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (roche(center + mid * cos, mid * sin, 0, MU) > POINTS.C1) lo = mid;
        else hi = mid;
      }
      out.push([center + lo * cos, lo * sin, 0]);
    }
    return out;
  };
  return [outline(-MU, POINTS.L1 + MU), outline(1 - MU, 1 - MU - POINTS.L1)];
})();
function overlay() {
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    at = (rotating) => {
      const p = project(matrix, toInertial(rotating, theta));
      return p && [p[0] * w, p[1] * h];
    };
  $('overlay').setAttribute('viewBox', `0 0 ${w} ${h}`);
  let path = '';
  if (view.lobes)
    for (const outline of LOBE) {
      const points = outline.map(at);
      if (points.some((p) => !p)) continue;
      path += 'M' + points.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L') + 'Z';
    }
  $('lobe-line').setAttribute('d', path);
  let marks = '';
  if (view.marks) {
    const wide = view.fov > rad(20);
    for (const [name, u, s] of [
      ['L₁', POINTS.L1, 0],
      ['L₂', POINTS.L2, 0],
      ['L₃', POINTS.L3, 0],
      ['L₄', ...POINTS.L4],
      ['L₅', ...POINTS.L5],
    ]) {
      const p = at([u, s, 0]);
      if (!p || (name !== 'L₁' && !wide)) continue;
      marks += `<path class="point" d="M${p[0] - 4} ${p[1]}L${p[0]} ${p[1] - 4}L${p[0] + 4} ${p[1]}L${p[0]} ${p[1] + 4}Z"/><text x="${p[0] + 8}" y="${p[1] + 3}">${name}</text>`;
    }
    for (const [name, shape] of [
      ['烛阴', shapeA],
      ['望舒', shapeB],
    ]) {
      const top = at([shape.center, 0, shape.pole]),
        centre = at([shape.center, 0, 0]);
      if (!top || !centre) continue;
      const lift = Math.max(14, Math.abs(centre[1] - top[1]) * 0.35),
        y = top[1] - lift;
      marks += `<path class="bracket" d="M${top[0]} ${top[1] - 3}V${y}h26"/><text class="name" x="${top[0] + 32}" y="${y + 4}">${name}</text>`;
    }
  }
  $('marks').innerHTML = marks;
}

function tick(now) {
  frame = 0;
  if (document.hidden || status !== 'ready') return;
  const seconds = last ? Math.min(now - last, 100) / 1000 : 0;
  last = now;
  if (!paused && seconds) {
    clock += seconds;
    advance(seconds);
    // 画得慢就先降分辨率，再减行星求交的步数；快了再升回去
    if (seconds > 0.03) (slow++, (fast = 0));
    else if (seconds < 0.019) (fast++, (slow = 0));
    if (slow > 10) {
      quality = Math.max(0.5, quality - 0.1);
      slow = 0;
    }
    if (fast > 120) {
      quality = Math.min(1, quality + 0.05);
      fast = 0;
    }
  }
  draw(seconds);
  readout();
  // 望远镜还在转的时候，即使暂停也接着画
  const settling =
    Math.abs(view.fov - clamp(SCOPES[view.scope].fov * view.zoom, rad(1.6), rad(48))) > 1e-4;
  if (!paused || settling) frame = requestAnimationFrame(tick);
  else last = 0;
}
function invalidate() {
  readout();
  drawLobes();
  if (status === 'ready' && !frame && !document.hidden) frame = requestAnimationFrame(tick);
}

// 检查用：读出现在的状态。
window.zhixuRocheBinaryProbe = () =>
  status === 'ready'
    ? {
        backend: dust.backend,
        count: dust.count,
        hdr: renderer.hdr,
        fill: model.fill,
        theta,
        orbits: theta / (2 * Math.PI),
        speed,
        paused,
        scope: view.scope,
        fov: view.fov,
        quality,
        census: dust.census(),
      }
    : null;

// 检查用：不等动画帧，直接把时间往前推 seconds 秒（按当前倍速），再画一帧。页面在后台被限速时也能用。
window.zhixuRocheBinaryAdvance = (seconds, chunk = 1 / 30) => {
  if (status !== 'ready') return null;
  for (let t = 0; t < seconds; t += chunk) {
    clock += chunk;
    advance(chunk);
  }
  view.fov = clamp(SCOPES[view.scope].fov * view.zoom, rad(1.6), rad(48));
  view.aim = SCOPES[view.scope].aim();
  draw(0);
  readout();
  return window.zhixuRocheBinaryProbe();
};

// ---------- 读数和控件 ----------
function readout() {
  const km = kilometres(),
    pressed = (node, on) => node.setAttribute('aria-pressed', String(on));
  $('gap-out').textContent = Math.round(km).toLocaleString('en-US');
  $('period-out').textContent = periodHours(MU, sizeB, DENSITY_B).toFixed(1);
  $('tips-out').textContent = Math.round((shapeB.tip - shapeA.tip) * km).toLocaleString('en-US');
  $('fill-out').textContent = (model.fill * 100).toFixed(0);
  $('fill2-out').textContent = (model.fill * 100).toFixed(0);
  $('fill').value = $('fill2').value = String(model.fill);
  $('range-out').textContent = ((STATION * km) / 1e4).toFixed(1);
  $('scope-out').textContent = `望远镜 视场 ${((view.fov * 180) / Math.PI).toFixed(1)}°`;
  $('clock-out').textContent = paused
    ? '时间 已暂停'
    : `时间流速 ×${Math.round(((periodHours(MU, sizeB, DENSITY_B) * 3600) / ORBIT_SECONDS) * speed).toLocaleString('en-US')}`;
  for (const button of document.querySelectorAll('.console [data-scope]'))
    pressed(button, button.dataset.scope === view.scope);
  $('opt-speed').textContent = `×${speed}`;
  $('opt-motion').disabled = status !== 'ready';
  $('opt-motion').textContent = paused ? '继续' : '暂停';
  pressed($('opt-motion'), paused);
  $('deck-pause').disabled = status !== 'ready';
  $('deck-pause').textContent = paused ? '继续观测' : '暂停时间';
  pressed($('deck-pause'), paused);
  canvas.dataset.fill = model.fill.toFixed(3);
  canvas.dataset.telescope = view.scope;
  document.querySelector('.deck').dataset.scope = view.scope;
}
function setFill(value) {
  model.fill = clamp(value, 0.6, 1);
  reshape();
  invalidate();
}
function bindControls() {
  $('deck-data').onclick = () => {
    const open = document.querySelector('.deck').classList.toggle('data-open');
    $('deck-data').setAttribute('aria-expanded', String(open));
    $('deck-data').textContent = open ? '收起仪表 −' : '观测仪表 ＋';
  };
  $('deck-pause').onclick = () => $('opt-motion').click();
  const pointers = new Map();
  let pinch = 0;
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const turn = (dx, dy) => {
    // 拖得越远看得越细时，转得越慢
    const gain = view.fov / rad(36);
    view.az -= dx * gain;
    view.elev = clamp(view.elev + dy * gain, rad(2), rad(62));
    invalidate();
  };
  const zoom = (factor) => {
    view.zoom = clamp(view.zoom * factor, 0.25, 2.2);
    invalidate();
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
    if (pointers.size > 1) pinch = spread();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size > 1) {
      const next = spread();
      if (pinch > 10 && next > 10) zoom(pinch / next);
      pinch = next;
    } else turn(dx * 0.005, dy * 0.005);
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    pinch = 0;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (!pointers.size) canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoom(Math.exp(clamp(e.deltaY, -200, 200) * 0.0015));
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (e) => {
    const act = {
      ArrowLeft: () => turn(20, 0),
      ArrowRight: () => turn(-20, 0),
      ArrowUp: () => turn(0, 14),
      ArrowDown: () => turn(0, -14),
      '+': () => zoom(0.85),
      '=': () => zoom(0.85),
      '-': () => zoom(1.18),
      Home: () => {
        view.zoom = 1;
        view.scope = 'wide';
        invalidate();
      },
    }[e.key];
    if (act) {
      e.preventDefault();
      act();
    }
  });
  for (const id of ['fill', 'fill2']) $(id).oninput = (e) => setFill(Number(e.target.value));
  for (const button of document.querySelectorAll('.console [data-scope]'))
    button.onclick = () => {
      view.scope = button.dataset.scope;
      view.zoom = 1;
      invalidate();
    };
  $('opt-speed').onclick = () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    invalidate();
  };
  $('opt-motion').onclick = () => {
    paused = !paused;
    last = 0;
    invalidate();
  };
  $('opt-lobes').onchange = (e) => {
    view.lobes = e.target.checked;
    invalidate();
  };
  $('opt-marks').onchange = (e) => {
    view.marks = e.target.checked;
    invalidate();
  };
}

// ---------- 二维示意：共转系里的等势线 ----------
function drawLobes() {
  const node = $('lobes'),
    dpr = Math.min(devicePixelRatio || 1, 2),
    w = node.clientWidth,
    h = node.clientHeight;
  if (!w || !h) return;
  node.width = Math.round(w * dpr);
  node.height = Math.round(h * dpr);
  const c = node.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const span = 3.7, // 横向能看到多少个间距
    k = Math.min(w / span, h / 2.5),
    X = (u) => w / 2 + (u - 0.12) * k,
    Y = (s) => h / 2 - s * k,
    cell = 4,
    cols = Math.ceil(w / cell) + 1,
    rows = Math.ceil(h / cell) + 1,
    field = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      field[j * cols + i] = roche((i * cell - w / 2) / k + 0.12, (h / 2 - j * cell) / k, 0, MU);
  // 两颗行星：各自等势面以内的部分
  for (const [shape, color] of [
    [shapeA, '#b9683a'],
    [shapeB, '#3f86b5'],
  ]) {
    c.fillStyle = color;
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        const u = (i * cell - w / 2) / k + 0.12,
          s = (h / 2 - j * cell) / k;
        if (
          field[j * cols + i] > shape.level &&
          Math.hypot(u - shape.center, s) < shape.reach * 1.02
        )
          c.fillRect(i * cell - cell / 2, j * cell - cell / 2, cell, cell);
      }
  }
  // 等值线：逐格看四个角，线性插值出线段
  const contour = (level, style, width, dash = [], within = Infinity) => {
    c.beginPath();
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        if (Math.hypot((i * cell - w / 2) / k + 0.12, (h / 2 - j * cell) / k) > within) continue;
        const a = field[j * cols + i] - level,
          b = field[j * cols + i + 1] - level,
          d = field[(j + 1) * cols + i] - level,
          e = field[(j + 1) * cols + i + 1] - level,
          cuts = [];
        if (a * b < 0) cuts.push([i + a / (a - b), j]);
        if (b * e < 0) cuts.push([i + 1, j + b / (b - e)]);
        if (d * e < 0) cuts.push([i + d / (d - e), j + 1]);
        if (a * d < 0) cuts.push([i, j + a / (a - d)]);
        for (let n = 0; n + 1 < cuts.length; n += 2) {
          c.moveTo(cuts[n][0] * cell, cuts[n][1] * cell);
          c.lineTo(cuts[n + 1][0] * cell, cuts[n + 1][1] * cell);
        }
      }
    c.strokeStyle = style;
    c.lineWidth = width;
    c.setLineDash(dash);
    c.stroke();
    c.setLineDash([]);
  };
  for (const level of [1.45, 1.56, 2.3, 2.9]) contour(level, '#cfd6dc22', 1);
  contour(POINTS.C3, '#cfd6dc66', 1);
  contour(POINTS.C2, '#cfd6dc66', 1);
  contour(POINTS.C1, '#ffe2a8', 1.6, [2, 4], 1.3);
  c.font = '11px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
  c.fillStyle = '#ffe2a8';
  for (const [name, u, s] of [
    ['L₁', POINTS.L1, 0],
    ['L₂', POINTS.L2, 0],
    ['L₃', POINTS.L3, 0],
    ['L₄', ...POINTS.L4],
    ['L₅', ...POINTS.L5],
  ]) {
    c.fillRect(X(u) - 1.5, Y(s) - 1.5, 3, 3);
    c.fillText(name, X(u) + 5, Y(s) - 5);
  }
  c.fillStyle = '#ece8de';
  c.fillText('烛阴', X(shapeA.center) - 12, Y(0) + 4);
  c.fillText('望舒', X(shapeB.center) - 12, Y(0) + 4);
  c.fillStyle = '#929da7';
  c.fillText('跟着两颗行星一起转的视角 · 从轨道面正上方看', 10, h - 10);
  node.dataset.fill = model.fill.toFixed(3);
  $('lobes-result').textContent =
    model.fill >= 0.995
      ? '两颗行星的尖端在 L₁ 碰在一起：它们各自充满了自己的洛希瓣。再近一点，就不再是两颗分开的行星了。'
      : model.fill >= 0.88
        ? '尖端快要碰到 L₁。那里的东西几乎不受任何一方约束，稍微一动就会越过去落向对方。'
        : model.fill >= 0.72
          ? '两颗行星已经明显被拉成泪滴形，但都还稳稳地待在自己的地盘里。'
          : '离得还远：两颗行星只是略微被拉长，各自的地盘绰绰有余。';
}

// ---------- 启动 / 上下文丢失 / 降级 ----------
const FALLBACK = '下面「两颗行星各自的地盘」的示意图仍然可以使用。';
function fallback(message, next = 'unavailable') {
  status = next;
  cancelAnimationFrame(frame);
  frame = 0;
  last = 0;
  $('fallback').hidden = false;
  $('fallback').textContent = message;
  document.documentElement.dataset.ready = 'fallback';
  readout();
}
function restore() {
  try {
    build();
    status = 'ready';
    $('fallback').hidden = true;
    document.documentElement.dataset.ready = 'true';
    document.documentElement.dataset.backend = dust.backend;
    invalidate();
  } catch (error) {
    console.warn('Roche binary:', error);
    fallback('三维画面暂时无法启动。' + FALLBACK);
  }
}
function start() {
  bindControls();
  readout();
  drawLobes();
  new ResizeObserver(() => invalidate()).observe(document.body);
  if (!gl) {
    fallback('这台设备画不了三维画面（需要 WebGL2）。' + FALLBACK);
    return;
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    fallback('三维画面暂时中断，正在等待恢复。' + FALLBACK, 'lost');
  });
  canvas.addEventListener('webglcontextrestored', restore);
  document.addEventListener('visibilitychange', () => {
    last = 0;
    if (!document.hidden) invalidate();
  });
  restore();
}
try {
  start();
} catch (error) {
  console.warn('Roche binary:', error);
  fallback('三维画面暂时无法启动。' + FALLBACK);
}
