import assert from 'node:assert/strict';
import {
  initialState,
  reduceState,
  sceneTargets,
  approach,
  tokyoMood,
} from '../laboratory/state.js';
import { COURSES } from '../laboratory/course-data.js';
import { advanceRelease, releasePhase } from '../laboratory/motion.js';

let state = initialState();
state = reduceState(state, { type: 'activate' });
assert.equal(state.stage, 'focus');
state = reduceState(state, { type: 'activate' });
assert.equal(state.stage, 'observe');
for (let i = 0; i < 10; i++) state = reduceState(state, { type: 'activate' });
assert.equal(state.stage, 'observe', 'repeated clicks must not queue further entry stages');
state = reduceState(state, { type: 'probe', value: -0.63 });
for (const chapter of COURSES) {
  state = reduceState(state, { type: 'chapter', chapter });
  assert.equal(state.stage, 'lesson');
  assert.equal(state.mode, chapter.mode);
  assert.ok(chapter.sections.length >= 8);
  state = reduceState(state, { type: 'back' });
  assert.equal(state.stage, 'observe');
  assert.equal(state.probe, -0.63, 'return from reading keeps the observation position');
}
state = reduceState(state, { type: 'back' });
assert.equal(state.stage, 'overview');
assert.equal(
  reduceState(state, { type: 'observe' }).stage,
  'observe',
  'chapter shortcut skips focus',
);
assert.equal(
  reduceState(state, { type: 'probe', value: 12 }).probe,
  12,
  'model metadata defines the per-chapter parameter range',
);
assert.equal(reduceState(state, { type: 'probe', value: NaN }), state);

// Interrupt a partially opened scene and reverse to the same closed endpoint.
// Every step remains finite, bounded and moves monotonically toward its target.
let spread = 0;
for (let i = 0; i < 16; i++) spread = approach(spread, sceneTargets('observe').spread, 1 / 60);
assert.ok(spread > 0 && spread < 1);
let previous = spread;
for (let i = 0; i < 180; i++) {
  spread = approach(spread, sceneTargets('overview').spread, 1 / 60);
  assert.ok(spread >= 0 && spread <= previous);
  previous = spread;
}
assert.equal(spread, 0);
for (const stage of ['observe', 'lesson']) assert.equal(sceneTargets(stage).spread, 1);
assert.equal(tokyoMood(new Date('2026-11-03T20:59:00Z')), 'night');
assert.equal(tokyoMood(new Date('2026-11-03T21:00:00Z')), 'day');
assert.equal(tokyoMood(new Date('2026-11-03T07:00:00Z')), 'dusk');
assert.equal(tokyoMood(new Date('2026-11-03T10:00:00Z')), 'night');

// The release accelerates from rest, remains frame-rate independent, and can
// reverse mid-flight without teleporting or adding a second queued animation.
const samples = [];
for (const fps of [30, 60, 120]) {
  let x = 0,
    velocity = 0;
  for (let i = 0; i < fps / 2; i++) [x, velocity] = advanceRelease(x, velocity, 1, 1 / fps);
  samples.push(x);
  assert.ok(x > 0.8 && x < 0.95, 'the object should be accessible during the first half-second');
  const before = x;
  [x, velocity] = advanceRelease(x, velocity, 0, 1 / fps);
  assert.ok(Math.abs(x - before) < 0.05, 'reversal must not jump');
  for (let i = 0; i < fps * 3; i++) {
    [x, velocity] = advanceRelease(x, velocity, 0, 1 / fps);
    assert.ok(Number.isFinite(x) && Number.isFinite(velocity) && x >= 0 && x <= 1);
  }
  assert.equal(x, 0);
  assert.equal(velocity, 0);
}
assert.ok(Math.max(...samples) - Math.min(...samples) < 1e-10);
const first = advanceRelease(0, 0, 1, 1 / 60);
const second = advanceRelease(...first, 1, 1 / 60);
assert.ok(first[0] < second[0] - first[0], 'release must accelerate gently from rest');
for (let fold = 0; fold < 3; fold++)
  for (const along of [0, 0.42, 1]) {
    assert.equal(releasePhase(0, along, fold), 0);
    assert.equal(releasePhase(1, along, fold), 1);
    let previous = 0;
    for (let i = 0; i <= 100; i++) {
      const phase = releasePhase(i / 100, along, fold);
      assert.ok(phase >= previous && phase <= 1);
      previous = phase;
    }
  }
console.log(
  'PASS: two-click entry, reading/return state, frame-rate independent release, continuous reversal, fold endpoints, bounded controls and Tokyo mood boundaries.',
);

const named = { N: 3, L: 1.5 };
const namedState = reduceState(state, { type: 'probe', value: named });
assert.deepEqual(namedState.probe, named);
assert.notEqual(namedState.probe, named, 'copy parameter object at state boundary');
assert.equal(reduceState(namedState, { type: 'probe', value: { N: NaN } }), namedState);
assert.equal(reduceState(namedState, { type: 'back' }).probe, namedState.probe);
