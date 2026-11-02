import * as T from '../vendor/three/three.module.min.js';

export function roundContour(w, h, r, steps = 12) {
  const points = [];
  for (const [x, y, a] of [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, Math.PI * 1.5],
  ])
    for (let i = 0; i <= steps; i++) {
      const t = a + ((i / steps) * Math.PI) / 2;
      points.push(new T.Vector2(x + r * Math.cos(t), y + r * Math.sin(t)));
    }
  return points;
}

export function roundedFace(w, h, r) {
  const geometry = new T.ShapeGeometry(new T.Shape(roundContour(w, h, r)), 16);
  const p = geometry.attributes.position,
    uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return geometry;
}

// Independent XY corner radius and Z edge profile. A thin device can have
// generous plan-view corners without becoming a stack of square plates.
export function profiledShell(levels, { caps = true } = {}) {
  const positions = [],
    uvs = [],
    indices = [],
    n = roundContour(...levels[0].slice(1)).length;
  for (const [z, w, h, r] of levels)
    for (const p of roundContour(w, h, r)) {
      positions.push(p.x, p.y, z);
      uvs.push(p.x / w + 0.5, p.y / h + 0.5);
    }
  for (let l = 0; l < levels.length - 1; l++)
    for (let j = 0; j < n; j++) {
      const a = l * n + j,
        b = l * n + ((j + 1) % n),
        c = a + n,
        d = b + n;
      indices.push(a, b, c, b, d, c);
    }
  if (caps)
    for (const l of [0, levels.length - 1]) {
      const center = positions.length / 3;
      positions.push(0, 0, levels[l][0]);
      uvs.push(0.5, 0.5);
      for (let j = 0; j < n; j++) {
        const a = l * n + j,
          b = l * n + ((j + 1) % n);
        indices.push(...(l === 0 ? [center, b, a] : [center, a, b]));
      }
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function ribbonSupport(points, width = 0.62, thickness = 0.045) {
  const path = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
  const positions = [],
    uvs = [],
    indices = [],
    rings = 44,
    sides = 16;
  const side = new T.Vector3(1, 0, 0),
    normal = new T.Vector3();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings,
      p = path.getPoint(t),
      tangent = path.getTangent(t);
    normal.crossVectors(tangent, side).normalize();
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const v = p
        .clone()
        .addScaledVector(side, width * 0.5 * Math.cos(a))
        .addScaledVector(normal, thickness * 0.5 * Math.sin(a));
      positions.push(v.x, v.y, v.z);
      uvs.push(j / sides, t);
      if (i < rings) {
        const k = i * sides + j,
          next = i * sides + ((j + 1) % sides);
        indices.push(k, next, k + sides, next, next + sides, k + sides);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function attach(parent, name, geometry, material, pos = [0, 0, 0]) {
  const mesh = new T.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function flat(parent, name, dimensions, r, material, z) {
  const m = attach(parent, name, roundedFace(...dimensions, r), material, [0, 0, z]);
  m.castShadow = false;
  return m;
}

export function tabletShell(tablet, screenTex, m) {
  attach(
    tablet,
    'tablet-unibody',
    profiledShell([
      [-0.085, 3.02, 1.78, 0.16],
      [-0.065, 3.13, 1.89, 0.17],
      [-0.032, 3.2, 1.96, 0.18],
      [0.0, 3.2, 1.96, 0.18],
      [0.019, 3.175, 1.935, 0.17],
    ]),
    m.satin,
  );
  flat(tablet, 'tablet-glass-seal', [3.162, 1.922], 0.165, m.rubber, 0.021);
  flat(tablet, 'tablet-cover-glass', [3.14, 1.9], 0.155, m.dark, 0.026);
  flat(
    tablet,
    'tablet-display',
    [2.92, 1.67],
    0.065,
    new T.MeshBasicMaterial({ map: screenTex }),
    0.027,
  );
  const coating = flat(tablet, 'tablet-optical-coating', [3.14, 1.9], 0.155, m.screenGlass, 0.029);
  coating.material = coating.material.clone();
  coating.material.opacity = 0.065;
  coating.material.roughness = 0.12;
  coating.receiveShadow = false;
  const lens = attach(
    tablet,
    'camera-lens',
    new T.CircleGeometry(0.014, 32),
    m.satin,
    [0, 0.899, 0.03],
  );
  lens.castShadow = false;
  const lensInside = attach(
    tablet,
    'camera-pupil',
    new T.CircleGeometry(0.008, 24),
    m.dark,
    [0, 0.899, 0.031],
  );
  lensInside.castShadow = false;
  const led = attach(
    tablet,
    'tablet-led',
    new T.CircleGeometry(0.004, 16),
    m.accent,
    [0.074, 0.899, 0.03],
  );
  led.castShadow = false;
  const button = attach(
    tablet,
    'tablet-side-key',
    profiledShell([
      [-0.01, 0.16, 0.036, 0.017],
      [0.01, 0.16, 0.036, 0.017],
    ]),
    m.titanium,
    [1.596, 0.43, -0.018],
  );
  button.rotation.y = Math.PI / 2;
  // Tiny holes on the metal edge, not an ornamental row of protruding blocks.
  for (let i = 0; i < 8; i++) {
    const port = attach(tablet, 'speaker-perforation', new T.CircleGeometry(0.005, 10), m.dark, [
      -0.21 + i * 0.06,
      -0.969,
      -0.025,
    ]);
    port.rotation.x = Math.PI / 2;
    port.castShadow = false;
  }
}

export function instrumentCase(specimen, m, { curve, label, fastener }) {
  const base = attach(
    specimen,
    'case-cast-base',
    profiledShell([
      [0, 1.53, 1.18, 0.16],
      [0.035, 1.65, 1.3, 0.18],
      [0.105, 1.72, 1.37, 0.19],
      [0.19, 1.7, 1.35, 0.18],
      [0.24, 1.6, 1.25, 0.16],
    ]),
    m.ivory,
  );
  base.rotation.x = -Math.PI / 2;
  const seat = attach(
    specimen,
    'case-glass-seat',
    profiledShell([
      [0.239, 1.58, 1.23, 0.16],
      [0.257, 1.58, 1.23, 0.16],
    ]),
    m.satin,
  );
  seat.rotation.x = -Math.PI / 2;
  const sleeve = attach(
    specimen,
    'case-formed-glass',
    profiledShell(
      [
        [0.26, 1.54, 1.19, 0.17],
        [1.87, 1.54, 1.19, 0.17],
      ],
      { caps: false },
    ),
    m.glass,
  );
  sleeve.rotation.x = -Math.PI / 2;
  sleeve.castShadow = false;
  sleeve.receiveShadow = false;
  sleeve.material = sleeve.material.clone();
  sleeve.material.opacity = 0.18;
  sleeve.material.envMapIntensity = 1.2;
  const edgeMaterial = m.glass.clone();
  edgeMaterial.opacity = 0.42;
  edgeMaterial.color.set('#b4c8bf');
  for (const x of [-0.72, 0.72]) {
    const edge = curve(
      specimen,
      [
        [x, 0.28, 0.54],
        [x, 1.84, 0.54],
      ],
      0.006,
      edgeMaterial,
    );
    edge.castShadow = false;
  }
  const crown = attach(
    specimen,
    'case-cast-crown',
    profiledShell([
      [1.855, 1.57, 1.22, 0.17],
      [1.875, 1.68, 1.33, 0.2],
      [1.94, 1.67, 1.32, 0.2],
      [1.966, 1.56, 1.21, 0.17],
    ]),
    m.satin,
  );
  crown.rotation.x = -Math.PI / 2;
  // Front has uninterrupted glass; two rear ribs carry the lid and wiring.
  for (const x of [-0.65, 0.65]) {
    curve(
      specimen,
      [
        [x, 0.2, -0.51],
        [x, 0.35, -0.54],
        [x, 1.72, -0.54],
        [x, 1.92, -0.48],
      ],
      0.024,
      m.titanium,
    );
    fastener(specimen, x, 0.12, 0.63, 0.022);
  }
  const inset = flat(specimen, 'case-identification', [0.82, 0.068], 0.016, m.dark, 0.68);
  inset.position.y = 0.124;
  label(specimen, 'M–01  /  MANIFOLD', -0.37, 0.12, 0.685, 0.7, '#9aaca4');
  const status = attach(
    specimen,
    'case-status',
    new T.CircleGeometry(0.012, 20),
    m.accent,
    [0.57, 0.12, 0.652],
  );
  status.castShadow = false;
  const diffuser = attach(
    specimen,
    'case-inspection-light',
    roundedFace(1.18, 0.56, 0.22),
    m.light,
    [0, 1.859, 0],
  );
  diffuser.rotation.x = Math.PI / 2;
  diffuser.castShadow = false;
  const light = new T.PointLight('#e0e7d4', 0.75, 2.3, 2);
  light.position.set(0, 1.75, 0.15);
  specimen.add(light);
  // The inspection seal is etched into the glass, with a discreet finger pull.
  curve(
    specimen,
    [
      [0.57, 0.39, 0.595],
      [0.57, 1.59, 0.595],
    ],
    0.003,
    m.satin,
  );
  curve(
    specimen,
    [
      [0.59, 0.9, 0.6],
      [0.62, 0.92, 0.645],
      [0.62, 1.08, 0.645],
      [0.59, 1.1, 0.6],
    ],
    0.008,
    m.titanium,
  );
  label(specimen, 'STRUCTURE / 01', -0.49, 1.69, 0.603, 0.66, '#78958d');
}

function linkPlate(parent, a, b, width, depth, m, offset = 0) {
  const start = new T.Vector3(...a),
    end = new T.Vector3(...b),
    d = end.clone().sub(start),
    length = d.length();
  const shape = new T.Shape(roundContour(width, length + width, width / 2 - 0.001, 16));
  if (length > 0.35)
    shape.holes.push(
      new T.Path(roundContour(width * 0.37, length - width * 1.45, width * 0.18, 16).reverse()),
    );
  const geo = new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.007,
    bevelSegments: 3,
    curveSegments: 16,
    steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  const plate = attach(parent, 'lamp-machined-link', geo, m);
  plate.position.copy(start.add(end).multiplyScalar(0.5));
  plate.position.z += offset;
  plate.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  return plate;
}

export function taskLamp(lamp, m, { curve, fastener }) {
  const base = attach(
    lamp,
    'lamp-weighted-base',
    new T.LatheGeometry(
      [
        [0, 0.014],
        [0.27, 0.014],
        [0.36, 0.035],
        [0.385, 0.072],
        [0.383, 0.09],
        [0.36, 0.12],
        [0.27, 0.135],
        [0.1, 0.135],
        [0.08, 0.18],
        [0, 0.18],
      ].map((p) => new T.Vector2(...p)),
      72,
    ),
    m.satin,
  );
  const trim = attach(
    lamp,
    'lamp-base-trim',
    new T.TorusGeometry(0.37, 0.006, 8, 72),
    m.titanium,
    [0, 0.099, 0],
  );
  trim.rotation.x = Math.PI / 2;
  const a = [0, 0.2, 0],
    b = [0.1, 1.2, -0.23],
    c = [0.74, 1.63, -0.49];
  for (const offset of [-0.046, 0.046]) {
    linkPlate(lamp, a, b, 0.13, 0.022, m.satin, offset);
    linkPlate(lamp, b, c, 0.105, 0.022, m.titanium, offset);
  }
  for (const [x, y, z] of [a, b, c]) {
    const pivot = attach(
      lamp,
      'lamp-bearing',
      new T.CylinderGeometry(0.073, 0.073, 0.15, 48),
      m.satin,
      [x, y, z],
    );
    pivot.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const washer = attach(
        lamp,
        'lamp-bearing-washer',
        new T.CylinderGeometry(0.052, 0.052, 0.009, 48),
        m.titanium,
        [x, y, z + side * 0.079],
      );
      washer.rotation.x = Math.PI / 2;
    }
    fastener(lamp, x, y, z + 0.085, 0.022);
  }
  curve(
    lamp,
    [
      [0, 0.14, -0.09],
      [-0.015, 0.44, -0.13],
      [0.03, 1.14, -0.3],
      [0.16, 1.23, -0.32],
      [0.74, 1.62, -0.56],
    ],
    0.007,
    m.rubber,
  );
  const head = new T.Group();
  head.position.set(0.6, 1.68, -0.5);
  head.rotation.x = -Math.PI / 2;
  lamp.add(head);
  attach(
    head,
    'lamp-cast-head',
    profiledShell([
      [-0.055, 1.54, 0.23, 0.113],
      [-0.035, 1.63, 0.28, 0.135],
      [0.02, 1.63, 0.28, 0.135],
      [0.045, 1.55, 0.23, 0.113],
    ]),
    m.satin,
  );
  const diffuser = flat(head, 'lamp-opal-diffuser', [1.43, 0.164], 0.079, m.light, -0.058);
  diffuser.material = diffuser.material.clone();
  diffuser.material.side = T.DoubleSide;
  const emitters = new T.Group();
  head.add(emitters);
  emitters.add(diffuser);
  const edgeDiffuser = new T.Mesh(roundedFace(1.38, 0.025, 0.012), diffuser.material);
  edgeDiffuser.rotation.x = Math.PI / 2;
  edgeDiffuser.position.set(0, -0.141, -0.012);
  emitters.add(edgeDiffuser);
  const rim = flat(head, 'lamp-upper-inlay', [1.43, 0.14], 0.068, m.graphite, 0.046);
  const switchDisc = attach(
    lamp,
    'lamp-touch-control',
    new T.CircleGeometry(0.035, 32),
    m.dark,
    [0.23, 0.133, 0.06],
  );
  switchDisc.rotation.x = -Math.PI / 2;
  return emitters;
}
