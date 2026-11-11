// 洛希极限展品 · 双星观测的页面逻辑（猫猫）：两颗虚构的行星、几个贴着它们的机位、读数、碎屑的推进，以及下半页的等势线示意图。
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
  SUN,
} from './scene.js?v=3';

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rad = (x) => (x * Math.PI) / 180;
const deg = (x) => (x * 180) / Math.PI;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

// ---------- 两颗虚构的行星 ----------
const MU = 0.35, // 望舒占总质量的份额；烛阴占 65%
  RADIUS_A_KM = 6400, // 烛阴的等体积半径：用它把「间距 = 1」换成千米
  DENSITY_B = 3.4, // 望舒的密度（g/cm³）：周期由它和形状算出
  POINTS = lagrange(MU),
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

// ---------- 机位 ----------
// 这一页里的位置都写成跟着两颗行星一起转的坐标 [u, h, w]：u 沿烛阴→望舒的连线，h 垂直轨道面，w 在轨道面内。
// 机位固定在这套坐标里（观景舱跟着两颗行星一起转），所以构图不动，动的是恒星、星空和碎屑。
const world = ([u, h, w]) => toInertial([u, w, h], theta);
// 从行星中心沿某个方向走多远到地面：地面是有效势的等值面
function ground(shape, [du, dh, dw]) {
  let lo = 1e-3,
    hi = shape.reach * 1.2;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (roche(shape.center + mid * du, mid * dw, mid * dh, MU) > shape.level) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
// 贴着行星的机位：lean 是从「正对着对方的尖端」往回偏多少，turn 是绕连线转多少，height 是离地多高；
// pan / pitch 是镜头相对「朝着对面那颗行星、平视」偏多少。
const tune = (key, value) => (query.has(key) ? Number(query.get(key)) : value); // 调机位用：?lean=44&pitch=20 …
const STATIONS = {
  // 悬在望舒上空，靠近朝着烛阴的那一侧：脚下的地面朝着尖端隆起，烛阴从头顶一直垂到地平线，两个尖端在地平线上相接
  wangshu: { name: '望舒上空', over: 'B', lean: 44, turn: 132, height: 0.03, fov: 76, pan: 0, pitch: 9 },
  // 反过来：脚下是烛阴开裂的地面，望舒悬在天上
  zhuyin: { name: '烛阴上空', over: 'A', lean: 46, turn: -134, height: 0.034, fov: 76, pan: 0, pitch: 7 },
  // 两个尖端旁边：左右各是一颗行星的「墙」，中间是物质桥
  between: { name: '两界之间', at: () => [POINTS.L1 + 0.02, 0.06, 0.3], fov: 74, look: () => [POINTS.L1, 0.0, 0.0] },
  // L₄：和两颗行星成等边三角形的那个点，两颗行星和整条行星带都在眼前
  far: { name: 'L₄ 驻留点', at: () => [POINTS.L4[0] * 1.5, 0.95, POINTS.L4[1] * 1.5], fov: 62, look: () => [POINTS.L1, 0.0, 0.0] },
};
function place(station) {
  if (!station.over) {
    const eye = station.at();
    return { eye, above: [0, 1, 0], ahead: unit(sub(station.look(), eye)), shape: null };
  }
  const shape = station.over === 'A' ? shapeA : shapeB,
    other = station.over === 'A' ? shapeB : shapeA,
    lean = rad(tune('lean', station.lean)),
    turn = rad(tune('turn', station.turn)),
    s = Math.sin(lean),
    above = unit([shape.toward * Math.cos(lean), s * Math.cos(turn), s * Math.sin(turn)]),
    floor = ground(shape, above),
    eye = add([shape.center, 0, 0], scale(above, floor + tune('height', station.height))),
    // 朝着对面那颗行星、贴着「地平面」的方向，再按 pan / pitch 偏过去
    toward = sub([other.center, 0, 0], eye),
    level = unit(sub(toward, scale(above, dot(toward, above)))),
    side = cross(level, above),
    pan = rad(tune('pan', station.pan)),
    pitch = rad(tune('pitch', station.pitch)),
    c = Math.cos(pitch),
    ahead = add(
      add(scale(level, c * Math.cos(pan)), scale(side, c * Math.sin(pan))),
      scale(above, Math.sin(pitch)),
    );
  return { eye, above, ahead, shape };
}
const stationFov = () => rad(tune('fov', STATIONS[view.station].fov));
const view = {
  station: STATIONS[query.get('station')] ? query.get('station') : 'wangshu',
  yaw: 0, // 拖动：从机位的默认朝向往左右、上下转头
  pitch: 0,
  zoom: 1,
  fov: 0,
  lobes: false,
  marks: true,
};
view.fov = stationFov();
// 这一刻镜头在哪、朝哪看（共转系里）
function camera() {
  const spot = place(STATIONS[view.station]),
    rise = dot(spot.ahead, spot.above),
    level = unit(sub(spot.ahead, scale(spot.above, rise))), // 贴着「地平面」的朝向
    side = cross(level, spot.above),
    tilt = clamp(Math.asin(clamp(rise, -1, 1)) + view.pitch, rad(-80), rad(80)),
    c = Math.cos(tilt),
    fwd = add(
      add(scale(level, c * Math.cos(view.yaw)), scale(side, c * Math.sin(view.yaw))),
      scale(spot.above, Math.sin(tilt)),
    ),
    right = unit(cross(fwd, spot.above));
  return { ...spot, fwd, right, up: cross(right, fwd) };
}

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
  theta = Number(query.get('theta')) || 3.95, // 两星连线的相位；开始时恒星在烛阴旁边、刚离开地平线
  clock = 0,
  paused = reduced.matches || query.get('motion') === '0',
  speed = 1,
  quality = 1, // 画布分辨率的折扣和行星求交的步数，按帧时间自动调
  frame = 0,
  last = 0,
  slow = 0,
  fast = 0,
  flare = 0,
  matrix = null;

function build() {
  renderer = createRenderer(gl, { allowHdr: query.get('hdr') !== '0' });
  if (query.get('sim') !== 'cpu' && gpuDustAvailable(gl)) {
    // 桌面 105 万粒；平板宽度 26 万粒
    const side = innerWidth < 1100 ? 512 : 1024;
    dust = createGpuDust(gl, side, side);
  } else dust = createCpuDust(gl, 128, 128); // 没有浮点渲染目标：CPU 上推 1.6 万粒
}
// 这一刻两颗行星的样子，给碎屑积分和画面用
function frameInfo(dt = 0) {
  const centers = [world([-MU, 0, 0]), world([1 - MU, 0, 0])],
    bridge = smooth(0.88, 0.99, model.fill), // 尖端伸到九成左右开始有碎屑被扯出来（示意）
    rate = 2.4 * bridge;
  return {
    theta,
    mu: MU,
    level: [shapeA.level, shapeB.level],
    reach: [shapeA.reach, shapeB.reach],
    tip: [shapeA.tip, shapeB.tip],
    emit: 1 - Math.exp(-rate * dt),
    heat: smooth(0.7, 1, model.fill),
    bridge,
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

// 从镜头看恒星，有没有被哪颗行星挡住：朝恒星圆面上的几个点各看一眼，露出来几成就是几成（给镜头的拉丝用）
function blocked(ro, rd, shape) {
  const oc = [ro[0] - shape.center, ro[1], ro[2]],
    b = dot(oc, rd),
    h = b * b - dot(oc, oc) + shape.reach ** 2;
  if (h < 0) return false;
  const root = Math.sqrt(h),
    from = Math.max(-b - root, 0),
    to = -b + root,
    middle = 0.5 * (shapeA.tip + shapeB.tip);
  for (let i = 0; i <= 56; i++) {
    const t = from + ((to - from) * i) / 56,
      p = add(ro, scale(rd, t));
    if (
      (p[0] - middle) * shape.toward < 0 && // 只认两个尖端中间那个面的本侧
      roche(p[0], p[2], p[1], MU) > shape.level &&
      Math.hypot(p[0] - shape.center, p[1], p[2]) < shape.reach
    )
      return true;
  }
  return false;
}
function sunlight(eye) {
  const c = Math.cos(theta),
    s = Math.sin(theta),
    sun = [SUN[0] * c + SUN[2] * s, SUN[1], -SUN[0] * s + SUN[2] * c],
    a = unit(cross(sun, [0, 1, 0])),
    b = cross(a, sun);
  let open = 0;
  const rings = [[0, 0]];
  for (let i = 0; i < 6; i++) rings.push([Math.cos(i * 1.047) * 0.009, Math.sin(i * 1.047) * 0.009]);
  for (const [x, y] of rings) {
    const rd = unit(add(sun, add(scale(a, x), scale(b, y))));
    if (!blocked(eye, rd, shapeA) && !blocked(eye, rd, shapeB)) open++;
  }
  return open / rings.length;
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
const goalFov = () => clamp(stationFov() * view.zoom, rad(24), rad(96));
function draw(seconds) {
  resize();
  const ease = seconds ? 1 - Math.exp(-seconds * 4.5) : 1;
  view.fov += (goalFov() - view.fov) * ease;
  const cam = camera(),
    textures = dust.textures(),
    open = sunlight(cam.eye);
  flare += (open - flare) * (seconds ? 1 - Math.exp(-seconds * 6) : 1);
  matrix = renderer.draw({
    eye: world(cam.eye),
    basis: { fwd: world(cam.fwd), right: world(cam.right), up: world(cam.up) },
    fov: view.fov,
    frame: frameInfo(),
    dust: query.get('dust') === '0' ? null : { pos: textures.pos, vel: textures.vel, size: dust.size, count: dust.count },
    grain: dust.count > 500000 ? 0.0011 : dust.count > 100000 ? 0.0016 : 0.003,
    stream: 0.2,
    steps: quality < 0.8 ? 48 : 72,
    sunlight: flare,
    time: clock,
  });
  overlay();
}

// 叠在画面上的线和字：洛希瓣的轮廓、L₁、两颗行星的名字和大小
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
      out.push([center + lo * cos, 0, lo * sin]);
    }
    return out;
  };
  return [outline(-MU, POINTS.L1 + MU), outline(1 - MU, 1 - MU - POINTS.L1)];
})();
function overlay() {
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    at = (point) => {
      const p = project(matrix, world(point));
      return p && [p[0] * w, p[1] * h];
    },
    inside = (p) => p && p[0] > 0.04 * w && p[0] < 0.96 * w && p[1] > 0.08 * h && p[1] < 0.86 * h;
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
    const p = at([POINTS.L1, 0, 0]);
    if (inside(p))
      marks += `<path class="point" d="M${p[0] - 5} ${p[1]}L${p[0]} ${p[1] - 5}L${p[0] + 5} ${p[1]}L${p[0]} ${p[1] + 5}Z"/><text x="${p[0] + 10}" y="${p[1] + 3}">L₁</text>`;
    const km = kilometres();
    for (const [name, shape, size] of [
      ['烛阴', shapeA, sizeA],
      ['望舒', shapeB, sizeB],
    ]) {
      const centre = at([shape.center, 0, 0]);
      if (!inside(centre)) continue; // 脚下的那一颗，中心不在画面里
      const [x, y] = centre;
      marks += `<path class="bracket" d="M${x - 5} ${y}h10M${x} ${y - 5}v10M${x + 12} ${y - 12}l14 -14h64"/><text class="name" x="${x + 30}" y="${y - 34}">${name}</text><text x="${x + 30}" y="${y - 12}">直径 ${(Math.round((2 * size * km) / 100) * 100).toLocaleString('en-US')} 千米</text>`;
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
  // 镜头还在变焦的时候，即使暂停也接着画
  const settling = Math.abs(view.fov - goalFov()) > 1e-4;
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
        station: view.station,
        fov: view.fov,
        yaw: view.yaw,
        pitch: view.pitch,
        sunlight: flare,
        sun: (() => {
          const spot = place(STATIONS[view.station]),
            c = Math.cos(theta),
            s = Math.sin(theta),
            sun = [SUN[0] * c + SUN[2] * s, SUN[1], -SUN[0] * s + SUN[2] * c],
            rise = dot(spot.ahead, spot.above),
            level = unit(sub(spot.ahead, scale(spot.above, rise))),
            side = cross(level, spot.above);
          return [deg(Math.atan2(dot(sun, side), dot(sun, level))), deg(Math.asin(dot(sun, spot.above)))];
        })(),
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
  view.fov = goalFov();
  draw(0);
  readout();
  return window.zhixuRocheBinaryProbe();
};

// ---------- 读数和控件 ----------
function readout() {
  const km = kilometres(),
    station = STATIONS[view.station],
    spot = place(station),
    pressed = (node, on) => node.setAttribute('aria-pressed', String(on)),
    round = (x, step) => (Math.round(x / step) * step).toLocaleString('en-US');
  $('gap-out').textContent = Math.round(km).toLocaleString('en-US');
  $('period-out').textContent = periodHours(MU, sizeB, DENSITY_B).toFixed(1);
  $('tips-out').textContent = Math.round((shapeB.tip - shapeA.tip) * km).toLocaleString('en-US');
  $('fill-out').textContent = (model.fill * 100).toFixed(0);
  $('fill2-out').textContent = (model.fill * 100).toFixed(0);
  $('fill').value = $('fill2').value = String(model.fill);
  $('station-out').textContent = station.name;
  // 机位离地多高；不贴着行星的机位，报离 L₁ 多远
  $('alt-out').textContent = spot.shape
    ? `离地 ${round(tune('height', station.height) * km, 10)} 千米`
    : `距 L₁ ${round(Math.hypot(...sub(spot.eye, [POINTS.L1, 0, 0])) * km, 100)} 千米`;
  // 天上那颗行星有多大：它的直径在眼里张开多少度
  const sky = spot.shape === shapeA ? shapeB : shapeA,
    away = Math.hypot(...sub(spot.eye, [sky.center, 0, 0]));
  $('span-out').textContent =
    `${sky === shapeA ? '烛阴' : '望舒'} 张开 ${deg(2 * Math.asin(Math.min(sky.side / away, 1))).toFixed(0)}°`;
  $('scope-out').textContent = `视场 ${deg(view.fov).toFixed(0)}°`;
  $('clock-out').textContent = paused
    ? '时间 已暂停'
    : `时间流速 ×${Math.round(((periodHours(MU, sizeB, DENSITY_B) * 3600) / ORBIT_SECONDS) * speed).toLocaleString('en-US')}`;
  for (const button of document.querySelectorAll('.deck-toolbar [data-station]'))
    pressed(button, button.dataset.station === view.station);
  $('deck-pause').disabled = status !== 'ready';
  $('deck-pause').textContent = paused ? '继续观测' : '暂停时间';
  pressed($('deck-pause'), paused);
  $('opt-speed').textContent = `×${speed}`;
  $('opt-motion').disabled = status !== 'ready';
  $('opt-motion').textContent = paused ? '继续' : '暂停';
  pressed($('opt-motion'), paused);
  canvas.dataset.fill = model.fill.toFixed(3);
  canvas.dataset.station = view.station;
}
function setFill(value) {
  model.fill = clamp(value, 0.6, 1);
  reshape();
  invalidate();
}
function setBare(on) {
  $('deck').classList.toggle('bare', on);
  $('opt-bare').setAttribute('aria-pressed', String(on));
  $('opt-bare').textContent = on ? '显示界面' : '隐藏界面';
}
function bindControls() {
  const pointers = new Map();
  let pinch = 0;
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const turn = (dx, dy) => {
    // 像抓着画面拖：往右拖，镜头往左转；看得越细转得越慢
    const gain = view.fov / rad(56);
    view.yaw = clamp(view.yaw - dx * gain, rad(-80), rad(80));
    view.pitch = clamp(view.pitch + dy * gain, rad(-38), rad(38));
    invalidate();
  };
  const zoom = (factor) => {
    view.zoom = clamp(view.zoom * factor, 0.5, 1.4);
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
    } else turn(dx * 0.0016, dy * 0.0016);
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
      ArrowLeft: () => turn(0.06, 0),
      ArrowRight: () => turn(-0.06, 0),
      ArrowUp: () => turn(0, 0.05),
      ArrowDown: () => turn(0, -0.05),
      '+': () => zoom(0.9),
      '=': () => zoom(0.9),
      '-': () => zoom(1.11),
      Home: () => {
        view.zoom = 1;
        view.yaw = view.pitch = 0;
        invalidate();
      },
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
  for (const button of document.querySelectorAll('.deck-toolbar [data-station]'))
    button.onclick = () => {
      view.station = button.dataset.station;
      view.zoom = 1;
      view.yaw = view.pitch = 0;
      view.fov = stationFov(); // 换机位是切镜头，不是推拉
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
  $('opt-bare').onclick = () => setBare(!$('deck').classList.contains('bare'));
  // 工具条：暂停，和按需展开的仪表（读数 + 控制台）
  $('deck-pause').onclick = () => $('opt-motion').click();
  $('deck-data').onclick = () => {
    const open = $('deck').classList.toggle('data-open');
    $('deck-data').setAttribute('aria-expanded', String(open));
    $('deck-data').textContent = open ? '收起仪表 −' : '观测仪表 ＋';
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
  // 现在的机位在这张图上的位置
  const eye = place(STATIONS[view.station]).eye;
  c.strokeStyle = '#7fe0b0';
  c.lineWidth = 1.2;
  c.strokeRect(X(eye[0]) - 3.5, Y(eye[2]) - 3.5, 7, 7);
  c.fillStyle = '#7fe0b0';
  c.fillText('机位', X(eye[0]) + 8, Y(eye[2]) + 4);
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
