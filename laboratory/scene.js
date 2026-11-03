import * as THREE from '../vendor/three/three.module.min.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { createSpecimen } from './specimen.js?v=31';
import { approach, sceneTargets } from './state.js?v=31';
import { advanceRelease, releasePhase } from './motion.js?v=31';

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
  renderer.toneMappingExposure = 0.92;
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
  const hemi = new THREE.HemisphereLight('#d9e7ea', '#34362e', 0.55);
  const key = new THREE.DirectionalLight('#eef2e6', 2.5);
  key.position.set(-3.2, 5, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 15 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.025;
  const edge = new THREE.DirectionalLight('#a6c0c7', 1.35);
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
    metalness: 0.16,
    roughness: 0.43,
    clearcoat: 0.12,
    transparent: true,
  });
  const plates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.032, 0.012), metal, count);
  plates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  plates.castShadow = false;
  plates.receiveShadow = true;
  plates.frustumCulled = false;
  ribbonGroup.add(plates);
  const frame = new THREE.Matrix4(),
    n = new THREE.Vector3(),
    b = new THREE.Vector3();
  const restRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0.3, -0.18));
  // Three folds keep their ordering and unwind into offset ribbons behind the specimen.
  // Their different depths and open ends avoid turning the sculpture into a circular frame.
  const folds = [
    [
      [-2.5, -0.6, -0.9],
      [-2.45, 0.45, -1.3],
      [-1.65, 1.2, -1.7],
      [-0.55, 1.15, -1.9],
    ],
    [
      [0.5, 1.15, -1.9],
      [1.5, 1.05, -1.5],
      [2.4, 0.4, -1.3],
      [2.3, -0.65, -1],
    ],
    [
      [1.9, -1.5, -1.5],
      [0.6, -1.7, -1.8],
      [-0.9, -1.55, -1.3],
      [-2.1, -1.05, -0.9],
    ],
  ].map((points) => new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))));
  const poses = Array.from({ length: count }, (_, i) => {
    const t = i / count,
      twist = t * Math.PI * 7;
    n.copy(frames.normals[i])
      .multiplyScalar(Math.cos(twist))
      .addScaledVector(frames.binormals[i], Math.sin(twist));
    b.copy(frames.normals[i])
      .multiplyScalar(-Math.sin(twist))
      .addScaledVector(frames.binormals[i], Math.cos(twist));
    const start = curve.getPointAt(t).applyQuaternion(restRotation),
      initial = new THREE.Quaternion()
        .setFromRotationMatrix(frame.makeBasis(n, b, frames.tangents[i]))
        .premultiply(restRotation);
    const sector = Math.min(2, Math.floor(t * 3)),
      u = t * 3 - sector;
    const end = folds[sector].getPointAt(u);
    const endTangent = folds[sector].getTangentAt(u).normalize();
    const cross = new THREE.Vector3(-endTangent.y, endTangent.x, 0).normalize();
    cross.applyAxisAngle(endTangent, 1.02 + 0.28 * Math.sin(u * Math.PI * 1.5 + sector));
    const normal = new THREE.Vector3().crossVectors(cross, endTangent).normalize();
    const final = new THREE.Quaternion().setFromRotationMatrix(
      frame.makeBasis(cross, endTangent, normal),
    );
    const startTangent = frames.tangents[i].clone().applyQuaternion(restRotation);
    const lead = start
      .clone()
      .addScaledVector(startTangent, 0.34)
      .addScaledVector(start.clone().normalize(), 0.18);
    const settle = end.clone().addScaledVector(endTangent, -0.3);
    return { start, initial, end, final, lead, settle, u, sector, t };
  });
  const specimen = createSpecimen(THREE);
  specimen.group.rotation.y = -0.25;
  specimen.setReveal(0);
  world.add(specimen.group);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.ShadowMaterial({ opacity: 0.15, depthWrite: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.864;
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
    spreadVelocity = 0,
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
    world.rotation.set(pitch, yaw, 0);
    for (let i = 0; i < count; i++) {
      const pose = poses[i];
      const localOpen = releasePhase(spread, pose.u, pose.sector),
        closed = 1 - localOpen;
      p.copy(pose.start)
        .multiplyScalar(closed ** 3 * (1 + focus * 0.11))
        .addScaledVector(pose.lead, 3 * closed * closed * localOpen)
        .addScaledVector(pose.settle, 3 * closed * localOpen * localOpen)
        .addScaledVector(pose.end, localOpen ** 3);
      q.copy(pose.initial).slerp(pose.final, localOpen);
      scale.setScalar(1 - localOpen * 0.08);
      matrix.compose(p, q, scale);
      plates.setMatrixAt(i, matrix);
      const isNode = Math.abs(i - mathIndex) < 5;
      color.copy(isNode ? (focus > 0.1 ? accent : charcoal) : ivory);
      if (isNode) color.lerp(ivory, spread);
      plates.setColorAt(i, color);
    }
    plates.instanceMatrix.needsUpdate = true;
    plates.instanceColor.needsUpdate = true;
    metal.opacity = 1 - THREE.MathUtils.smoothstep(spread, 0.22, 1) * 0.58;
    const reveal = THREE.MathUtils.smoothstep(spread, 0.43, 0.93);
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
      spreadVelocity = 0;
      yaw = targetYaw;
      pitch = targetPitch;
    } else {
      focus = approach(focus, target.focus, dt, 7);
      [spread, spreadVelocity] = advanceRelease(spread, spreadVelocity, target.spread, dt);
      yaw = approach(yaw, targetYaw, dt, 13);
      pitch = approach(pitch, targetPitch, dt, 13);
    }
    paint();
    if (
      focus !== target.focus ||
      spread !== target.spread ||
      spreadVelocity !== 0 ||
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
      key.intensity = mood === 'day' ? 2.7 : mood === 'dusk' ? 2.4 : 2.2;
      scene.environmentIntensity = mood === 'day' ? 0.56 : 0.44;
      request();
    },
    refresh: request,
  };
}
