import { courseData } from './course-data.js?v=40';
import { initialState } from './state.js?v=40';
import * as THREE from '../vendor/three/three.module.min.js';
import { buildModelPoses } from './assembly-models.js?v=40';
import { createFlight, sampleFlight, soften } from './assembly-motion.js?v=40';
import {
  orbitPose,
  gateETA,
  createGateRoute,
  sampleGateRoute,
  createReleaseRoute,
  sampleReleaseRoute,
} from './orbital-motion.js?v=40';
import { surfaceFor } from './specimen-materials.js?v=40';

const X = new THREE.Vector3(1, 0, 0),
  zero = new THREE.Vector3();
const clone = (p) => ({
  p: p.p.clone(),
  q: p.q.clone(),
  s: p.s.clone(),
  c: p.c.clone(),
  finish: [...p.finish],
});
const active = (p) => p.s.x > 0 && p.s.y > 0 && p.s.z > 0;
const blend = (out, a, b, t) => {
  out.p.copy(a.p).lerp(b.p, t);
  out.q.copy(a.q).slerp(b.q, t);
  out.s.copy(a.s).lerp(b.s, t);
  out.c.copy(a.c).lerp(b.c, t);
  for (let k = 0; k < 3; k++) out.finish[k] = a.finish[k] + (b.finish[k] - a.finish[k]) * t;
};

