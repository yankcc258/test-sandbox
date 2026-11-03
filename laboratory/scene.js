import * as THREE from '../vendor/three/three.module.min.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { createSpecimen } from './specimen.js?v=30';
import { approach, sceneTargets } from './state.js?v=30';

// The trefoil and Frenet-frame ribbon follow ZHIXU's existing laboratory.
// The inside specimen is a separate mathematical object, not a transformation
// claiming that a trefoil knot and a saddle are the same surface.
class TrefoilCurve extends THREE.Curve {
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    return target
      .set(
        Math.sin(a) + 2 * Math.sin(2 * a),
        Math.cos(a) - 2 * Math.cos(2 * a),
        -1.3 * Math.sin(3 * a),
      )
      .multiplyScalar(0.36);
  }
}
export async function createLaboratory({ canvas, anchor, activate, motion }) {
  if (new URLSearchParams(location.search).get('view') === 'fallback')
    throw new Error('Static preview');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const environment = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const texture = environment.fromScene(room, 0.035).texture;
  scene.environment = texture;
  environment.dispose();
  room.dispose?.();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 45);
  const hemi = new THREE.HemisphereLight('#d9e7ea', '#41443a', 1.3);
  const key = new THREE.DirectionalLight('#eef2e6', 3);
  key.position.set(-3.2, 5, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 15 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.025;
  const edge = new THREE.DirectionalLight('#9bbdc8', 1.8);
  edge.position.set(2, 2, -3);
  scene.add(hemi, key, edge);
  const world = new THREE.Group(),
    ribbonGroup = new THREE.Group();
  world.add(ribbonGroup);
  scene.add(world);
  const count = innerWidth < 700 ? 192 : 288;
  const curve = new TrefoilCurve(),
    frames = curve.computeFrenetFrames(count, true);
  const metal = new THREE.MeshPhysicalMaterial({
    color: '#e3e1d6',
    metalness: 0.12,
    roughness: 0.34,
    clearcoat: 0.25,
    transparent: true,
  });
  const plates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.032, 0.012), metal, count);
  plates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  plates.castShadow = plates.receiveShadow = true;
  plates.frustumCulled = false;
  ribbonGroup.add(plates);
  const frame = new THREE.Matrix4(),
    n = new THREE.Vector3(),
    b = new THREE.Vector3();
  const poses = Array.from({ length: count }, (_, i) => {
    const t = i / count,
      twist = t * Math.PI * 7;
    n.copy(frames.normals[i])
      .multiplyScalar(Math.cos(twist))
      .addScaledVector(frames.binormals[i], Math.sin(twist));
    b.copy(frames.normals[i])
      .multiplyScalar(-Math.sin(twist))
      .addScaledVector(frames.binormals[i], Math.cos(twist));
    const start = curve.getPointAt(t),
      initial = new THREE.Quaternion().setFromRotationMatrix(
        frame.makeBasis(n, b, frames.tangents[i]),
      );
    const sector = Math.floor(t * 6),
      u = t * 6 - sector;
    const angle = (sector * Math.PI) / 3 + (u - 0.5) * 0.8;
    const end = new THREE.Vector3(Math.cos(angle) * 2.65, Math.sin(angle) * 1.72, -1.1 - u * 0.22);
    const final = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.15, 0.35, angle + Math.PI / 2 + (u - 0.5) * 0.5),
    );
    return { start, initial, end, final, normal: n.clone(), t };
  });
  const specimen = createSpecimen(THREE);
  specimen.group.rotation.y = -0.25;
  specimen.setReveal(0);
  world.add(specimen.group);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.ShadowMaterial({ opacity: 0.18 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  ground.receiveShadow = true;
  scene.add(ground);
  const matrix = new THREE.Matrix4(),
    p = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    scale = new THREE.Vector3(1, 1, 1);
  const ivory = new THREE.Color('#e3e1d6'),
    charcoal = new THREE.Color('#3a403d'),
    accent = new THREE.Color('#c9dd93'),
    color = new THREE.Color();
  let state = { stage: 'overview', mode: 'surface', probe: 0.35 };
  let focus = 0,
    spread = 0,
    target = sceneTargets('overview');
  let yaw = 0,
    pitch = 0,
    targetYaw = 0,
    targetPitch = 0;
  let raf = 0,
    last = 0,
    width = 1,
    height = 1,
    disposed = false,
    lost = false;
  const project = new THREE.Vector3(),
    mathIndex = Math.floor(count * 0.24);
  function paint() {
    ribbonGroup.rotation.set(0.42 * (1 - spread), 0.3 * (1 - spread), -0.18 * (1 - spread));
    world.rotation.set(pitch, yaw, 0);
    for (let i = 0; i < count; i++) {
      const pose = poses[i];
      const localOpen = THREE.MathUtils.smoothstep(spread, pose.t * 0.08, 0.83 + pose.t * 0.17);
      p.copy(pose.start)
        .multiplyScalar(1 + focus * 0.11)
        .lerp(pose.end, localOpen);
      q.copy(pose.initial).slerp(pose.final, localOpen);
      scale.setScalar(1 - localOpen * 0.28);
      matrix.compose(p, q, scale);
      plates.setMatrixAt(i, matrix);
      const isNode = Math.abs(i - mathIndex) < 5;
      color.copy(isNode ? (focus > 0.1 ? accent : charcoal) : ivory);
      plates.setColorAt(i, color);
    }
    plates.instanceMatrix.needsUpdate = true;
    plates.instanceColor.needsUpdate = true;
    metal.opacity = 1 - spread * 0.69;
    metal.depthWrite = spread < 0.3;
    plates.castShadow = spread < 0.55;
    const reveal = THREE.MathUtils.smoothstep(spread, 0.25, 0.9);
    specimen.setReveal(reveal);
    const aspect = width / height;
    const fit = Math.max(1, 1.12 / aspect);
    const z = (6.65 - focus * 0.75 + spread * 0.95) * fit;
    camera.position.set(0, 0.35 + spread * 2.65, z);
    camera.lookAt(0, -0.04 - spread * 0.1, 0);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    world.updateMatrixWorld(true);
    renderer.render(scene, camera);
    anchor.hidden = state.stage === 'observe' || state.stage === 'lesson';
    if (!anchor.hidden) {
      project.copy(poses[mathIndex].start).applyMatrix4(ribbonGroup.matrixWorld).project(camera);
      const x = THREE.MathUtils.clamp(
        (project.x * 0.5 + 0.5) * width + 22,
        20,
        Math.max(20, width - 145),
      );
      const y = THREE.MathUtils.clamp((-project.y * 0.5 + 0.5) * height, 50, height - 70);
      anchor.style.transform = `translate(${x}px,${y}px)`;
    }
    canvas.dataset.stage = state.stage;
    canvas.dataset.spread = spread.toFixed(3);
    canvas.dataset.focus = focus.toFixed(3);
    canvas.dataset.yaw = yaw.toFixed(3);
  }
  function tick(now) {
    raf = 0;
    if (disposed || lost || document.hidden) return;
    const dt = last ? Math.min((now - last) / 1000, 0.06) : 1 / 60;
    last = now;
    if (!motion()) {
      focus = target.focus;
      spread = target.spread;
      yaw = targetYaw;
      pitch = targetPitch;
    } else {
      focus = approach(focus, target.focus, dt, 7);
      spread = approach(spread, target.spread, dt, 5.8);
      yaw = approach(yaw, targetYaw, dt, 13);
      pitch = approach(pitch, targetPitch, dt, 13);
    }
    paint();
    if (
      focus !== target.focus ||
      spread !== target.spread ||
      yaw !== targetYaw ||
      pitch !== targetPitch
    )
      request();
    else last = 0;
  }
  function request() {
    if (!raf && !disposed && !lost && !document.hidden) raf = requestAnimationFrame(tick);
  }
  function resize() {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    request();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  const ray = new THREE.Raycaster(),
    cursor = new THREE.Vector2();
  let drag = null;
  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) {
      if (drag) drag.moved = true;
      return;
    }
    if (event.button !== 0) return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw: targetYaw,
      pitch: targetPitch,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 7) drag.moved = true;
    if (!drag.moved) return;
    if (event.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) return;
    targetYaw = drag.yaw + dx * 0.005;
    targetPitch = THREE.MathUtils.clamp(
      drag.pitch + (event.pointerType === 'touch' ? 0 : dy * 0.003),
      -0.4,
      0.55,
    );
    request();
  });
  function release(event, cancel = false) {
    if (!drag || drag.id !== event.pointerId) return;
    const tap = !cancel && !drag.moved;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!tap || spread > 0.5) return;
    const rect = canvas.getBoundingClientRect();
    cursor.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(cursor, camera);
    if (ray.intersectObject(plates).length) activate();
  }
  canvas.addEventListener('pointerup', (event) => release(event));
  canvas.addEventListener('pointercancel', (event) => release(event, true));
  canvas.addEventListener('lostpointercapture', (event) => release(event, true));
  canvas.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      targetYaw += event.key === 'ArrowLeft' ? -0.2 : 0.2;
      request();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  });
  const visibility = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    if (!document.hidden) request();
  };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', visibility);
  window.addEventListener('pageshow', request);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    raf = 0;
    document.getElementById('fallback').hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    document.getElementById('fallback').hidden = true;
    request();
  });
  resize();
  renderer.compile(scene, camera);
  request();
  return {
    update(next) {
      const changedStage = state.stage !== next.stage;
      state = next;
      target = sceneTargets(state.stage);
      if (changedStage && state.stage !== 'lesson') {
        targetYaw = 0;
        targetPitch = 0;
      }
      specimen.setMode(state.mode);
      specimen.setProbe(state.probe);
      request();
    },
    setMood(mood) {
      const light = mood === 'day' ? '#f0efe6' : mood === 'dusk' ? '#eed4b4' : '#c5dbe2';
      key.color.set(light);
      key.intensity = mood === 'day' ? 3.1 : mood === 'dusk' ? 2.8 : 2.5;
      scene.environmentIntensity = mood === 'day' ? 0.9 : 0.65;
      request();
    },
    refresh: request,
  };
}
