import assert from 'node:assert/strict';
import { flightProgress, flightPosition } from '../laboratory/assembly-motion.js';
import { initialState, reduceState } from '../laboratory/state.js';
import { COURSES, getCourse } from '../laboratory/course-data.js';
const a = [-1.3, 0.5, -0.4],
  b = [1.1, 0.7, 0];
for (const i of [0, 144, 287]) {
  assert.equal(flightProgress(0, i, 288), 0);
  assert.equal(flightProgress(1.4, i, 288), 1);
  assert.deepEqual(flightPosition(a, b, 0, i), a);
  assert.deepEqual(flightPosition(a, b, 1, i), b);
  for (let frame = 0; frame <= 180; frame++) {
    const p = flightPosition(a, b, flightProgress(frame / 120, i, 288), i);
    assert.ok(p.every(Number.isFinite));
    assert.ok(p.every((x) => Math.abs(x) < 5));
  }
}
const mid = flightPosition(a, b, 0.43, 4);
assert.deepEqual(
  flightPosition(mid, [0, 0, 0], 0, 4),
  mid,
  'retargeting begins at visible position',
);
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
  'PASS: staggered finite flight endpoints, interruption position, immediate study, retained selection and per-discipline chapter changes.',
);
