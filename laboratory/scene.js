import * as THREE from '../vendor/three/three.module.min.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { createLabEnvironment } from './environment.js?v=39';
import { createParticleField } from './particle-field.js?v=39';
import {
  surfaceFor,
  createSpecimenGeometry,
  createSpecimenMaterial,
  createSpecimenDepthMaterial,
} from './specimen-materials.js?v=39';
import { approach } from './state.js?v=39';
import { DISCIPLINES } from './course-data.js?v=39';
class TrefoilCurve extends THREE.Curve {
  getPoint(t, v = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    return v
      .set(
        Math.sin(a) + 2 * Math.sin(2 * a),
        Math.cos(a) - 2 * Math.cos(2 * a),
        -1.3 * Math.sin(3 * a),
      )
      .multiplyScalar(0.36);
  }
}
export async function createLaboratory({
  canvas,
  anchor,
  activate,
  motion,
  labels,
  courses,
  progress,
  select,
}) {
  if (new URLSearchParams(location.search).get('view') === 'fallback')
    throw new Error('Static preview');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  const pmrem = new THREE.PMREMGenerator(renderer),
    room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.035).texture;
  scene.environment = env;
  pmrem.dispose();
  room.dispose?.();
  scene.environmentIntensity = 0.5;
  const key = new THREE.DirectionalLight('#eef0e5', 2.8);
  key.position.set(-3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 16 });
  key.shadow.bias = -0.00015;
  key.shadow.normalBias = 0.012;
  const rim = new THREE.DirectionalLight('#95b3bf', 1.3);
  rim.position.set(3, 1, -2);
  const fill = new THREE.DirectionalLight('#c2cecc', 0.8);
  fill.position.set(4, 1, 3);
  scene.add(new THREE.HemisphereLight('#d3ddd6', '#222a28', 0.22), key, rim, fill);
  const bay = createLabEnvironment(THREE);
  scene.add(bay.group);
  const world = new THREE.Group();
  scene.add(world);
  const modelRoot = new THREE.Group();
  world.add(modelRoot);
  const count = 288,
    box = createSpecimenGeometry(count),
    mat = createSpecimenMaterial();
  const finishes = box.getAttribute('labSurface');
  const mesh = new THREE.InstancedMesh(box, mat, count);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.customDepthMaterial = createSpecimenDepthMaterial();
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const tailMat = new THREE.MeshBasicMaterial({
    color: '#9db5af',
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
  });
  const tails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), tailMat, count);
  tails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tails.frustumCulled = false;
  scene.add(tails);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 2.5),
    new THREE.ShadowMaterial({ opacity: 0.22, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0, -1.4, 0);
  contact.receiveShadow = true;
  modelRoot.add(contact);
  const curve = new TrefoilCurve(),
    frames = curve.computeFrenetFrames(count, true),
    basis = new THREE.Matrix4(),
    n = new THREE.Vector3(),
    b = new THREE.Vector3(),
    rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0.3, -0.18));
  const initial = Array.from({ length: count }, (_, i) => {
    const t = i / count,
      a = t * Math.PI * 7;
    n.copy(frames.normals[i])
      .multiplyScalar(Math.cos(a))
      .addScaledVector(frames.binormals[i], Math.sin(a));
    b.copy(frames.normals[i])
      .multiplyScalar(-Math.sin(a))
      .addScaledVector(frames.binormals[i], Math.cos(a));
    return {
      p: curve.getPointAt(t).applyQuaternion(rest),
      q: new THREE.Quaternion()
        .setFromRotationMatrix(basis.makeBasis(n, b, frames.tangents[i]))
        .premultiply(rest),
      s: new THREE.Vector3(0.5, 0.032, 0.012),
      c: new THREE.Color('#dfded3'),
      finish: surfaceFor(),
    };
  });
  let state = { stage: 'overview', discipline: 'mathematics', chapter: null, probe: 0.35 };
  let yaw = 0,
    pitch = 0,
    targetYaw = 0,
    targetPitch = 0,
    viewLesson = 0,
    viewModel = 0;
  let cameraDistance = 6.8,
    cameraElevation = 0.35,
    width = 1,
    height = 1,
    raf = 0,
    renderedFrames = 0,
    last = 0,
    lost = false,
    contactOpacity = 0;
  const transform = new THREE.Object3D(),
    zero = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    point = new THREE.Vector3(),
    velocity = new THREE.Vector3(),
    yAxis = new THREE.Vector3(0, 1, 0);
  const field = createParticleField(initial, {
    modelTransform(source, out) {
      out.p.copy(source.p).applyMatrix4(modelRoot.matrixWorld);
      out.q.copy(world.quaternion).multiply(source.q);
      out.s.copy(source.s).multiplyScalar(modelRoot.scale.x);
      out.c.copy(source.c);
      for (let k = 0; k < 3; k++) out.finish[k] = source.finish[k];
    },
    knotTransform(source, i, out, next) {
      const sector = DISCIPLINES.findIndex((d) => d.id === next.discipline),
        active = Math.floor((i / count) * 6) === sector;
      out.p
        .copy(source.p)
        .multiplyScalar(next.stage === 'focus' && active ? 1.16 : 1)
        .applyMatrix4(world.matrixWorld);
      out.q.copy(world.quaternion).multiply(source.q);
      out.s.copy(source.s);
      const empty = ['observe', 'lesson'].includes(next.stage) && !next.hasCourses;
      out.c.set(empty ? '#4a5a54' : active ? '#e5e2d4' : '#8f9c94');
      if (empty) out.s.multiplyScalar(0.8);
      for (let k = 0; k < 3; k++) out.finish[k] = source.finish[k];
    },
  });
  function put(mesh, index, p, q, s, c) {
    transform.position.copy(p);
    transform.quaternion.copy(q);
    transform.scale.copy(s);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    if (c) mesh.setColorAt(index, c);
  }
  function render(dt) {
    yaw = motion() ? approach(yaw, targetYaw, dt, 13) : targetYaw;
    pitch = motion() ? approach(pitch, targetPitch, dt, 13) : targetPitch;
    viewLesson = motion()
      ? approach(viewLesson, state.stage === 'lesson' ? 1 : 0, dt, 10)
      : state.stage === 'lesson'
        ? 1
        : 0;
    world.rotation.set(pitch, yaw, 0);
    viewModel = motion()
      ? approach(viewModel, state.chapter ? 1 : 0, dt, 9)
      : state.chapter
        ? 1
        : 0;
    // 露娜：模型放在环的正中心（原来向右偏 1.05，看起来没在环里）
    const modelX = 0;
    modelRoot.position.x = motion() ? approach(modelRoot.position.x, modelX, dt, 10) : modelX;
    modelRoot.position.y = 0.15 * viewModel * (1 - viewLesson);
    modelRoot.scale.setScalar(1 - 0.14 * viewModel * (1 - viewLesson));
    world.updateMatrixWorld(true);
    const particleMotion = field.step(dt, motion());
    contact.position.y = field.contactY;
    contact.visible = !!state.chapter;
    const desiredContact = state.chapter ? (field.busy ? 0.1 : 0.22) : 0;
    contactOpacity = motion() ? approach(contactOpacity, desiredContact, dt, 9) : desiredContact;
    contact.material.opacity = contactOpacity;
    for (let i = 0; i < count; i++) {
      const p = field.current[i],
        ring = field.homes[i] === 'ring' && field.phases[i] === 'orbit';
      scale.copy(p.s);
      if (ring) scale.multiplyScalar(1 - viewLesson);
      put(mesh, i, p.p, p.q, scale, p.c);
      finishes.setXYZ(i, ...p.finish);
      const speed = velocity.copy(field.velocity[i]).length();
      const flying = field.phases[i] === 'arrival' || field.phases[i] === 'join';
      const trail = motion() && flying ? Math.min(0.16, speed * 0.014) : 0;
      if (trail > 0.006 && p.s.lengthSq() > 0.00001) {
        velocity.normalize();
        transform.position.copy(p.p).addScaledVector(velocity, -trail * 0.5);
        transform.quaternion.setFromUnitVectors(yAxis, velocity);
        transform.scale.set(0.004, trail, 0.004);
        transform.updateMatrix();
        tails.setMatrixAt(i, transform.matrix);
      } else put(tails, i, zero, transform.quaternion, zero);
    }
    mesh.instanceMatrix.needsUpdate = true;
    finishes.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    tails.instanceMatrix.needsUpdate = true;
    const aspect = width / height,
      fit = Math.max(1, 1.12 / aspect);
    camera.aspect = aspect;
    const targetDistance =
      (state.stage === 'focus'
        ? 5.8
        : state.chapter
          ? 7.6 - viewLesson * (state.chapter === 'math-partials' ? 2.35 : 2.7)
          : state.stage === 'observe'
            ? 7.4
            : 6.8) * fit;
    cameraDistance = motion() ? approach(cameraDistance, targetDistance, dt, 9) : targetDistance;
    const targetElevation =
      0.35 +
      viewLesson * 1.8 +
      viewModel * (1 - viewLesson) * (state.chapter === 'math-partials' ? 1.4 : 0.4);
    cameraElevation = motion()
      ? approach(cameraElevation, targetElevation, dt, 9)
      : targetElevation;
    camera.position.set(0, cameraElevation, cameraDistance);
    camera.lookAt(0, -0.04, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    world.updateMatrixWorld(true);
    bay.setReveal(
      state.stage === 'overview' || state.stage === 'focus' ? 0 : 0.5,
      state.stage === 'lesson',
    );
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    anchor.hidden = ['observe', 'lesson'].includes(state.stage);
    if (!anchor.hidden) {
      const sector = DISCIPLINES.findIndex((d) => d.id === state.discipline),
        i = Math.min(count - 1, Math.round(((sector + 0.5) / 6) * count));
      point.copy(field.current[i].p).project(camera);
      anchor.style.transform = `translate(${Math.max(20, Math.min(width - 160, (point.x * 0.5 + 0.5) * width + 16))}px,${Math.max(70, Math.min(height - 70, (-point.y * 0.5 + 0.5) * height))}px)`;
    }
    canvas.dataset.stage = state.stage;
    canvas.dataset.assembly = state.chapter ?? 'orbit';
    canvas.dataset.assembling = String(field.busy);
    canvas.dataset.transition = String(field.transition);
    canvas.dataset.materialCount = String(field.modelCount);
    canvas.dataset.yaw = yaw.toFixed(3);
    canvas.dataset.frame = String(++renderedFrames);
    return (
      particleMotion ||
      contactOpacity !== desiredContact ||
      yaw !== targetYaw ||
      pitch !== targetPitch ||
      viewLesson !== (state.stage === 'lesson' ? 1 : 0) ||
      viewModel !== (state.chapter ? 1 : 0) ||
      modelRoot.position.x !== modelX ||
      cameraDistance !== targetDistance ||
      cameraElevation !== targetElevation
    );
  }
  function tick(now) {
    raf = 0;
    if (lost || document.hidden) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
    last = now;
    if (render(dt)) request();
    else last = 0;
  }
  function request() {
    if (!raf && !lost && !document.hidden) raf = requestAnimationFrame(tick);
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
  canvas.addEventListener('pointerdown', (e) => {
    if (state.stage === 'observe' && !state.chapter) return;
    if (e.button !== 0 || !e.isPrimary) {
      if (drag) drag.moved = true;
      return;
    }
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      yaw: targetYaw,
      pitch: targetPitch,
      moved: false,
    };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 7) drag.moved = true;
    if (!drag.moved) return;
    if (e.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) return;
    targetYaw = drag.yaw + dx * 0.004;
    targetPitch = THREE.MathUtils.clamp(
      drag.pitch + (e.pointerType === 'touch' ? 0 : dy * 0.003),
      -0.4,
      0.5,
    );
    request();
  });
  function release(e, cancel = false) {
    if (!drag || drag.id !== e.pointerId) return;
    const tap = !cancel && !drag.moved;
    drag = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (!tap) return;
    const rect = canvas.getBoundingClientRect();
    cursor.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(cursor, camera);
    if (['overview', 'focus'].includes(state.stage)) {
      if (ray.intersectObject(mesh).length) activate();
      return;
    }
  }
  canvas.addEventListener('pointerup', (e) => release(e));
  canvas.addEventListener('pointercancel', (e) => release(e, true));
  canvas.addEventListener('lostpointercapture', (e) => release(e, true));
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      targetYaw += e.key === 'ArrowLeft' ? -0.2 : 0.2;
      request();
    } else if (
      (e.key === 'Enter' || e.key === ' ') &&
      ['overview', 'focus'].includes(state.stage)
    ) {
      e.preventDefault();
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
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
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
      const changed =
        state.stage !== next.stage ||
        state.chapter !== next.chapter ||
        state.discipline !== next.discipline;
      state = next;
      if (changed) {
        if (state.stage === 'focus') {
          const sector = DISCIPLINES.findIndex((d) => d.id === state.discipline),
            p = initial[Math.round(((sector + 0.5) / 6) * (count - 1))].p;
          targetYaw = -Math.atan2(p.x, p.z);
        } else targetYaw = state.chapter === 'math-partials' ? -0.38 : state.chapter ? 0.12 : 0;
        targetPitch = 0;
      }
      field.update({ ...state, hasCourses: courses(state.discipline).length > 0 });
      request();
    },
    refresh: request,
    setHover(id) {
      request();
    },
    setMood(mood) {
      key.color.set(mood === 'day' ? '#f0efe6' : mood === 'dusk' ? '#e7d8c4' : '#cbdde0');
      key.intensity = mood === 'day' ? 2.9 : 2.5;
      bay.setMood(mood);
      request();
    },
  };
}
