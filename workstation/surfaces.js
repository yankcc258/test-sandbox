import * as T from '../vendor/three/three.module.min.js';

// Broad reflected windows and narrow equipment-room strips, instead of a
// uniformly bright environment. Baked once into the shared reflection map.
export function createStudioEnvironment() {
  const studio = new T.Scene();
  studio.background = new T.Color(0.055, 0.07, 0.076);
  for (const [position, size, color] of [
    [
      [-3, 5, 4],
      [5, 4],
      [3.6, 3.85, 3.7],
    ],
    [
      [4, 3, 1],
      [1.2, 6],
      [1.6, 2.0, 2.1],
    ],
    [
      [0, 3, -5],
      [6, 2.7],
      [1.05, 1.4, 1.6],
    ],
    [
      [0, 7, 0],
      [4, 3],
      [2.5, 2.6, 2.35],
    ],
  ]) {
    const panel = new T.Mesh(
      new T.PlaneGeometry(...size),
      new T.MeshBasicMaterial({ color: new T.Color(...color), side: T.DoubleSide }),
    );
    panel.position.set(...position);
    panel.lookAt(0, 1, 0);
    studio.add(panel);
  }
  return studio;
}

// Original, deterministic micro-surfaces. Shared small maps stay in GPU memory;
// these are material response maps, not image backgrounds or external assets.
function surface(kind, base, amplitude, repeat = 1) {
  const size = 256,
    canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'),
    pixels = ctx.createImageData(size, size);
  let seed = 7819;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = Array.from({ length: size }, () => random() - 0.5);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let grain = random() - 0.5;
      if (kind === 'brushed') grain = rows[y] * 0.8 + grain * 0.2;
      if (kind === 'woven') grain = (x % 4 < 2 === y % 4 < 2 ? 0.32 : -0.32) + grain * 0.22;
      const value = Math.round(base + grain * amplitude),
        i = (y * size + x) * 4;
      pixels.data.set([value, value, value, 255], i);
    }
  ctx.putImageData(pixels, 0, 0);
  const map = new T.CanvasTexture(canvas);
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.anisotropy = 4;
  return map;
}

export function createMaterials() {
  const grain = surface('grain', 128, 32, 3);
  const brushed = surface('brushed', 145, 45, 3);
  const weave = surface('woven', 150, 60, 4);
  const paperGrain = surface('grain', 180, 24, 2);
  return {
    graphite: new T.MeshStandardMaterial({
      color: '#293033',
      roughness: 0.78,
      metalness: 0.16,
      bumpMap: grain,
      bumpScale: 0.008,
    }),
    desk: new T.MeshStandardMaterial({
      color: '#343d3e',
      roughness: 0.58,
      metalness: 0.18,
      bumpMap: grain,
      bumpScale: 0.0025,
    }),
    dark: new T.MeshStandardMaterial({ color: '#111718', roughness: 0.72, metalness: 0.14 }),
    rubber: new T.MeshStandardMaterial({
      color: '#111a1c',
      roughness: 0.94,
      bumpMap: grain,
      bumpScale: 0.005,
    }),
    ivory: new T.MeshPhysicalMaterial({
      color: '#d4d4c6',
      roughness: 0.43,
      metalness: 0.02,
      clearcoat: 0.12,
      clearcoatRoughness: 0.5,
      bumpMap: grain,
      bumpScale: 0.0007,
    }),
    titanium: new T.MeshStandardMaterial({
      color: '#9daaa8',
      roughness: 0.42,
      metalness: 0.88,
      bumpMap: brushed,
      bumpScale: 0.0005,
    }),
    satin: new T.MeshStandardMaterial({
      color: '#525f60',
      roughness: 0.36,
      metalness: 0.8,
      bumpMap: brushed,
      bumpScale: 0.0007,
    }),
    green: new T.MeshStandardMaterial({
      color: '#31453e',
      roughness: 0.68,
      metalness: 0.16,
      bumpMap: grain,
      bumpScale: 0.004,
    }),
    paper: new T.MeshStandardMaterial({
      color: '#c8ccbd',
      roughness: 0.98,
      bumpMap: paperGrain,
      bumpScale: 0.003,
      side: T.DoubleSide,
    }),
    fabric: new T.MeshStandardMaterial({
      color: '#4a5550',
      roughness: 0.96,
      bumpMap: weave,
      bumpScale: 0.012,
    }),
    light: new T.MeshBasicMaterial({ color: '#e4e9dc', toneMapped: false }),
    accent: new T.MeshBasicMaterial({ color: '#c9df76', toneMapped: false }),
    glass: new T.MeshPhysicalMaterial({
      color: '#8caaa5',
      transparent: true,
      opacity: 0.12,
      roughness: 0.12,
      metalness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      depthWrite: false,
      side: T.DoubleSide,
      envMapIntensity: 0.7,
    }),
    screenGlass: new T.MeshPhysicalMaterial({
      color: '#73928b',
      transparent: true,
      opacity: 0.13,
      roughness: 0.17,
      metalness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      depthWrite: false,
      envMapIntensity: 0.6,
    }),
  };
}

export function roundedBox(w, h, d, radius = 0.04, segments = 3) {
  const r = Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const geometry = new T.BoxGeometry(w, h, d, segments * 2, segments * 2, segments * 2);
  const positions = geometry.attributes.position,
    normals = geometry.attributes.normal;
  const p = new T.Vector3(),
    nearest = new T.Vector3(),
    normal = new T.Vector3();
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    nearest.set(
      T.MathUtils.clamp(p.x, -w / 2 + r, w / 2 - r),
      T.MathUtils.clamp(p.y, -h / 2 + r, h / 2 - r),
      T.MathUtils.clamp(p.z, -d / 2 + r, d / 2 - r),
    );
    normal.copy(p).sub(nearest).normalize();
    p.copy(nearest).addScaledVector(normal, r);
    positions.setXYZ(i, p.x, p.y, p.z);
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  return geometry;
}

// Closed rounded cross-section, with the half-twist seam joined at the opposite
// profile sample. Unlike a double-sided plane this has real edge thickness.
export function manifoldGeometry() {
  const positions = [],
    indices = [],
    uvs = [],
    rings = 128,
    sides = 20;
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < sides; j++) {
      const u = (i / rings) * Math.PI * 2,
        t = (j / sides) * Math.PI * 2;
      const v = 0.255 * Math.cos(t),
        n = 0.027 * Math.sin(t);
      const radial = 0.48 + v * Math.cos(u / 2) - n * Math.sin(u / 2);
      positions.push(
        radial * Math.cos(u),
        radial * Math.sin(u),
        v * Math.sin(u / 2) + n * Math.cos(u / 2),
      );
      uvs.push(i / rings, j / sides);
      const a = i * sides + j,
        b = i * sides + ((j + 1) % sides);
      const next = (i + 1) % rings,
        shift = i === rings - 1 ? sides / 2 : 0;
      const c = next * sides + ((j + shift) % sides),
        d = next * sides + ((j + 1 + shift) % sides);
      indices.push(a, c, b, b, c, d);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
