import { readFile, writeFile, copyFile } from 'node:fs/promises';
import * as THREE from '../../vendor/three/three.module.min.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { proportions } from './sculpted-geometry.mjs';

// The approved revision 02 is immutable. Hardware is appended to its nodes and BIN.
const dir = new URL('./generated/', import.meta.url);
try {
  await readFile(new URL('organic-spine-v2.glb', dir));
} catch {
  await copyFile(new URL('organic-spine.glb', dir), new URL('organic-spine-v2.glb', dir));
}
const source = await readFile(new URL('organic-spine-v2.glb', dir));
const jsonLength = source.readUInt32LE(12),
  base = 28 + jsonLength;
const data = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
let offset = data.buffers[0].byteLength,
  chunks = [source.subarray(base, base + offset)];
function append(array, index = false) {
  const bufferView = data.bufferViews.length;
  chunks.push(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  data.bufferViews.push({
    buffer: 0,
    byteOffset: offset,
    byteLength: array.byteLength,
    target: index ? 34963 : 34962,
  });
  offset += array.byteLength;
  const a = {
    bufferView,
    componentType: index ? 5125 : 5126,
    count: array.length / (index ? 1 : 3),
    type: index ? 'SCALAR' : 'VEC3',
  };
  if (!index) {
    a.min = [Infinity, Infinity, Infinity];
    a.max = [-Infinity, -Infinity, -Infinity];
    array.forEach((x, i) => {
      a.min[i % 3] = Math.min(a.min[i % 3], x);
      a.max[i % 3] = Math.max(a.max[i % 3], x);
    });
  }
  data.accessors.push(a);
  return data.accessors.length - 1;
}
function encode() {
  data.buffers = [{ byteLength: offset }];
  const j = Buffer.from(JSON.stringify(data)),
    json = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 32)]),
    bin = Buffer.concat(chunks);
  const h = Buffer.alloc(20),
    b = Buffer.alloc(8);
  h.writeUInt32LE(0x46546c67);
  h.writeUInt32LE(2, 4);
  h.writeUInt32LE(28 + json.length + bin.length, 8);
  h.writeUInt32LE(json.length, 12);
  h.writeUInt32LE(0x4e4f534a, 16);
  b.writeUInt32LE(bin.length);
  b.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, json, b, bin]);
}
function polygon(points) {
  return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
}
function hardware(p) {
  const pieces = [];
  function add(g) {
    pieces.push(g.index ? g.toNonIndexed() : g);
  }
  for (const s of [-1, 1]) {
    // Open, chamfered side plate: straight machined edges, with a long negative-space slot.
    const h = p.h * 0.34,
      w = 0.092;
    const plate = polygon([
      [-w, -h + 0.055],
      [-w + 0.042, -h],
      [w - 0.025, -h],
      [w, -h + 0.028],
      [w, h - 0.06],
      [w - 0.045, h],
      [-w + 0.025, h],
      [-w, h - 0.026],
    ]);
    const slot = new THREE.Path();
    slot.moveTo(-0.027, -h * 0.53);
    slot.lineTo(-0.027, h * 0.53);
    slot.lineTo(0.027, h * 0.53);
    slot.lineTo(0.027, -h * 0.53);
    slot.closePath();
    plate.holes.push(slot);
    const g = new THREE.ExtrudeGeometry(plate, {
      depth: 0.025,
      bevelEnabled: true,
      bevelSize: 0.007,
      bevelThickness: 0.006,
      bevelSegments: 1,
      curveSegments: 1,
    });
    g.rotateY((s * Math.PI) / 2);
    g.translate(s * p.w * 0.98, 0, p.center);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) a.setX(i, a.getX(i) + (s * p.w * 0.22 * a.getY(i)) / p.h);
    g.computeVertexNormals();
    add(g);
    for (const y of [-h * 0.82, h * 0.82]) {
      const head = polygon(
        Array.from({ length: 6 }, (_, k) => [
          0.035 * Math.cos((k * Math.PI) / 3),
          0.035 * Math.sin((k * Math.PI) / 3),
        ]),
      );
      const recess = new THREE.Path();
      recess.absarc(0, 0, 0.013, 0, Math.PI * 2, true);
      head.holes.push(recess);
      const bolt = new THREE.ExtrudeGeometry(head, {
        depth: 0.018,
        bevelEnabled: true,
        bevelSize: 0.003,
        bevelThickness: 0.003,
        bevelSegments: 1,
        curveSegments: 8,
      });
      bolt.rotateY((s * Math.PI) / 2);
      bolt.translate(s * (p.w * (0.98 + (0.22 * y) / p.h) + 0.033), y, p.center);
      add(bolt);
    }
    // A small rear yoke and recessed pivot sit on the existing lamina, not across the canal.
    const bridge = new THREE.BoxGeometry(0.19, 0.065, 0.1);
    bridge.rotateY(s * 0.23);
    bridge.translate(s * 0.53, 0.1, -0.68);
    add(bridge);
    const pin = new THREE.CylinderGeometry(0.065, 0.065, 0.085, 12, 1, true);
    pin.rotateZ(Math.PI / 2);
    pin.translate(s * 0.64, 0.1, -0.68);
    add(pin);
    const collar = new THREE.TorusGeometry(0.048, 0.013, 4, 12);
    collar.rotateY(Math.PI / 2);
    collar.translate(s * 0.688, 0.1, -0.68);
    add(collar);
  }
  const pos = [],
    nor = [];
  for (const g of pieces) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    g.dispose();
  }
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    indices: Uint32Array.from({ length: pos.length / 3 }, (_, i) => i),
  };
}
for (let i = 0; i < 9; i++) {
  const g = hardware(proportions(i)),
    mesh = data.meshes.length;
  data.meshes.push({
    name: `Machined side braces and joint hardware ${i + 1}`,
    primitives: [
      {
        attributes: { POSITION: append(g.positions), NORMAL: append(g.normals) },
        indices: append(g.indices, true),
        material: 1,
      },
    ],
  });
  data.nodes[data.extras.units[i]].children.push(data.nodes.length);
  data.nodes.push({ name: 'Titanium fittings / original decoration', mesh });
}
data.asset.generator = 'ZHIXU original sculpted spine + machined fittings / revision 03';
data.extras.revision = 3;
data.extras.description =
  'Approved revision 02 body, arch and seams preserved byte-for-byte. Original machined titanium side braces, hollow hex fasteners and rear joint fittings.';
