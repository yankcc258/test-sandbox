import { writeFile, mkdir } from 'node:fs/promises';
import * as THREE from '../../vendor/three/three.module.min.js';
import { proportions, bodyGeometry, metalGeometry, discGeometry } from './sculpted-geometry.mjs';
const linear = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const rgb = (hex) => [16, 8, 0].map((s) => linear(((hex >> s) & 255) / 255));
const gltf = {
  asset: { version: '2.0', generator: 'ZHIXU sculpted loft spine / revision 02' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'Organic spine / nine distinct vertebrae', children: [] }],
  meshes: [],
  accessors: [],
  bufferViews: [],
  buffers: [],
  materials: [
    {
      name: 'Ivory · existing #d6d3ca',
      pbrMetallicRoughness: {
        baseColorFactor: [...rgb(0xd6d3ca), 1],
        metallicFactor: 0,
        roughnessFactor: 0.42,
      },
    },
    {
      name: 'Titanium · existing #b9c0c2',
      pbrMetallicRoughness: {
        baseColorFactor: [...rgb(0xb9c0c2), 1],
        metallicFactor: 1,
        roughnessFactor: 0.44,
      },
    },
    {
      name: 'Disc · existing #c4c1b8',
      pbrMetallicRoughness: {
        baseColorFactor: [...rgb(0xc4c1b8), 1],
        metallicFactor: 0,
        roughnessFactor: 0.55,
      },
    },
  ],
};
const chunks = [];
let offset = 0;
function accessor(array, isIndex = false) {
  const view = gltf.bufferViews.length;
  chunks.push(Buffer.from(array.buffer));
  gltf.bufferViews.push({
    buffer: 0,
    byteOffset: offset,
    byteLength: array.byteLength,
    target: isIndex ? 34963 : 34962,
  });
  offset += array.byteLength;
  if (isIndex) {
    gltf.accessors.push({
      bufferView: view,
      componentType: 5125,
      count: array.length,
      type: 'SCALAR',
    });
    return gltf.accessors.length - 1;
  }
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < array.length; i++) {
    min[i % 3] = Math.min(min[i % 3], array[i]);
    max[i % 3] = Math.max(max[i % 3], array[i]);
  }
  gltf.accessors.push({
    bufferView: view,
    componentType: 5126,
    count: array.length / 3,
    type: 'VEC3',
    min,
    max,
  });
  return gltf.accessors.length - 1;
}
const params = Array.from({ length: 9 }, (_, i) => proportions(i)),
  poses = [];
let height = 0;
for (let i = 0; i < 9; i++) {
  const p = params[i],
    t = i / 8;
  if (i) height += (params[i - 1].h + p.h) / 2 + 0.04 + 0.012 * Math.sin(i * 0.73);
  const pos = new THREE.Vector3(
    0.19 * Math.sin(t * Math.PI * 1.4),
    -height,
    0.43 * Math.sin(t * Math.PI * 1.8 - 0.4),
  );
  const e = new THREE.Euler(
      -0.23 * Math.cos(t * Math.PI * 1.8 - 0.4),
      0.035 * Math.sin(i * 0.65),
      0.05 * Math.cos(t * Math.PI * 1.4),
    ),
    q = new THREE.Quaternion().setFromEuler(e);
  poses.push({ pos, q, matrix: new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)) });
}
const units = [];
for (let i = 0; i < 9; i++) {
  const p = params[i],
    pose = poses[i],
    next = params[i + 1],
    relative = next
      ? pose.matrix
          .clone()
          .invert()
          .multiply(poses[i + 1].matrix)
      : null;
  const geometries = [bodyGeometry(p), metalGeometry(p), discGeometry(p, next, relative)],
    unitIndex = gltf.nodes.length;
  gltf.nodes.push({
    name: `Vertebra ${String(i + 1).padStart(2, '0')} / unique profile`,
    translation: pose.pos.toArray(),
    rotation: pose.q.toArray(),
    scale: [1, 1, 1],
    children: [],
  });
  units.push(unitIndex);
  gltf.nodes[0].children.push(unitIndex);
  for (let part = 0; part < 3; part++) {
    const g = geometries[part],
      name = [
        'Sculpted ivory body',
        'Laminae and articular processes',
        'Recessed intervertebral seam',
      ][part],
      mesh = gltf.meshes.length;
    gltf.meshes.push({
      name: `${name} ${i + 1}`,
      primitives: [
        {
          attributes: { POSITION: accessor(g.positions), NORMAL: accessor(g.normals) },
          indices: accessor(g.indices, true),
          material: part,
        },
      ],
    });
    gltf.nodes[unitIndex].children.push(gltf.nodes.length);
    gltf.nodes.push({ name, mesh });
  }
  console.log(
    `Vertebra ${i + 1}: ${geometries.reduce((n, g) => n + g.indices.length / 3, 0)} triangles`,
  );
}
gltf.nodes[0].translation = [0, height / 2, 0];
gltf.extras = {
  revision: 2,
  palette: {
    ivory: '#d6d3ca',
    titanium: '#b9c0c2',
    disc: '#c4c1b8',
    background: '#151a1c',
    signal: '#9cc2b9',
  },
  units,
  prototype: true,
  description:
    'Nine original sculpted profiles with recessed endplates and flattened laminae. Independent study; original sandbox is untouched.',
};
gltf.buffers = [{ byteLength: offset }];
const json = Buffer.from(JSON.stringify(gltf)),
  js = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]),
  bin = Buffer.concat(chunks);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8);
jh.writeUInt32LE(js.length, 0);
jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(bin.length, 0);
bh.writeUInt32LE(0x004e4942, 4);
await mkdir(new URL('./generated/', import.meta.url), { recursive: true });
await writeFile(
  new URL('./generated/organic-spine.glb', import.meta.url),
  Buffer.concat([header, jh, js, bh, bin]),
);
const tris = gltf.accessors.filter((a) => a.type === 'SCALAR').reduce((n, a) => n + a.count / 3, 0);
await writeFile(
  new URL('./generated/model-info.json', import.meta.url),
  JSON.stringify(
    {
      revision: 2,
      units: 9,
      uniqueTriangles: tris,
      renderedTriangles: tris,
      bytes: header.readUInt32LE(8),
      palette: gltf.extras.palette,
    },
    null,
    2,
  ),
);
console.log(
  `Revision 02 exported: ${tris} triangles / ${(header.readUInt32LE(8) / 1048576).toFixed(2)} MiB`,
);
