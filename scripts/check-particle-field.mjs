import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import { createParticleField } from '../laboratory/particle-field.js';
import { ASSEMBLY_COUNT, MATH_MODEL_IDS, buildModelPoses } from '../laboratory/assembly-models.js';
import { orbitPose } from '../laboratory/orbital-motion.js';
import { surfaceFor } from '../laboratory/specimen-materials.js';

const copy = (source, target) => {
  target.p.copy(source.p);
  target.q.copy(source.q);
  target.s.copy(source.s);
  target.c.copy(source.c);
  target.finish = [...source.finish];
  return target;
};
const near = (actual, expected, tolerance = 1e-7) => {
  actual.forEach((value, k) =>
    assert.ok(
      Math.abs(value - expected[k]) <= tolerance,
      `component ${k}: ${value} versus ${expected[k]}`,
    ),
  );
};
const offset = new THREE.Vector3();
const initial = Array.from({ length: ASSEMBLY_COUNT }, (_, i) => ({
  p: new THREE.Vector3(Math.cos(i * 0.1) * 0.7, Math.sin(i * 0.1) * 0.7, 0),
  q: new THREE.Quaternion(),
  s: new THREE.Vector3(0.5, 0.03, 0.01),
  c: new THREE.Color('#d6d3ca'),
  finish: surfaceFor(),
}));
const field = createParticleField(initial, {
  modelTransform(source, target) {
    copy(source, target);
    target.p.add(offset);
    return target;
  },
  knotTransform(source, index, target) {
    return copy(source, target);
  },
});
let state = {
  stage: 'overview',
  discipline: 'mathematics',
  chapter: null,
  probe: 0,
  hasCourses: true,
};
const update = (patch) => {
  state = { ...state, ...patch };
  field.update(state);
};
const tick = (seconds, hz = 60) => {
  let running;
  for (let i = 0; i < Math.ceil(seconds * hz); i++) running = field.step(1 / hz, true);
  return running;
};
function checkFinite() {
  for (let i = 0; i < ASSEMBLY_COUNT; i++) {
    const p = field.current[i];
    assert.ok(
      [...p.p, ...p.q, ...p.s, ...p.c.toArray(), ...p.finish, ...field.velocity[i]].every(
        Number.isFinite,
      ),
    );
  }
}
function checkMapping(id, probe, settled = false) {
  const poses = buildModelPoses(id, probe).poses;
  const active = poses.flatMap((p, i) => (p.scale.every((v) => v > 0) ? [i] : []));
  const owned = [...field.slots].filter((slot) => slot >= 0);
  assert.equal(new Set(owned).size, owned.length, 'one particle per component');
  assert.deepEqual(
    [...owned].sort((a, b) => a - b),
    active,
    'all active components represented exactly once',
  );
  assert.equal(field.modelCount, active.length);
  for (let i = 0; i < ASSEMBLY_COUNT; i++) {
    const slot = field.slots[i];
    assert.equal(field.homes[i], slot < 0 ? 'ring' : 'model');
    if (!settled || slot < 0) continue;
    const p = poses[slot];
    near(
      field.current[i].p.toArray(),
      p.position.map((v, k) => v + offset.getComponent(k)),
    );
    near(field.current[i].s.toArray(), p.scale);
    near(field.current[i].finish, surfaceFor(p.role));
    near(field.current[i].c.toArray(), new THREE.Color(p.color).toArray());
  }
  checkFinite();
}

assert.equal(field.step(0, false), false);
update({ stage: 'observe' });
assert.equal(tick(2), true, 'visible directory ring may continue flowing');
assert.equal(field.busy, false, 'unfold routes terminate independently of idle ring flow');
for (let i = 0; i < ASSEMBLY_COUNT; i++) {
  const expected = orbitPose(i, field.clock);
  near(field.current[i].p.toArray(), expected.p);
  near(field.velocity[i].toArray(), expected.v, 1e-9);
}

update({ chapter: 'math-integral', probe: 8 });
checkMapping(state.chapter, state.probe);
field.step(0.01, true);
for (let i = 0; i < ASSEMBLY_COUNT; i++)
  if (field.slots[i] >= 0)
    assert.ok(
      ['orbit', 'arrival'].includes(field.phases[i]),
      'ring particles depart along the ring, without an unnecessary rejoin',
    );
const originalSlots = [...field.slots],
  before = field.current.map((p) => p.p.toArray());
const originalPhases = [...field.phases];
update({ probe: 24 });
checkMapping(state.chapter, state.probe);
for (let i = 0; i < ASSEMBLY_COUNT; i++) {
  near(field.current[i].p.toArray(), before[i]);
  if (originalSlots[i] >= 0)
    assert.equal(
      field.slots[i],
      originalSlots[i],
      'parameter growth keeps existing component ownership',
    );
}
field.step(0, true);
for (let i = 0; i < ASSEMBLY_COUNT; i++)
  if (originalSlots[i] >= 0)
    assert.equal(
      field.phases[i],
      originalPhases[i],
      'parameter input retains the active gate route',
    );
tick(4);
assert.equal(field.busy, false);
checkMapping(state.chapter, state.probe, true);

const largerSlots = [...field.slots];
update({ probe: 4 });
checkMapping(state.chapter, state.probe);
for (let i = 0; i < ASSEMBLY_COUNT; i++)
  if (field.slots[i] >= 0)
    assert.equal(field.slots[i], largerSlots[i], 'parameter reduction preserves surviving owners');
