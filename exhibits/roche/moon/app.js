// 洛希极限展品的页面逻辑（猫猫）：建卫星、推进 N 体、影片的镜头和字幕、自由观察、读数，以及下半页的希尔球示意图和标尺。
// 物理都在 physics.js；sim.js 负责在显卡或 CPU 上积分；render.js 只管画。
import { PILES } from './pile-data.js?v=1';
import {
  pileParams,
  measurePile,
  settlePile,
  placeOnOrbit,
  boundClump,
  coast,
  rocheFluid,
  rocheRigid,
  hillOverflow,
  orbitalRate,
} from './physics.js?v=2';
import { createGpuSim, createCpuSim, gpuSimAvailable } from './sim.js?v=2';
import { createRenderer, project, SUN } from './render.js?v=2';

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rad = (x) => (x * Math.PI) / 180;
const mix = (a, b, s) => a + (b - a) * s;
const ease = (s) => s * s * s * (s * (s * 6 - 15) + 10);
const TAU = 2 * Math.PI;
// 把角度 a 换成离 near 最近的那个等价角
const nearestTurn = (a, near) => a + TAU * Math.round((near - a) / TAU);

// ---------- 卫星和行星 ----------
const PLANET_DENSITY = 0.687; // 土星的平均密度，g/cm³
const RHO_MIN = 0.3,
  RHO_MAX = 5,
  D_MIN = 1.15,
  D_MAX = 4.5;
const model = { rho: 0.93, d: 2.9 };
const ratio = () => model.rho / PLANET_DENSITY;

// ---------- 自由观察时的视角 ----------
const SUN_AZ = Math.atan2(SUN[2], SUN[0]);
const VIEWS = {
  follow: { mode: 'follow', dist: 1.9, incl: rad(68), az: -0.5 },
  wide: { mode: 'wide', dist: 9.5, incl: rad(58), az: SUN_AZ + 1.9 },
  top: { mode: 'wide', dist: 12, incl: rad(6), az: 0.9 },
};
const view = { ...VIEWS.follow, preset: 'follow', lines: true, layers: true, stars: true };

// ---------- 影片 ----------
// 一段大约一分钟的固定镜头：远看 → 靠近 → 撕开 → 散开 → 成环。物理仍然是实时算的，影片只安排镜头、倍速和字幕。
// 每个镜头：到这个时刻相机应该在的位置。turn = 跟着卫星一起转的程度；aim = 0 看行星中心、1 看卫星。
const SHOTS = [
  { t: 0, turn: 1, aim: 0.62, dist: 6.2, incl: 76, az: -0.66, fov: 36 },
  { t: 7, turn: 1, aim: 1, dist: 1.8, incl: 71, az: -0.52, fov: 36 },
  { t: 21, turn: 1, aim: 1, dist: 1.05, incl: 73, az: -0.44, fov: 36 },
  { t: 36, turn: 1, aim: 1, dist: 1.45, incl: 64, az: -1.05, fov: 38 },
  { t: 47, turn: 0, aim: 0, dist: 9.2, incl: 54, az: SUN_AZ + 1.9, fov: 36 },
  { t: 62, turn: 0, aim: 0, dist: 6.6, incl: 107, az: SUN_AZ + Math.PI - 0.12, fov: 40 },
];
// 每一幕：到 end 秒为止。speed 是模拟倍速；hold 为真时停在幕尾等物理赶上来（比如等它真的被撕开）。
const ACTS = [
  { end: 7, name: '远处', speed: () => 2 },
  { end: 21, name: '靠近', speed: () => 4, hold: () => migrating && model.d > SLOW_AT },
  { end: 36, name: '撕开', speed: () => 1.25, hold: () => bound > 0.6 && film.waited < 10 },
  { end: 47, name: '散开', speed: () => 2 },
  { end: 62, name: '成环', speed: (s) => mix(2, 16, ease(clamp(s * 5, 0, 1))) },
];
const FILM_END = ACTS[ACTS.length - 1].end,
  SLOW_AT = 2.13, // 靠近到这里就从快进换回慢速
  MIGRATE_TO = 1.86, // 影片里卫星最多螺旋到这个距离（冰的流体极限是 2.21，碎石堆在约 2.0 处解体）
  // 示意用的轨道衰减率：「靠近」那一幕正好在幕尾走到 SLOW_AT，「撕开」那一幕慢放时再收紧到 MIGRATE_TO
  DRAG_NEAR = 0.00184,
  DRAG_TEAR = 0.0036;
const film = { t: 0, waited: 0, release: null, pulled: false, nudge: [0, 0] };
let mode = 'intro', // intro（等着开始）| film（播放中）| free（自己动手）
  migrating = false;

