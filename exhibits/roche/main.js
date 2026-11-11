// 洛希极限展品 · 双星观测的页面逻辑（猫猫）：两颗虚构的行星、观景舱的镜头和读数，以及下半页的等势线示意图。
// 物理在 binary.js；主画面在 vista.js。
import { lagrange, planetShape, volumeRadius, periodHours, roche } from './binary.js?v=1';
import { createVista, aim, BINARY } from './vista.js?v=1';

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------- 两颗虚构的行星 ----------
const MU = 0.35, // 望舒占总质量的份额；烛阴占 65%
  RADIUS_A_KM = 6400, // 烛阴的等体积半径：用它把「间距 = 1」换成千米
  DENSITY_B = 3.4, // 望舒的密度（g/cm³）：周期由它和形状算出
  POINTS = lagrange(MU),
  BELT = 6.4, // 行星带画到大约多少倍间距（画面里外缘是慢慢淡出去的）
  ORBIT_SECONDS = 120, // 一倍速时，两颗行星互绕一圈用多少秒。大的东西动得慢
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

// ---------- 镜头 ----------
// tan 是 16:9 时横向半视场的正切；toward 是镜头从「正对窗外」转向双星中心的多少（0–1）
const SCOPES = {
  vista: { tan: 0.5774, toward: 0 }, // 全景：整条行星带、地平线和恒星
  pair: { tan: 0.19, toward: 1 }, // 望远镜对准两颗行星：看它们的泪滴形和尖端
};
const view = {
  scope: SCOPES[query.get('scope')] ? query.get('scope') : 'vista',
  tan: 0,
  toward: 0,
  yaw: 0, // 拖动：稍微转一下头（正切值）
  pitch: 0,
};
view.tan = SCOPES[view.scope].tan;
view.toward = SCOPES[view.scope].toward;

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
  vista = null,
  theta = Number(query.get('theta')) || 0.55, // 两星连线的相位
  clock = 0,
  paused = reduced.matches || query.get('motion') === '0',
  speed = 1,
  quality = 1, // 画布分辨率的折扣，按帧时间自动调
  frame = 0,
  last = 0,
  slow = 0,
  fast = 0;

