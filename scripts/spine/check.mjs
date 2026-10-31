import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const approved = JSON.parse(await readFile(new URL('./approved-v2.json', import.meta.url), 'utf8'));
async function validate(name) {
  const b = await readFile(new URL('../../assets/models/' + name, import.meta.url));
  assert.equal(b.readUInt32LE(0), 0x46546c67);
  assert.equal(b.readUInt32LE(4), 2);
  assert.equal(b.readUInt32LE(8), b.length);
  const jl = b.readUInt32LE(12),
    d = JSON.parse(b.subarray(20, 20 + jl).toString()),
    base = 28 + jl;
  assert.equal(base + d.buffers[0].byteLength, b.length);
  assert.deepEqual(
    d.materials,
    approved.materials,
    'Preserve the approved palette and material finish',
  );
  assert.deepEqual(d.extras.palette, approved.palette);
  function bytes(index) {
    const a = d.accessors[index],
      v = d.bufferViews[a.bufferView];
    assert.equal(v.byteOffset % 4, 0);
    assert(v.byteOffset >= 0 && v.byteOffset + v.byteLength <= d.buffers[0].byteLength);
    return b.subarray(base + v.byteOffset, base + v.byteOffset + v.byteLength);
  }
  function array(index) {
    const a = d.accessors[index],
      s = bytes(index),
      copy = s.buffer.slice(s.byteOffset, s.byteOffset + s.byteLength);
    return a.componentType === 5125 ? new Uint32Array(copy) : new Float32Array(copy);
  }
  for (const mesh of d.meshes) {
    const p = mesh.primitives[0],
      pos = array(p.attributes.POSITION),
      norm = array(p.attributes.NORMAL),
      idx = array(p.indices);
    assert.equal(pos.length, norm.length);
    assert.equal(idx.length % 3, 0);
    for (const x of pos) assert(Number.isFinite(x));
    for (let i = 0; i < norm.length; i += 3)
      assert(Math.abs(Math.hypot(...norm.subarray(i, i + 3)) - 1) < 0.003);
    for (const x of idx) assert(x < pos.length / 3);
    for (let i = 0; i < idx.length; i += 3) assert.equal(new Set(idx.subarray(i, i + 3)).size, 3);
  }
  for (const n of d.nodes) {
    if (n.rotation) assert(Math.abs(Math.hypot(...n.rotation) - 1) < 1e-6);
    if (n.scale) assert(n.scale.every((x) => x > 0));
    n.children?.forEach((i) => assert(d.nodes[i]));
    if (n.mesh !== undefined) assert(d.meshes[n.mesh]);
  }
  if (!d.extras.sceneRuntime) {
    assert.equal(d.extras.units.length, 9);
    const hashes = d.meshes.slice(0, 27).map((m) => {
      const p = m.primitives[0];
      return [p.attributes.POSITION, p.attributes.NORMAL, p.indices].map((i) =>
        createHash('sha256').update(bytes(i)).digest('hex'),
      );
    });
    assert.deepEqual(
      hashes,
      approved.geometryHashes,
      'Approved bodies, arches and joints must remain byte-for-byte identical',
    );
    for (const i of d.extras.units) assert.equal(d.nodes[i].children.length, 4);
  } else {
    assert(d.extras.vertebrae > 60 && d.extras.vertebrae < 90);
    assert(b.length < 3 * 1024 * 1024, 'Scene geometry download budget');
    const units = d.extras.units.map((i) => d.nodes[i]);
    for (let i = 1; i < units.length; i++) {
      const gap = units[i - 1].translation[1] - units[i].translation[1];
      assert(gap > 0.65 && gap < 0.86);
    }
    const instances = d.nodes.filter((n) => n.mesh !== undefined),
      triangles = instances.reduce(
        (sum, n) => sum + d.accessors[d.meshes[n.mesh].primitives[0].indices].count / 3,
        0,
      );
    assert(triangles < 450000, 'Runtime triangle budget');
    console.log(
      `Runtime: ${d.extras.vertebrae} vertebrae / ${triangles.toLocaleString()} triangles / ${(b.length / 1048576).toFixed(2)} MiB`,
    );
  }
  console.log(
    `PASS ${name}: binary structure, finite geometry, normals, indices, transforms, palette${d.extras.sceneRuntime ? ' and runtime budgets' : '; approved revision 02 hashes unchanged'}.`,
  );
}
await validate('organic-spine-study-v3.glb');
await validate('organic-spine-scene-v3.glb');