// ---------- 运行状态 ----------
const canvas = $('scene');
const gl = (() => {
  try {
    return canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
})();
let status = 'loading', // loading | ready | unavailable | lost
  renderer = null,
  sim = null,
  pile = null,
  params = null, // 当前密度下的模拟参数
  clump = { center: [model.d, 0, 0], count: 0 }, // 还聚在一起的那一团
  bound = 1,
  sinceRead = 0, // 上次读回之后又走了多少模拟时间
  phase = 0, // 卫星（或它原本该在的位置）此刻的轨道相位；相机跟的是这个点
  elapsed = 0, // 这颗卫星放进轨道之后的模拟时间
  paused = reduced.matches || query.get('motion') === '0',
  budget = 12, // 每一帧最多走多少步，按帧时间自动调
  debt = 0, // 还没走的步数（带小数）
  speed = 1,
  smaller = false, // 显卡太慢时换成 1024 颗
  frame = 0,
  ticks = 0,
  last = 0,
  clock = 0,
  slow = 0,
  fast = 0,
  matrix = null;

function decodePile(n) {
  const text = atob(PILES[n]),
    bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return measurePile(new Float32Array(bytes.buffer), n);
}
function build() {
  renderer = createRenderer(gl, { allowHdr: query.get('hdr') !== '0' }); // ?hdr=0：检查用，强制走没有后期的那条路
  const gpu = query.get('sim') !== 'cpu' && gpuSimAvailable(gl);
  if (gpu) {
    const asked = Number(query.get('n')),
      n = PILES[asked] ? asked : smaller || innerWidth < 700 ? 1024 : 4096;
    pile = decodePile(n);
    sim = createGpuSim(gl, n, n > 2000 ? 64 : 32); // 每颗碎石带 64 或 32 粒冰尘
    budget = 12;
  } else {
    // 没有浮点渲染目标：用 CPU 跑一颗小一些的卫星，现场聚拢
    pile = settlePile(400);
    sim = createCpuSim(gl, 400, 24);
    budget = 3;
  }
  renderer.setLayers(pile.depth, sim.size);
  params = pileParams(pile.n, ratio(), pile.rEff);
  place(model.d, 0);
}
function upload(state) {
  const count = sim.size[0] * sim.size[1],
    x = new Float32Array(4 * count),
    v = new Float32Array(4 * count);
  for (let i = 0; i < pile.n; i++) {
    for (let k = 0; k < 3; k++) {
      x[4 * i + k] = state.x[3 * i + k];
      v[4 * i + k] = state.v[3 * i + k];
    }
    x[4 * i + 3] = 1;
    v[4 * i + 3] = 12; // 邻居数先填一个大数，免得第一步之前冰尘就散开
  }
  sim.load(x, v, params);
}
// 在半径 d 的圆轨道上放一颗新的、完整的卫星
function place(d, at) {
  upload(placeOnOrbit(pile, d, at));
  phase = at;
  clump = { center: [d * Math.cos(at), 0, d * Math.sin(at)], count: pile.n };
  bound = 1;
  sinceRead = 0;
  elapsed = 0;
}
const phaseOf = (p) => Math.atan2(p[2], p[0]);
function measure() {
  const { x } = sim.read(),
    guess = { center: coast(clump.center, sinceRead), count: clump.count },
    next = boundClump(x, pile.n, params.mp, guess, { stride: 4 });
  clump = next.count ? next : { center: guess.center, count: 0 };
  sinceRead = 0;
  bound = clump.count / pile.n;
  if (bound >= 0.5) {
    // 卫星还在：相机跟着它。影片里它在螺旋向内，轨道距离也跟着量到的走
    phase += 0.5 * (nearestTurn(phaseOf(clump.center), phase) - phase);
    if (migrating) {
      model.d = Math.hypot(clump.center[0], clump.center[2]);
      if (model.d <= MIGRATE_TO) migrating = false;
    }
  } else migrating = false; // 已经散了，不再往里拖
  return x;
}
// 改轨道距离：卫星还完整时把它整个挪过去（保持同步自转），已经散了就放一颗新的。
function moveTo(d) {
  model.d = clamp(d, D_MIN, D_MAX);
  if (status === 'ready') {
    if (bound < 0.97) place(model.d, phase);
    else {
      const x = measure(),
        { v } = sim.read(),
        c = clump.center,
        scale = model.d / Math.hypot(c[0], c[2]),
        shift = [c[0] * (scale - 1), -c[1], c[2] * (scale - 1)],
        reach = (1.6 * clump.radius) ** 2,
        rate = orbitalRate(model.d);
      for (let i = 0; i < pile.n; i++) {
        const at = 4 * i,
          dx = x[at] - c[0],
          dy = x[at + 1] - c[1],
          dz = x[at + 2] - c[2];
        v[at + 3] = 12;
        if (x[at + 3] < 0.5 || dx * dx + dy * dy + dz * dz > reach) continue;
        x[at] += shift[0];
        x[at + 1] += shift[1];
        x[at + 2] += shift[2];
        v[at] = rate * x[at + 2];
        v[at + 1] = 0;
        v[at + 2] = -rate * x[at];
      }
      sim.load(x, v, params);
      clump.center = [c[0] * scale, 0, c[2] * scale];
      phase = nearestTurn(phaseOf(clump.center), phase);
      elapsed = 0;
    }
  }
  invalidate();
}
function setDensity(rho) {
  model.rho = clamp(rho, RHO_MIN, RHO_MAX);
  if (pile) params = pileParams(pile.n, ratio(), pile.rEff);
  invalidate();
}

// ---------- 影片的进行 ----------
const actAt = (t) => ACTS.findIndex((act) => t < act.end);
function startFilm() {
  if (status !== 'ready') return;
  setDensity(0.93);
  model.d = 2.9;
  place(model.d, 0);
  view.lines = true;
  $('opt-lines').checked = true;
  Object.assign(film, { t: 0, waited: 0, release: null, pulled: false, nudge: [0, 0] });
  migrating = false;
  paused = false;
  mode = 'film';
  last = 0;
  invalidate();
}
function leaveFilm() {
  // 把影片此刻的镜头交给自由观察，画面不跳
  const shot = filmShot(),
    following = shot.turn > 0.5;
  migrating = false;
  speed = following ? 1 : 4;
  Object.assign(view, {
    mode: following ? 'follow' : 'wide',
    dist: following ? clamp(shot.dist, 0.45, 8) : clamp(shot.dist, 3.5, 40),
    incl: shot.incl,
    az: following ? shot.azimuth - phase : shot.azimuth,
    preset: '',
  });
  if (film.t >= 50) {
    // 片尾的逆光镜头没有画极限线；交给自由观察时也先不画，免得突然冒出来
    view.lines = false;
    $('opt-lines').checked = false;
  }
  mode = 'free';
  invalidate();
}
function advanceFilm(dt) {
  const index = actAt(film.t);
  if (index < 0) return;
  const act = ACTS[index],
    begin = index ? ACTS[index - 1].end : 0;
  // 第二幕一开始，卫星开始螺旋向内
  if (index === 1 && !film.pulled && model.d > MIGRATE_TO) {
    migrating = true;
    film.pulled = true;
  }
  let next = film.t + dt;
  if (next >= act.end && act.hold && act.hold()) {
    next = act.end - 1e-3; // 停在幕尾，等物理赶上来
    film.waited += dt;
  } else if (next >= act.end) film.waited = 0;
  film.t = next;
  speed = act.speed((film.t - begin) / (act.end - begin));
  if (film.t >= FILM_END) {
    film.t = FILM_END;
    leaveFilm();
  }
}
// 影片此刻的镜头：在前后两个机位之间平滑过渡
function filmShot() {
  let i = SHOTS.findIndex((shot) => film.t < shot.t);
  if (i < 0) i = SHOTS.length - 1;
  const a = SHOTS[Math.max(0, i - 1)],
    b = SHOTS[i],
    s = ease(clamp((film.t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1)),
    shot = {};
  for (const key of ['turn', 'aim', 'dist', 'fov']) shot[key] = mix(a[key], b[key], s);
  shot.incl = rad(mix(a.incl, b.incl, s));
  // 方位角：跟转的机位是「相对卫星的角度 + 相位」，不跟转的是固定角度。从跟转换到不跟转时，
  // 记下放手那一刻的去向，朝离它最近的那个固定角度滑过去，免得相机多绕几圈。
  if (a.turn > 0.5 && b.turn < 0.5) {
    if (!film.release) film.release = { to: nearestTurn(b.az, a.az + phase - 2.4) };
    shot.azimuth = mix(a.az + phase, film.release.to, s);
  } else if (a.turn < 0.5 && b.turn < 0.5) {
    const from = film.release ? film.release.to : a.az;
    shot.azimuth = mix(from, nearestTurn(b.az, from), s);
  } else shot.azimuth = mix(a.az, b.az, s) + phase;
  shot.azimuth += film.nudge[0];
  shot.incl = clamp(shot.incl + film.nudge[1], 0.05, Math.PI - 0.05);
  return shot;
}
function caption() {
  const index = actAt(film.t),
    fluid = rocheFluid(ratio());
  return [
    () => '一颗由碎石和冰聚成的卫星，绕着行星转。它始终同一面朝着行星。',
    () =>
      model.d > fluid
        ? '它的轨道在慢慢收紧。真实里要几千万年，这里压成十几秒。'
        : '越过了流体极限。液态的卫星到这里就散了；碎石堆比液体结实一点，还撑着。',
    () =>
      bound >= 0.97
        ? '潮汐沿着行星的方向，把它往两头拉。'
        : bound >= 0.5
          ? '两端开始守不住，碎石从尖端流走。'
          : '它被撕开了。没有任何东西撞上它。',
    () => '里侧的碎石转得快，跑到前面；外侧的转得慢，落在后面。',
    () => (film.t < 54 ? '十几圈之后，首尾相接：一道环。' : '逆着光看，冰尘把阳光散射过来。'),
  ][index < 0 ? ACTS.length - 1 : index]();
}

// ---------- 画面 ----------
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2),
    w = Math.max(2, Math.round(canvas.clientWidth * dpr)),
    h = Math.max(2, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return dpr;
}
const moonPoint = () => [model.d * Math.cos(phase), 0, model.d * Math.sin(phase)];
function camera() {
  const moon = moonPoint();
  let aim, dist, incl, azimuth, fov;
  if (mode === 'free') {
    aim = view.mode === 'follow' ? 1 : 0;
    ({ dist, incl } = view);
    azimuth = view.az + (view.mode === 'follow' ? phase : 0);
  } else {
    // 等着开始的时候停在第一个机位，慢慢左右摆
    ({ aim, dist, incl, azimuth, fov } = filmShot());
    if (mode === 'intro') azimuth += 0.05 * Math.sin(clock * 0.25);
  }
  const target = moon.map((value) => value * aim),
    s = Math.sin(incl);
  return {
    target,
    fov: fov ? rad(fov) : undefined,
    eye: [
      target[0] + dist * s * Math.cos(azimuth),
      target[1] + dist * Math.cos(incl),
      target[2] + dist * s * Math.sin(azimuth),
    ],
  };
}
function draw() {
  const pixelRatio = resize(),
    { eye, target, fov } = camera(),
    q = ratio(),
    toMoon = moonPoint().map((value) => value / model.d),
    // 行星朝着卫星的那一面有多少被太阳照着
    lit = 0.5 * (1 + toMoon[0] * SUN[0] + toMoon[1] * SUN[1] + toMoon[2] * SUN[2]),
    // 极限线：影片里随着拉远慢慢隐去，最后的逆光镜头不画
    lines = !view.lines ? 0 : mode === 'free' ? 1 : clamp((50 - film.t) / 8, 0, 1) * 0.85;
  matrix = renderer.draw({
    eye,
    target,
    fov,
    rocks: { texture: sim.texture(), size: sim.size, count: sim.size[0] * sim.size[1] },
    dust: sim.dust && {
      texture: sim.dust.texture(),
      size: sim.dust.size,
      count: sim.dust.size[0] * sim.dust.size[1],
      per: sim.dust.per,
    },
    radius: params.s,
    grain: 0.3 * params.s,
    fluid: rocheFluid(q),
    rigid: rocheRigid(q),
    orbit: model.d,
    lines,
    stars: view.stars,
    layers: view.layers,
    shine: { direction: toMoon.map((value) => -value), strength: (0.9 * lit) / model.d ** 2 },
    focus: moonPoint(),
    pixelRatio,
    time: clock,
  });
  labels(eye, lines);
}
// 极限线上的小字：跟着卫星时放在卫星旁边，看全景时放在朝着相机的一侧
function labels(eye, lines) {
  const q = ratio(),
    following = mode === 'free' ? view.mode === 'follow' : filmShot().turn > 0.5,
    base = following ? phase : Math.atan2(eye[2], eye[0]) + 0.45;
  for (const [id, radius, text] of [
    ['label-fluid', rocheFluid(q), '流体极限'],
    ['label-rigid', rocheRigid(q), '刚体极限'],
  ]) {
    const node = $(id),
      angle = base + (following ? 0.42 / radius : 0),
      point = [radius * Math.cos(angle), 0, radius * Math.sin(angle)],
      at = lines > 0.3 && radius > 1.03 && visible(eye, point) ? project(matrix, point) : null;
    if (at && at[0] > 0.02 && at[0] < 0.9 && at[1] > 0.04 && at[1] < 0.96) {
      node.textContent = `${text} ${radius.toFixed(2)} R`;
      node.style.transform = `translate(${(at[0] * canvas.clientWidth).toFixed(1)}px, ${(at[1] * canvas.clientHeight - 8).toFixed(1)}px)`;
      node.style.opacity = '1';
    } else node.style.opacity = '0';
  }
}
// 从相机到这个点的连线有没有被行星挡住
function visible(eye, point) {
  const d = point.map((value, i) => value - eye[i]),
    length = Math.hypot(...d),
    along = -(eye[0] * d[0] + eye[1] * d[1] + eye[2] * d[2]) / length;
  if (along <= 0 || along >= length) return true;
  const nearest = eye.map((value, i) => value + (d[i] / length) * along);
  return Math.hypot(...nearest) > 1;
}

const still = () => paused;
const RATE = 1.5, // 一倍速时每秒走多少模拟时间；土星附近一个单位约 40 分钟
  SPEEDS = [1, 4, 16];
function tick(now) {
  frame = 0;
  if (document.hidden || status !== 'ready') return;
  const dt = last ? Math.min(now - last, 100) : 0;
  last = now;
  if (!still()) {
    clock += dt / 1000;
    if (mode === 'film') advanceFilm(dt / 1000);
    else if (mode === 'intro') speed = 1;
    // 模拟时间按真实时间走（每秒 RATE × 倍速），和屏幕刷新率无关；每一步的物理不变。
    debt = Math.min(debt + (RATE * speed * dt) / 1000 / params.dt, 2 * budget);
    const steps = Math.min(Math.floor(debt), budget);
    debt -= steps;
    if (steps) {
      const drag = !migrating ? 0 : model.d > SLOW_AT ? DRAG_NEAR : DRAG_TEAR;
      sim.step(steps, params, { drag });
      sinceRead += steps * params.dt;
      elapsed += steps * params.dt;
      phase -= orbitalRate(model.d) * steps * params.dt;
    }
    // 画得慢就少走几步（模拟变慢），快了再加回来
    if (dt > 28) (slow++, (fast = 0));
    else if (dt && dt < 19) (fast++, (slow = 0));
    if (slow > 8) {
      slow = 0;
      if (budget > 1) budget = Math.max(1, Math.round(budget * 0.7));
      else if (sim.backend === 'gpu' && pile.n > 1024 && !smaller) {
        // 每帧只走一步还是慢：换成颗粒少的那一份，重新放一颗
        smaller = true;
        restore();
        return;
      }
    }
    if (fast > 45) {
      budget = Math.min(sim.backend === 'gpu' ? 64 : 8, budget + 2);
      fast = 0;
    }
  }
  if (++ticks % 6 === 0 && !still()) {
    measure();
    readout();
  }
  draw();
  if (!still()) frame = requestAnimationFrame(tick);
  else last = 0;
}
function invalidate() {
  readout();
  drawLobe();
  drawRuler();
  if (status === 'ready' && !frame && !document.hidden) frame = requestAnimationFrame(tick);
}

// 检查用：读出模拟现在的状态。
window.zhixuRocheProbe = () =>
  status === 'ready'
    ? {
        backend: sim.backend,
        n: pile.n,
        dust: sim.dust ? sim.dust.total : 0,
        hdr: renderer.hdr,
        bound,
        distance: Math.hypot(...clump.center),
        d: model.d,
        orbits: (elapsed * orbitalRate(model.d)) / (2 * Math.PI),
        budget,
        speed,
        paused,
        mode,
        film: film.t,
        act: mode === 'film' ? ACTS[Math.max(0, actAt(film.t))].name : '',
        migrating,
      }
    : null;

// ---------- 读数和控件 ----------
function readout() {
  const q = ratio(),
    whole = bound >= 0.97;
  $('d-out').textContent = model.d.toFixed(2);
  $('fluid-out').textContent = rocheFluid(q).toFixed(2);
  $('bound-out').textContent = status === 'ready' ? (bound * 100).toFixed(0) : '—';
  $('dist').value = $('dist2').value = String(model.d);
  $('d2-out').textContent = model.d.toFixed(2);
  $('rho').value = String(Math.log(model.rho));
  for (const button of document.querySelectorAll('.materials button'))
    button.setAttribute(
      'aria-pressed',
      String(Math.abs(Number(button.dataset.rho) - model.rho) < 0.005),
    );
  for (const name of Object.keys(VIEWS))
    $('view-' + name).setAttribute('aria-pressed', String(view.preset === name));
  $('opt-motion').disabled = status !== 'ready';
  $('opt-motion').textContent = paused ? '继续' : '暂停';
  $('opt-motion').setAttribute('aria-pressed', String(paused));
  $('opt-speed').textContent = `速度 ×${SPEEDS.includes(speed) ? speed : speed.toFixed(0)}`;
  const turns = (elapsed * orbitalRate(model.d)) / (2 * Math.PI);
  $('state-out').textContent =
    status !== 'ready'
      ? status === 'loading'
        ? '正在准备画面'
        : '二维示意可用'
      : (paused ? '已暂停 · ' : '') +
        (whole
          ? `${pile.n} 颗碎石 · 完整，同一面朝着行星`
          : bound >= 0.5
            ? '两端正在流失碎石'
            : '已被潮汐撕开 · 碎石沿轨道散开') +
        (turns >= 0.05 ? ` · 第 ${turns.toFixed(1)} 圈` : '');
  // 影片条
  document.querySelector('.stage').dataset.mode = status === 'ready' ? mode : 'free';
  $('film-play').textContent =
    mode === 'intro' ? '开始 · 坠向洛希极限' : paused ? '继续' : '暂停';
  $('film-play').disabled = status !== 'ready';
  $('film-progress').style.width = `${((film.t / FILM_END) * 100).toFixed(1)}%`;
  $('film-act').textContent = mode === 'film' ? ACTS[Math.max(0, actAt(film.t))].name : '';
  $('caption').textContent = mode === 'film' ? caption() : '';
  canvas.dataset.bound = bound.toFixed(3);
  canvas.dataset.d = model.d.toFixed(3);
  canvas.dataset.rho = model.rho.toFixed(3);
  canvas.dataset.mode = mode;
}
function setView(patch) {
  Object.assign(view, patch);
  const range = view.mode === 'follow' ? [0.45, 8] : [3.5, 40];
  view.dist = clamp(view.dist, ...range);
  view.incl = clamp(view.incl, 0.05, Math.PI - 0.05);
  invalidate();
}
// 拖动：自由观察时改视角；影片里只是把镜头稍微拨开一点
function turnView(dx, dy) {
  if (mode === 'free') setView({ az: view.az + dx, incl: view.incl - dy, preset: '' });
  else {
    film.nudge = [clamp(film.nudge[0] + dx, -1.2, 1.2), clamp(film.nudge[1] - dy, -0.6, 0.6)];
    invalidate();
  }
}
function zoomView(factor) {
  if (mode === 'free') setView({ dist: view.dist * factor, preset: '' });
}
function bindControls() {
  const pointers = new Map();
  let pinch = 0;
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
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
      if (pinch > 10 && next > 10) zoomView(pinch / next);
      pinch = next;
    } else turnView(dx * 0.006, dy * 0.006);
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
      if (mode !== 'free') return; // 影片里滚轮留给页面滚动
      e.preventDefault();
      zoomView(Math.exp(clamp(e.deltaY, -200, 200) * 0.0015));
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (e) => {
    const act = {
      ArrowLeft: () => turnView(-0.12, 0),
      ArrowRight: () => turnView(0.12, 0),
      ArrowUp: () => turnView(0, 0.08),
      ArrowDown: () => turnView(0, -0.08),
      '+': () => zoomView(0.88),
      '=': () => zoomView(0.88),
      '-': () => zoomView(1.14),
      Home: () => mode === 'free' && setView({ ...VIEWS.follow, preset: 'follow' }),
    }[e.key];
    if (act) {
      e.preventDefault();
      act();
    }
  });
  // 动了滑杆，就算是自己动手了
  const hands = () => {
    if (mode !== 'free') leaveFilm();
  };
  for (const id of ['dist', 'dist2'])
    $(id).oninput = (e) => {
      // 先记下滑杆的值：离开影片时读数会刷新，把滑杆写回原来的距离
      const value = Number(e.target.value);
      hands();
      moveTo(value);
    };
  $('rho').min = String(Math.log(RHO_MIN));
  $('rho').max = String(Math.log(RHO_MAX));
  $('rho').oninput = (e) => setDensity(Math.exp(Number(e.target.value)));
  for (const button of document.querySelectorAll('.materials button'))
    button.onclick = () => setDensity(Number(button.dataset.rho));
  for (const name of Object.keys(VIEWS))
    $('view-' + name).onclick = () => setView({ ...VIEWS[name], preset: name });
  $('reset').onclick = () => {
    if (status === 'ready') place(model.d, phase);
    invalidate();
  };
  for (const key of ['lines', 'layers', 'stars'])
    $('opt-' + key).onchange = (e) => {
      view[key] = e.target.checked;
      invalidate();
    };
  $('opt-speed').onclick = () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] || 1;
    invalidate();
  };
  const togglePause = () => {
    paused = !paused;
    last = 0;
    invalidate();
  };
  $('opt-motion').onclick = togglePause;
  $('film-play').onclick = () => (mode === 'intro' ? startFilm() : togglePause());
  $('film-free').onclick = () => {
    hands();
    setView({ ...VIEWS.follow, preset: 'follow' });
  };
  $('film-again').onclick = startFilm;
}

