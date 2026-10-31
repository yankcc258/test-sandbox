import * as THREE from '../../vendor/three/three.module.min.js';
import { RoomEnvironment } from '../../vendor/three/RoomEnvironment.js';
const $ = (id) => document.getElementById(id),
  canvas = $('scene'),
  stage = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setClearColor(0x151a1c, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(33, 1, 0.05, 100);
const pmrem = new THREE.PMREMGenerator(renderer),
  room = new RoomEnvironment();
const env = pmrem.fromScene(room, 0.035);
scene.environment = env.texture;
scene.environmentIntensity = 0.42;
room.dispose();
pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xe9f0ec, 0x283435, 0.45));
const key = new THREE.DirectionalLight(0xf4f1e9, 2.35);
key.position.set(-4.5, 7, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -7, right: 7, top: 8, bottom: -8, near: 0.1, far: 30 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.035;
scene.add(key);
const rim = new THREE.DirectionalLight(0xd6e5e3, 2.1);
rim.position.set(4, 4, -5);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xe3e9e6, 0.55);
fill.position.set(3, 0, 5);
scene.add(fill);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.ShadowMaterial({ color: 0x050808, opacity: 0.24 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const center = new THREE.Vector3();
let assembly,
  units = [],
  base = [],
  materials = [],
  mode = 'whole',
  spin = false,
  separate = false,
  wireframe = false,
  drag = false,
  lastTime = 0,
  raf = 0;
let theta = -0.92,
  phi = 1.38,
  radius = 18,
  homeRadius = 18;
let activeCenter = new THREE.Vector3();
function render(now = 0) {
  raf = 0;
  const dt = Math.min(0.04, (now - lastTime) / 1000 || 0.016);
  lastTime = now;
  if (spin && !drag) {
    theta += dt * 0.12;
    setViewLabel('自由视角');
  }
  camera.position.set(
    center.x + radius * Math.sin(phi) * Math.sin(theta),
    center.y + radius * Math.cos(phi),
    center.z + radius * Math.sin(phi) * Math.cos(theta),
  );
  camera.lookAt(center);
  renderer.render(scene, camera);
  if (spin) invalidate();
}
function invalidate() {
  if (!raf) raf = requestAnimationFrame(render);
}
function resize() {
  const { width, height } = canvas.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (assembly) fit();
  invalidate();
}
new ResizeObserver(resize).observe(stage);

// Small purpose-built glTF 2.0 reader for the uncompressed artifact produced by build-model.mjs.
// The artifact is a standard GLB; it can also be opened in Blender or another glTF viewer.
async function loadGLB() {
  const response = await fetch('../../assets/models/organic-spine-study-v3.glb');
  if (!response.ok) throw Error('模型文件加载失败');
  const buffer = await response.arrayBuffer(),
    dv = new DataView(buffer),
    length = dv.getUint32(12, true);
  if (dv.getUint32(0, true) !== 0x46546c67) throw Error('无效的 GLB 文件');
  const data = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))),
    binStart = 28 + length;
  const attribute = (index) => {
    const a = data.accessors[index],
      v = data.bufferViews[a.bufferView];
    return new THREE.BufferAttribute(
      new Float32Array(buffer, binStart + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * 3),
      3,
    );
  };
  materials = data.materials.map((m, i) => {
    const p = m.pbrMetallicRoughness,
      c = new THREE.Color().setRGB(...p.baseColorFactor.slice(0, 3), THREE.LinearSRGBColorSpace);
    return new THREE.MeshPhysicalMaterial({
      color: c,
      metalness: p.metallicFactor,
      roughness: p.roughnessFactor,
      clearcoat: i === 0 ? 0.4 : i === 1 ? 0.18 : 0,
      clearcoatRoughness: 0.3,
      envMapIntensity: 1,
    });
  });
  const geometries = data.meshes.map((m) => {
    const p = m.primitives[0],
      g = new THREE.BufferGeometry();
    g.setAttribute('position', attribute(p.attributes.POSITION));
    g.setAttribute('normal', attribute(p.attributes.NORMAL));
    if (p.indices !== undefined) {
      const a = data.accessors[p.indices],
        v = data.bufferViews[a.bufferView];
      g.setIndex(
        new THREE.BufferAttribute(new Uint32Array(buffer, binStart + v.byteOffset, a.count), 1),
      );
    }
    g.computeBoundingSphere();
    return g;
  });
  const nodes = data.nodes.map((n) => {
    const o =
      n.mesh === undefined
        ? new THREE.Group()
        : new THREE.Mesh(geometries[n.mesh], materials[data.meshes[n.mesh].primitives[0].material]);
    o.name = n.name;
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    return o;
  });
  data.nodes.forEach((n, i) => n.children?.forEach((child) => nodes[i].add(nodes[child])));
  assembly = nodes[0];
  scene.add(assembly);
  units = data.extras.units.map((i) => nodes[i]);
  base = units.map((u) => u.position.clone());
  $('loading').hidden = true;
  setMode('whole');
  canvas.dataset.ready = 'true';
}
function fit(reset = true) {
  assembly.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  for (const u of units) if (u.visible) bounds.union(new THREE.Box3().setFromObject(u));
  const size = bounds.getSize(new THREE.Vector3());
  bounds.getCenter(activeCenter);
  center.copy(activeCenter);
  const aspect = canvas.clientWidth / canvas.clientHeight;
  homeRadius =
    Math.max(size.y * (mode === 'whole' ? 1.29 : 1.18), (size.x / aspect) * 1.25) /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) +
    size.z * 0.6;
  if (reset) radius = homeRadius;
  else radius = Math.max(homeRadius * 0.32, Math.min(homeRadius * 2, radius));
  ground.position.y = bounds.min.y - 0.09;
  key.target.position.copy(center);
  scene.add(key.target);
  key.position.set(center.x - 4.5, center.y + 7, center.z + 6);
  rim.position.set(center.x + 4, center.y + 4, center.z - 5);
  fill.position.set(center.x + 3, center.y, center.z + 5);
  invalidate();
}
function setMode(next) {
  mode = next;
  units.forEach(
    (u, i) => (u.visible = mode === 'whole' || (mode === 'joint' ? i >= 3 && i <= 5 : i === 4)),
  );
  $('separate').disabled = mode === 'single';
  for (const b of document.querySelectorAll('[data-mode]'))
    b.setAttribute('aria-pressed', String(b.dataset.mode === next));
  $('specimen-id').textContent =
    next === 'whole' ? 'SPECIMEN 01—09' : next === 'joint' ? 'SPECIMEN 04—06' : 'SPECIMEN 05';
  fit();
  invalidate();
}
function setViewLabel(label) {
  $('view-label').textContent = label;
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', 'false');
}
function view(name) {
  theta = { hero: -0.92, front: 0, side: Math.PI / 2, back: Math.PI, top: 0 }[name];
  phi = name === 'top' ? 0.12 : name === 'hero' ? (mode === 'single' ? 0.9 : 1.38) : Math.PI / 2;
  setViewLabel(
    { hero: '斜侧视图', front: '正面视图', side: '侧面视图', back: '背面视图', top: '俯视 · 椎孔' }[
      name
    ],
  );
  document.querySelector(`[data-view="${name}"]`).setAttribute('aria-pressed', 'true');
  center.copy(activeCenter);
  radius = homeRadius;
  invalidate();
}
for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => view(b.dataset.view);
for (const b of document.querySelectorAll('[data-mode]'))
  b.onclick = () => assembly && setMode(b.dataset.mode);
