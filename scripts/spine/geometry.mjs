// Original, deterministic implicit modeling. No reference-site assets or code.
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function smoothUnion(a, b, k = 0.14) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return mix(b, a, h) - k * h * (1 - h);
}
function segment(x, y, z, a, b, r1, r2, flatten = 1) {
  const ax = x - a[0],
    ay = (y - a[1]) / flatten,
    az = z - a[2];
  const bx = b[0] - a[0],
    by = (b[1] - a[1]) / flatten,
    bz = b[2] - a[2];
  const h = clamp((ax * bx + ay * by + az * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return Math.hypot(ax - bx * h, ay - by * h, az - bz * h) - mix(r1, r2, h);
}
export function fields(variant = 0) {
  const rx = 0.72 + variant * 0.035,
    rz = 0.51 + variant * 0.018,
    cy = 0.39 + variant * 0.012;
  function body(x, y, z) {
    // A soft kidney-shaped body with an anterior convex face and a posterior waist.
    const zn = (z - 0.52) / rz,
      xn = x / rx;
    const height = cy * (1 + 0.085 * Math.sin(x * 2.8 + variant * 0.3) - 0.11 * zn);
    const waist = 1 - 0.08 * Math.exp(-Math.pow(y / 0.23, 2));
    const posterior =
      0.1 * Math.exp(-Math.pow(x / 0.38, 2)) * Math.exp(-Math.pow((z - 0.06) / 0.23, 2));
    const p = 2.55;
    const kidneyWidth =
      (1 - 0.11 * zn + 0.025 * Math.sin(zn * 3 + variant * 0.25)) * (0.94 + (0.09 * y) / height);
    let d =
      (Math.pow(
        Math.pow(Math.abs(xn / waist / kidneyWidth), p) +
          Math.pow(Math.abs((zn + posterior) / waist), p) +
          Math.pow(Math.abs(y / height), p),
        1 / p,
      ) -
        1) *
      0.38;
    // Very shallow growth lines, coherent across the surface, never random noise.
    d += 0.00035 * Math.sin(y * 29 + x * 1.4 + z * 2.2) * Math.exp(-Math.pow(y / 0.29, 4));
    return d;
  }
  const appendages = [];
  for (const side of [-1, 1]) {
    const v = variant * 0.035;
    // Swept lateral processes blend continuously into the neural arch.
    appendages.push([[side * 0.45, -0.01, -0.31], [side * 0.84, -0.07, -0.43], 0.22, 0.17, 1.1]);
    appendages.push([
      [side * 0.84, -0.07, -0.43],
      [side * (1.19 + v), -0.17, -0.66 - v],
      0.17,
      0.085,
      0.78,
    ]);
    appendages.push([
      [side * (1.19 + v), -0.17, -0.66 - v],
      [side * (1.36 + v), -0.22, -0.79 - v],
      0.085,
      0.033,
      0.73,
    ]);
    // Superior / inferior articular facets create layered joints between units.
    appendages.push([[side * 0.39, 0.0, -0.54], [side * 0.44, 0.34, -0.62], 0.18, 0.135, 1]);
    appendages.push([[side * 0.44, 0.34, -0.62], [side * 0.42, 0.43, -0.6], 0.135, 0.095, 1]);
    appendages.push([[side * 0.42, -0.06, -0.45], [side * 0.36, -0.35, -0.54], 0.17, 0.11, 1]);
    // Pedicles reach into the ivory body rather than looking attached with bolts.
    appendages.push([[side * 0.47, -0.04, -0.04], [side * 0.6, -0.17, 0.31], 0.18, 0.14, 1.05]);
  }
  appendages.push([[0, -0.02, -0.69], [0, -0.18, -1.01], 0.22, 0.16, 1.28]);
  appendages.push([[0, -0.18, -1.01], [0, -0.4, -1.26 - variant * 0.035], 0.16, 0.06, 0.95]);
  function metal(x, y, z) {
    // Continuous swept ellipses avoid repeated capsule-union ripples in highlights.
    const a = Math.atan2((z + 0.28) / 0.49, x / 0.53);
    let d =
      Math.hypot(
        x - 0.53 * Math.cos(a),
        (y + 0.025 - 0.07 * Math.sin(a)) / 1.48,
        z + 0.28 - 0.49 * Math.sin(a),
      ) - 0.155;
    for (const [a, b, r1, r2, f] of appendages)
      d = smoothUnion(d, segment(x, y, z, a, b, r1, r2, f), 0.15);
    return d;
  }
  function disc(x, y, z) {
    return (
      (Math.pow(
        Math.pow(Math.abs(x / (rx * 0.83)), 2.7) +
          Math.pow(Math.abs(z / (rz * 0.83)), 2.7) +
          Math.pow(Math.abs(y / 0.105), 2.7),
        1 / 2.7,
      ) -
        1) *
      0.105
    );
  }
  return { body, metal, disc };
}

// Marching tetrahedra with analytic-field normals. Consistent cell decomposition
// prevents cracks; triangles are explicitly wound towards the field gradient.
export function surface(field, min, max, step = 0.042) {
  const n = min.map((v, k) => Math.ceil((max[k] - v) / step)),
    stride = (n[0] + 1) * (n[1] + 1);
  const values = new Float32Array(stride * (n[2] + 1));
  const at = (i, j, k) => i + (n[0] + 1) * j + stride * k;
  const point = (i, j, k) => [
    mix(min[0], max[0], i / n[0]),
    mix(min[1], max[1], j / n[1]),
    mix(min[2], max[2], k / n[2]),
  ];
  for (let k = 0; k <= n[2]; k++)
    for (let j = 0; j <= n[1]; j++)
      for (let i = 0; i <= n[0]; i++) values[at(i, j, k)] = field(...point(i, j, k));
  const offsets = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ];
  const tets = [
    [0, 5, 1, 6],
    [0, 1, 2, 6],
    [0, 2, 3, 6],
    [0, 3, 7, 6],
    [0, 7, 4, 6],
    [0, 4, 5, 6],
  ];
  const pos = [],
    nor = [],
    e = 0.001;
  const normal = (p) => {
    const [x, y, z] = p;
    const q = [
      field(x + e, y, z) - field(x - e, y, z),
      field(x, y + e, z) - field(x, y - e, z),
      field(x, y, z + e) - field(x, y, z - e),
    ];
    const l = Math.hypot(...q) || 1;
    return q.map((v) => v / l);
  };
  const tri = (a, b, c) => {
    const na = normal(a),
      nb = normal(b),
      nc = normal(c);
    const u = b.map((v, k) => v - a[k]),
      v = c.map((v, k) => v - a[k]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(...cross) < 1e-10) return;
    const out = cross.reduce((sum, v, k) => sum + v * (na[k] + nb[k] + nc[k]), 0) >= 0;
    pos.push(...a, ...(out ? b : c), ...(out ? c : b));
    nor.push(...na, ...(out ? nb : nc), ...(out ? nc : nb));
  };
  for (let k = 0; k < n[2]; k++)
    for (let j = 0; j < n[1]; j++)
      for (let i = 0; i < n[0]; i++) {
        const ids = offsets.map(([a, b, c]) => at(i + a, j + b, k + c)),
          val = ids.map((id) => values[id]);
        if (val.every((v) => v >= 0) || val.every((v) => v < 0)) continue;
        const pts = offsets.map(([a, b, c]) => point(i + a, j + b, k + c));
        const edge = (a, b) => {
          const t = val[a] / (val[a] - val[b]);
          return pts[a].map((v, k) => mix(v, pts[b][k], t));
        };
        for (const tet of tets) {
          const inside = tet.filter((v) => val[v] < 0),
            outside = tet.filter((v) => val[v] >= 0);
          if (!inside.length || !outside.length) continue;
          if (inside.length === 1) {
            const a = inside[0];
            tri(...outside.map((b) => edge(a, b)));
          } else if (inside.length === 3) {
            const a = outside[0];
            tri(...inside.map((b) => edge(a, b)));
          } else {
            const [a, b] = inside,
              [c, d] = outside,
              A = edge(a, c),
              B = edge(a, d),
              C = edge(b, c),
              D = edge(b, d);
            tri(A, B, C);
            tri(B, D, C);
          }
        }
      }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor) };
}