// ---------- 二维示意：卫星和它的希尔球 ----------
// 希尔近似下，共转系里的等势线在以希尔半径为单位时形状固定：3/ρ + 1.5 ξ² = C，过 L1 / L2 的那条 C = 4.5。
// 所以画面只需要把这组曲线按「希尔半径 / 卫星半径 = d / (1.44 q^-1/3)」缩放。
function contour(level) {
  const upper = [];
  for (let i = 0; i <= 240; i++) {
    const xi = -3 + (6 * i) / 240,
      left = level - 1.5 * xi * xi;
    if (left <= 0) {
      upper.push(null);
      continue;
    }
    const rho = 3 / left,
      eta2 = rho * rho - xi * xi;
    upper.push(eta2 >= 0 && rho < 4 ? [xi, Math.sqrt(eta2)] : null);
  }
  return upper;
}
const LEVELS = [
  [9, '#cfd6dc2e'],
  [6, '#cfd6dc2e'],
  [3.9, '#cfd6dc24'],
  [3.2, '#cfd6dc1c'],
];
function sized(node) {
  const dpr = Math.min(devicePixelRatio || 1, 2),
    w = node.clientWidth,
    h = node.clientHeight;
  node.width = Math.round(w * dpr);
  node.height = Math.round(h * dpr);
  const c = node.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  return { c, w, h };
}
function drawLobe() {
  const { c, w, h } = sized($('lobe')),
    q = ratio(),
    hill = model.d / hillOverflow(q), // 希尔半径，以卫星半径为单位
    k = Math.min(h / 2 / 3.1, w / 2 / 4.6), // 一个卫星半径是多少像素
    X = (x) => w / 2 + x * k,
    Y = (y) => h / 2 - y * k;
  const trace = (points, scale) => {
    c.beginPath();
    for (const sign of [1, -1]) {
      let pen = false;
      for (const p of points) {
        if (!p) {
          pen = false;
          continue;
        }
        const x = X(p[0] * scale),
          y = Y(p[1] * scale * sign);
        if (pen) c.lineTo(x, y);
        else c.moveTo(x, y);
        pen = true;
      }
    }
  };
  for (const [level, style] of LEVELS) {
    trace(contour(level), hill);
    c.strokeStyle = style;
    c.lineWidth = 1;
    c.stroke();
  }
  // 临界的那一圈：闭合的柠檬形
  const lobe = new Path2D(),
    edge = contour(4.5).filter((p) => p && Math.abs(p[0]) <= 1);
  edge.forEach(([x, y], i) => lobe[i ? 'lineTo' : 'moveTo'](X(x * hill), Y(y * hill)));
  edge.reverse().forEach(([x, y]) => lobe.lineTo(X(x * hill), Y(-y * hill)));
  lobe.closePath();
  // 卫星：留在希尔球里的部分是象牙色，伸到外面的部分是暗红色
  const body = new Path2D();
  body.arc(X(0), Y(0), k, 0, Math.PI * 2);
  c.fillStyle = '#a2573f';
  c.fill(body);
  c.save();
  c.clip(body);
  c.fillStyle = '#cfc9bb';
  c.fill(lobe);
  c.restore();
  c.strokeStyle = '#ece8de';
  c.lineWidth = 1;
  c.stroke(body);
  c.strokeStyle = '#e9c995';
  c.lineWidth = 1.6;
  c.stroke(lobe);
  // L1 / L2 和方向
  c.font = '11px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
  c.fillStyle = '#e9c995';
  for (const [sign, name] of [
    [-1, 'L₁'],
    [1, 'L₂'],
  ]) {
    const x = X(sign * hill);
    if (x < 14 || x > w - 14) continue;
    c.fillRect(x - 1.5, Y(0) - 1.5, 3, 3);
    c.fillText(name, x - 6, Y(0) - 9);
  }
  c.fillStyle = '#929da7';
  c.fillText('← 行星', 10, h - 12);
  c.textAlign = 'right';
  c.fillText('卫星的运动方向 ↑', w - 10, h - 12);
  c.textAlign = 'left';
  $('lobe').dataset.hill = hill.toFixed(3);
  const fluid = rocheFluid(q),
    overflow = hillOverflow(q),
    rigid = rocheRigid(q);
  $('lobe-result').textContent =
    `希尔球的半径是卫星的 ${hill.toFixed(2)} 倍。` +
    (model.d >= fluid
      ? '卫星整个待在自己的地盘里。'
      : hill >= 1.5
        ? '圆的卫星还装得下。但液态的卫星不是圆的，它已经被拉成长条，在这里找不到平衡的形状。'
        : model.d >= overflow
          ? '卫星的侧面（暗红色）已经高过两个出口 L₁、L₂。那里的碎石仍被卫星拉着，但只要能滑动，就会流向两端、从出口漏走。'
          : model.d >= rigid
            ? '连朝着行星和背着行星的两端也伸到了外面，放在那里的石头会直接飘走。'
            : '就算不自转的整块石头，表面也留不住松动的东西了，只能靠材料本身的强度撑着。');
}