function reset() {
  spin = false;
  toggleState('spin', false);
  view('hero');
}
$('reset').onclick = reset;
$('home').onclick = (e) => {
  e.preventDefault();
  reset();
};
function toggleState(id, on) {
  const b = $(id);
  b.setAttribute('aria-pressed', String(on));
  b.querySelector('span').textContent = on ? '开' : '关';
}
$('spin').onclick = () => {
  spin = !spin;
  toggleState('spin', spin);
  lastTime = performance.now();
  invalidate();
};
$('separate').onclick = () => {
  separate = !separate;
  toggleState('separate', separate);
  units.forEach((u, i) =>
    u.position.copy(base[i]).add(new THREE.Vector3(0, separate ? (4 - i) * 0.28 : 0, 0)),
  );
  fit();
};
$('wireframe').onclick = () => {
  wireframe = !wireframe;
  toggleState('wireframe', wireframe);
  materials.forEach((m) => (m.wireframe = wireframe));
  invalidate();
};
const pointers = new Map();
let previousPinch = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  drag = true;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    previousPinch = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const p = pointers.get(e.pointerId),
    dx = e.clientX - p.x,
    dy = e.clientY - p.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()],
      d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 1 && previousPinch > 1) radius *= previousPinch / d;
    previousPinch = d;
  } else if (e.buttons === 2 || e.shiftKey) {
    center.y += (dy * radius) / stage.clientHeight;
    center.x -= ((dx * radius) / stage.clientHeight) * Math.cos(theta);
    center.z += ((dx * radius) / stage.clientHeight) * Math.sin(theta);
  } else {
    theta -= dx * 0.006;
    phi = THREE.MathUtils.clamp(phi - dy * 0.005, 0.15, Math.PI - 0.15);
  }
  radius = THREE.MathUtils.clamp(radius, homeRadius * 0.28, homeRadius * 2.2);
  setViewLabel('自由视角');
  invalidate();
});
function release(e) {
  pointers.delete(e.pointerId);
  drag = pointers.size > 0;
  if (pointers.size < 2) previousPinch = 0;
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('lostpointercapture', release);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    radius = THREE.MathUtils.clamp(
      radius * Math.exp(e.deltaY * 0.001),
      homeRadius * 0.28,
      homeRadius * 2.2,
    );
    invalidate();
  },
  { passive: false },
);
canvas.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') theta -= 0.12;
  else if (e.key === 'ArrowRight') theta += 0.12;
  else if (e.key === 'ArrowUp') phi = Math.max(0.15, phi - 0.1);
  else if (e.key === 'ArrowDown') phi = Math.min(Math.PI - 0.15, phi + 0.1);
  else if (e.key === '+' || e.key === '=') radius = Math.max(homeRadius * 0.28, radius * 0.9);
  else if (e.key === '-') radius = Math.min(homeRadius * 2.2, radius * 1.1);
  else if (e.key.toLowerCase() === 'r') {
    reset();
    e.preventDefault();
    return;
  } else return;
  e.preventDefault();
  setViewLabel('自由视角');
  invalidate();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  } else {
    lastTime = performance.now();
    invalidate();
  }
});
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  $('loading').hidden = false;
  $('loading').textContent = '图形上下文已暂停，请刷新恢复预览。';
});
resize();
loadGLB().catch((error) => {
  console.error(error);
  $('loading').className = 'error';
  $('loading').textContent = '模型加载失败。请确认通过本地服务器打开，随后刷新。';
});
