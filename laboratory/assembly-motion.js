export function flightProgress(elapsed, index, count, duration = 1.12) {
  const delay = count <= 1 ? 0 : (index / (count - 1)) * 0.25;
  const t = Math.max(0, Math.min(1, (elapsed - delay) / duration));
  return t * t * (3 - 2 * t);
}
export function flightPosition(start, end, t, seed = 0) {
  const s = 1 - t,
    arc = Math.sin(seed * 2.399) * 0.24 + 0.42;
  const c1 = [start[0] + (end[0] - start[0]) * 0.28, start[1] + arc, start[2] + 0.2];
  const c2 = [end[0] - (end[0] - start[0]) * 0.2, end[1] + arc * 0.65, end[2] - 0.12];
  return start.map(
    (v, i) => s * s * s * v + 3 * s * s * t * c1[i] + 3 * s * t * t * c2[i] + t * t * t * end[i],
  );
}
