import assert from 'node:assert/strict';
import { atmosphere, PALETTES, createFocusTimer } from '../workstation/atmosphere.js';
import { legacyDestination } from '../sandbox/routing.js';
import { manifoldGeometry, roundedBox } from '../workstation/surfaces.js';
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
for (const geometry of [sample, roundedBox(1, 0.1, 0.7, 0.04)]) {
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
  'PASS: Tokyo atmosphere, timer, legacy routes, closed material geometry and surface normals.',
);
