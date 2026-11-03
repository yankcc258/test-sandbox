import assert from 'node:assert/strict';
import {
  ORBIT,
  orbitPose,
  orbitCoords,
  gateETA,
  createGateRoute,
  sampleGateRoute,
  createReleaseRoute,
  sampleReleaseRoute,
} from '../laboratory/orbital-motion.js';

const TAU = Math.PI * 2;
const near = (a, b, tolerance = 1e-7, message = '') => {
  assert.equal(a.length, b.length);
  a.forEach((value, i) =>
    assert.ok(
      Math.abs(value - b[i]) <= tolerance,
      `${message}: component ${i}, ${value} versus ${b[i]}`,
    ),
  );
};
const finite = (sample) => {
  assert.ok([...sample.p, ...sample.v].every(Number.isFinite));
  if ('progress' in sample) assert.ok(sample.progress >= 0 && sample.progress <= 1);
  if ('needle' in sample) assert.ok(sample.needle >= 0 && sample.needle <= 1);
  if ('attach' in sample) assert.ok(sample.attach >= 0 && sample.attach <= 1);
};
const difference = (before, after, dt) => before.map((x, i) => (after[i] - x) / dt);
const eps = 1e-6;
function checkVelocity(sample, time, tolerance = 2e-5) {
  const a = sample(time - eps),
    b = sample(time + eps),
    middle = sample(time);
  near(middle.v, difference(a.p, b.p, 2 * eps), tolerance, 'analytic velocity');
}
function checkJoin(sample, time) {
  const a = sample(time - eps),
    b = sample(time + eps),
    middle = sample(time);
  near(a.p, b.p, 1e-4, 'continuous join position');
  near(a.v, b.v, 0.001, 'continuous join velocity');
  near(middle.v, difference(a.p, b.p, 2 * eps), 0.001, 'join displacement derivative');
}

// Orbit velocity is in scene units/second, including radius, not a unit tangent.
for (let index = 0; index < 288; index++) {
  for (const time of [0, 3.25, 300]) {
    const p = orbitPose(index, time);
    finite(p);
    const coords = orbitCoords(p.p);
    assert.ok(Math.abs(coords.radius - p.radius) < 1e-10);
    assert.ok(Math.abs(p.radius - ORBIT.radius) < 0.05);
    assert.ok(Math.abs(Math.hypot(...p.v) / p.radius - [0.07, 0.09, 0.11][index % 3]) < 1e-12);
    checkVelocity((t) => orbitPose(index, t), time);
  }
}

// Near-gate arcs, including a stopped particle, must remain finite and must
// never pass the shared entrance before changing to its arrival segment.
for (const distance of [0, 1e-9, 1e-5, 0.01, 0.7, 3, TAU - 1e-5]) {
  for (const omega of [0, 0.09, 4]) {
    const angle = ORBIT.gate - distance,
      radius = ORBIT.radius;
    const start = [
      Math.cos(angle) * radius,
      ORBIT.center[1] + Math.sin(angle) * radius,
      ORBIT.center[2],
    ];
    const velocity = [-Math.sin(angle) * radius * omega, Math.cos(angle) * radius * omega, 0];
    const route = createGateRoute({
      start,
      velocity,
      end: [0.5, -0.8, 0.2],
      index: 1,
      time: 4,
      fromRing: true,
    });
    assert.equal(route.joinDuration, 0);
    assert.equal(gateETA(start, velocity, 1, { fromRing: true }), route.gateTime);
    near(sampleGateRoute(route, 0).p, start);
    near(sampleGateRoute(route, 0).v, velocity);
    let previousAngle = route.orbit.angle;
    for (let frame = 0; frame < 100; frame++) {
      const sample = sampleGateRoute(route, (route.gateTime * frame) / 100);
      finite(sample);
      if (sample.phase === 'orbit') {
        assert.ok(sample.angle >= previousAngle - 1e-10, 'positive direction around the ring');
        assert.ok(
          sample.angle <= route.orbit.angle + route.orbit.distance + 1e-10,
          'no gate overshoot',
        );
        previousAngle = sample.angle;
        assert.equal(sample.needle, 1);
        assert.equal(sample.attach, 0);
      }
    }
    if (route.gateTime > 1e-4) {
      checkJoin((t) => sampleGateRoute(route, t), route.gateTime);
      checkVelocity((t) => sampleGateRoute(route, t), route.gateTime * 0.4);
    }
    const earlyArrival = sampleGateRoute(route, route.gateTime + route.arrivalDuration * 0.79);
    assert.equal(earlyArrival.needle, 1, 'large components stay needles until the final fifth');
    const done = sampleGateRoute(route, route.duration);
    near(done.p, route.end);
    near(done.v, [0, 0, 0]);
    assert.deepEqual(
      [done.progress, done.attach, done.needle, done.phase, done.done],
      [1, 1, 0, 'done', true],
    );
  }
}

