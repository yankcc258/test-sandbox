import * as THREE from '../../vendor/three/three.module.min.js';
import { BODIES, position, orbitOffset } from './orbit-space.js';
import { makeBody, makeSky } from './orbit-models.js';
import { skyDay, skyClock, orbitSkyToday, orbitSkyEvents, orbitSkyCountdown } from './orbit-sky.js';

// A self-contained view: no study routes, user data or storage.
// 原始内容预览地址不增加操作界面，仅在从目录/工作台进入时给出返回入口。
const from = new URLSearchParams(location.search).get('from');
if (from === 'workstation' || from === 'catalog') {
  const back = document.createElement('a');
  back.className = 'preview-return';
  back.href = from === 'workstation' ? '../../workstation/' : '../../';
  back.textContent = from === 'workstation' ? '↙ 返回工作台' : '↙ 沙盒目录';
  document.body.append(back);
}
const text = (key, value) => {
  document.querySelector(`[data-sky="${key}"]`).textContent = value;
};
let reportDay = '';
let nextEventAt = 0;
function updateReport() {
  const now = new Date();
  text('clock', `${skyClock(now)} JST`);
  if (reportDay === skyDay(now) && now.getTime() < nextEventAt) return;
  const A = window.Astronomy;
  if (!A) {
    text('note', '天象数据暂未载入');
    return;
  }
  const today = orbitSkyToday(A, now);
  const events = orbitSkyEvents(A, now);
  const clock = (date) => (date ? skyClock(date) : '—');
  const visible = (list) => list.map((p) => p.cn).join(' · ') || '无主要行星';
  text('day', today.day.replaceAll('-', '.'));
  text('sun', `${clock(today.sunrise)} / ${clock(today.sunset)}`);
  text('moon', `${clock(today.moonrise)} / ${clock(today.moonset)}`);
  text('phase', `${today.phase} · ${Math.round(today.illumination * 100)}%`);
  text('tonight', visible(today.tonight));
  text('dawn', visible(today.dawn));
  const next = events[0];
  text('next', next?.title || '暂无近期天象');
  text('countdown', next ? orbitSkyCountdown(next.time, now) : '');
  text(
    'note',
    next
      ? `${skyDay(next.time).replaceAll('-', '.')} · ${next.kind === 'shower' ? '极大日期约值' : skyClock(next.time)}${next.note && next.kind !== 'shower' ? ` · ${next.note}` : ''}`
      : '',
  );
  const list = document.querySelector('[data-sky="upcoming"]');
  list.replaceChildren(
    ...events.slice(1, 4).map((event) => {
      const li = document.createElement('li');
      const title = document.createElement('span');
      title.textContent = event.title;
      const date = document.createElement('time');
      date.dateTime = event.time.toISOString();
      date.textContent = `${event.kind === 'shower' ? '约 ' : ''}${skyDay(event.time).slice(5).replace('-', '.')}`;
      li.append(title, date);
      return li;
    }),
  );
  reportDay = today.day;
  nextEventAt = next?.time.getTime() || now.getTime() + 3600000;
}

