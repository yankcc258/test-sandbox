import assert from 'node:assert/strict';
import { createFlight, sampleFlight, sampleLeg } from '../laboratory/assembly-motion.js';
import { initialState, reduceState } from '../laboratory/state.js';
import { COURSES, getCourse } from '../laboratory/course-data.js';
const a = [-1.3, 0.5, -0.4],
  b = [1.1, 0.7, 0];
const near = (actual, expected, tolerance = 1e-8, message = '') => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) =>
    assert.ok(
      Math.abs(value - expected[i]) < tolerance,
      `${message} component ${i}: ${value} versus ${expected[i]}`,
    ),
  );
};
const output = () => ({ p: [0, 0, 0], v: [0, 0, 0], progress: 0 });
const zero = [0, 0, 0];
const initialVelocity = [0.7, -0.25, 0.12];
const endVelocity = [-0.15, 0.3, 0.04];
const epsilon = 1e-5;

// Check the analytic velocity against the rendered path, rather than only
// accepting two endpoints with a discontinuous or incorrectly scaled derivative.
for (const duration of [0.3, 1.18, 1.42]) {
  const evaluate = (time) =>
    sampleLeg(a, b, initialVelocity, endVelocity, duration, time, [0.08, 0.23, 0.12], output());
  near(evaluate(0).p, a);
  near(evaluate(0).v, initialVelocity);
  near(evaluate(duration).p, b);
  near(evaluate(duration).v, endVelocity);
  for (const fraction of [0.1, 0.4, 0.75]) {
    const time = fraction * duration;
    const before = evaluate(time - epsilon),
      after = evaluate(time + epsilon);
    near(
      evaluate(time).v,
      before.p.map((v, i) => (after.p[i] - v) / (2 * epsilon)),
      1e-6,
      'analytic velocity agrees with displacement',
    );
  }
}

// A paused/still source may stagger. An interrupted moving source must resume
// immediately with exactly its visible position and velocity.
for (const i of [0, 144, 287]) {
  const path = createFlight({ start: a, end: b, index: i, count: 288 });
  near(sampleFlight(path, 0).p, a);
  near(sampleFlight(path, path.duration + path.delay).p, b);
  near(sampleFlight(path, path.duration + path.delay).v, zero);
  if (path.delay) {
    near(sampleFlight(path, path.delay * 0.5).p, a);
    near(sampleFlight(path, path.delay * 0.5).v, zero);
  }
  const sample = sampleFlight(path, path.delay + path.duration * 0.43);
  const interrupted = createFlight({
    start: sample.p,
    end: [-0.8, -0.6, 0.2],
    velocity: sample.v,
    index: i,
    count: 288,
  });
  assert.equal(interrupted.delay, 0, 'moving pieces do not pause for another stagger');
  near(sampleFlight(interrupted, 0).p, sample.p);
  near(sampleFlight(interrupted, 0).v, sample.v);
  const end = sampleFlight(interrupted, interrupted.duration + 10);
  near(end.p, interrupted.end);
  near(end.v, zero);
  assert.equal(end.progress, 1, 'the scheduler can terminate at the exact endpoint');
}

// Both legs must pass the ribbon waypoint with the same velocity and zero
// acceleration. This catches the old down-then-up cusp at the join.
const via = [-1.4, 0.25, -0.5];
const exchange = createFlight({
  start: a,
  end: b,
  velocity: initialVelocity,
  via,
  duration: 1.42,
  index: 287,
  count: 288,
});
const join = exchange.duration * 0.4;
near(sampleFlight(exchange, join).p, via);
near(sampleFlight(exchange, join).v, exchange.through);
const beforeJoin = sampleFlight(exchange, join - epsilon);
const afterJoin = sampleFlight(exchange, join + epsilon);
near(beforeJoin.v, afterJoin.v, 1e-6, 'shared waypoint velocity');
near(
  afterJoin.v.map((v, i) => (v - beforeJoin.v[i]) / (2 * epsilon)),
  zero,
  0.002,
  'no acceleration impulse at the waypoint',
);

// The result depends on elapsed seconds, not the number of render callbacks.
for (const hz of [30, 60, 120]) {
  const scratch = output();
  let elapsed = 0;
  for (let frame = 0; frame < hz / 2; frame++) {
    elapsed += 1 / hz;
    assert.equal(sampleFlight(exchange, elapsed, scratch), scratch);
  }
  near(scratch.p, sampleFlight(exchange, 0.5).p);
  near(scratch.v, sampleFlight(exchange, 0.5).v);
}

// Rapid alternating selections retain momentum without accumulating NaNs or
// escaping the scene's fixed picking envelope for these representative poses.
let live = createFlight({ start: a, end: b });
for (let selection = 0; selection < 32; selection++) {
  const visible = sampleFlight(live, 0.11);
  assert.ok([...visible.p, ...visible.v].every(Number.isFinite));
  assert.ok(Math.hypot(...visible.p) < 8);
  live = createFlight({
    start: visible.p,
    end: selection % 2 ? b : a,
    velocity: visible.v,
    index: 287,
    via: selection % 3 ? via : null,
  });
  assert.equal(live.delay, 0);
  near(sampleFlight(live, 0).p, visible.p);
  near(sampleFlight(live, 0).v, visible.v);
}

// Non-flight parameter changes keep stationary axes and feet stationary.
const localUpdate = createFlight({ start: a, end: a, curved: false, index: 287 });
for (const time of [0, 0.1, 0.4, 0.8, 2]) {
  near(sampleFlight(localUpdate, time).p, a);
  near(sampleFlight(localUpdate, time).v, zero);
}
let s = initialState();
s = reduceState(s, { type: 'observe' });
s = reduceState(s, { type: 'select', chapter: getCourse('math-integral'), probe: 8 });
assert.equal(s.stage, 'observe');
assert.equal(s.chapter, 'math-integral');
s = reduceState(s, { type: 'chapter', chapter: getCourse('math-integral') });
assert.equal(s.stage, 'lesson', 'study is available independent of animation');
s = reduceState(s, { type: 'back' });
assert.equal(s.chapter, 'math-integral', 'return retains selected chapter');
for (const chapter of COURSES) {
  s = reduceState(s, { type: 'select', chapter });
  assert.equal(s.chapter, chapter.id);
  assert.equal(s.discipline, chapter.discipline);
}
s = reduceState(s, { type: 'discipline', id: 'computing' });
assert.equal(s.chapter, null);
assert.equal(s.discipline, 'computing');
console.log(
  'PASS: analytic velocity, continuous waypoint position/velocity/acceleration, interruption without re-delay, frame-rate independence, repeated selections, fixed parameter-update geometry and course state.',
);
