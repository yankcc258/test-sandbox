import { roche, lagrange } from '../roche/binary.js?v=1';

export const ATLAS_MU = 0.35;
export const ATLAS_L1 = lagrange(ATLAS_MU).L1;

// r and z in Schwarzschild radii. From dz/dr = sqrt(g_rr - 1).
// Only one exterior sheet, r >= 1; this is a spatial embedding, not a trajectory.
export function embeddingHeight(r) {
  if (r < 1) return NaN;
  return 2 * Math.sqrt(r - 1);
}

// Display height is a scaled, clipped negative effective potential.
export function potentialHeight(u, w) {
  return Math.max(-4.8, -(roche(u, w, 0, ATLAS_MU) - 1.5) * 1.8);
}

export function atlasGeometry(kind) {
  const vertices = [], faces = [];
  if (kind === 'schwarzschild') {
    const rings = 38, around = 88;
    for (let i = 0; i <= rings; i++) {
      const r = 1 + 5.4 * (i / rings) ** 1.65;
      for (let j = 0; j <= around; j++) {
        const a = j / around * Math.PI * 2;
        vertices.push([r * Math.cos(a), embeddingHeight(r) - 3.5, r * Math.sin(a)]);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < around; j++) {
      const a = i * (around + 1) + j;
      faces.push({ ids: [a, a + 1, a + around + 2, a + around + 1], stripe: i / rings });
    }
  } else {
    const cols = 56, rows = 46;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const u = -1.35 + i / cols * 3, w = -1.18 + j / rows * 2.36;
      vertices.push([u * 3.8, potentialHeight(u, w), w * 3.8]);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      faces.push({ ids: [a, a + 1, a + cols + 2, a + cols + 1], stripe: i / cols });
    }
  }
  return { vertices, faces };
}
