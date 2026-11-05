// Original, deterministic observation models for one reusable 288-box instance pool.
// Scientific coordinates live in `data`; poses are their explicitly scaled display.
import { createModelDetails } from './model-details.js';
// 露娜：其他学科的观察模型用「积木 + 配方」生成，见 specimen-kit.js / specimen-recipes.js
import { buildRecipe } from './specimen-kit.js?v=40';
import { COURSES, getCourse } from './course-data.js?v=40';
export const ASSEMBLY_COUNT = 288;
export const MATH_MODEL_IDS = COURSES.filter((c) => c.observation?.category === 'mathematics').map(
  (c) => c.id,
);
const C = {
  ivory: '#d9d5c8',
  ceramic: '#a5aca3',
  titanium: '#65736e',
  dark: '#35413f',
  lime: '#bdcc8e',
  ice: '#8faeb4',
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const hidden = () => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [0, 0, 0],
  color: C.dark,
  role: 'unused',
});
function builder() {
  const poses = [];
  const box = (position, scale, color = C.ivory, rotation = [0, 0, 0], role = 'structure') => {
    const pose = { position, rotation, scale, color, role };
    poses.push(pose);
    return pose;
  };
  const line = (a, b, width = 0.018, color = C.ivory, depth = width, role = 'curve') => {
    const d = b.map((v, i) => v - a[i]);
    const length = Math.hypot(...d);
    if (length < 1e-10) {
      poses.push(hidden());
      return;
    }
    return box(
      a.map((v, i) => (v + b[i]) / 2),
      [length, width, depth],
      color,
      [0, Math.atan2(-d[2], d[0]), Math.asin(clamp(d[1] / length, -1, 1))],
      role,
    );
  };
  const curve = (
    fn,
    from,
    to,
    count,
    width = 0.025,
    color = C.ivory,
    depth = width,
    role = 'curve',
  ) => {
    for (let i = 0; i < count; i++)
      line(
        fn(from + ((to - from) * i) / count),
        fn(from + ((to - from) * (i + 1)) / count),
        width,
        color,
        depth,
        role,
      );
  };
  const ring = (center, radius = 0.055, color = C.lime, count = 12) => {
    curve(
      (t) => [center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t), center[2]],
      0,
      Math.PI * 2,
      count,
      0.012,
      color,
      0.028,
      'probe-ring',
    );
  };
  const arrow = (a, b, width = 0.03, color = C.lime) => {
    line(a, b, width, color, width * 1.4, 'vector');
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (const side of [-1, 1])
      line(
        b,
        [
          b[0] - 0.14 * Math.cos(angle) + side * 0.07 * Math.sin(angle),
          b[1] - 0.14 * Math.sin(angle) - side * 0.07 * Math.cos(angle),
          b[2],
        ],
        width * 0.7,
        color,
        width,
        'arrowhead',
      );
  };
  const details = createModelDetails({ box, line });
  let base;
  const foot = (level) => (base = details.foot(level));
  const axes = (origin, xRange, yRange, unit = 0.5) => {
    line(
      [xRange[0], origin[1], origin[2]],
      [xRange[1], origin[1], origin[2]],
      0.014,
      C.titanium,
      0.028,
      'axis',
    );
    line(
      [origin[0], yRange[0], origin[2]],
      [origin[0], yRange[1], origin[2]],
      0.014,
      C.titanium,
      0.028,
      'axis',
    );
    for (
      let x = origin[0] + Math.ceil((xRange[0] - origin[0]) / unit) * unit;
      x <= xRange[1] + 1e-8;
      x += unit
    )
      line(
        [x, origin[1] - 0.032, origin[2]],
        [x, origin[1] + 0.032, origin[2]],
        0.009,
        C.ceramic,
        0.015,
        'tick',
      );
    for (
      let y = origin[1] + Math.ceil((yRange[0] - origin[1]) / unit) * unit;
      y <= yRange[1] + 1e-8;
      y += unit
    )
      line(
        [origin[0] - 0.032, y, origin[2]],
        [origin[0] + 0.032, y, origin[2]],
        0.009,
        C.ceramic,
        0.015,
        'tick',
      );
  };
  return {
    poses,
    box,
    line,
    curve,
    ring,
    arrow,
    foot,
    axes,
    details,
    get base() {
      return base;
    },
  };
}