function mountScene() {
  const canvas = document.querySelector('#starfield');
  const host = document.querySelector('.universe');
  const labels = document.querySelector('#planet-labels');
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true });
  if (!context) throw new Error('WebGL2 unavailable');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    context,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 400);
  scene.add(world, new THREE.AmbientLight('#8fa2b8', 0.18));
  const sky = makeSky();
  scene.add(sky.group);
  const names = {
    earth: '地球',
    sun: '太阳',
    luna: '月球',
    mercury: '水星',
    venus: '金星',
    mars: '火星',
    jupiter: '木星',
    saturn: '土星',
  };
  const bodies = BODIES.map((body) => {
    const model = makeBody(body);
    world.add(model.group);
    const label = document.createElement('span');
    label.className = 'planet-label';
    label.dataset.body = body.id;
    label.append(document.createTextNode(names[body.id]));
    const en = document.createElement('small');
    en.textContent = body.id.toUpperCase();
    label.append(en);
    labels.append(label);
    return { ...body, ...model, label };
  });
  const earth = bodies.find((b) => b.id === 'earth');
  const sun = bodies.find((b) => b.id === 'sun');
  const luna = bodies.find((b) => b.id === 'luna');
  const sunFrame = new THREE.Group();
  world.add(sunFrame);
  const tracks = bodies
    .filter((b) => b.center)
    .map((b) => {
      const points = Array.from({ length: 361 }, (_, i) => new THREE.Vector3(...orbitOffset(b, i)));
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          tint: { value: new THREE.Color('#cfd6dc') },
          opacity: { value: b.id === 'luna' ? 0.22 : 0.3 },
          near: { value: 10 },
          far: { value: 40 },
        },
        vertexShader:
          'varying float d; void main(){vec4 p=modelViewMatrix*vec4(position,1.); d=-p.z; gl_Position=projectionMatrix*p;}',
        fragmentShader:
          'varying float d; uniform vec3 tint; uniform float opacity; uniform float near; uniform float far; void main(){float f=1.-smoothstep(near,far,d); gl_FragColor=vec4(tint,opacity*mix(.08,1.,f));}',
      });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
      (b.center === 'sun' ? sunFrame : world).add(line);
      return material;
    });
  const opened = Date.now();
  const openingSun = position('sun', opened);
  const yaw = Math.atan2(openingSun[0], openingSun[2]) - 2.1;
  const view = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(0.6),
    Math.sin(0.6),
    Math.cos(yaw) * Math.cos(0.6),
  );
  const projected = new THREE.Vector3();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motionOff = new URLSearchParams(location.search).get('motion') === '0';
  let width = 1,
    height = 1,
    time = 0,
    frame = 0,
    last = 0,
    lastLabels = -Infinity;
  let quietZones = [];
  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function placeLabels() {
    const occupied = [...quietZones];
    for (const b of bodies) {
      projected.copy(b.group.position).project(camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const w = b.label.offsetWidth,
        h = b.label.offsetHeight;
      const offsets = [
        [16, -22],
        [16, 12],
        [-w - 16, -22],
        [-w - 16, 12],
      ];
      const candidates = offsets.map(([dx, dy]) => ({ x: x + dx, y: y + dy, w, h }));
      const spot =
        projected.z < 1 &&
        projected.z > -1 &&
        candidates.find(
          (r) =>
            r.x >= 16 &&
            r.x + w < width - 16 &&
            r.y > 20 &&
            r.y + h < height - 30 &&
            !occupied.some((zone) => overlaps(r, zone)),
        );
      b.label.style.visibility = spot ? 'visible' : 'hidden';
      if (spot) {
        b.label.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px)`;
        occupied.push({ ...spot, x: spot.x - 8, y: spot.y - 6, w: w + 16, h: h + 12 });
      }
    }
  }
  function draw(forceLabels = false) {
    for (const b of bodies) {
      b.group.position.set(...position(b.id, opened, time));
      if (b.spin) b.surface.rotation.y = (time / b.spin) * Math.PI * 2;
    }
    luna.group.lookAt(earth.group.position);
    luna.surface.rotation.y = -Math.PI / 2;
    sunFrame.position.copy(sun.group.position);
    earth.sunDirection.copy(sun.group.position).normalize();
    sun.uniforms.time.value = time;
    world.updateMatrixWorld(true);
    renderer.render(scene, camera);
    if (forceLabels || time - lastLabels > 0.08) {
      placeLabels();
      lastLabels = time;
    }
  }
  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    const small = width <= 900;
    const distance = small ? Math.max(31, 18 / (width / height)) : 27;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.copy(view).multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    camera.setViewOffset(
      width,
      height,
      width * (small ? 0 : 0.14),
      height * (small ? -0.1 : -0.04),
      width,
      height,
    );
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    sky.group.position.copy(camera.position);
    tracks.forEach((m) => {
      m.uniforms.near.value = distance * 0.6;
      m.uniforms.far.value = distance * 2.2;
    });
    const base = host.getBoundingClientRect();
    quietZones = [...document.querySelectorAll('[data-quiet-zone]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left - base.left - 12,
        y: r.top - base.top - 10,
        w: r.width + 24,
        h: r.height + 20,
      };
    });
    draw(true);
  }
  function tick(now) {
    frame = 0;
    if (document.hidden || reduced.matches || motionOff) return;
    if (!last) last = now;
    // Cap the resumed delta; never catch up hidden time in one visual jump.
    time += Math.min((now - last) / 1000, 0.06);
    last = now;
    draw();
    frame = requestAnimationFrame(tick);
  }
  function syncMotion() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    if (!document.hidden) {
      resize();
      if (!reduced.matches && !motionOff) frame = requestAnimationFrame(tick);
    }
  }
  new ResizeObserver(resize).observe(host);
  document.fonts.ready.then(resize);
  THREE.DefaultLoadingManager.onLoad = () => draw(true);
  reduced.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('pageshow', syncMotion);
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frame);
    last = 0;
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    document.querySelector('.render-note').hidden = false;
    labels.hidden = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    document.querySelector('.render-note').hidden = true;
    labels.hidden = false;
    syncMotion();
  });
  syncMotion();
}

updateReport();
setInterval(() => {
  if (!document.hidden) updateReport();
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateReport();
});
try {
  mountScene();
} catch (error) {
  console.warn('Starfield preview:', error);
  document.querySelector('.render-note').hidden = false;
}