// A model-side release into the ring and its gate segment share an actual
// velocity, with no zero-speed pause or reversal at either boundary.
const route = createGateRoute({
  start: [0.2, -0.6, 0.4],
  velocity: [0.8, -0.3, 0.2],
  end: [-0.9, 0.8, 0],
  index: 287,
  time: 9,
});
assert.ok(route.joinDuration >= 0.35 && route.joinDuration <= 0.48);
near(sampleGateRoute(route, 0).p, route.start);
near(sampleGateRoute(route, 0).v, route.velocity);
assert.equal(sampleGateRoute(route, 0).needle, 0);
checkJoin((t) => sampleGateRoute(route, t), route.joinDuration);
checkJoin((t) => sampleGateRoute(route, t), route.gateTime);
for (const time of [route.joinDuration / 2, route.gateTime + 0.2])
  checkVelocity((t) => sampleGateRoute(route, t), time);
for (const u of [0.01, 0.2, 0.5, 0.9]) {
  const time = route.gateTime + u * route.arrivalDuration;
  const before = sampleGateRoute(route, time - eps),
    after = sampleGateRoute(route, time + eps);
  assert.ok(
    Math.abs(
      sampleGateRoute(route, time).attachVelocity - (after.attach - before.attach) / (2 * eps),
    ) < 1e-7,
  );
}

// Reusing scratch arrays is supported. Command snapshots must not alias the
// source arrays, which the renderer overwrites on its next frame.
const destination = [1, 0, 0],
  origin = [0, 0, 0],
  speed = [0.4, 0.2, 0.1];
const snapshot = createGateRoute({ start: origin, velocity: speed, end: destination, index: 7 });
origin.fill(100);
speed.fill(100);
destination.fill(100);
near(snapshot.start, [0, 0, 0]);
near(snapshot.velocity, [0.4, 0.2, 0.1]);
near(snapshot.end, [1, 0, 0]);
const scratch = { p: [], v: [] };
assert.equal(sampleGateRoute(snapshot, 0.2, scratch), scratch);
finite(scratch);

// Release uses the future orbit endpoint and continues that exact absolute
// clock after completion; neither its arrival position nor velocity can jump.
for (const index of [0, 1, 2, 70, 287]) {
  for (const duration of [0.48, 1.1, 1.18]) {
    const release = createReleaseRoute({
      start: [0.4, 0.8, 0],
      velocity: [-0.2, 0.5, 0.1],
      index,
      time: 17,
      duration,
    });
    near(sampleReleaseRoute(release, 0).p, release.start);
    near(sampleReleaseRoute(release, 0).v, release.velocity);
    checkJoin((t) => sampleReleaseRoute(release, t), duration);
    checkVelocity((t) => sampleReleaseRoute(release, t), duration * 0.4);
    for (const time of [duration, duration + 0.2, duration + 15]) {
      const result = sampleReleaseRoute(release, time),
        expected = orbitPose(index, 17 + time);
      near(result.p, expected.p);
      near(result.v, expected.v);
      assert.deepEqual(
        [result.progress, result.needle, result.phase, result.done],
        [1, 1, 'orbit', true],
      );
    }
  }
}

// Fast new selections may interrupt any phase. Each replacement begins at the
// visible position and velocity, regardless of the previous intended home.
let moving = route;
for (let i = 0; i < 40; i++) {
  const visible = sampleGateRoute(moving, 0.12 + (i % 5) * 0.09);
  finite(visible);
  moving = createGateRoute({
    start: visible.p,
    velocity: visible.v,
    end: [Math.sin(i) * 1.1, Math.cos(i) * 0.8, 0],
    index: i,
    time: i,
    fromRing: visible.phase === 'orbit',
  });
  near(sampleGateRoute(moving, 0).p, visible.p);
  near(sampleGateRoute(moving, 0).v, visible.v);
}

// All frame rates sample one timeline. The module does not advance a second clock.
for (const hz of [30, 60, 120]) {
  let elapsed = 0;
  for (let frame = 0; frame < hz / 2; frame++) elapsed += 1 / hz;
  near(sampleGateRoute(route, elapsed).p, sampleGateRoute(route, 0.5).p);
  near(sampleGateRoute(route, elapsed).v, sampleGateRoute(route, 0.5).v);
}

console.log(
  'PASS: analytic orbit speed, matching ETA, forward gate arcs without overshoot, C1 joins/arrival, needle unfolding, future release continuity, scratch reuse and repeated interruption.',
);
