import assert from 'node:assert/strict';
import {
  ASSEMBLY_COUNT,
  MATH_MODEL_IDS,
  buildModelPoses,
  midpointRectangles,
  partialObservation,
  complexObservation,
} from '../laboratory/assembly-models.js';
const near = (a, b, t = 1e-10) => assert(Math.abs(a - b) < t, `${a} != ${b}`);
function endpoints(pose) {
  const [rx, ry, rz] = pose.rotation;
  const a = Math.cos(rx),
    b = Math.sin(rx),
    c = Math.cos(ry),
    d = Math.sin(ry);
  const e = Math.cos(rz),
    f = Math.sin(rz);
  const axis = [c * e, a * f + b * e * d, b * f - a * e * d];
  return [-1, 1].map((sign) =>
    pose.position.map((v, i) => v + (sign * axis[i] * pose.scale[0]) / 2),
  );
}
function axes(pose) {
  const [rx, ry, rz] = pose.rotation;
  const sx = Math.sin(rx),
    cx = Math.cos(rx),
    sy = Math.sin(ry),
    cy = Math.cos(ry),
    sz = Math.sin(rz),
    cz = Math.cos(rz);
  return [
    [cy * cz, cx * sz + sx * cz * sy, sx * sz - cx * cz * sy],
    [-cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz],
    [sy, -sx * cy, cx * cy],
  ];
}
function bounds(pose) {
  const basis = axes(pose);
  return pose.position.map((v, i) => {
    const half = pose.scale.reduce((sum, s, j) => sum + (Math.abs(basis[j][i]) * s) / 2, 0);
    return [v - half, v + half];
  });
}
for (const id of [...MATH_MODEL_IDS, 'thermo', 'quantum-wave', 'organic-acid', 'unknown']) {
  for (const probe of [undefined, NaN, Infinity, -999, 0, 0.5, 1, 8, 32, 999]) {
    const { poses, metadata } = buildModelPoses(id, probe);
    assert.equal(poses.length, ASSEMBLY_COUNT);
    assert(metadata.title && metadata.description && metadata.readout);
    assert(Number.isFinite(metadata.contactY));
    for (const pose of poses) {
      for (const field of ['position', 'rotation', 'scale']) {
        assert.equal(pose[field].length, 3);
        assert(pose[field].every(Number.isFinite));
      }
      assert(pose.scale.every((v) => v >= 0));
      assert(/^#[0-9a-f]{6}$/i.test(pose.color));
      if (pose.scale.every((v) => v > 0))
        assert(
          bounds(pose)[1][0] >= metadata.contactY - 1e-10,
          `${id}: geometry below foot contact`,
        );
    }
    const groundPads = poses.filter((pose) => pose.part === 'ground-pad');
    assert(groundPads.length >= 2);
    for (const pad of groundPads) near(bounds(pad)[1][0], metadata.contactY);
  }
}
for (let n = 4; n <= 32; n++) {
  const data = midpointRectangles(n);
  assert.equal(data.rectangles.length, n);
  near(data.sum, 1 / 3 - 1 / (12 * n * n));
  data.rectangles.forEach((r, i) => {
    near(r.left, i / n);
    near(r.right, (i + 1) / n);
    near(r.height, r.midpoint ** 2);
  });
  const rendered = buildModelPoses('math-integral', n).poses.filter(
    (p) => p.role === 'midpoint-rectangle',
  );
  near(rendered.reduce((sum, p) => sum + p.scale[0] * p.scale[1], 0) / (2.6 * 2), data.sum);
}
assert(midpointRectangles(32).sum > midpointRectangles(4).sum);
// Fixtures may touch a rectangle's base, but must not occupy its measured area.
const integralPoses = buildModelPoses('math-integral', 32).poses;
for (const rectangle of integralPoses.filter((pose) => pose.role === 'midpoint-rectangle')) {
  const r = bounds(rectangle);
  for (const fixture of integralPoses.filter((pose) => pose.role.startsWith('hardware-'))) {
    const f = bounds(fixture);
    const interiorOverlap = r.every(
      ([min, max], i) => Math.min(max, f[i][1]) - Math.max(min, f[i][0]) > 1e-10,
    );
    assert(!interiorOverlap, 'Integral fixture intersects the represented area');
  }
}
for (const a of [-1.3, -0.2, 0, 0.8, 1.3]) {
  const { data } = buildModelPoses('math', a);
  near(data.slope, 2 * a);
  near(data.slope * a + data.tangentIntercept, a * a);
  for (const pose of buildModelPoses('math', a).poses) {
    if (!['curve', 'tangent'].includes(pose.role)) continue;
    for (const p of endpoints(pose)) {
      const x = p[0] / 0.95,
        y = (p[1] + 0.95) / 0.8;
      near(y, pose.role === 'curve' ? x * x : a * a + 2 * a * (x - a));
    }
  }
}
for (const t of [-1.1, 0, 0.4, 1]) {
  const { data, poses } = buildModelPoses('math-explog', t);
  near(Math.log(data.exponential[1]), t);
  assert.deepEqual(data.exponential.toReversed(), data.inverse);
  for (const pose of poses.filter((pose) => pose.role === 'curve'))
    for (const point of endpoints(pose)) {
      const x = (point[0] + 0.48) / 0.7,
        y = (point[1] + 0.48) / 0.7;
      if (pose.position[2] > 0.07) near(y, Math.exp(x));
      else near(x, Math.exp(y));
    }
}
const p = partialObservation(1),
  half = partialObservation(0.5);
near(p.df, 0.4);
near(p.delta, 0.348);
near(p.error, 0.052);
near(p.fx, 12);
near(p.fy, 4);
assert(half.error < p.error / 3);
for (const sample of buildModelPoses('math-partials').data.samples)
  near(sample.f, sample.x ** 2 * sample.y);
for (const pose of buildModelPoses('math-partials').poses) {
  if (!['partial-surface', 'tangent-plane'].includes(pose.role)) continue;
  for (const p of endpoints(pose)) {
    const x = p[0] / 2 + 2,
      y = p[2] / 2 + 3,
      value = p[1] / 0.12 + 12;
    near(value, pose.role === 'partial-surface' ? x * x * y : 12 + 12 * (x - 2) + 4 * (y - 3));
  }
}
// Every ceramic saddle is fully beneath one actual scan segment, matching its
// direction and lower face instead of approximating contact with a level box.
const partialPoses = buildModelPoses('math-partials').poses;
const surfaceStrips = partialPoses.filter((pose) => pose.role === 'partial-surface');
const contacts = partialPoses.filter((pose) => pose.part === 'surface-contact');
assert.equal(contacts.length, 4);
for (const contact of contacts) {
  const strip = surfaceStrips.find((pose) =>
    pose.position.every((v, i) => Math.abs(v - contact.contactPoint[i]) < 1e-10),
  );
  assert(strip, 'Surface saddle must attach to an actual scan strip');
  contact.rotation.forEach((v, i) => near(v, strip.rotation[i]));
  assert(contact.scale[0] <= strip.scale[0] && contact.scale[2] <= strip.scale[2]);
  const normal = axes(contact)[1];
  for (let i = 0; i < 3; i++)
    near(
      contact.position[i] + (normal[i] * contact.scale[1]) / 2,
      strip.position[i] - (normal[i] * strip.scale[1]) / 2,
    );
}
for (const a of [-2, -1, 0, 1, 2]) {
  const data = complexObservation(a);
  near(data.probabilities[0] + data.probabilities[1], 1);
  near(
    data.amplitude1.reduce((s, v) => s + v * v, 0),
    data.probabilities[0],
  );
  near(data.amplitude2[0] ** 2, data.probabilities[1]);
  near(data.probabilities[0], complexObservation(-a).probabilities[0]);
  const bars = buildModelPoses('math-complex', a).poses.filter(
    (pose) => pose.role === 'probability-bar',
  );
  bars.forEach((bar, i) => {
    near(bar.scale[1] / 1.72, data.probabilities[i]);
    near(bar.position[1] - bar.scale[1] / 2, -0.98);
  });
}
near(complexObservation(1).probabilities[0], 2 / 3);
near(complexObservation(1).probabilities[1], 1 / 3);
assert.equal(buildModelPoses('thermo').metadata.interactive, false);
assert.equal(buildModelPoses('constructor').metadata.interactive, false);
assert.deepEqual(buildModelPoses('math-integral', 8), buildModelPoses('math-integral', 8));
console.log(
  'PASS: fixed 288 finite poses; exact scientific curves/areas/probabilities; fitted surface saddles, clear integral area and coplanar foot contacts; neutral archive fallback.',
);
