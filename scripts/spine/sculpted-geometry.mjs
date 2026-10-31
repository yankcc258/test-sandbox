import * as THREE from '../../vendor/three/three.module.min.js';
import { surface } from './geometry.mjs';
// Revision 02: explicit anatomical-style lofts, nine distinct contours.
const TAU = Math.PI * 2;
const pow = (v, p) => Math.sign(v) * Math.abs(v) ** p;
const vec = (a) => new THREE.Vector3(...a);
export function proportions(i) {
  const t = i / 8;
  return {
    i,
    t,
    w: 0.69 + 0.13 * t + 0.035 * Math.sin(i * 0.79),
    d: 0.5 + 0.06 * t + 0.025 * Math.cos(i * 0.73),
    h: 0.94 + 0.16 * t + 0.045 * Math.sin(i * 0.92),
    center: 0.53 + 0.025 * t,
    wing: 1.22 + 0.22 * Math.sin(t * Math.PI * 0.8) + 0.035 * Math.sin(i * 1.19),
    arch: 0.48 + 0.07 * t,
    phase: i * 0.61,
  };
}
export function contour(p, a, radial = 1) {
  const c = Math.cos(a),
    s = Math.sin(a);
  let x = p.w * pow(c, 0.63) * (1 - 0.075 * s),
    z = p.d * pow(s, 0.72);
  if (s < 0) z += 0.14 * Math.exp(-Math.pow(x / (p.w * 0.46), 2));
  x += 0.033 * Math.sin(2 * a + p.phase) * s;
  z += 0.022 * Math.cos(3 * a + p.phase * 0.4);
  return new THREE.Vector3(x * radial, 0, p.center + z * radial);
}
function endTilt(p, a) {
  return (
    0.028 * Math.cos(2 * a + 0.25) +
    0.025 * Math.cos(a + p.phase) * Math.sin(a) +
    0.028 * Math.sin(a)
  );
}
function finish(positions, indices) {
  let volume = 0;
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k] * 3,
      b = indices[k + 1] * 3,
      c = indices[k + 2] * 3;
    volume +=
      positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) +
      positions[a + 1] * (positions[b + 2] * positions[c] - positions[b] * positions[c + 2]) +
      positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  if (volume < 0)
    for (let k = 0; k < indices.length; k += 3)
      [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return {
    positions: g.attributes.position.array,
    normals: g.attributes.normal.array,
    indices: new Uint32Array(indices),
  };
}
function skin(rows, { closed = false, caps = true } = {}) {
  const p = rows.flatMap((r) => r.flatMap((v) => v.toArray())),
    index = [],
    n = rows[0].length,
    m = rows.length;
  for (let j = 0; j < (closed ? m : m - 1); j++)
    for (let k = 0; k < n; k++) {
      const a = j * n + k,
        b = ((j + 1) % m) * n + k,
        c = ((j + 1) % m) * n + ((k + 1) % n),
        d = j * n + ((k + 1) % n);
      index.push(a, b, c, a, c, d);
    }
  if (caps && !closed)
    for (const end of [0, m - 1]) {
      const center = rows[end]
          .reduce((v, q) => v.add(q), new THREE.Vector3())
          .multiplyScalar(1 / n),
        ix = p.length / 3;
      p.push(...center.toArray());
      for (let k = 0; k < n; k++)
        end === 0
          ? index.push(ix, end * n + k, end * n + ((k + 1) % n))
          : index.push(ix, end * n + ((k + 1) % n), end * n + k);
    }
  return finish(p, index);
}
function merge(parts) {
  let offset = 0;
  const p = [],
    n = [],
    ix = [];
  for (const g of parts) {
    p.push(...g.positions);
    n.push(...g.normals);
    for (const v of g.indices) ix.push(v + offset);
    offset += g.positions.length / 3;
  }
  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    indices: new Uint32Array(ix),
  };
}
export function bodyGeometry(p) {
  const N = 112,
    rows = [];
  // Mostly planar recessed endplates, a narrow lip and full-height concave walls.
  const outline = [
      [-0.455, 0.075],
      [-0.457, 0.27],
      [-0.464, 0.52],
      [-0.48, 0.76],
      [-0.501, 0.91],
      [-0.5, 0.965],
      [-0.472, 0.995],
      [-0.424, 0.995],
      [-0.34, 0.98],
      [-0.23, 0.95],
      [-0.1, 0.94],
      [0.04, 0.935],
      [0.18, 0.95],
      [0.3, 0.985],
      [0.395, 1.005],
      [0.453, 1.02],
      [0.493, 1.005],
      [0.51, 0.963],
      [0.505, 0.91],
      [0.48, 0.78],
      [0.45, 0.58],
      [0.422, 0.34],
      [0.415, 0.075],
    ],
    rings = [];
  for (let j = 0; j < outline.length; j++) {
    rings.push([...outline[j], j]);
    if (j >= 7 && j < 15)
      for (let k = 1; k < 7; k++) {
        const t = k / 7,
          r0 = outline[j - 1][1],
          r1 = outline[j][1],
          r2 = outline[j + 1][1],
          r3 = outline[j + 2][1],
          radius =
            0.5 *
            (2 * r1 +
              (-r0 + r2) * t +
              (2 * r0 - 5 * r1 + 4 * r2 - r3) * t * t +
              (-r0 + 3 * r1 - 3 * r2 + r3) * t * t * t);
        rings.push([THREE.MathUtils.lerp(outline[j][0], outline[j + 1][0], t), radius, j + t]);
      }
  }
  for (let j = 0; j < rings.length; j++) {
    const [y, r, source] = rings[j],
      side = source >= 6 && source <= 16;
    rows.push(
      Array.from({ length: N }, (_, k) => {
        const a = (k / N) * TAU,
          front = Math.max(0, Math.sin(a)),
          wedge = 1 + 0.22 * y + 0.035 * Math.sin(a + p.phase) * Math.sin(Math.PI * (y + 0.5));
        let relief = 0;
        if (side)
          for (const c of [0.93, 1.62, 2.28])
            relief -=
              0.012 *
              Math.exp(-Math.pow((a - c - 0.4 * y - 0.06 * Math.sin(p.phase)) / 0.09, 2)) *
              Math.sin(Math.PI * (y + 0.5));
        const radius = side ? 1 + (r - 1) * (1 - 0.45 * front) : r;
        const v = contour(p, a, radius * wedge + relief);
        v.y = y * p.h + endTilt(p, a) * (source < 6 || source > 17 ? r : 1);
        v.z += 0.055 * y * front;
        return v;
      }),
    );
  }
  return skin(rows);
}
// Flattened, bevelled lens section: broad faces and a defined narrow edge.
const section = [
  [-1, 0],
  [-0.92, 0.55],
  [-0.68, 0.91],
  [0, 1],
  [0.68, 0.91],
  [0.92, 0.55],
  [1, 0],
  [0.9, -0.52],
  [0.62, -0.85],
  [0, -0.92],
  [-0.62, -0.85],
  [-0.9, -0.52],
];
function lerpStops(stops, t) {
  const f = t * (stops.length - 1),
    i = Math.min(stops.length - 2, Math.floor(f)),
    u = f - i;
  return THREE.MathUtils.lerp(stops[i], stops[i + 1], u * u * (3 - 2 * u));
}
function ribbon(points, widths, depths, { steps = 32, closed = false, roll = 0 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(vec), closed, 'centripetal'),
    rows = [];
  for (let j = 0; j < (closed ? steps : steps + 1); j++) {
    const t = j / steps,
      c = curve.getPoint(t),
      tangent = curve.getTangent(t).normalize();
    let side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 0.015) side.crossVectors(tangent, new THREE.Vector3(0, 0, 1));
    side.normalize();
    const up = new THREE.Vector3().crossVectors(side, tangent).normalize();
    if (roll) {
      const q = new THREE.Quaternion().setFromAxisAngle(tangent, roll);
      side.applyQuaternion(q);
      up.applyQuaternion(q);
    }
    const w = lerpStops(widths, t),
      h = lerpStops(depths, t);
    rows.push(
      section.map(([x, y]) =>
        c
          .clone()
          .addScaledVector(side, x * w)
          .addScaledVector(up, y * h),
      ),
    );
  }
  return skin(rows, { closed, caps: !closed });
}
function archGeometry(p) {
  const rows = [];
  for (let k = 0; k < 120; k++) {
    const a = (k / 120) * TAU,
      s = Math.sin(a),
      c = Math.cos(a),
      center = new THREE.Vector3(p.arch * c, -0.1 - 0.21 * s, -0.34 + 0.48 * s),
      radial = new THREE.Vector3(c, 0, s).normalize(),
      width = 0.145 + 0.04 * (1 - s) * 0.5 + 0.012 * Math.sin(2 * a + p.phase),
      height = 0.075 + 0.034 * (1 - s) * 0.5;
    rows.push(
      section.map(([u, v]) =>
        center
          .clone()
          .addScaledVector(radial, u * width)
          .add(new THREE.Vector3(0, v * height, 0)),
      ),
    );
  }
  return skin(rows, { closed: true, caps: false });
}
function facet(p, side, upper) {
  const y = upper ? p.h * 0.48 : -p.h * 0.47;
  const points = upper
    ? [
        [side * 0.4, 0.0, -0.57],
        [side * 0.43, 0.23, -0.59],
        [side * 0.42, y - 0.09, -0.53],
        [side * 0.41, y, -0.48],
      ]
    : [
        [side * 0.44, -0.04, -0.49],
        [side * 0.4, -0.23, -0.51],
        [side * 0.37, y + 0.08, -0.46],
        [side * 0.36, y, -0.41],
      ];
  return ribbon(points, [0.16, 0.14, 0.125, 0.125], [0.105, 0.09, 0.07, 0.055], {
    steps: 20,
    roll: side * 0.2,
  });
}
export function metalGeometry(p) {
  // Fuse the laminae, pedicles and flat joint pads before meshing. Their
  // superelliptic cross-sections retain broad planes while the roots merge.
  const beams = [];
  function add(points, widths, depths, roll = 0) {
    const curve = new THREE.CatmullRomCurve3(points.map(vec), false, 'centripetal'),
      segments = [],
      box = new THREE.Box3();
    for (let i = 0; i < 32; i++) {
      const t = i / 32,
        u = (i + 1) / 32,
        A = curve.getPoint(t),
        B = curve.getPoint(u),
        D = B.clone().sub(A),
        l2 = D.lengthSq(),
        T = D.clone().normalize();
      let S = new THREE.Vector3().crossVectors(T, new THREE.Vector3(0, 1, 0));
      if (S.lengthSq() < 0.015) S.crossVectors(T, new THREE.Vector3(0, 0, 1));
      S.normalize();
      const U = new THREE.Vector3().crossVectors(S, T).normalize();
      if (roll) {
        const q = new THREE.Quaternion().setFromAxisAngle(T, roll);
        S.applyQuaternion(q);
        U.applyQuaternion(q);
      }
      segments.push({
        a: A.toArray(),
        d: D.toArray(),
        l2,
        s: S.toArray(),
        u: U.toArray(),
        w0: lerpStops(widths, t),
        w1: lerpStops(widths, u),
        h0: lerpStops(depths, t),
        h1: lerpStops(depths, u),
      });
      box.expandByPoint(A);
      box.expandByPoint(B);
    }
    box.expandByScalar(Math.max(...widths, ...depths) + 0.14);
    beams.push({ segments, min: box.min.toArray(), max: box.max.toArray() });
  }
  for (const s of [-1, 1]) {
    add(
      [
        [s * p.w * 0.8, -0.29, 0.43],
        [s * p.w * 0.91, -0.23, 0.16],
        [s * 0.64, -0.11, -0.12],
        [s * p.arch, 0.04, -0.44],
      ],
      [0.15, 0.18, 0.15, 0.18],
      [0.1, 0.12, 0.11, 0.09],
      s * 0.14,
    );
    add(
      [
        [s * 0.38, 0.02, -0.43],
        [s * 0.72, 0.13, -0.46],
        [s * p.wing * 0.82, 0.1 + 0.035 * Math.sin(p.phase), -0.62],
        [s * p.wing, -0.035, -0.8 - 0.035 * Math.cos(p.phase)],
      ],
      [0.18, 0.205, 0.135, 0.043],
      [0.11, 0.09, 0.052, 0.028],
      s * 0.17,
    );
    const top = p.h * 0.46,
      bot = -p.h * 0.46;
    add(
      [
        [s * 0.4, 0, -0.57],
        [s * 0.43, 0.23, -0.59],
        [s * 0.42, top - 0.09, -0.53],
        [s * 0.41, top, -0.48],
      ],
      [0.145, 0.13, 0.11, 0.095],
      [0.1, 0.085, 0.065, 0.038],
      s * 0.2,
    );
    add(
      [
        [s * 0.44, -0.04, -0.49],
        [s * 0.4, -0.23, -0.51],
        [s * 0.37, bot + 0.08, -0.46],
        [s * 0.36, bot, -0.41],
      ],
      [0.145, 0.125, 0.1, 0.085],
      [0.1, 0.082, 0.062, 0.035],
      s * 0.2,
    );
  }
  add(
    [
      [0, 0.1, -0.71],
      [0, 0.045, -0.96],
      [0.015 * Math.sin(p.phase), -0.17, -1.15],
      [0.025 * Math.sin(p.phase), -0.36, -1.28 - 0.075 * p.t],
    ],
    [0.21, 0.18, 0.115, 0.048],
    [0.095, 0.087, 0.06, 0.032],
  );
  const blend = (a, b, k) => {
    const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
    return b + (a - b) * h - k * h * (1 - h);
  };
  function field(x, y, z) {
    const angle = Math.atan2((z + 0.34) / 0.48, x / p.arch),
      s = Math.sin(angle),
      c = Math.cos(angle),
      width = 0.145 + 0.04 * (1 - s) * 0.5 + 0.012 * Math.sin(2 * angle + p.phase),
      height = 0.075 + 0.034 * (1 - s) * 0.5;
    const radial = (x - p.arch * c) * c + (z + 0.34 - 0.48 * s) * s,
      vertical = y + 0.1 + 0.21 * s;
    let d =
      (Math.pow(
        Math.pow(Math.abs(radial / width), 3.2) + Math.pow(Math.abs(vertical / height), 3.2),
        1 / 3.2,
      ) -
        1) *
      Math.min(width, height);
    for (const beam of beams) {
      if (
        x < beam.min[0] ||
        x > beam.max[0] ||
        y < beam.min[1] ||
        y > beam.max[1] ||
        z < beam.min[2] ||
        z > beam.max[2]
      )
        continue;
      let dist = 10;
      for (const q of beam.segments) {
        const X = x - q.a[0],
          Y = y - q.a[1],
          Z = z - q.a[2],
          t0 = (X * q.d[0] + Y * q.d[1] + Z * q.d[2]) / q.l2,
          t = Math.max(0, Math.min(1, t0)),
          dx = X - q.d[0] * t,
          dy = Y - q.d[1] * t,
          dz = Z - q.d[2] * t;
        const w = q.w0 + (q.w1 - q.w0) * t,
          h = q.h0 + (q.h1 - q.h0) * t,
          A = (dx * q.s[0] + dy * q.s[1] + dz * q.s[2]) / w,
          B = (dx * q.u[0] + dy * q.u[1] + dz * q.u[2]) / h;
        const radius = Math.min(w, h),
          along = (Math.abs(t0 - t) * Math.sqrt(q.l2)) / radius;
        const v =
          (Math.pow(
            Math.pow(Math.abs(A), 3.4) + Math.pow(Math.abs(B), 3.4) + Math.pow(along, 3.4),
            1 / 3.4,
          ) -
            1) *
          radius;
        if (v < dist) dist = v;
      }
      d = blend(d, dist, 0.065);
    }
    return d;
  }
  const g = surface(field, [-1.7, -0.72, -1.52], [1.7, 0.73, 0.7], 0.033),
    positions = [],
    normals = [],
    indices = [],
    map = new Map();
  for (let i = 0; i < g.positions.length; i += 3) {
    const key = [0, 1, 2].map((k) => Math.round(g.positions[i + k] * 1e6)).join(',');
    let idx = map.get(key);
    if (idx === undefined) {
      idx = positions.length / 3;
      map.set(key, idx);
      positions.push(...g.positions.subarray(i, i + 3));
      normals.push(...g.normals.subarray(i, i + 3));
    }
    indices.push(idx);
  }
  const valid = [];
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k],
      b = indices[k + 1],
      c = indices[k + 2];
    if (a !== b && b !== c && a !== c) valid.push(a, b, c);
  }
  // Volume-preserving relaxation removes discretization ripples from the fused
  // field; normals then follow the final surface rather than the sampled field.
  const p0 = new Float32Array(positions),
    neighbors = Array.from({ length: p0.length / 3 }, () => new Set());
  for (let k = 0; k < valid.length; k += 3) {
    const [a, b, c] = valid.slice(k, k + 3);
    neighbors[a].add(b).add(c);
    neighbors[b].add(a).add(c);
    neighbors[c].add(a).add(b);
  }
  const adjacent = neighbors.map((s) => [...s]),
    next = p0.slice();
  for (let iteration = 0; iteration < 48; iteration++) {
    const rate = iteration % 2 === 0 ? 0.43 : -0.445;
    for (let i = 0; i < adjacent.length; i++) {
      const ns = adjacent[i];
      if (!ns.length) continue;
      for (let axis = 0; axis < 3; axis++) {
        let sum = 0;
        for (const n of ns) sum += p0[n * 3 + axis];
        next[i * 3 + axis] = p0[i * 3 + axis] + rate * (sum / ns.length - p0[i * 3 + axis]);
      }
    }
    p0.set(next);
  }
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  mesh.setIndex(valid);
  mesh.computeVertexNormals();
  return { positions: p0, normals: mesh.attributes.normal.array, indices: new Uint32Array(valid) };
}
export function discGeometry(a, b, relative) {
  const rows = [],
    N = 112;
  for (const t of [0, 0.16, 0.45, 0.68, 0.86, 1]) {
    const rim = 0.81 - 0.022 * Math.sin(Math.PI * t);
    rows.push(
      Array.from({ length: N }, (_, k) => {
        const angle = (k / N) * TAU,
          A = contour(a, angle, rim);
        A.y = -a.h * 0.486 + endTilt(a, angle);
        const B = b ? contour(b, angle, rim) : A.clone();
        if (b) {
          B.y = b.h * 0.488 + endTilt(b, angle);
          B.applyMatrix4(relative);
        } else B.y -= 0.04;
        return A.lerp(B, t);
      }),
    );
  }
  return skin(rows);
}