// Physical particles and scientific component IDs are separate. A component
// keeps its particle during parameter changes; the course progress is DOM-only.
export function createParticleField(initial, { modelTransform, knotTransform, data = courseData }) {
  const count = initial.length,
    current = initial.map(clone),
    goals = initial.map(clone),
    planned = clone(initial[0]);
  const velocity = Array.from({ length: count }, () => new THREE.Vector3());
  const slots = new Int16Array(count).fill(-1),
    homes = Array(count).fill('knot'),
    routes = Array(count).fill(null);
  const samples = Array.from({ length: count }, () => ({
    p: [0, 0, 0],
    v: [0, 0, 0],
    progress: 1,
    needle: 0,
    attach: 1,
    phase: 'done',
  }));
  const phases = Array(count).fill('done');
  const orbit = { p: [0, 0, 0], v: [0, 0, 0] },
    direction = new THREE.Vector3(),
    goalVelocity = new THREE.Vector3(),
    qFlight = new THREE.Quaternion();
  const needle = new THREE.Vector3(),
    bright = new THREE.Color('#cad5cd');
  let state = initialState(),
    clock = 0,
    transition = 0,
    busy = false;
  let canonical = [],
    desired = [],
    parameterStart = [],
    parameterElapsed = 1,
    metadata = null;

  function load(id, probe, interpolate = false) {
    const model = buildModelPoses(id, probe, data.getCourse(id)?.observation);
    metadata = model.metadata;
    const next = model.poses.map((p) => ({
      p: new THREE.Vector3(...p.position),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation)),
      s: new THREE.Vector3(...p.scale),
      c: new THREE.Color(p.color),
      finish: surfaceFor(p.role),
      role: p.role,
    }));
    parameterStart = interpolate ? canonical.map(clone) : next.map(clone);
    desired = next;
    canonical = parameterStart.map(clone);
    parameterElapsed = interpolate ? 0 : 1;
  }
  function target(i, out, final = false) {
    if (homes[i] === 'model') {
      const source = (final ? desired : canonical)[slots[i]];
      modelTransform(source, out);
      return out;
    }
    if (homes[i] === 'ring') {
      orbitPose(i, clock, orbit);
      out.p.fromArray(orbit.p);
      direction.fromArray(orbit.v).normalize();
      out.q.setFromUnitVectors(X, direction);
      const highlight = i % 23 === 0;
      out.s.set(highlight ? 0.12 : 0.055 + (i % 7) * 0.004, 0.004, 0.004);
      out.c.set(highlight ? '#8fa9a5' : state.chapter ? '#34413f' : '#50625e');
      out.finish = surfaceFor();
      return out;
    }
    knotTransform(initial[i], i, out, state);
    return out;
  }
  function schedule(i, kind, path, delay = 0) {
    routes[i] = {
      kind,
      path,
      start: clock + delay,
      from: clone(current[i]),
      end: planned.p.clone(),
    };
  }
  function onRing(i) {
    return (homes[i] === 'ring' && !routes[i]) || phases[i] === 'orbit';
  }
  function plan(next) {
    const previous = state,
      sameModel = next.chapter && next.chapter === previous.chapter;
    const changed =
      previous.chapter !== next.chapter ||
      previous.stage !== next.stage ||
      previous.discipline !== next.discipline;
    const probe = previous.probe !== next.probe;
    state = next;
    if (!changed && !probe) return;
    if (sameModel && !probe) return; // The surrounding reader/viewport is not a new particle command.
    transition++;
    const wasHomes = [...homes],
      wasSlots = [...slots],
      wasRing = current.map((_, i) => onRing(i));
    if (next.chapter) {
      load(next.chapter, next.probe, !!sameModel);
      const kept = new Set();
      slots.fill(-1);
      if (sameModel)
        for (let i = 0; i < count; i++)
          if (wasHomes[i] === 'model' && wasSlots[i] >= 0 && active(desired[wasSlots[i]])) {
            slots[i] = wasSlots[i];
            kept.add(slots[i]);
          }
      const available = current
        .map((p, i) => i)
        .filter((i) => slots[i] < 0)
        .map((i) => ({
          i,
          eta: gateETA(current[i].p.toArray(), velocity[i].toArray(), i, { fromRing: wasRing[i] }),
        }))
        .sort((a, b) => a.eta - b.eta || a.i - b.i);
      const components = desired
        .map((p, index) => ({ p, index }))
        .filter(({ p, index }) => active(p) && !kept.has(index));
      const priority = (p) => (/hardware-|axis|tick/.test(p.role) ? 0 : 1);
      components.sort((a, b) => priority(a.p) - priority(b.p) || a.index - b.index);
      components.forEach((p, k) => (slots[available[k].i] = p.index));
    } else slots.fill(-1);
    for (let i = 0; i < count; i++) {
      homes[i] =
        next.chapter && slots[i] >= 0
          ? 'model'
          : ['observe', 'lesson'].includes(next.stage) && next.hasCourses
            ? 'ring'
            : 'knot';
      if (homes[i] === 'model' && sameModel && wasSlots[i] === slots[i] && wasHomes[i] === 'model')
        continue;
      // Keep the previous rendered target for retained components. Replacing it
      // with the final parameter target would inject a false one-frame velocity.
      target(i, planned, true);
      target(i, goals[i]);
      const start = current[i].p.toArray(),
        v = velocity[i].toArray();
      if (homes[i] === 'model') {
        schedule(
          i,
          'gate',
          createGateRoute({
            start,
            velocity: v,
            end: planned.p.toArray(),
            index: i,
            time: clock,
            fromRing: wasRing[i],
          }),
        );
      } else if (homes[i] === 'ring') {
        if (wasHomes[i] === 'ring' && (!routes[i] || routes[i].kind === 'release')) continue;
        const unfolding = wasHomes[i] === 'knot';
        const delay = unfolding && velocity[i].length() < 0.001 ? (i / count) * 0.34 : 0;
        schedule(
          i,
          'release',
          createReleaseRoute({
            start,
            velocity: v,
            index: i,
            time: clock + delay,
            duration: unfolding ? 1.18 : 0.48,
          }),
          delay,
        );
      } else {
        schedule(
          i,
          'knot',
          createFlight({
            start,
            velocity: v,
            end: planned.p.toArray(),
            index: i,
            count,
            duration: 1.18,
            unfold: true,
          }),
        );
      }
    }
    busy = true;
  }
  function step(dt, motion) {
    if (motion && (busy || (state.stage === 'observe' && state.hasCourses))) clock += dt;
    if (!motion) {
      parameterElapsed = 1;
      canonical = desired.map(clone);
      routes.fill(null);
    } else if (parameterElapsed < 1) {
      parameterElapsed = Math.min(1, parameterElapsed + dt / 0.28);
      for (let k = 0; k < canonical.length; k++)
        blend(canonical[k], parameterStart[k], desired[k], soften(parameterElapsed));
    }
    let travelling = false;
    for (let i = 0; i < count; i++) {
      goalVelocity.copy(goals[i].p);
      const p = current[i],
        goal = target(i, goals[i]),
        route = routes[i],
        sample = samples[i];
      goalVelocity.sub(goal.p).multiplyScalar(-1 / Math.max(dt, 0.001));
      if (route && motion) {
        const elapsed = clock - route.start;
        if (elapsed < 0) {
          travelling = true;
          continue;
        }
        if (route.kind === 'gate') sampleGateRoute(route.path, elapsed, sample);
        else if (route.kind === 'release') sampleReleaseRoute(route.path, elapsed, sample);
        else {
          sampleFlight(route.path, elapsed, sample);
          sample.attach = sample.progress;
          const u = Math.max(0, Math.min(1, (elapsed - route.path.delay) / route.path.duration));
          sample.attachVelocity = (30 * u * u * (1 - u) ** 2) / route.path.duration;
          sample.needle = 0;
          sample.done = elapsed >= route.path.duration + route.path.delay;
          sample.phase = sample.done ? 'done' : 'unfold';
        }
        const amount = sample.progress;
        blend(p, route.from, goal, amount);
        p.p.fromArray(sample.p);
        velocity[i].fromArray(sample.v);
        if (route.kind !== 'release') {
          direction.copy(goal.p).sub(route.end);
          p.p.addScaledVector(direction, sample.attach);
          velocity[i]
            .addScaledVector(direction, sample.attachVelocity)
            .addScaledVector(goalVelocity, sample.attach);
        }
        const narrowing = route.kind === 'knot' ? 0 : sample.needle;
        if (narrowing > 0) {
          needle.set(0.14 + Math.min(0.06, Math.hypot(...sample.v) * 0.006), 0.005, 0.005);
          p.s.lerp(needle, narrowing);
          direction.fromArray(sample.v);
          if (direction.lengthSq() > 1e-10) {
            qFlight.setFromUnitVectors(X, direction.normalize());
            p.q.slerp(qFlight, narrowing * 0.98);
          }
          p.c.lerp(bright, narrowing * 0.14);
        }
        phases[i] = sample.phase;
        if (sample.done) {
          routes[i] = null;
          blend(p, p, goal, 1);
        } else travelling = true;
      } else {
        blend(p, p, goal, 1);
        phases[i] = homes[i] === 'ring' ? 'orbit' : 'done';
        if (homes[i] === 'ring') {
          orbitPose(i, clock, orbit);
          velocity[i].fromArray(orbit.v);
        } else velocity[i].copy(goalVelocity);
      }
      if (!motion) velocity[i].copy(zero);
    }
    busy = travelling || parameterElapsed < 1;
    return motion && (busy || (state.stage === 'observe' && state.hasCourses));
  }
  return {
    current,
    velocity,
    homes,
    phases,
    slots,
    update: plan,
    step,
    get busy() {
      return busy;
    },
    get transition() {
      return transition;
    },
    get contactY() {
      return metadata?.contactY ?? -1.4;
    },
    // Narrow read-only diagnostic used by integration checks and the canvas state.
    get modelCount() {
      return homes.filter((h) => h === 'model').length;
    },
    get clock() {
      return clock;
    },
  };
}
