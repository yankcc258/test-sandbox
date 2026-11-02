import assert from 'node:assert/strict';
import { atmosphere, PALETTES, createFocusTimer } from '../workstation/atmosphere.js';
import { legacyDestination } from '../sandbox/routing.js';
import { manifoldGeometry, roundedBox } from '../workstation/surfaces.js';
import { profiledShell, roundedFace, ribbonSupport } from '../workstation/forms.js';
import { roundedDistance } from '../workstation/contact.js';
import { cloudDensity } from '../workstation/sky.js';
import { Vector3 } from '../vendor/three/three.module.min.js';

// 东京时段交界、平滑交接与午夜；不依赖执行测试机器的系统时区。
const at = (iso) => atmosphere(new Date(iso));
assert.equal(at('2026-11-01T20:59:00Z').phase, 'night');
assert.equal(at('2026-11-01T21:00:00Z').phase, 'day');
assert.equal(at('2026-11-01T21:00:00Z').bg, PALETTES.night.bg);
assert.equal(at('2026-11-01T21:30:00Z').bg, PALETTES.day.bg);
assert.equal(at('2026-11-02T07:00:00Z').bg, PALETTES.day.bg);
assert.equal(at('2026-11-02T07:30:00Z').bg, PALETTES.dusk.bg);
assert.equal(at('2026-11-02T10:00:00Z').bg, PALETTES.dusk.bg);
assert.equal(at('2026-11-02T10:30:00Z').bg, PALETTES.night.bg);
assert.deepEqual(at('2026-11-02T15:00:00Z'), at('2026-11-02T14:59:00Z'));
assert.equal(at('2026-11-01T21:15:00Z').bg, '#171c1f');
assert.equal(atmosphere(new Date('2026-11-01T21:15:00Z'), 'night').bg, PALETTES.night.bg);
assert.ok(/^#[0-9a-f]{6}$/.test(atmosphere(new Date(), 'unknown').bg));

// 模拟后台经过时间、暂停续计、完成以及重置。
let now = 0;
const timer = createFocusTimer(() => now, 1500);
timer.start();
now = 61000;
assert.equal(timer.seconds, 1439);
timer.start();
now = 62000;
assert.equal(timer.seconds, 1438); // 重复开始不延长。
timer.pause();
now = 500000;
assert.equal(timer.seconds, 1438);
timer.start();
now += 1400000;
assert.equal(timer.seconds, 38);
now += 60000;
assert.equal(timer.seconds, 0);
assert.equal(timer.running, false);
timer.reset();
assert.equal(timer.seconds, 1500);
assert.equal(timer.running, false);
timer.start();
timer.pause();
assert.equal(timer.seconds, 1500);

// 整理首页后，旧分享链接仍指向对应原型。
for (const q of ['?i=1&v=13', '?region=lab', '?i=2&workbench=1&v=17', '?motion=0', '?v=16'])
  assert.equal(legacyDestination(q), 'recall.html');
for (const q of ['', '?v=18', '?ref=share', '?v=abc']) assert.equal(legacyDestination(q), null);
for (const q of ['?region=cabin', '?region=workstation&motion=0'])
  assert.equal(legacyDestination(q), 'workstation/');
// A thick half-twist must close across its reversed seam with outward winding.
// Count shared edges and signed volume to catch holes / inside-out lighting.
const sample = manifoldGeometry(),
  edges = new Map(),
  points = sample.attributes.position;
const a = new Vector3(),
  b = new Vector3(),
  c = new Vector3(),
  cross = new Vector3();
let volume = 0;
for (let i = 0; i < sample.index.count; i += 3) {
  const ids = [0, 1, 2].map((offset) => sample.index.getX(i + offset));
  for (let j = 0; j < 3; j++) {
    const pair = [ids[j], ids[(j + 1) % 3]].sort((x, y) => x - y).join(':');
    edges.set(pair, (edges.get(pair) || 0) + 1);
  }
  a.fromBufferAttribute(points, ids[0]);
  b.fromBufferAttribute(points, ids[1]);
  c.fromBufferAttribute(points, ids[2]);
  volume += a.dot(cross.crossVectors(b, c)) / 6;
}
assert.ok(
  [...edges.values()].every((count) => count === 2),
  'Material sample must have no open/non-manifold edges',
);
assert.ok(volume > 0.02 && volume < 0.1, 'Material sample must have positive solid volume');
const shell = profiledShell([
  [-0.06, 2.8, 1.6, 0.16],
  [-0.02, 3, 1.8, 0.18],
  [0.02, 2.98, 1.78, 0.17],
]);
const shellEdges = new Map();
// Hard shading seams intentionally duplicate cap vertices. Weld by position
// for topology, while checking cap normals separately below.
const shellKey = (id) =>
  [0, 1, 2].map((k) => shell.attributes.position.array[id * 3 + k].toFixed(6)).join(',');
let shellVolume = 0;
for (let i = 0; i < shell.index.count; i += 3) {
  const ids = [0, 1, 2].map((j) => shell.index.getX(i + j));
  for (let j = 0; j < 3; j++) {
    const edge = [shellKey(ids[j]), shellKey(ids[(j + 1) % 3])].sort().join(':');
    shellEdges.set(edge, (shellEdges.get(edge) || 0) + 1);
  }
  a.fromBufferAttribute(shell.attributes.position, ids[0]);
  b.fromBufferAttribute(shell.attributes.position, ids[1]);
  c.fromBufferAttribute(shell.attributes.position, ids[2]);
  shellVolume += a.dot(cross.crossVectors(b, c)) / 6;
}
assert.ok(
  [...shellEdges.values()].every((n) => n === 2),
  'Profiled shell sides and caps meet without open edges',
);
assert.ok(
  shellVolume > 0 && shellVolume < 3 * 1.8 * 0.08,
  'Correct outward winding and bounded shell volume',
);
for (const group of shell.groups.slice(-2)) {
  for (let i = group.start; i < group.start + group.count; i++) {
    const id = shell.index.getX(i);
    const n = new Vector3().fromBufferAttribute(shell.attributes.normal, id);
    assert.ok(
      Math.abs(n.x) < 1e-6 && Math.abs(n.y) < 1e-6 && Math.abs(n.z) > 0.99999,
      'Machined end faces remain flat under reflection lighting',
    );
  }
}
// Contact is darkest at the support and decays outside its actual footprint.
assert.ok(roundedDistance(0, 0, 1.6, 1.2, 0.12) < 0);
assert.ok(Math.abs(roundedDistance(0.8, 0, 1.6, 1.2, 0.12)) < 1e-8);
assert.ok(roundedDistance(0.85, 0, 1.6, 1.2, 0.12) < roundedDistance(1, 0, 1.6, 1.2, 0.12));
assert.ok(Math.abs(roundedDistance(0, 0.345, 0.69, 0.69, 0.345)) < 1e-8);
for (let y = 0; y <= 20; y++)
  for (let x = 0; x <= 30; x++) {
    const d = cloudDensity(x / 30, y / 20);
    assert.ok(Number.isFinite(d) && d >= 0 && d <= 1, 'Cloud coverage remains finite and bounded');
  }
const face = roundedFace(3, 1.8, 0.17);
assert.ok(
  [...face.attributes.uv.array].every((v) => v >= 0 && v <= 1),
  'Display texture stays within the rounded glass',
);
const support = ribbonSupport(
  [
    [0, 0, 0],
    [0, 0.2, 0.1],
    [0, 0.5, 0.15],
  ],
  0.4,
  0.04,
);
for (const geometry of [sample, roundedBox(1, 0.1, 0.7, 0.04), shell, face, support]) {
  for (const attribute of Object.values(geometry.attributes))
    assert.ok([...attribute.array].every(Number.isFinite), 'No invalid geometry coordinates');
  const normals = geometry.attributes.normal;
  for (let i = 0; i < normals.count; i++)
    assert.ok(
      Math.abs(a.fromBufferAttribute(normals, i).length() - 1) < 0.00001,
      'Unit surface normals',
    );
  geometry.dispose();
}
console.log(
  'PASS: Tokyo atmosphere, timer, routes, closed shells, flat cap normals, display UVs, contact footprints and cloud coverage.',
);
