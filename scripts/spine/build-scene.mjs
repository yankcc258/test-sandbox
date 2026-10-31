import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from '../../vendor/three/three.module.min.js';
import { proportions, discGeometry } from './sculpted-geometry.mjs';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const input = await readFile(new URL('./generated/organic-spine-runtime-v3.glb', import.meta.url)),
  jl = input.readUInt32LE(12),
  start = 28 + jl;
const d = JSON.parse(input.subarray(20, 20 + jl).toString()),
  oldNodes = d.nodes,
  unitMeshes = d.extras.units.map((i) =>
    [0, 1, 3].map((k) => oldNodes[oldNodes[i].children[k]].mesh),
  );
let offset = d.buffers[0].byteLength;
const chunks = [input.subarray(start, start + offset)];
function accessor(a, index = false) {
  const v = d.bufferViews.length;
  chunks.push(Buffer.from(a.buffer));
  d.bufferViews.push({
    buffer: 0,
    byteOffset: offset,
    byteLength: a.byteLength,
    target: index ? 34963 : 34962,
  });
  offset += a.byteLength;
  const entry = {
    bufferView: v,
    componentType: index ? 5125 : 5126,
    count: a.length / (index ? 1 : 3),
    type: index ? 'SCALAR' : 'VEC3',
  };
  if (!index) {
    entry.min = [Infinity, Infinity, Infinity];
    entry.max = [-Infinity, -Infinity, -Infinity];
    a.forEach((x, i) => {
      entry.min[i % 3] = Math.min(entry.min[i % 3], x);
      entry.max[i % 3] = Math.max(entry.max[i % 3], x);
    });
  }
  d.accessors.push(entry);
  return d.accessors.length - 1;
}
const scale = 0.72,
  poses = [],
  params = [];
let y = 9;
for (let i = 0; y > -46; i++) {
  const k = i % 16,
    profile = k <= 8 ? k : 16 - k,
    p = proportions(profile);
  if (i) y -= scale * ((params[i - 1].h + p.h) / 2 + 0.046);
  const pos = new THREE.Vector3(0.12 * Math.sin(y * 0.42), y, 0.22 * Math.sin(y * 0.57)),
    q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        0.1254 * Math.cos(y * 0.57),
        0.04 * Math.sin(y * 0.23),
        -0.0504 * Math.cos(y * 0.42),
      ),
    );
  params.push(p);
  poses.push({
    profile,
    pos,
    q,
    m: new THREE.Matrix4().compose(pos, q, new THREE.Vector3(scale, scale, scale)),
  });
}
d.nodes = [{ name: 'Continuous sculpted spine / sandbox runtime', children: [] }];
d.extras.units = [];
for (let i = 0; i < poses.length; i++) {
  const p = poses[i],
    n = d.nodes.length;
  d.extras.units.push(n);
  d.nodes[0].children.push(n);
  d.nodes.push({
    name: `Vertebra ${i + 1}`,
    translation: p.pos.toArray(),
    rotation: p.q.toArray(),
    scale: [scale, scale, scale],
    children: [],
  });
  for (const mesh of unitMeshes[p.profile]) {
    d.nodes[n].children.push(d.nodes.length);
    d.nodes.push({ mesh, name: d.meshes[mesh].name });
  }
}
// Seams are fitted to actual neighbouring poses. Merge eight seams per draw object.
for (let first = 0; first < poses.length; first += 8) {
  const pos = [],
    nor = [],
    ix = [];
  let vertices = 0;
  for (let i = first; i < Math.min(poses.length, first + 8); i++) {
    const p = poses[i],
      relative =
        i + 1 < poses.length
          ? p.m
              .clone()
              .invert()
              .multiply(poses[i + 1].m)
          : null,
      g = discGeometry(params[i], params[i + 1], relative),
      v = new THREE.Vector3(),
      normal = new THREE.Vector3();
    const [indices] = MeshoptSimplifier.simplify(g.indices, g.positions, 3, 1200, 0.003),
      [remap, count] = MeshoptSimplifier.compactMesh(indices),
      ps = new Float32Array(count * 3),
      ns = new Float32Array(count * 3);
    for (let k = 0; k < remap.length; k++)
      if (remap[k] !== 0xffffffff) {
        ps.set(g.positions.subarray(k * 3, k * 3 + 3), remap[k] * 3);
        ns.set(g.normals.subarray(k * 3, k * 3 + 3), remap[k] * 3);
      }
    g.positions = ps;
    g.normals = ns;
    g.indices = indices;
    for (let j = 0; j < g.positions.length; j += 3) {
      v.fromArray(g.positions, j).applyMatrix4(p.m);
      normal.fromArray(g.normals, j).applyQuaternion(p.q);
      pos.push(...v.toArray());
      nor.push(...normal.toArray());
    }
    for (const x of g.indices) ix.push(x + vertices);
    vertices += g.positions.length / 3;
  }
  const mesh = d.meshes.length;
  d.meshes.push({
    name: `Fitted seam group ${first / 8 + 1}`,
    primitives: [
      {
        attributes: {
          POSITION: accessor(new Float32Array(pos)),
          NORMAL: accessor(new Float32Array(nor)),
        },
        indices: accessor(new Uint32Array(ix), true),
        material: 2,
      },
    ],
  });
  d.nodes[0].children.push(d.nodes.length);
  d.nodes.push({ mesh, name: 'Fitted cartilage seams' });
}
d.extras.sceneRuntime = true;
d.extras.scale = scale;
d.extras.vertebrae = poses.length;
d.extras.description =
  'Continuous sandbox chain with nine sculpted profiles; fitted recessed seams; titanium hardware. All original ZHIXU geometry.';
d.buffers = [{ byteLength: offset }];
const raw = Buffer.from(JSON.stringify(d)),
  json = Buffer.concat([raw, Buffer.alloc((4 - (raw.length % 4)) % 4, 32)]),
  bin = Buffer.concat(chunks),
  h = Buffer.alloc(20),
  b = Buffer.alloc(8);
h.writeUInt32LE(0x46546c67);
h.writeUInt32LE(2, 4);
h.writeUInt32LE(28 + json.length + bin.length, 8);
h.writeUInt32LE(json.length, 12);
h.writeUInt32LE(0x4e4f534a, 16);
b.writeUInt32LE(bin.length);
b.writeUInt32LE(0x004e4942, 4);
const output = Buffer.concat([h, json, b, bin]);
await writeFile(new URL('./generated/organic-spine-scene-v3.glb', import.meta.url), output);
console.log(
  `${poses.length} fitted vertebrae · ${(output.length / 1048576).toFixed(2)} MiB scene asset`,
);
