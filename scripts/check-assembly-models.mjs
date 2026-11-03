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
for (const id of [...MATH_MODEL_IDS, 'thermo', 'quantum-wave', 'organic-acid', 'unknown']) {
  for (const probe of [undefined, NaN, Infinity, -999, 0, 0.5, 1, 8, 32, 999]) {
    const { poses, metadata } = buildModelPoses(id, probe);
    assert.equal(poses.length, ASSEMBLY_COUNT);
    assert(metadata.title && metadata.description && metadata.readout);
    for (const pose of poses) {
      for (const field of ['position', 'rotation', 'scale']) {
        assert.equal(pose[field].length, 3);
        assert(pose[field].every(Number.isFinite));
      }
      assert(pose.scale.every((v) => v >= 0));
      assert(/^#[0-9a-f]{6}$/i.test(pose.color));
    }
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
  const { data } = buildModelPoses('math-explog', t);
  near(Math.log(data.exponential[1]), t);
  assert.deepEqual(data.exponential.toReversed(), data.inverse);
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
for (const a of [-2, -1, 0, 1, 2]) {
  const data = complexObservation(a);
  near(data.probabilities[0] + data.probabilities[1], 1);
  near(
    data.amplitude1.reduce((s, v) => s + v * v, 0),
    data.probabilities[0],
  );
  near(data.amplitude2[0] ** 2, data.probabilities[1]);
  near(data.probabilities[0], complexObservation(-a).probabilities[0]);
}
near(complexObservation(1).probabilities[0], 2 / 3);
near(complexObservation(1).probabilities[1], 1 / 3);
assert.equal(buildModelPoses('thermo').metadata.interactive, false);
assert.equal(buildModelPoses('constructor').metadata.interactive, false);
assert.deepEqual(buildModelPoses('math-integral', 8), buildModelPoses('math-integral', 8));
console.log(
  'PASS: fixed 288 finite poses; exact tangents, midpoint areas, exponential inverse, f=x²y example, normalized complex amplitudes, neutral archive fallback.',
);
