// 史瓦西黑洞展品的页面逻辑（露娜）：WebGL 画面、拖动 / 缩放、读数，以及下面那张「光线怎么弯」的二维示意图。
// geodesic.js 是笛卡尔参考积分；orbit.js / shader.js 用等价的轨道平面方程。
import { VERTEX, FRAGMENT } from './shader.js';
import {
  RS,
  PHOTON_SPHERE,
  ISCO,
  B_CRIT,
  traceRay,
  weakDeflection,
  shadowAngle,
} from './geodesic.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let paused = false,
  reduceMotion = reduced.matches;
const still = () => paused || reduceMotion || params.get('motion') === '0';
const deg = (x) => (x * 180) / Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------- 观察状态 ----------
const HOME = { r: 22, incl: (80 * Math.PI) / 180, az: 0.6 };
const view = { ...HOME, disk: true, shift: true, stars: true };
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
  ])
    uniforms[name] = gl.getUniformLocation(program, name);
}
function resize() {
  const renderScale = still() || !view.disk ? Math.max(scale, innerWidth < 700 ? 0.85 : 1) : scale;
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
  const { r, incl, az } = view;
  // 盘的轴是 +y；incl 是视线和轴的夹角（90° = 正侧面）
  const cam = [
      r * Math.sin(incl) * Math.cos(az),
      r * Math.cos(incl),
      r * Math.sin(incl) * Math.sin(az),
    ],
    fwd = norm(cam.map((x) => -x)),
    right = norm(cross(fwd, [0, 1, 0])),
    up = cross(right, fwd);
  // 视场：短边上能看到整个盘的外沿（离得近时最多放到 100°）
  const half = clamp(Math.atan((R_OUT * 1.35) / r), 0.42, 0.87),
    aspect = canvas.width / canvas.height,
    tanV = aspect >= 1 ? Math.tan(half) : Math.tan(half) / aspect,
    tanH = tanV * aspect;
  gl.uniform3fv(uniforms.u_cam, cam);
  gl.uniform3fv(uniforms.u_right, right);
  gl.uniform3fv(uniforms.u_up, up);
  gl.uniform3fv(uniforms.u_fwd, fwd);
  gl.uniform2f(uniforms.u_tan, tanH, tanV);
  gl.uniform1f(uniforms.u_time, time);
  gl.uniform1f(uniforms.u_rin, R_IN);
  gl.uniform1f(uniforms.u_rout, R_OUT);
  gl.uniform1f(uniforms.u_disk, view.disk ? 1 : 0);
  gl.uniform1f(uniforms.u_shift, view.shift ? 1 : 0);
  gl.uniform1f(uniforms.u_stars, view.stars ? 1 : 0);
  gl.uniform1i(uniforms.u_aa, aa);
  gl.uniform1i(uniforms.u_debug, diagnostic ? 1 : 0);
  gl.uniform2f(uniforms.u_res, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
let last = 0,
  clock = 0;
function tick(now) {
  frame = 0;
  if (document.hidden || rendererState !== 'ready') return;
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
  last = now;
  const moving = !still() && view.disk; // 盘在转 → 一直画；否则只在有变化时画
  if (!moving) aa = 2;
  if (moving) clock += dt;
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
  if (rendererState === 'ready' && !frame && !document.hidden) frame = requestAnimationFrame(tick);
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
  const locked = reduceMotion || params.get('motion') === '0';
  $('opt-motion').disabled = locked || rendererState !== 'ready';
  $('opt-motion').textContent = locked ? '静态观察' : paused ? '继续转动' : '暂停盘面';
  $('opt-motion').setAttribute('aria-pressed', String(still()));
  $('motion-out').textContent =
    rendererState !== 'ready'
      ? '二维示意可用'
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
  Object.assign(view, patch);
  view.r = clamp(view.r, R_MIN, R_MAX);
  view.incl = clamp(view.incl, 0.06, Math.PI - 0.06);
  invalidate();
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
      Home: () => setView({ ...HOME }),
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
    last = 0;
    invalidate();
  });
  document.addEventListener('visibilitychange', () => {
    last = 0;
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