export function midpointRectangles(count) {
  const n = Math.round(clamp(finite(count, 8), 4, 32));
  const rectangles = Array.from({ length: n }, (_, i) => {
    const left = i / n,
      right = (i + 1) / n,
      midpoint = (left + right) / 2;
    return { left, right, midpoint, height: midpoint ** 2, area: midpoint ** 2 / n };
  });
  return { n, rectangles, sum: rectangles.reduce((a, r) => a + r.area, 0), exact: 1 / 3 };
}
export function partialObservation(t = 1) {
  const fraction = clamp(finite(t, 1), 0, 1);
  const x = 2 + 0.1 * fraction,
    y = 3 - 0.2 * fraction;
  const df = 12 * (x - 2) + 4 * (y - 3),
    delta = x * x * y - 12;
  return {
    fraction,
    x,
    y,
    value: x * x * y,
    base: 12,
    fx: 12,
    fy: 4,
    df,
    delta,
    error: df - delta,
  };
}
export function complexObservation(real = 1) {
  const a = clamp(finite(real, 1), -2, 2),
    b = 1;
  const weight1 = a * a + b * b,
    weight2 = 1,
    total = weight1 + weight2;
  return {
    a,
    b,
    weight1,
    weight2,
    total,
    amplitude1: [a / Math.sqrt(total), b / Math.sqrt(total)],
    amplitude2: [1 / Math.sqrt(total), 0],
    probabilities: [weight1 / total, weight2 / total],
  };
}

function archive(model, id) {
  model.foot();
  // A labelled-in-HTML archive carrier, not a fabricated scientific simulation.
  for (let layer = 0; layer < 7; layer++) {
    const z = (layer - 3) * 0.13,
      tilt = (layer - 3) * 0.025;
    for (let strip = 0; strip < 16; strip++) {
      const x = -0.96 + strip * 0.128;
      model.box(
        [x, 0.05 + Math.sin((strip / 15) * Math.PI) * 0.13, z],
        [0.115, 1.45, 0.027],
        layer === 3 ? C.ivory : C.ceramic,
        [0, tilt, 0],
        'archive-leaf',
      );
    }
  }
  for (const y of [-0.74, 0.92]) model.box([0, y, 0], [2.24, 0.065, 1.06], C.titanium);
  for (const x of [-1.06, 1.06]) {
    model.box([x, -0.88, 0], [0.075, 0.67, 0.2], C.dark);
    model.box([x, 0.1, 0], [0.035, 1.59, 0.08], C.titanium);
  }
  model.box([0, -0.8, 0.555], [0.58, 0.035, 0.02], C.lime);
  return {
    metadata: {
      title: '课程档案标本',
      description:
        '中性的分层档案载体，用于课程目录与阅读入口；本章尚未制作专属科学观察模型，不把它解释为分子、实验或物理模拟。',
      probeLabel: '无专属互动',
      probeMin: 0,
      probeMax: 1,
      probeStep: 1,
      probeDefault: 0,
      interactive: false,
      readout: '内容档案预览 · 非专属互动',
    },
    data: { id, kind: 'archive' },
  };
}

export function buildModelPoses(id, probe, recipe = getCourse(id)?.observation) {
  const model = builder();
  const result = recipe
    ? buildRecipe(model, recipe, probe)
    : archive(model, String(id ?? 'archive'));
  if (model.poses.length > ASSEMBLY_COUNT)
    throw new Error(`Assembly exceeds ${ASSEMBLY_COUNT} instances: ${id}`);
  const activeCount = model.poses.filter((p) => p.scale.every((v) => v > 0)).length;
  while (model.poses.length < ASSEMBLY_COUNT) model.poses.push(hidden());
  return {
    poses: model.poses,
    metadata: { interactive: true, contactY: model.base.contactY, ...result.metadata },
    data: { ...result.data, activeCount },
  };
}