const full = encode();
await writeFile(new URL('organic-spine.glb', dir), full);

// Offline-only LOD: preserve positions + normal field, then compact unused vertices.
await MeshoptSimplifier.ready;
const bin = Buffer.concat(chunks),
  oldAccessors = data.accessors,
  oldViews = data.bufferViews;
function read(index) {
  const a = oldAccessors[index],
    v = oldViews[a.bufferView],
    b = bin.subarray(v.byteOffset, v.byteOffset + v.byteLength);
  const copy = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return a.componentType === 5125 ? new Uint32Array(copy) : new Float32Array(copy);
}
data.accessors = [];
data.bufferViews = [];
chunks = [];
offset = 0;
let triangles = 0;
for (const mesh of data.meshes) {
  const p = mesh.primitives[0],
    positions = read(p.attributes.POSITION),
    normals = read(p.attributes.NORMAL);
  let indices = read(p.indices);
  const target = p.material === 0 ? 1700 : p.material === 1 ? 2600 : 400;
  if (indices.length > target * 3) {
    [indices] = MeshoptSimplifier.simplifyWithAttributes(
      indices,
      positions,
      3,
      normals,
      3,
      [0.15, 0.15, 0.15],
      null,
      target * 3,
      0.008,
    );
  }
  const [remap, count] = MeshoptSimplifier.compactMesh(indices),
    pos = new Float32Array(count * 3),
    nor = new Float32Array(count * 3);
  for (let i = 0; i < remap.length; i++)
    if (remap[i] !== 0xffffffff) {
      pos.set(positions.subarray(i * 3, i * 3 + 3), remap[i] * 3);
      nor.set(normals.subarray(i * 3, i * 3 + 3), remap[i] * 3);
    }
  p.attributes = { POSITION: append(pos), NORMAL: append(nor) };
  p.indices = append(indices, true);
  triangles += indices.length / 3;
}
data.extras.lod = 'runtime';
data.extras.triangles = triangles;
const runtime = encode();
await writeFile(new URL('organic-spine-runtime-v3.glb', dir), runtime);
await writeFile(
  new URL('model-info.json', dir),
  JSON.stringify(
    {
      revision: 3,
      units: 9,
      fullBytes: full.length,
      runtimeBytes: runtime.length,
      runtimeTriangles: triangles,
      palette: data.extras.palette,
    },
    null,
    2,
  ),
);
console.log(
  `Revision 03: high detail ${(full.length / 1048576).toFixed(2)} MiB; runtime ${(runtime.length / 1048576).toFixed(2)} MiB / ${triangles.toLocaleString()} triangles for nine units.`,
);