// ---------- 标尺：三条极限、卫星的位置，以及土星周围的实际情况 ----------
// 模拟里的行星是一个密度 0.687 的球，所以实际距离都按土星的体积平均半径 58,232 km 折算（不是赤道半径 60,268 km）。
const SATURN_RADIUS = 58232;
const SATURN = {
  rings: [74658 / SATURN_RADIUS, 136775 / SATURN_RADIUS], // 土星主环：C 环内沿到 A 环外沿
  marks: [
    [140180 / SATURN_RADIUS, 'F 环'],
    [185539 / SATURN_RADIUS, '米玛斯'],
    [237948 / SATURN_RADIUS, '恩克拉多斯'],
  ],
};
function drawRuler() {
  const { c, w, h } = sized($('ruler')),
    q = ratio(),
    left = 16,
    right = w - 16,
    X = (r) => left + ((r - 1) / (D_MAX - 1)) * (right - left),
    axis = 54;
  c.font = '10px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
  // 土星主环
  c.fillStyle = '#d7d0be1f';
  c.fillRect(X(SATURN.rings[0]), axis - 18, X(SATURN.rings[1]) - X(SATURN.rings[0]), 18);
  c.fillStyle = '#b6b4ad';
  c.fillText('土星主环', X(SATURN.rings[0]) + 6, axis - 6);
  for (const [r, name] of SATURN.marks) {
    c.fillStyle = '#929da7';
    c.fillRect(X(r), axis - 14, 1, 14);
    const tight = X(r) + c.measureText(name).width + 6 > w; // 贴着右边的名字写在刻度左侧
    c.textAlign = tight ? 'right' : 'left';
    c.fillText(name, X(r) + (tight ? -4 : 4), axis - 6);
    c.textAlign = 'left';
  }
  c.fillStyle = '#929da7';
  c.fillText('土星周围的实际位置', left, 14);
  // 轴和刻度
  c.strokeStyle = '#d7d0be55';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(left, axis + 0.5);
  c.lineTo(right, axis + 0.5);
  c.stroke();
  c.fillStyle = '#6f7880';
  for (let r = 1; r <= D_MAX; r += 0.5) {
    c.fillRect(X(r), axis, 1, Number.isInteger(r) ? 6 : 3);
    if (Number.isInteger(r)) c.fillText(r + ' R', X(r) - 6, axis + 17);
  }
  // 当前密度下的三条极限
  const lines = [
    [rocheFluid(q), '#ffe2a8', [2, 3], '2.44', 32],
    [hillOverflow(q), '#e9c995', [], '1.44', 32],
    [rocheRigid(q), '#8fd0ff', [5, 3], '1.26', 44],
  ];
  for (const [r, color, dash, name, drop] of lines) {
    if (r < 1 || r > D_MAX) continue;
    c.strokeStyle = color;
    c.setLineDash(dash);
    c.beginPath();
    c.moveTo(X(r) + 0.5, axis - 30);
    c.lineTo(X(r) + 0.5, axis + drop - 9);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = color;
    c.fillText(name, X(r) + 3, axis + drop);
  }
  // 卫星
  c.fillStyle = '#ece8de';
  c.beginPath();
  c.arc(X(model.d), axis + 0.5, 4, 0, Math.PI * 2);
  c.fill();
  c.fillText('卫星', X(model.d) - 10, axis - 24);
  c.fillStyle = '#929da7';
  c.textAlign = 'right';
  c.fillText(`当前密度 ${model.rho.toFixed(2)} g/cm³ 的极限`, right, h - 8);
  c.textAlign = 'left';
}

