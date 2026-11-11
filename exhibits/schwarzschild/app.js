// 史瓦西黑洞展品的页面逻辑（露娜）：WebGL 画面、拖动 / 缩放、读数，以及下面那张「光线怎么弯」的二维示意图。
// geodesic.js 是笛卡尔参考积分；orbit.js / shader.js 用等价的轨道平面方程。
import { VERTEX, FRAGMENT } from './shader.js?v=5';
import { createCinema, createScore } from './cinema.js?v=1';
import { initMission } from './mission.js?v=1';
import { buildFlight, flightCamera, FLIGHT_MASS, FLIGHT_DURATION } from './flight.js?v=3';
import { scales } from './infall.js?v=1';
import {
  RS,
  PHOTON_SPHERE,
  ISCO,
  B_CRIT,
  traceRay,
  weakDeflection,
  shadowAngle,
} from './geodesic.js?v=2';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let paused = false,
  reduceMotion = reduced.matches;
const still = () => paused || reduceMotion || params.get('motion') === '0';
const deg = (x) => (x * 180) / Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------- 观察状态 ----------
// 独立的二维实验不依赖 WebGL，主画面降级时也能运行。
initMission(document.getElementById('infall'));
const HOME = { r: 22, incl: (80 * Math.PI) / 180, az: 0.6 };
const view = { ...HOME, disk: true, shift: true, stars: true };
const flight = { active: false, running: false, progress: 0, yaw: 0, pitch: 0, half: 0.94 };
const trajectory = buildFlight();
const flightFrame = () => flightCamera(trajectory, flight.progress, flight.yaw, flight.pitch);
const flightLocked = () => reduceMotion || params.get('motion') === '0';
const score = createScore();
let cinema = null;
let filmIdleTimer = 0;
function wakeFilm() {
  clearTimeout(filmIdleTimer);
  $('film-ui').classList.remove('is-quiet');
  if (flight.active && flight.running)
    filmIdleTimer = setTimeout(() => {
      if (flight.running && !document.activeElement?.closest('.film-ui'))
        $('film-ui').classList.add('is-quiet');
    }, 2600);
}
const R_MIN = 1.6,
  R_MAX = 60,
  R_IN = ISCO,
  R_OUT = 12;

