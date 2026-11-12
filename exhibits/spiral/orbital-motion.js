import { sampleLeg, soften } from './assembly-motion.js?v=1';

// All positions and velocities are in scene coordinates, independent of model rotation.
// 露娜（2026-11-04）：Yank 希望环更大、模型落在环的正中心。环从 z=-2.4 挪到 -0.6（离模型近，
// 镜头抬高时环心和模型中心不再因透视错开），半径 2.11 → 2.35，最大的模型四周也留得出空。
export const ORBIT = Object.freeze({
  radius: 2.35,
  center: Object.freeze([0, -0.03, -0.6]),
  gate: Math.PI * 0.22,
});
const TAU = Math.PI * 2;
const ZERO = [0, 0, 0];
const ARRIVAL_SECONDS = 0.65;
const lanes = new Map();
const clamp = (x) => Math.max(0, Math.min(1, x));
const fraction = (x) => x - Math.floor(x);
const hash = (i) => fraction(Math.sin(i * 127.1 + 311.7) * 43758.5453);
const wrap = (angle) => ((angle % TAU) + TAU) % TAU;
const copyVector = (value, name) => {
  if (!value || value.length < 3 || ![value[0], value[1], value[2]].every(Number.isFinite))
    throw new TypeError(`${name} must contain three finite coordinates`);
  return [value[0], value[1], value[2]];
};
function scratch(out = {}) {
  if (!out.p || out.p.length < 3) out.p = [0, 0, 0];
  if (!out.v || out.v.length < 3) out.v = [0, 0, 0];
  return out;
}
function laneFor(index) {
  if (lanes.has(index)) return lanes.get(index);
  const lane = ((index % 3) + 3) % 3;
  const jitter = hash(index);
  const result = {
    radius: ORBIT.radius + (lane - 1) * 0.035 + (jitter - 0.5) * 0.02,
    z: (lane - 1) * 0.025 + (jitter - 0.5) * 0.012,
    omega: [0.07, 0.09, 0.11][lane],
    angle: TAU * fraction(index * 0.6180339887 + lane * 0.11),
  };
  lanes.set(index, result);
  return result;
}
function circle(angle, radius, z, omega, out) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  out.p[0] = ORBIT.center[0] + radius * c;
  out.p[1] = ORBIT.center[1] + radius * s;
  out.p[2] = ORBIT.center[2] + z;
  out.v[0] = -radius * s * omega;
  out.v[1] = radius * c * omega;
  out.v[2] = 0;
  out.angle = angle;
  out.radius = radius;
  out.angularVelocity = omega;
  return out;
}

export function orbitPose(index, time, out = {}) {
  const lane = laneFor(index);
  return circle(lane.angle + lane.omega * time, lane.radius, lane.z, lane.omega, scratch(out));
}
export function orbitCoords(p) {
  const x = p[0] - ORBIT.center[0],
    y = p[1] - ORBIT.center[1];
  return { angle: Math.atan2(y, x), radius: Math.hypot(x, y), z: p[2] - ORBIT.center[2] };
}

// Positive angular speed, analytically integrated. A short arc shortens its
// duration instead of overshooting the gate to satisfy a minimum travel time.
function orbitLeg(angle, radius, z, initialOmega) {
  const distance = wrap(ORBIT.gate - angle);
  const omega0 = Math.max(0, initialOmega);
  if (distance < 1e-12)
    return {
      angle,
      radius,
      z,
      distance: 0,
      duration: 0,
      omega0,
      omega1: omega0,
      boost: 0,
    };
  const omega1 = Math.min(4.4, Math.sqrt(omega0 * omega0 + 10 * distance));
  const duration = Math.min(0.24 + distance * 0.16, (2 * distance) / (omega0 + omega1));
  const boost = Math.max(0, (2 * distance) / duration - omega0 - omega1);
  return { angle, radius, z, distance, duration, omega0, omega1, boost };
}
function sampleOrbitLeg(leg, elapsed, out) {
  if (leg.duration === 0 || elapsed >= leg.duration)
    return circle(leg.angle + leg.distance, leg.radius, leg.z, leg.omega1, out);
  const u = clamp(elapsed / leg.duration);
  const smooth = u * u * (3 - 2 * u);
  const angle =
    leg.angle +
    leg.duration *
      (leg.omega0 * u +
        (leg.omega1 - leg.omega0) * (u ** 3 - u ** 4 / 2) +
        leg.boost * (u / 2 - Math.sin(TAU * u) / (2 * TAU)));
  const omega =
    leg.omega0 + (leg.omega1 - leg.omega0) * smooth + leg.boost * Math.sin(Math.PI * u) ** 2;
  return circle(angle, leg.radius, leg.z, omega, out);
}
function approachPlan(start, velocity, index, fromRing) {
  const lane = laneFor(index),
    coords = orbitCoords(start);
  const c = Math.cos(coords.angle),
    s = Math.sin(coords.angle);
  const tangentSpeed = -s * velocity[0] + c * velocity[1];
  const radialSpeed = c * velocity[0] + s * velocity[1];
  // A stale ownership flag must not discard the radial/vertical velocity of an
  // interrupted arrival. Such a particle first rejoins the ring with Hermite.
  const onRing =
    fromRing &&
    coords.radius > 1e-6 &&
    tangentSpeed >= 0 &&
    Math.abs(radialSpeed) < 1e-8 &&
    Math.abs(velocity[2]) < 1e-8;
  const joinDuration = onRing ? 0 : 0.35 + hash(index + 7) * 0.13;
  const angle = onRing
    ? coords.angle
    : (coords.radius > 1e-6 ? coords.angle : lane.angle) + lane.omega * joinDuration;
  const orbit = orbitLeg(
    angle,
    onRing ? coords.radius : lane.radius,
    onRing ? coords.z : lane.z,
    onRing ? tangentSpeed / coords.radius : lane.omega,
  );
  const joinEnd = circle(angle, orbit.radius, orbit.z, orbit.omega0, scratch());
  const gate = circle(angle + orbit.distance, orbit.radius, orbit.z, orbit.omega1, scratch());
  return { joinDuration, orbit, joinEnd, gate, gateTime: joinDuration + orbit.duration };
}

