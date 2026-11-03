import assert from 'node:assert/strict';
import {
  initialState,
  reduceState,
  sceneTargets,
  approach,
  tokyoMood,
} from '../laboratory/state.js';
import { CHAPTERS } from '../laboratory/chapters.js';

let state = initialState();
state = reduceState(state, { type: 'activate' });
assert.equal(state.stage, 'focus');
state = reduceState(state, { type: 'activate' });
assert.equal(state.stage, 'observe');
for (let i = 0; i < 10; i++) state = reduceState(state, { type: 'activate' });
assert.equal(state.stage, 'observe', 'repeated clicks must not queue further entry stages');
state = reduceState(state, { type: 'probe', value: -0.63 });
for (const chapter of CHAPTERS) {
  state = reduceState(state, { type: 'chapter', chapter });
  assert.equal(state.stage, 'lesson');
  assert.equal(state.mode, chapter.mode);
  assert.ok(chapter.html.includes('示例'));
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
assert.equal(reduceState(state, { type: 'probe', value: 12 }).probe, 1);
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
console.log(
  'PASS: two-click entry, direct chapter access, reading/return observation state, interrupted reversal, bounded controls and Tokyo mood boundaries.',
);