// ---------- WebGL ----------
const canvas = $('hole');
const gl = (() => {
  try {
    return canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
})();
let rendererState = 'loading';
let stageVisible = true;
let program = null,
  uniforms = {},
  dirty = true,
  frame = 0,
  scale = innerWidth < 700 ? 0.55 : 0.75, // 画布像素占屏幕像素的比例，按帧时间自动调
  slow = 0,
  fast = 0,
  aa = 2; // 优先保留 2×2 空间采样；慢时先降分辨率，不降低轨道精度
function compile(type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function setup() {
  program = gl.createProgram();
  const vertex = compile(gl.VERTEX_SHADER, VERTEX),
    fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const name of [
    'u_cam',
    'u_right',
    'u_up',
    'u_fwd',
    'u_tan',
    'u_time',
    'u_rin',
    'u_rout',
    'u_disk',
    'u_shift',
    'u_stars',
    'u_aa',
    'u_debug',
    'u_res',
    'u_probe',
    'u_beta',
    'u_gamma',
  ])
    uniforms[name] = gl.getUniformLocation(program, name);
  try {
    cinema = createCinema(gl, VERTEX);
  } catch (error) {
    cinema = null;
    console.warn('Cinema lens unavailable:', error);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(program);
}
function resize() {
  const settled = flight.active ? !flight.running : still() || !view.disk;
  const renderScale = settled ? Math.max(scale, innerWidth < 700 ? 0.85 : 1) : scale;
  const dpr = Math.min(devicePixelRatio || 1, 1.5),
    w = Math.max(2, Math.round(canvas.clientWidth * dpr * renderScale)),
    h = Math.max(2, Math.round(canvas.clientHeight * dpr * renderScale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((x) => x / l);
};
function draw(time, diagnostic = false) {
  if (rendererState !== 'ready') return;
  resize();
  const landing = document.querySelector('.stage').classList.contains('cinema-landing');
  const filmLook = flight.active || landing;
  const useCinema = filmLook && !diagnostic && cinema;
  if (useCinema) cinema.begin(canvas.width, canvas.height);
  else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(program);
  const { r, incl, az } = view;
  // 盘的轴是 +y；incl 是视线和轴的夹角（90° = 正侧面）
  let cam = [
      r * Math.sin(incl) * Math.cos(az),
      r * Math.cos(incl),
      r * Math.sin(incl) * Math.sin(az),
    ],
    fwd = norm(cam.map((x) => -x)),
    right = norm(cross(fwd, [0, 1, 0])),
    up = cross(right, fwd);
  const probe = flight.active
    ? flightFrame()
    : landing
      ? flightCamera(trajectory, 0, innerWidth > 820 ? -0.25 : 0)
      : null;
  if (probe) ({ cam, fwd, right, up } = probe);
  // 视场：短边上能看到整个盘的外沿（离得近时最多放到 100°）
  const half = probe
      ? ((flight.active ? flight.half : 0.94) * probe.lens) / 0.94
      : clamp(Math.atan((R_OUT * 1.35) / r), 0.42, 0.87),
    aspect = canvas.width / canvas.height,
    tanV = aspect >= 1 ? Math.tan(half) : Math.tan(half) / aspect,
    tanH = tanV * aspect;
  gl.uniform3fv(uniforms.u_cam, cam);
  gl.uniform3fv(uniforms.u_right, right);
  gl.uniform3fv(uniforms.u_up, up);
  gl.uniform3fv(uniforms.u_fwd, fwd);
  gl.uniform1i(uniforms.u_probe, filmLook ? 1 : 0);
  gl.uniform3fv(uniforms.u_beta, probe ? probe.beta : [0, 0, 0]);
  gl.uniform1f(uniforms.u_gamma, probe ? probe.gamma : 1);
  gl.uniform2f(uniforms.u_tan, tanH, tanV);
  gl.uniform1f(uniforms.u_time, flight.active ? flight.progress * FLIGHT_DURATION : time);
  gl.uniform1f(uniforms.u_rin, R_IN);
  gl.uniform1f(uniforms.u_rout, R_OUT);
  gl.uniform1f(uniforms.u_disk, view.disk ? 1 : 0);
  gl.uniform1f(uniforms.u_shift, view.shift ? 1 : 0);
  gl.uniform1f(uniforms.u_stars, view.stars ? 1 : 0);
  gl.uniform1i(uniforms.u_aa, aa);
  gl.uniform1i(uniforms.u_debug, diagnostic ? 1 : 0);
  gl.uniform2f(uniforms.u_res, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (useCinema) {
    cinema.finish(flight.active ? flight.progress : 0);
    gl.useProgram(program);
  }
}
let last = 0,
  clock = 0;
function tick(now) {
  frame = 0;
  if (document.hidden || !stageVisible || rendererState !== 'ready') return;
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
  last = now;
  const flying = flight.active && flight.running && !flightLocked();
  if (flying) {
    flight.progress = Math.min(1, flight.progress + dt / FLIGHT_DURATION);
    if (flight.progress === 1) flight.running = false;
    readout();
  }
  const moving = (flight.active ? false : !still() && view.disk) || flying;
  if (!moving) aa = 2;
  if (!still() && view.disk) clock += dt;
  if (moving || dirty) {
    draw(clock);
    dirty = false;
    // 画得慢就降一点分辨率，快就升回去（只在连续画的时候调）
    if (moving && dt) {
      if (dt > 0.045) (slow++, (fast = 0));
      else if (dt < 0.02) (fast++, (slow = 0));
      else slow = fast = 0;
      if (slow > 12) {
        if (scale > 0.35) scale = Math.max(0.35, scale - 0.1);
        else aa = 1;
        slow = 0;
      }
      if (fast > 90) {
        if (aa < 2) aa = 2;
        else if (scale < 1) scale = Math.min(1, scale + 0.05);
        fast = 0;
      }
    }
  }
  if (moving) frame = requestAnimationFrame(tick);
  else last = 0;
}
function invalidate() {
  dirty = true;
  readout();
  if (rendererState === 'ready' && !frame && !document.hidden && stageVisible)
    frame = requestAnimationFrame(tick);
}

// 检查用：马上画一帧，读出几个点的颜色（坐标是画布上的比例，左上角为 0,0）。scripts 里的浏览器检查靠它看画面对不对。
window.zhixuBlackHoleProbe = (points, { diagnostic = false, time = clock } = {}) => {
  if (rendererState !== 'ready') return null;
  draw(time, diagnostic);
  const px = new Uint8Array(4);
  const result = points.map(([fx, fy]) => {
    gl.readPixels(
      Math.round(fx * (canvas.width - 1)),
      Math.round((1 - fy) * (canvas.height - 1)),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      px,
    );
    return [px[0], px[1], px[2]];
  });
  if (diagnostic || time !== clock) draw(clock);
  return result;
};

// ---------- 读数和控件 ----------
function readout() {
  $('r-out').textContent = view.r.toFixed(view.r < 10 ? 2 : 1);
  $('incl-out').textContent = deg(view.incl).toFixed(0);
  $('shadow-out').textContent = (deg(shadowAngle(view.r)) * 2).toFixed(1);
  $('dist').value = String(Math.log(view.r));
  $('incl').value = String(deg(view.incl));
  canvas.dataset.r = view.r.toFixed(3);
  canvas.dataset.incl = view.incl.toFixed(3);
  canvas.dataset.az = view.az.toFixed(3);
  canvas.dataset.flight = String(flight.active);
  canvas.dataset.progress = String(flight.progress);
  canvas.dataset.flying = String(flight.running);
  $('r-label').textContent = flight.active ? '探测器坐标半径' : '观察距离';
  $('incl-label').textContent = flight.active ? '累计绕行' : '视线与盘轴的夹角';
  $('incl-unit').textContent = flight.active ? ' 圈' : '°';
  $('shadow-label').textContent = flight.active ? '船上已过时间' : '阴影的视直径';
  $('shadow-unit').textContent = flight.active ? ' 分' : '°';
  $('flight-enter').disabled = rendererState !== 'ready';
  $('film-start').disabled = rendererState !== 'ready';
  $('flight-play').disabled = flightLocked() || rendererState !== 'ready';
  $('flight-play').textContent = flightLocked()
    ? '拖动进度体验'
    : flight.running
      ? '暂停航行'
      : flight.progress === 1
        ? '再次航行'
        : '开始航行';
  $('flight-play').setAttribute('aria-pressed', String(flight.running));
  $('flight-quick-pause').textContent = $('flight-play').textContent;
  $('flight-quick-pause').disabled = $('flight-play').disabled;
  $('flight-quick-pause').setAttribute('aria-pressed', String(flight.running));
  $('film-play').disabled = flightLocked() || rendererState !== 'ready';
  $('film-play').textContent = flightLocked()
    ? '拖动进度体验'
    : flight.running
      ? 'Ⅱ 暂停'
      : flight.progress === 1
        ? '↻ 重播'
        : '▷ 继续';
  $('film-play').setAttribute('aria-pressed', String(flight.running));
  $('film-progress').value = String(flight.progress);
  $('film-progress').style.setProperty('--progress', flight.progress * 100 + '%');
  const seconds = Math.round(flight.progress * FLIGHT_DURATION),
    stamp = (n) =>
      String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  $('film-time').textContent = stamp(seconds) + ' / ' + stamp(FLIGHT_DURATION);
  $('film-end').hidden = !flight.active || flight.progress < 1;
  if (!flight.active || !flight.running) wakeFilm();
  score.update(
    flight.progress,
    flight.active &&
      flight.running &&
      !document.hidden &&
      stageVisible &&
      rendererState === 'ready',
  );
  if (flight.active) {
    const s = flightFrame();
    $('r-out').textContent = s.r.toFixed(3);
    $('incl-out').textContent = (s.phi / (2 * Math.PI)).toFixed(2);
    $('shadow-out').textContent = ((s.tau * scales(FLIGHT_MASS).time) / 60).toFixed(2);
    canvas.dataset.r = String(s.r);
    $('flight-progress').value = String(flight.progress);
    $('flight-percent').textContent = Math.round(flight.progress * 100) + '%';
    $('flight-phase').textContent =
      flight.progress === 1
        ? '航程终点 · 未到奇点'
        : Math.abs(s.r - 1) < 1e-4
          ? '穿过事件视界'
          : s.r < 1
            ? '视界内 · 外部光仍可抵达'
            : s.r < 1.7
              ? '向视界坠落'
              : s.r < 3
                ? '绕行 · 最后的弯道'
                : '接近黑洞';
    $('film-phase').textContent = $('flight-phase').textContent;
    const chapters = [
      [0, 'I / APPROACH', '驶向黑暗', '远处的光，正在绕过它。'],
      [0.3, 'II / ORBIT', '最后的绕行', '同一片星空，出现在不同方向。'],
      [0.72, 'III / DESCENT', '向内，向前', '引擎关闭。轨迹不再返回。'],
      [0.88, 'IV / BEYOND', '越过视界', '这里没有墙。外部的光仍会抵达。'],
    ];
    const chapter = chapters.findLast((c) => flight.progress >= c[0]);
    $('film-chapter-index').textContent = chapter[1];
    $('film-chapter').textContent = chapter[2];
    $('film-line').textContent = chapter[3];
    const elapsed = (flight.progress - chapter[0]) * FLIGHT_DURATION;
    const opacity =
      flight.progress >= 1
        ? 0
        : Math.min(1, elapsed / 0.7) * Math.max(0, Math.min(1, (5.5 - elapsed) / 1.5));
    document.querySelector('.stage').style.setProperty('--chapter-opacity', String(opacity));
  }
  const locked = reduceMotion || params.get('motion') === '0';
  $('opt-motion').disabled = locked || rendererState !== 'ready';
  $('opt-motion').textContent = locked ? '静态观察' : paused ? '继续转动' : '暂停盘面';
  $('opt-motion').setAttribute('aria-pressed', String(still()));
  $('motion-out').textContent =
    rendererState !== 'ready'
      ? '二维示意可用'
      : flight.active
        ? '探测器第一视角 · ' + (flight.running ? '航行中' : '已暂停')
        : !still() && view.disk
          ? '光线追踪 · 盘面转动中'
          : '光线追踪 · 静态观察';
  const presets = {
    home: HOME,
    side: { r: 22, incl: Math.PI / 2 },
    top: { r: 26, incl: (18 * Math.PI) / 180 },
    near: { r: 4, incl: (80 * Math.PI) / 180 },
  };
  for (const [name, preset] of Object.entries(presets)) {
    $('view-' + name).setAttribute(
      'aria-pressed',
      String(Math.abs(view.r - preset.r) < 0.01 && Math.abs(view.incl - preset.incl) < 0.001),
    );
  }
}
function setView(patch) {
  if (flight.active) {
    if (patch.az !== undefined) flight.yaw += patch.az - view.az;
    if (patch.incl !== undefined)
      flight.pitch = clamp(flight.pitch + view.incl - patch.incl, -1.35, 1.35);
    if (patch.r !== undefined) flight.half = clamp((flight.half * patch.r) / view.r, 0.35, 1.1);
    invalidate();
    return;
  }
  Object.assign(view, patch);
  view.r = clamp(view.r, R_MIN, R_MAX);
  view.incl = clamp(view.incl, 0.06, Math.PI - 0.06);
  invalidate();
}
function bindControls() {
  const stage = document.querySelector('.stage');
  const landing = (active) => {
    stage.classList.toggle('cinema-landing', active);
    $('film-intro').hidden = !active;
  };
  const toggleFlight = (active) => {
    landing(false);
    flight.active = active;
    flight.running = active && !flightLocked();
    $('static-controls').hidden = active;
    $('flight-enter').hidden = active;
    $('flight-controls').hidden = !active;
    $('flight-hud').hidden = !active;
    $('flight-quick-pause').hidden = !active;
    document.querySelector('.panel').classList.remove('compact');
    $('flight-hud').textContent = '收起面板';
    $('flight-hud').setAttribute('aria-expanded', 'true');
    $('flight-explanation').hidden = !active;
    document.querySelector('.stage').classList.toggle('in-flight', active);
    $('film-ui').hidden = !active;
    stage.classList.remove('film-data-open');
    $('film-data').setAttribute('aria-expanded', 'false');
    $('film-data').textContent = '仪表 ＋';
    $('view-hint').textContent = active
      ? '拖动转头 · 滚轮或双指调视野'
      : '拖动改视角 · 滚轮或双指改距离';
    canvas.setAttribute(
      'aria-label',
      active
        ? '探测器第一视角；拖动或方向键转头，滚轮、双指或加减号调视野，Home 回正'
        : '黑洞的实时画面；拖动改变视角，滚轮或双指改变距离，方向键和加减号也可以',
    );
    last = 0;
    invalidate();
    if (active) canvas.focus({ preventScroll: true });
    wakeFilm();
  };
  const seekFlight = (p) => {
    flight.progress = p;
    flight.running = false;
    last = 0;
    invalidate();
  };
  $('flight-enter').onclick = () => toggleFlight(true);
  $('film-start').onclick = () => {
    flight.progress = 0;
    flight.yaw = flight.pitch = 0;
    flight.half = 0.94;
    toggleFlight(true);
  };
  $('film-observe').onclick = () => {
    landing(false);
    invalidate();
  };
  $('film-exit').onclick = () => {
    toggleFlight(false);
    landing(true);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };
  $('film-play').onclick = () => $('flight-play').click();
  $('film-progress').oninput = (e) => seekFlight(Number(e.target.value));
  $('film-replay').onclick = () => {
    flight.yaw = flight.pitch = 0;
    flight.half = 0.94;
    flight.progress = 0;
    flight.running = !flightLocked();
    invalidate();
    wakeFilm();
  };
  $('film-data').onclick = () => {
    const open = stage.classList.toggle('film-data-open');
    $('film-data').setAttribute('aria-expanded', String(open));
    $('film-data').textContent = open ? '仪表 −' : '仪表 ＋';
    document.querySelector('.panel').classList.remove('compact');
    $('flight-hud').textContent = '收起面板';
    $('flight-hud').setAttribute('aria-expanded', 'true');
  };
  $('film-sound').onclick = async () => {
    try {
      const on = await score.toggle();
      $('film-sound').textContent = on ? '配乐 开启' : '配乐 关闭';
      $('film-sound').setAttribute('aria-pressed', String(on));
      readout();
    } catch {
      $('film-sound').textContent = '配乐不可用';
    }
  };
  $('film-fullscreen').disabled = !document.fullscreenEnabled;
  $('film-fullscreen').onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.requestFullscreen();
    } catch {}
  };
  document.addEventListener('fullscreenchange', () => {
    $('film-fullscreen').textContent = document.fullscreenElement ? '退出全屏' : '全屏';
    invalidate();
  });
  $('flight-quick-pause').onclick = () => $('flight-play').click();
  $('flight-hud').onclick = () => {
    const compact = document.querySelector('.panel').classList.toggle('compact');
    $('flight-hud').textContent = compact ? '展开面板' : '收起面板';
    $('flight-hud').setAttribute('aria-expanded', String(!compact));
  };
  $('flight-exit').onclick = () => toggleFlight(false);
  $('flight-progress').oninput = (e) => seekFlight(Number(e.target.value));
  $('flight-restart').onclick = () => {
    flight.yaw = flight.pitch = 0;
    flight.half = 0.94;
    seekFlight(0);
  };
  $('flight-play').onclick = () => {
    if (flightLocked()) return;
    if (flight.progress === 1) flight.progress = 0;
    flight.running = !flight.running;
    last = 0;
    invalidate();
    wakeFilm();
  };
  $('flight-orbit').onclick = () => seekFlight(0.52);
  $('flight-horizon').onclick = () => seekFlight(0.88);
  $('flight-inside').onclick = () => seekFlight(0.96);
  const pointers = new Map();
  stage.addEventListener('pointermove', wakeFilm);
  stage.addEventListener('pointerdown', wakeFilm);
  $('film-ui').addEventListener('focusin', wakeFilm);
  let pinch = 0;
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (stage.classList.contains('cinema-landing')) return;
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
      if (pinch > 10 && next > 10) setView({ r: view.r * (pinch / next) });
      pinch = next;
    } else setView({ az: view.az - dx * 0.006, incl: view.incl - dy * 0.006 });
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
      setView({ r: view.r * Math.exp(clamp(e.deltaY, -200, 200) * 0.0015) });
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (e) => {
    const act = {
      ArrowLeft: () => setView({ az: view.az + 0.12 }),
      ArrowRight: () => setView({ az: view.az - 0.12 }),
      ArrowUp: () => setView({ incl: view.incl - 0.08 }),
      ArrowDown: () => setView({ incl: view.incl + 0.08 }),
      '+': () => setView({ r: view.r * 0.88 }),
      '=': () => setView({ r: view.r * 0.88 }),
      '-': () => setView({ r: view.r * 1.14 }),
      Home: () => {
        if (flight.active) {
          flight.yaw = flight.pitch = 0;
          flight.half = 0.94;
          invalidate();
        } else setView({ ...HOME });
      },
      ' ': () => {
        if (flight.active) $('film-play').click();
      },
    }[e.key];
    if (act) {
      e.preventDefault();
      act();
    }
  });
  $('dist').min = String(Math.log(R_MIN));
  $('dist').max = String(Math.log(R_MAX));
  $('dist').oninput = (e) => setView({ r: Math.exp(Number(e.target.value)) });
  $('incl').oninput = (e) => setView({ incl: (Number(e.target.value) * Math.PI) / 180 });
  for (const key of ['disk', 'shift', 'stars'])
    $('opt-' + key).onchange = (e) => {
      view[key] = e.target.checked;
      invalidate();
    };
  $('view-side').onclick = () => setView({ r: 22, incl: Math.PI / 2 });
  $('view-top').onclick = () => setView({ r: 26, incl: (18 * Math.PI) / 180 });
  $('view-near').onclick = () => setView({ r: 4, incl: (80 * Math.PI) / 180 });
  $('view-home').onclick = () => setView({ ...HOME });
  $('opt-motion').onclick = () => {
    paused = !paused;
    last = 0;
    invalidate();
  };
}

// ---------- 二维示意图：平行射来的一束光，各自的瞄准距离不同 ----------
const plot = $('rays');
let chosen = 3.2;
const FAN = [1, 1.6, 2.2, 2.56, 2.64, 2.8, 3.2, 4, 5, 6.5, 8.5];
const cache = new Map();
const ray = (b) => {
  if (!cache.has(b)) cache.set(b, traceRay(b, { start: 40, far: 40, scale: 0.4, keep: 1 }));
  return cache.get(b);
};
function drawRays() {
  const dpr = Math.min(devicePixelRatio || 1, 2),
    w = plot.clientWidth,
    h = plot.clientHeight;
  plot.width = Math.round(w * dpr);
  plot.height = Math.round(h * dpr);
  const c = plot.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const span = 13, // 画面高度的一半对应多少 r_s
    k = h / 2 / span,
    X = (x) => w * 0.56 + x * k,
    Y = (y) => h / 2 - y * k;
  const circle = (r, style, dash = []) => {
    c.beginPath();
    c.setLineDash(dash);
    c.arc(X(0), Y(0), r * k, 0, Math.PI * 2);
    c.strokeStyle = style;
    c.lineWidth = 1;
    c.stroke();
    c.setLineDash([]);
  };
  const path = (points, style, width) => {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))));
    c.strokeStyle = style;
    c.lineWidth = width;
    c.stroke();
  };
  for (const b of FAN)
    for (const sign of [1, -1]) {
      const r = ray(b);
      path(
        r.points.map(([x, y]) => [x, y * sign]),
        r.captured ? '#b9836088' : '#cfd6dc55',
        1,
      );
    }
  const pick = ray(chosen);
  path(pick.points, pick.captured ? '#ff9d6b' : '#ffe2a8', 2);
  circle(B_CRIT, '#ffe2a855', [2, 5]);
  circle(PHOTON_SPHERE, '#8fd0ff99', [4, 4]);
  c.beginPath();
  c.arc(X(0), Y(0), RS * k, 0, Math.PI * 2);
  c.fillStyle = '#000';
  c.fill();
  circle(RS, '#cfd6dc');
  // 选中的那条：左边标出它的瞄准距离
  c.fillStyle = '#ffe2a8';
  c.font = '11px Inter, sans-serif';
  c.fillText(`b = ${chosen.toFixed(2)} r_s`, 8, clamp(Y(chosen) - 6, 12, h - 6));
  $('b-out').textContent = chosen.toFixed(2);
  $('b-result').textContent = pick.captured
    ? `掉进黑洞（b 小于临界值 ${B_CRIT.toFixed(3)} r_s）`
    : `偏折 ${deg(pick.deflection).toFixed(1)}°` +
      (pick.deflection > Math.PI
        ? `，累计偏折相当于 ${(pick.deflection / (2 * Math.PI)).toFixed(2)} 圈`
        : '') +
      ` · 弱场公式给 ${deg(weakDeflection(chosen)).toFixed(1)}°`;
  plot.dataset.b = chosen.toFixed(2);
  plot.dataset.captured = String(pick.captured);
}
$('b').oninput = (e) => {
  chosen = Number(e.target.value);
  drawRays();
};

