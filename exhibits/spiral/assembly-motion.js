const clamp = (t) => Math.max(0, Math.min(1, t));
export const soften = (t) => {
  t = clamp(t);
  return t * t * t * (10 + t * (-15 + 6 * t));
};
// Quintic Hermite, with specified endpoint velocities and zero endpoint acceleration.
export function sampleLeg(start, end, velocity, endVelocity, seconds, elapsed, bend, out) {
  const t = clamp(elapsed / seconds),
    t2 = t * t,
    t3 = t2 * t,
    t4 = t3 * t,
    t5 = t4 * t;
  const h = 10 * t3 - 15 * t4 + 6 * t5,
    dh = 30 * t2 - 60 * t3 + 30 * t4;
  const a = t - 6 * t3 + 8 * t4 - 3 * t5,
    da = 1 - 18 * t2 + 32 * t3 - 15 * t4;
  const b = -4 * t3 + 7 * t4 - 3 * t5,
    db = -12 * t2 + 28 * t3 - 15 * t4;
  const bump = 64 * t3 * (1 - t) ** 3,
    dbump = 192 * t2 * (1 - t) ** 2 * (1 - 2 * t);
  for (let k = 0; k < 3; k++) {
    out.p[k] =
      start[k] +
      (end[k] - start[k]) * h +
      seconds * (velocity[k] * a + endVelocity[k] * b) +
      bend[k] * bump;
    out.v[k] =
      ((end[k] - start[k]) * dh) / seconds +
      velocity[k] * da +
      endVelocity[k] * db +
      (bend[k] * dbump) / seconds;
  }
  out.progress = h;
  return out;
}
const still = [0, 0, 0];
export function createFlight({
  start,
  end,
  velocity = still,
  index = 0,
  count = 288,
  duration = 1.18,
  curved = true,
  via = null,
  unfold = false,
}) {
  const moving = Math.hypot(...velocity) > 0.001;
  const distance = Math.hypot(...end.map((v, k) => v - start[k]));
  const phase = index / Math.max(1, count - 1),
    lift = curved ? Math.min(0.28, distance * 0.12) : 0;
  return {
    start: [...start],
    end: [...end],
    velocity: [...velocity],
    duration,
    delay: !curved || moving ? 0 : phase * (unfold ? 0.34 : 0.2),
    bend: [
      unfold ? Math.sin(phase * Math.PI * 2) * lift * 0.4 : 0,
      lift * (0.75 + 0.25 * Math.sin(phase * Math.PI * 2)),
      lift * 0.65,
    ],
    via: via ? [...via] : null,
    through: via
      ? [
          ((end[0] - start[0]) * 0.22) / duration,
          -0.55 + ((end[1] - start[1]) * 0.16) / duration,
          0.25,
        ]
      : null,
  };
}
export function sampleFlight(path, elapsed, out = { p: [0, 0, 0], v: [0, 0, 0], progress: 0 }) {
  const time = elapsed - path.delay;
  if (time <= 0) {
    for (let k = 0; k < 3; k++) {
      out.p[k] = path.start[k];
      out.v[k] = time < 0 ? 0 : path.velocity[k];
    }
    out.progress = 0;
    return out;
  }
  if (time >= path.duration) {
    for (let k = 0; k < 3; k++) {
      out.p[k] = path.end[k];
      out.v[k] = 0;
    }
    out.progress = 1;
    return out;
  }
  if (path.via) {
    const split = path.duration * 0.4;
    if (time < split)
      sampleLeg(path.start, path.via, path.velocity, path.through, split, time, still, out);
    else
      sampleLeg(
        path.via,
        path.end,
        path.through,
        still,
        path.duration - split,
        time - split,
        path.bend,
        out,
      );
    out.progress = soften(time / path.duration);
    return out;
  }
  return sampleLeg(path.start, path.end, path.velocity, still, path.duration, time, path.bend, out);
}
// Compatibility for the prior endpoint checks and isolated prototypes.
export function flightProgress(elapsed, index, count, duration = 1.12) {
  return soften((elapsed - (count <= 1 ? 0 : (index / (count - 1)) * 0.25)) / duration);
}
export function flightPosition(start, end, t, seed = 0) {
  if (t <= 0) return [...start];
  if (t >= 1) return [...end];
  const arc = Math.sin(seed * 0.08) * 0.08 + 0.16;
  return start.map(
    (v, k) =>
      v + (end[k] - v) * t + (k === 1 ? arc : k === 2 ? arc * 0.5 : 0) * 64 * t ** 3 * (1 - t) ** 3,
  );
}