// 这一刻两颗行星的样子
function frameInfo() {
  return {
    level: [shapeA.level, shapeB.level],
    reach: [shapeA.reach, shapeB.reach],
    tip: [shapeA.tip, shapeB.tip],
    l1: 0.5 * (shapeA.tip + shapeB.tip),
    bridge: smooth(0.88, 0.99, model.fill), // 尖端伸到九成左右，中间开始亮起来（示意）
  };
}
function advance(seconds) {
  theta += ((2 * Math.PI) / ORBIT_SECONDS) * speed * seconds;
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
const settled = () => {
  const goal = SCOPES[view.scope];
  return Math.abs(Math.log(view.tan / goal.tan)) < 2e-3 && Math.abs(view.toward - goal.toward) < 2e-3;
};
function draw(seconds) {
  resize();
  // 望远镜慢慢推过去、慢慢转过去
  const goal = SCOPES[view.scope],
    ease = seconds ? 1 - Math.exp(-seconds * 2.4) : 1;
  view.tan *= (goal.tan / view.tan) ** ease;
  view.toward += (goal.toward - view.toward) * ease;
  // 观景舱有一点很慢的晃动；系统设成「减少动态效果」时不晃
  const sway = reduced.matches ? 0 : view.tan / SCOPES.vista.tan,
    x = BINARY[0] * view.toward + view.yaw + 0.004 * sway * Math.sin(clock * 0.11),
    y = (BINARY[1] - 0.012) * view.toward + view.pitch + 0.003 * sway * Math.sin(clock * 0.07 + 1);
  vista.draw({ theta, time: clock, ...frameInfo(), tan: view.tan, basis: aim(x, y) });
}
function tick(now) {
  frame = 0;
  if (document.hidden || status !== 'ready') return;
  const seconds = last ? Math.min(now - last, 100) / 1000 : 0;
  last = now;
  if (!paused && seconds) {
    clock += seconds;
    advance(seconds);
    // 画得慢就降分辨率，快了再升回去
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
  if (!paused || !settled()) frame = requestAnimationFrame(tick);
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
        hdr: vista.hdr,
        fill: model.fill,
        theta,
        orbits: theta / (2 * Math.PI),
        speed,
        paused,
        scope: view.scope,
        tan: view.tan,
        yaw: view.yaw,
        pitch: view.pitch,
        quality,
      }
    : null;

// 检查用：不等动画帧，直接把时间往前推 seconds 秒（按当前倍速），再画一帧。页面在后台被限速时也能用。
window.zhixuRocheBinaryAdvance = (seconds) => {
  if (status !== 'ready') return null;
  clock += seconds;
  advance(seconds);
  view.tan = SCOPES[view.scope].tan;
  view.toward = SCOPES[view.scope].toward;
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
  $('belt-out').textContent = ((2 * BELT * km) / 1e4).toFixed(0);
  $('scope-out').textContent = `视场 ${((2 * Math.atan(view.tan) * 180) / Math.PI).toFixed(0)}°`;
  $('clock-out').textContent = paused
    ? '时间 已暂停'
    : `时间流速 ×${Math.round(((periodHours(MU, sizeB, DENSITY_B) * 3600) / ORBIT_SECONDS) * speed).toLocaleString('en-US')}`;
  for (const button of document.querySelectorAll('.deck-toolbar [data-scope]'))
    pressed(button, button.dataset.scope === view.scope);
  $('opt-speed').textContent = `×${speed}`;
  $('opt-motion').disabled = $('deck-pause').disabled = status !== 'ready';
  $('opt-motion').textContent = paused ? '继续' : '暂停';
  $('deck-pause').textContent = paused ? '继续观测' : '暂停时间';
  pressed($('opt-motion'), paused);
  pressed($('deck-pause'), paused);
  canvas.dataset.fill = model.fill.toFixed(3);
  canvas.dataset.telescope = view.scope;
  $('deck').dataset.scope = view.scope;
}
function setFill(value) {
  model.fill = clamp(value, 0.6, 1);
  reshape();
  invalidate();
}
function setScope(scope) {
  view.scope = scope;
  view.yaw = view.pitch = 0;
  invalidate();
}
function setBare(on) {
  $('deck').classList.toggle('bare', on);
  $('opt-bare').setAttribute('aria-pressed', String(on));
  $('opt-bare').textContent = on ? '显示界面' : '隐藏界面';
}
function bindControls() {
  let held = null;
  const turn = (dx, dy) => {
    // 像抓着画面拖；只能稍微转一点头，窗外的东西都很远
    view.yaw = clamp(view.yaw - dx * view.tan, -0.24 * view.tan, 0.24 * view.tan);
    view.pitch = clamp(view.pitch + dy * view.tan, -0.14 * view.tan, 0.14 * view.tan);
    invalidate();
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    held = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!held || held.id !== e.pointerId) return;
    turn(((e.clientX - held.x) * 2) / canvas.clientWidth, ((e.clientY - held.y) * 2) / canvas.clientWidth);
    held.x = e.clientX;
    held.y = e.clientY;
  });
  const release = (e) => {
    if (!held || held.id !== e.pointerId) return;
    held = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('keydown', (e) => {
    const act = {
      ArrowLeft: () => turn(0.08, 0),
      ArrowRight: () => turn(-0.08, 0),
      ArrowUp: () => turn(0, 0.06),
      ArrowDown: () => turn(0, -0.06),
      Home: () => setScope('vista'),
    }[e.key];
    if (act) {
      e.preventDefault();
      act();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'h' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range') return;
    setBare(!$('deck').classList.contains('bare'));
  });
  for (const id of ['fill', 'fill2']) $(id).oninput = (e) => setFill(Number(e.target.value));
  for (const button of document.querySelectorAll('.deck-toolbar [data-scope]'))
    button.onclick = () => setScope(button.dataset.scope);
  $('opt-speed').onclick = () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    invalidate();
  };
  $('opt-motion').onclick = () => {
    paused = !paused;
    last = 0;
    invalidate();
  };
  $('deck-pause').onclick = () => $('opt-motion').click();
  // 仪表（读数 + 控制台）按需展开
  $('deck-data').onclick = () => {
    const open = $('deck').classList.toggle('data-open');
    $('deck-data').setAttribute('aria-expanded', String(open));
    $('deck-data').textContent = open ? '收起仪表 −' : '观测仪表 ＋';
  };
  $('opt-bare').onclick = () => setBare(!$('deck').classList.contains('bare'));
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
    vista = createVista(gl);
    status = 'ready';
    $('fallback').hidden = true;
    document.documentElement.dataset.ready = 'true';
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