// ---------- 启动 / 上下文丢失 / 降级 ----------
function fallback(message, state = 'unavailable') {
  rendererState = state;
  flight.running = false;
  cancelAnimationFrame(frame);
  frame = 0;
  last = 0;
  $('fallback').hidden = false;
  $('fallback').textContent = message;
  document.documentElement.dataset.ready = 'fallback';
  readout();
}
function restoreRenderer() {
  try {
    setup();
    rendererState = 'ready';
    // 恢复后即便画布尺寸未变也显式设置 viewport。
    gl.viewport(0, 0, canvas.width, canvas.height);
    $('fallback').hidden = true;
    document.documentElement.dataset.ready = 'true';
    invalidate();
  } catch (error) {
    console.warn('Schwarzschild exhibit:', error);
    fallback('三维画面暂时无法启动。下面「光线怎么弯」的示意图仍然可以使用。');
  }
}
function start() {
  bindControls();
  readout();
  drawRays();
  new ResizeObserver(() => {
    drawRays();
    invalidate();
  }).observe(document.body);
  new IntersectionObserver(
    ([entry]) => {
      stageVisible = entry.intersectionRatio >= 0.001;
      if (!stageVisible) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
        flight.running = false;
        readout();
      } else invalidate();
    },
    { threshold: 0.001 },
  ).observe(canvas);
  if (!gl) {
    fallback('这台设备画不了三维画面（需要 WebGL2）。下面「光线怎么弯」的示意图仍然可以使用。');
    return;
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    fallback('三维画面暂时中断，正在等待恢复。下面的光线示意图仍然可以使用。', 'lost');
  });
  canvas.addEventListener('webglcontextrestored', restoreRenderer);
  reduced.addEventListener('change', (event) => {
    reduceMotion = event.matches;
    if (reduceMotion) flight.running = false;
    last = 0;
    invalidate();
  });
  document.addEventListener('visibilitychange', () => {
    last = 0;
    if (document.hidden) {
      flight.running = false;
      readout();
    }
    if (!document.hidden) invalidate();
  });
  restoreRenderer();
}
try {
  start();
} catch (error) {
  console.warn('Schwarzschild exhibit:', error);
  fallback('三维画面暂时无法启动。下面「光线怎么弯」的示意图仍然可以使用。');
  try {
    drawRays();
  } catch {}
}