// ---------- 启动 / 上下文丢失 / 降级 ----------
const FALLBACK = '下面「卫星守得住多大一块地方」的示意图仍然可以使用。';
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
    if (mode === 'film') mode = 'intro'; // 画面重建以后影片从头来
    migrating = false;
    $('fallback').hidden = true;
    document.documentElement.dataset.ready = 'true';
    document.documentElement.dataset.backend = sim.backend;
    invalidate();
  } catch (error) {
    console.warn('Roche exhibit:', error);
    fallback('三维画面暂时无法启动。' + FALLBACK);
  }
}
function start() {
  // 系统要求减少动态效果时不放影片，直接进自由观察，由人手动继续
  if (paused) mode = 'free';
  bindControls();
  readout();
  drawLobe();
  drawRuler();
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
  if (status === 'ready' && query.get('play') === '1' && !paused) startFilm();
  if (mode === 'film' && query.get('skip') === '1') {
    // 检查用：跳过前两幕，从「撕开」前一刻开始
    model.d = SLOW_AT + 0.02;
    place(model.d, 0);
    Object.assign(film, { t: 20.5, pulled: true });
    migrating = true;
  }
  if (status === 'ready' && query.get('free') === '1' && mode !== 'free') leaveFilm();
}
try {
  start();
} catch (error) {
  console.warn('Roche exhibit:', error);
  fallback('三维画面暂时无法启动。' + FALLBACK);
}