export function gateETA(start, velocity, index, { fromRing = false } = {}) {
  return approachPlan(start, velocity, index, fromRing).gateTime;
}
export function createGateRoute({
  start,
  velocity = ZERO,
  end,
  index,
  time = 0,
  fromRing = false,
}) {
  start = copyVector(start, 'start');
  velocity = copyVector(velocity, 'velocity');
  end = copyVector(end, 'end');
  const plan = approachPlan(start, velocity, index, fromRing);
  return {
    ...plan,
    start,
    velocity,
    end,
    index,
    time,
    arrivalDuration: ARRIVAL_SECONDS,
    duration: plan.gateTime + ARRIVAL_SECONDS,
  };
}
export function sampleGateRoute(route, elapsed, out = {}) {
  out = scratch(out);
  const t = Math.max(0, elapsed);
  out.progress = soften(t / route.duration);
  out.done = t >= route.duration;
  out.attach = 0;
  out.attachVelocity = 0;
  out.needle = 1;
  if (out.done) {
    for (let k = 0; k < 3; k++) {
      out.p[k] = route.end[k];
      out.v[k] = 0;
    }
    out.progress = 1;
    out.attach = 1;
    out.needle = 0;
    out.phase = 'done';
    return out;
  }
  if (t < route.joinDuration) {
    sampleLeg(
      route.start,
      route.joinEnd.p,
      route.velocity,
      route.joinEnd.v,
      route.joinDuration,
      t,
      ZERO,
      out,
    );
    out.needle = soften(t / route.joinDuration);
    out.phase = 'join';
  } else if (t < route.gateTime) {
    sampleOrbitLeg(route.orbit, t - route.joinDuration, out);
    out.phase = 'orbit';
  } else {
    const arrivalTime = t - route.gateTime,
      u = clamp(arrivalTime / route.arrivalDuration);
    sampleLeg(
      route.gate.p,
      route.end,
      route.gate.v,
      ZERO,
      route.arrivalDuration,
      arrivalTime,
      ZERO,
      out,
    );
    out.attach = soften(u);
    out.attachVelocity = (30 * u * u * (1 - u) ** 2) / route.arrivalDuration;
    out.needle = 1 - soften((u - 0.8) / 0.2);
    out.phase = 'arrival';
  }
  // sampleLeg exposes its local progress; callers need one whole-route clock.
  out.progress = soften(t / route.duration);
  return out;
}

export function createReleaseRoute({ start, velocity = ZERO, index, time, duration = 1.1 }) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0)
    throw new RangeError('Release time must be finite and duration must be positive');
  const destination = orbitPose(index, time + duration);
  return {
    start: copyVector(start, 'start'),
    velocity: copyVector(velocity, 'velocity'),
    end: [...destination.p],
    endVelocity: [...destination.v],
    index,
    time,
    duration,
  };
}
export function sampleReleaseRoute(route, elapsed, out = {}) {
  out = scratch(out);
  const t = Math.max(0, elapsed);
  if (t >= route.duration) orbitPose(route.index, route.time + t, out);
  else
    sampleLeg(
      route.start,
      route.end,
      route.velocity,
      route.endVelocity,
      route.duration,
      t,
      ZERO,
      out,
    );
  out.progress = soften(t / route.duration);
  out.attach = 0;
  out.attachVelocity = 0;
  out.needle = out.progress;
  out.done = t >= route.duration;
  out.phase = out.done ? 'orbit' : 'join';
  return out;
}
