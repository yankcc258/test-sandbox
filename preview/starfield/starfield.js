import * as THREE from '../../vendor/three/three.module.min.js';
import { BODIES, position, orbitOffset } from './orbit-space.js';
import { makeBody, makeSky, whenTexturesReady } from './orbit-models.js?v=28';
import { skyDay, skyClock, orbitSkyCountdown } from './orbit-sky.js';
import { createSkyClient } from './sky-client.js?v=29';
import { createBodyPanel } from './body-panel.js?v=29';
import { bindExploreControls, clampZoom } from './explore-controls.js?v=29';

// A self-contained view: no study routes, user data or storage.
// Only the sandbox atlas is interactive; study routes and account data stay separate.
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
let reportPending = false;
const requestSky = createSkyClient();
let selectedBody = null,
  sceneNavigate = () => {};
const bodyPanel = createBodyPanel(requestSky, selectBody, closeBody);
function selectBody(id, trigger) {
  selectedBody = id;
  bodyPanel.open(id, trigger);
  sceneNavigate(id);
}
function closeBody() {
  selectedBody = null;
  bodyPanel.hide();
  sceneNavigate(null);
}
async function updateReport() {
  const now = new Date();
  text('clock', `${skyClock(now)} JST`);
  if (reportDay === skyDay(now) && now.getTime() < nextEventAt) return;
  if (reportPending) return;
  reportPending = true;
  let report;
  try {
    report = await requestSky({ timestamp: now.getTime() });
  } catch {
    text('note', '天象数据暂未载入');
    return;
  } finally {
    reportPending = false;
  }
  const { today, events } = report;
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

async function mountScene() {
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
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'planet-label';
    label.style.visibility = 'hidden';
    label.dataset.body = body.id;
    label.setAttribute('aria-label', `查看${names[body.id]}详情`);
    label.onclick = () => selectBody(body.id, label);
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
  const initialYaw = Math.atan2(openingSun[0], openingSun[2]) - 2.1;
  let yaw = initialYaw,
    targetYaw = yaw,
    zoom = 1,
    targetZoom = 1;
  let focus = null,
    savedView = null,
    distance = 27;
  const view = new THREE.Vector3(),
    center = new THREE.Vector3();
  const destination = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motionOff = new URLSearchParams(location.search).get('motion') === '0';
  let ready = false;
  let width = 1,
    height = 1,
    time = 0,
    frame = 0,
    last = 0,
    lastLabels = -Infinity;
  let quietZones = [],
    labelsDirty = false;
  function invalidate() {
    labelsDirty = true;
    if (ready && !document.hidden && !frame) frame = requestAnimationFrame(tick);
  }
  const isStill = () => reduced.matches || motionOff;
  function updateCamera(delta, snap = false) {
    const small = width <= 900;
    const blend = snap ? 1 : 1 - Math.exp(-delta * 9);
    const body = bodies.find((b) => b.id === focus);
    if (body) destination.copy(body.group.position);
    else destination.set(0, 0, 0);
    center.lerp(destination, blend);
    yaw += (targetYaw - yaw) * blend;
    zoom += (targetZoom - zoom) * blend;
    const baseDistance = body
      ? small
        ? Math.max(
            2.6,
            (body.radius * (body.id === 'saturn' ? 2.3 : 1) * height) /
              (0.53 * (innerHeight < 700 ? 55 : Math.min(95, width * 0.26))),
          )
        : Math.max(2.6, body.radius * (body.id === 'saturn' ? 15 : 10))
      : small
        ? Math.max(31, 18 / (width / height))
        : 27;
    distance += (baseDistance * zoom - distance) * blend;
    view.set(Math.sin(yaw) * Math.cos(0.6), Math.sin(0.6), Math.cos(yaw) * Math.cos(0.6));
    camera.position.copy(view).multiplyScalar(distance).add(center);
    camera.lookAt(center);
    camera.setViewOffset(
      width,
      height,
      width * (small ? 0 : body ? 0.18 : 0.14),
      height * (small ? (body ? 0.5 - (innerHeight * 0.24) / height : -0.1) : -0.04),
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
    canvas.dataset.yaw = yaw.toFixed(3);
    canvas.dataset.zoom = zoom.toFixed(3);
    canvas.dataset.selected = focus || '';
  }
  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function placeLabels() {
    const occupied = [...quietZones];
    // Labels must avoid the projected bodies as well as other labels and HUD.
    for (const b of bodies) {
      projected.copy(b.group.position).project(camera);
      if (projected.z <= -1 || projected.z >= 1) continue;
      const r =
        (((b.radius * (b.id === 'saturn' ? 2.3 : 1.05)) /
          camera.position.distanceTo(b.group.position)) *
          height) /
        0.53;
      occupied.push({
        x: (projected.x * 0.5 + 0.5) * width - r,
        y: (-projected.y * 0.5 + 0.5) * height - r,
        w: r * 2,
        h: r * 2,
      });
    }
    for (const b of bodies) {
      if (focus && b.id !== focus) {
        b.label.style.visibility = 'hidden';
        continue;
      }
      projected.copy(b.group.position).project(camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const { w, h } = b.labelBounds;
      const gap = Math.max(
        16,
        ((b.radius / camera.position.distanceTo(b.group.position)) * height) / 0.53 + 9,
      );
      const offsets = [
        [gap, -22],
        [gap, 12],
        [-w - gap, -22],
        [-w - gap, 12],
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
  function draw(forceLabels = false, delta = 0.016, snap = false) {
    if (!ready) return;
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
    updateCamera(delta, snap);
    renderer.render(scene, camera);
    if (forceLabels || performance.now() - lastLabels > 80) {
      placeLabels();
      lastLabels = performance.now();
    }
  }
  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    measureLayout();
    draw(true, 0, true);
  }
  function measureLayout() {
    const base = host.getBoundingClientRect();
    quietZones = [...document.querySelectorAll('[data-quiet-zone]')]
      .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: r.left - base.left - 12,
          y: r.top - base.top - 10,
          w: r.width + 24,
          h: r.height + 20,
        };
      });
    bodies.forEach((b) => {
      b.labelBounds = { w: b.label.offsetWidth, h: b.label.offsetHeight };
    });
  }
  sceneNavigate = (id) => {
    if (id && !focus) savedView = { yaw: targetYaw, zoom: targetZoom };
    if (!id && savedView) {
      targetYaw = savedView.yaw;
      targetZoom = savedView.zoom;
      savedView = null;
    }
    if (id) targetZoom = 1;
    focus = id;
    measureLayout();
    invalidate();
  };
  const ray = new THREE.Raycaster(),
    cursor = new THREE.Vector2();
  bindExploreControls(canvas, {
    turn(amount) {
      targetYaw += amount;
      invalidate();
    },
    zoom(scale) {
      targetZoom = clampZoom(targetZoom * scale);
      invalidate();
    },
    pick(x, y) {
      if (!ready) return;
      const rect = canvas.getBoundingClientRect();
      cursor.set(((x - rect.left) / rect.width) * 2 - 1, (-(y - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(cursor, camera);
      const hit = ray.intersectObjects(
        bodies.map((b) => b.axis),
        true,
      )[0];
      if (hit) {
        const body = bodies.find((b) => b.axis.getObjectById(hit.object.id));
        if (body) selectBody(body.id, canvas);
      }
    },
    reset() {
      closeBody();
      targetYaw = initialYaw;
      targetZoom = 1;
      invalidate();
    },
    close: closeBody,
  });
  function tick(now) {
    frame = 0;
    if (!ready || document.hidden) return;
    if (!last) last = now;
    // Cap the resumed delta; never catch up hidden time in one visual jump.
    const delta = Math.min((now - last) / 1000, 0.06);
    if (!focus && !isStill()) time += delta;
    last = now;
    draw(labelsDirty, delta, isStill());
    labelsDirty = false;
    if (!isStill()) frame = requestAnimationFrame(tick);
    else last = 0;
  }
  function syncMotion() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    if (!document.hidden) {
      resize();
      if (ready && !reduced.matches && !motionOff) frame = requestAnimationFrame(tick);
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
  resize();
  // Decode/load first, then yield between uploads while the arrival image
  // remains in place. A missing texture can use its procedural fallback.
  let timeout;
  await Promise.race([
    whenTexturesReady(),
    new Promise((resolve) => {
      timeout = setTimeout(resolve, 6000);
    }),
  ]);
  clearTimeout(timeout);
  const maps = new Set();
  scene.traverse((object) => {
    for (const material of [object.material].flat().filter(Boolean)) {
      for (const value of Object.values(material))
        if (value?.isTexture && value.image) maps.add(value);
      for (const uniform of Object.values(material.uniforms || {}))
        if (uniform.value?.isTexture && uniform.value.image) maps.add(uniform.value);
    }
  });
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  for (const map of maps) {
    renderer.initTexture(map);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  ready = true;
  syncMotion();
  if (selectedBody) sceneNavigate(selectedBody);
  await nextFrame();
  await nextFrame();
  document.documentElement.dataset.starfieldReady = 'true';
  dispatchEvent(new Event('zhixu:starfield-ready'));
}

updateReport();
setInterval(() => {
  if (!document.hidden) {
    updateReport();
    bodyPanel.refresh();
  }
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    updateReport();
    bodyPanel.refresh();
  }
});
mountScene().catch((error) => {
  console.warn('Starfield preview:', error);
  document.querySelector('.render-note').hidden = false;
  document.documentElement.dataset.starfieldReady = 'fallback';
  dispatchEvent(new Event('zhixu:starfield-ready'));
});
