import * as THREE from '../vendor/three/three.module.min.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { createLabEnvironment } from './environment.js?v=33';
import { buildModelPoses } from './assembly-models.js?v=33';
import { flightProgress, flightPosition } from './assembly-motion.js?v=33';
import { approach } from './state.js?v=33';
import { DISCIPLINES } from './course-data.js?v=33';
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
  const rim = new THREE.DirectionalLight('#95b3bf', 1.3);
  rim.position.set(3, 1, -2);
  scene.add(new THREE.HemisphereLight('#d3ddd6', '#222a28', 0.6), key, rim);
  const bay = createLabEnvironment(THREE);
  scene.add(bay.group);
  const world = new THREE.Group();
  scene.add(world);
  const count = 288,
    box = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.4,
    metalness: 0.22,
    clearcoat: 0.15,
  });
  const mesh = new THREE.InstancedMesh(box, mat, count);
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  world.add(mesh);
  const tailMat = new THREE.MeshBasicMaterial({
    color: '#9db5af',
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const tails = new THREE.InstancedMesh(box, tailMat, count);
  tails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tails.frustumCulled = false;
  world.add(tails);
  const marks = new THREE.InstancedMesh(box, mat, 85);
  // Fixed catalog envelope prevents a sphere cached in a one-chapter subject
  // from rejecting later picks at the ends of a larger subject's ribbon.
  marks.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
  marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  marks.frustumCulled = false;
  world.add(marks);
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
    };
  });
  const clone = (p) => ({ p: p.p.clone(), q: p.q.clone(), s: p.s.clone(), c: p.c.clone() });
  let current = initial.map(clone),
    starts = current.map(clone),
    targets = current.map(clone),
    state = { stage: 'overview', discipline: 'mathematics', chapter: null, probe: 0.35 };
  let activeCatalog = courses(state.discipline),
    activeDiscipline = DISCIPLINES.find((d) => d.id === state.discipline);
  let trackSizes = activeDiscipline.tracks.map(
    (track) => activeCatalog.filter((c) => c.track === track).length,
  );
  let elapsed = 2,
    duration = 1.12,
    flowTime = 0,
    yaw = 0,
    pitch = 0,
    targetYaw = 0,
    targetPitch = 0,
    viewLesson = 0,
    hovered = null,
    width = 1,
    height = 1,
    raf = 0,
    last = 0,
    lost = false;
  let groups = [],
    questionMap = [],
    flight = false,
    curved = false,
    exchange = false,
    waypoints = [];
  const transform = new THREE.Object3D(),
    zero = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    point = new THREE.Vector3(),
    color = new THREE.Color(),
    lastPos = new THREE.Vector3();
  const groupPoint = (index, total, phase = 0) => {
    if (width <= 600 && width / height > 1.1) {
      const t = total <= 1 ? 0.5 : index / (total - 1);
      return new THREE.Vector3(
        (t - 0.5) * 4.5,
        -0.65 + 0.18 * Math.sin(t * Math.PI * 2 + phase),
        -0.5,
      );
    }
    const t = total <= 1 ? 0.5 : index / (total - 1);
    return new THREE.Vector3(
      -1.35 + 0.22 * Math.sin(t * Math.PI * 2 + phase),
      1.45 - t * 2.9,
      -0.35 + 0.15 * Math.cos(t * Math.PI * 2),
    );
  };
  function updateGroups() {
    groups = activeCatalog.map((c, i, a) => ({
      course: c,
      p: groupPoint(i, a.length, flowTime * 0.3),
    }));
  }
  function flowPose(i) {
    const t = i / (count - 1),
      d = activeDiscipline,
      tracks = Math.max(1, d.tracks.length),
      strand = i % tracks,
      local = Math.floor(i / tracks) / Math.max(1, Math.ceil(count / tracks) - 1);
    const before = trackSizes.slice(0, strand).reduce((a, b) => a + b, 0);
    const u =
      tracks > 1
        ? (before + local * Math.max(0.4, trackSizes[strand] - 0.25)) /
          Math.max(1, activeCatalog.length)
        : local;
    let x, y, z;
    if (width <= 600 && width / height > 1.1) {
      x = (u - 0.5) * 4.8;
      y = -0.6 + 0.22 * Math.sin(u * 8 + flowTime * 0.3 + strand);
      z = -0.8 + strand * 0.2;
    } else {
      x = -1.35 + 0.4 * Math.sin(u * 7 + flowTime * 0.3 + strand * 0.6);
      y = 1.7 - u * 3.4;
      z = -0.7 + strand * 0.22 + 0.18 * Math.cos(u * 9 + flowTime * 0.3);
    }
    return {
      p: new THREE.Vector3(x, y, z),
      q: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.45 + Math.sin(t * 9) * 0.3, 0.4 * Math.sin(t * 7 + flowTime * 0.3), -0.3),
      ),
      s: new THREE.Vector3(0.52, 0.012, 0.018),
      c: new THREE.Color(state.chapter ? '#303c39' : '#78857b'),
    };
  }
  function destinations() {
    const open = state.stage === 'observe' || state.stage === 'lesson',
      lesson = state.stage === 'lesson';
    if (!open) {
      const sector = DISCIPLINES.findIndex((d) => d.id === state.discipline),
        focus = state.stage === 'focus';
      return initial.map((p, i) => {
        const a = clone(p),
          active = Math.floor((i / count) * 6) === sector;
        a.p.multiplyScalar(focus && active ? 1.16 : 1);
        a.c.set(active ? '#e5e2d4' : '#8f9c94');
        return a;
      });
    }
    if (!state.chapter) {
      if (!activeCatalog.length)
        return initial.map((p) => {
          const a = clone(p);
          a.s.multiplyScalar(0.8);
          a.c.set('#4a5a54');
          return a;
        });
      return Array.from({ length: count }, (_, i) => flowPose(i));
    }
    const m = buildModelPoses(state.chapter, state.probe);
    const offset = lesson ? 0 : width <= 600 ? 0 : 1.05;
    return m.poses.map((p) => ({
      p: new THREE.Vector3(...p.position)
        .multiplyScalar(lesson ? 1 : 0.86)
        .add(new THREE.Vector3(offset, lesson ? 0 : 0.15, 0)),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation)),
      s: new THREE.Vector3(...p.scale).multiplyScalar(lesson ? 1 : 0.86),
      c: new THREE.Color(p.color ?? '#deddd0'),
    }));
  }
  function retarget(meteor = true, returnThroughRibbon = false) {
    starts = current.map(clone);
    targets = destinations();
    elapsed = 0;
    duration = meteor ? 1.12 : 0.22;
    curved = meteor;
    flight = meteor && !!state.chapter;
    exchange = returnThroughRibbon;
    waypoints = exchange ? Array.from({ length: count }, (_, i) => flowPose(i).p.toArray()) : [];
    request();
  }
  function pathAt(i, t) {
    const a = starts[i].p.toArray(),
      b = targets[i].p.toArray();
    if (!curved) return a.map((v, index) => v + (b[index] - v) * t);
    if (!exchange) return flightPosition(a, b, t, i);
    const k = 0.36;
    return t < k
      ? flightPosition(a, waypoints[i], t / k, i)
      : flightPosition(waypoints[i], b, (t - k) / (1 - k), i);
  }
  function progressAt(i) {
    return curved
      ? flightProgress(elapsed, i, count, duration)
      : flightProgress(elapsed, 0, 1, duration);
  }
  function put(mesh, index, p, q, s, c) {
    transform.position.copy(p);
    transform.quaternion.copy(q);
    transform.scale.copy(s);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    if (c) mesh.setColorAt(index, c);
  }
  function render(dt) {
    const moving = elapsed < duration + (curved ? 0.25 : 0);
    if (!motion()) {
      elapsed = duration + 0.25;
      current = targets.map(clone);
    } else if (moving) {
      elapsed += dt;
      for (let i = 0; i < count; i++) {
        const t = progressAt(i),
          a = starts[i],
          end = targets[i],
          p = current[i];
        p.p.fromArray(pathAt(i, t));
        p.q.copy(a.q).slerp(end.q, t);
        p.s.copy(a.s).lerp(end.s, t);
        p.c.copy(a.c).lerp(end.c, t);
      }
    } else if (state.stage === 'observe' && !state.chapter && activeCatalog.length && motion()) {
      flowTime += dt;
      current = Array.from({ length: count }, (_, i) => flowPose(i));
    }
    yaw = motion() ? approach(yaw, targetYaw, dt, 13) : targetYaw;
    pitch = motion() ? approach(pitch, targetPitch, dt, 13) : targetPitch;
    viewLesson = motion()
      ? approach(viewLesson, state.stage === 'lesson' ? 1 : 0, dt, 10)
      : state.stage === 'lesson'
        ? 1
        : 0;
    world.rotation.set(pitch, yaw, 0);
    for (let i = 0; i < count; i++) {
      const p = current[i];
      put(mesh, i, p.p, p.q, p.s, p.c);
      const t = progressAt(i),
        trail = flight && motion() ? Math.sin(t * Math.PI) : 0;
      if (trail > 0.03) {
        lastPos.fromArray(pathAt(i, Math.max(0, t - 0.045)));
        point.copy(p.p).add(lastPos).multiplyScalar(0.5);
        transform.position.copy(point);
        transform.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          p.p.clone().sub(lastPos).normalize(),
        );
        transform.scale.set(0.012, p.p.distanceTo(lastPos) * 1.4, 0.012);
        transform.updateMatrix();
        tails.setMatrixAt(i, transform.matrix);
      } else put(tails, i, zero, transform.quaternion, zero);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    tails.instanceMatrix.needsUpdate = true;
    updateGroups();
    questionMap = [];
    let qi = 0;
    const showMarks = state.stage === 'observe' && elapsed > 0.3;
    for (const g of groups) {
      const statuses = progress(g.course.id).results;
      for (let j = 0; j < statuses.length; j++) {
        if (qi >= 85) break;
        const p = g.p.clone().add(new THREE.Vector3((j - 2) * 0.11, 0, 0.12));
        color.set(
          statuses[j] === 'correct'
            ? '#ede9d8'
            : ['wrong', 'partial'].includes(statuses[j])
              ? '#b99b72'
              : '#66756d',
        );
        if (hovered === g.course.id || state.chapter === g.course.id)
          color.lerp(new THREE.Color('#c9dc8a'), 0.4);
        put(
          marks,
          qi,
          p,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.25, -0.18)),
          showMarks ? new THREE.Vector3(0.075, groups.length > 6 ? 0.22 : 0.38, 0.04) : zero,
          color,
        );
        questionMap[qi] = g.course.id;
        qi++;
      }
    }
    for (; qi < 85; qi++) put(marks, qi, zero, transform.quaternion, zero);
    marks.instanceMatrix.needsUpdate = true;
    if (marks.instanceColor) marks.instanceColor.needsUpdate = true;
    const aspect = width / height,
      fit = Math.max(1, 1.12 / aspect);
    camera.aspect = aspect;
    camera.position.set(
      0,
      0.35 + viewLesson * 1.8,
      (state.stage === 'focus' ? 5.8 : state.chapter ? 7.6 - viewLesson * 0.9 : 6.8) * fit,
    );
    camera.lookAt(0, -0.04, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    world.updateMatrixWorld(true);
    bay.setReveal(
      state.stage === 'overview' || state.stage === 'focus' ? 0 : 0.5,
      state.stage === 'lesson',
    );
    renderer.render(scene, camera);
    for (const [id, label] of labels) {
      const g = groups.find((g) => g.course.id === id);
      label.hidden = state.stage !== 'observe' || !g;
      if (g) {
        point.copy(g.p).applyMatrix4(world.matrixWorld).project(camera);
        const x = (point.x * 0.5 + 0.5) * width - 210,
          y = (-point.y * 0.5 + 0.5) * height - 24;
        label.style.transform = `translate(${Math.max(14, x)}px,${Math.max(86, Math.min(height - 88, y))}px)`;
      }
    }
    anchor.hidden = ['observe', 'lesson'].includes(state.stage);
    if (!anchor.hidden) {
      const sector = DISCIPLINES.findIndex((d) => d.id === state.discipline),
        i = Math.min(count - 1, Math.round(((sector + 0.5) / 6) * count));
      point.copy(current[i].p).applyMatrix4(world.matrixWorld).project(camera);
      anchor.style.transform = `translate(${Math.max(20, Math.min(width - 160, (point.x * 0.5 + 0.5) * width + 16))}px,${Math.max(70, Math.min(height - 70, (-point.y * 0.5 + 0.5) * height))}px)`;
    }
    canvas.dataset.stage = state.stage;
    canvas.dataset.assembly = state.chapter ?? 'ribbon';
    canvas.dataset.assembling = String(elapsed < duration + (curved ? 0.25 : 0));
    canvas.dataset.yaw = yaw.toFixed(3);
    return (
      elapsed < duration + (curved ? 0.25 : 0) ||
      yaw !== targetYaw ||
      pitch !== targetPitch ||
      viewLesson !== (state.stage === 'lesson' ? 1 : 0) ||
      (motion() && state.stage === 'observe' && !state.chapter && groups.length > 0)
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
    const w = Math.max(1, canvas.clientWidth),
      h = Math.max(1, canvas.clientHeight),
      changed = Math.abs(w - width) > 1 || Math.abs(h - height) > 1;
    width = w;
    height = h;
    renderer.setSize(width, height, false);
    if (changed) retarget(false);
    else request();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  const ray = new THREE.Raycaster(),
    cursor = new THREE.Vector2();
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
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
    const hit = ray.intersectObject(marks)[0];
    if (hit && questionMap[hit.instanceId]) select(questionMap[hit.instanceId]);
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
      const probe = state.probe !== next.probe;
      const chapterChanged = state.chapter !== next.chapter,
        swap = chapterChanged && !!state.chapter && !!next.chapter;
      state = next;
      activeCatalog = courses(state.discipline);
      activeDiscipline = DISCIPLINES.find((d) => d.id === state.discipline);
      trackSizes = activeDiscipline.tracks.map(
        (track) => activeCatalog.filter((c) => c.track === track).length,
      );
      if (changed) {
        if (state.stage === 'focus') {
          const sector = DISCIPLINES.findIndex((d) => d.id === state.discipline),
            p = initial[Math.round(((sector + 0.5) / 6) * (count - 1))].p;
          targetYaw = -Math.atan2(p.x, p.z);
        } else targetYaw = 0;
        targetPitch = 0;
        retarget(chapterChanged || state.stage !== 'lesson', swap);
      } else if (probe) retarget(false);
      else request();
    },
    refresh: request,
    setHover(id) {
      hovered = id;
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