tick(2);
checkMapping(state.chapter, state.probe, true);

// A new parameter target must not overwrite the previous rendered target used
// for velocity. Retained settled pieces move with the interpolation, rather than
// reporting a large backwards velocity from desired to the old canonical pose.
const settledSlots = [...field.slots];
const settledPositions = field.current.map((p) => p.p.toArray());
update({ probe: 8 });
field.step(1 / 60, true);
for (let i = 0; i < ASSEMBLY_COUNT; i++)
  if (settledSlots[i] >= 0 && field.slots[i] === settledSlots[i]) {
    const displacementVelocity = field.current[i].p
      .toArray()
      .map((v, k) => (v - settledPositions[i][k]) * 60);
    near(field.velocity[i].toArray(), displacementVelocity, 1e-7);
  }
tick(2);
checkMapping(state.chapter, state.probe, true);

const transition = field.transition;
update({ stage: 'lesson' });
assert.equal(field.transition, transition, 'reader entry does not restart assembly');
const frozenClock = field.clock;
assert.equal(tick(0.5), false, 'settled lesson stops its animation clock');
assert.equal(field.clock, frozenClock);
const ringBeforeTransform = field.current.map((p) => p.p.toArray());
offset.set(0.3, 0.1, 0);
field.step(1 / 60, true);
checkMapping(state.chapter, state.probe, true);
for (let i = 0; i < ASSEMBLY_COUNT; i++)
  if (field.homes[i] === 'ring') near(field.current[i].p.toArray(), ringBeforeTransform[i], 1e-10);
offset.set(0, 0, 0);
update({ stage: 'observe' });
assert.equal(field.transition, transition, 'reader return does not restart assembly');

for (let command = 0; command < 25; command++) {
  const chapter = MATH_MODEL_IDS[command % MATH_MODEL_IDS.length];
  const probe = buildModelPoses(chapter).metadata.probeDefault;
  const visible = field.current.map((p) => p.p.toArray());
  update({ chapter, probe });
  field.current.forEach((p, i) => near(p.p.toArray(), visible[i]));
  checkMapping(chapter, probe);
  tick(0.08);
  checkFinite();
}
tick(4);
assert.equal(field.busy, false);
checkMapping(state.chapter, state.probe, true);

// Recipe parameters use named values. Updating either parameter retains the
// current particle position, settles to the new geometry and pauses in reading.
update({
  stage: 'observe',
  discipline: 'chemistry',
  chapter: 'electro-nernst',
  probe: { logZn: -1, logCu: -3 },
});
tick(4);
for (const probe of [
  { logZn: -2, logCu: -3 },
  { logZn: -2, logCu: -2 },
  { logZn: -2, logCu: -1 },
]) {
  const visible = field.current.map((p) => p.p.toArray());
  update({ probe });
  field.current.forEach((p, i) => near(p.p.toArray(), visible[i]));
  tick(3);
  checkMapping(state.chapter, state.probe, true);
  checkFinite();
}
update({ stage: 'lesson' });
const recipeTransition = field.transition;
assert.equal(tick(0.5), false);
update({ stage: 'observe' });
assert.equal(field.transition, recipeTransition, 'recipe reader return keeps assembled model');

// New recipes: change partial area while assembling, including empty/full
// intervals; then reverse the thermodynamic direction without teleporting.
for (const [chapter, probes] of [
  [
    'quantum-wave',
    [
      { N: 1, b: 0.5 },
      { N: 2, b: 0 },
      { N: 4, b: 1 },
      { N: 2, b: 0.5 },
    ],
  ],
  [
    'physical-gibbs',
    [
      { K: 4, y: 0.5 },
      { K: 4, y: 0.99 },
      { K: 4, y: 0.8 },
      { K: 1, y: 0.01 },
    ],
  ],
]) {
  update({ stage: 'observe', chapter, probe: probes[0] });
  tick(0.08);
  for (const probe of probes.slice(1)) {
    const visible = field.current.map((p) => p.p.toArray());
    update({ probe });
    field.current.forEach((p, i) => near(p.p.toArray(), visible[i]));
    checkMapping(chapter, probe);
    tick(0.12);
    checkFinite();
  }
  tick(4);
  checkMapping(chapter, state.probe, true);
  update({ stage: 'lesson' });
  assert.equal(tick(0.5), false, 'new recipe settles and stops drawing in reading');
}

// Reduced motion completes a pending command without another RAF, and empty
// disciplines do not start a decorative ring clock or fabricate components.
update({ chapter: 'math-integral', probe: 16 });
assert.equal(field.step(0, false), false);
assert.equal(field.busy, false);
checkMapping(state.chapter, state.probe, true);
update({ discipline: 'computing', chapter: null, hasCourses: false });
assert.equal(field.step(0, false), false);
assert.equal(field.modelCount, 0);
assert.ok(field.homes.every((home) => home === 'knot'));
const emptyClock = field.clock;
assert.equal(tick(0.5), false);
assert.equal(field.clock, emptyClock);
checkFinite();

console.log(
  'PASS: unique component mapping, in-flight parameter retention, growth/release, exact ring velocity, reader clock suspension, independent model framing, rapid switching, reduced motion and empty disciplines.',
);
