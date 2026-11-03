import assert from 'node:assert/strict';
import * as T from '../vendor/three/three.module.min.js';
import {
  SPECIMEN_BOUND,
  surfacePoint,
  tangentY,
  sectionPoints,
  createSpecimen,
} from '../laboratory/specimen.js';

const near = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
for (const a of [-1.2, -0.4, 0, 0.7, 1.2])
  for (const b of [-1.2, 0.3, 1.2]) {
    const p = surfacePoint(a, b);
    assert.deepEqual([p[0], p[2]], [a, b]);
    near(tangentY(a, b, a, b), p[1]);
    const h = 0.0001;
    near((tangentY(a + h, b, a, b) - tangentY(a - h, b, a, b)) / (2 * h), a, 1e-8);
    near((tangentY(a, b + h, a, b) - tangentY(a, b - h, a, b)) / (2 * h), -b, 1e-8);
  }
for (const level of [-0.72, -0.5, -0.1, -1e-5, 0, 1e-5, 0.1, 0.5, 0.72]) {
  const branches = sectionPoints(level);
  assert.equal(branches.length, 2);
  for (const points of branches) {
    for (const [x, y, z] of points) {
      assert.ok(Math.abs(x) <= SPECIMEN_BOUND + 1e-10);
      assert.ok(Math.abs(z) <= SPECIMEN_BOUND + 1e-10);
      near(y, level);
      near((x * x - z * z) / 2, level);
    }
    if (level > 0) assert.ok(points.every((p) => Math.sign(p[0]) === Math.sign(points[0][0])));
    if (level < 0) assert.ok(points.every((p) => Math.sign(p[2]) === Math.sign(points[0][2])));
  }
}
assert.deepEqual(sectionPoints(0.73), []);
assert.throws(() => sectionPoints(NaN), RangeError);

// Exercise the geometry factory without WebGL. Moving the probe must preserve
// all geometry objects; only small existing buffers may change.
const specimen = createSpecimen(T);
assert.equal(specimen.group.visible, false);
const geometries = new Set();
specimen.group.traverse((object) => {
  if (object.geometry) geometries.add(object.geometry);
});
const shell = specimen.group.getObjectByName('exact-saddle-surface');
const positions = shell.geometry.attributes.position;
for (let i = 0; i < positions.count; i += 31) {
  near(positions.getY(i), (positions.getX(i) ** 2 - positions.getZ(i) ** 2) / 2, 1e-6);
}
specimen.setReveal(1);
assert.equal(specimen.group.visible, true);
specimen.setMode('tangent');
assert.equal(specimen.group.getObjectByName('tangent-observation').visible, true);
assert.equal(specimen.group.getObjectByName('horizontal-section').visible, false);
for (const p of [-1, -0.1, 0, 0.9, 1]) {
  specimen.setProbe(p);
  specimen.group.traverse((object) => {
    if (!object.geometry) return;
    assert.ok(geometries.has(object.geometry), 'probe should reuse geometry');
    const a = object.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      assert.ok(
        Number.isFinite(a.getX(i)) && Number.isFinite(a.getY(i)) && Number.isFinite(a.getZ(i)),
      );
    }
  });
}
specimen.setMode('section');
assert.equal(specimen.group.getObjectByName('tangent-observation').visible, false);
assert.equal(specimen.group.getObjectByName('horizontal-section').visible, true);
// The contour tubes must face outwards; finite buffers alone would miss an
// inverted winding that disappears under front-face culling in the browser.
const contour = specimen.group
  .getObjectByName('horizontal-section')
  .children.find(
    (object) =>
      object.isMesh && object.geometry.attributes.normal && object.geometry.index?.count > 100,
  );
const vertex = (i) => new T.Vector3().fromBufferAttribute(contour.geometry.attributes.position, i);
const [ia, ib, ic] = Array.from(contour.geometry.index.array.slice(0, 3));
const cross = vertex(ib)
  .sub(vertex(ia))
  .cross(vertex(ic).sub(vertex(ia)));
const normal = new T.Vector3().fromBufferAttribute(contour.geometry.attributes.normal, ia);
assert.ok(cross.dot(normal) > 0, 'section contours must have outward winding');
specimen.setReveal(0.5);
assert.equal(shell.material.opacity, 0.5);
specimen.setReveal(0);
assert.equal(specimen.group.visible, false);
specimen.dispose();
console.log(
  'PASS: exact saddle surface, tangent derivatives, disconnected bounded sections, finite mesh buffers, probe geometry reuse and reversible reveal.',
);
