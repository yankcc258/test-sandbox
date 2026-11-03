// Original, deterministic observation models for one reusable 288-box instance pool.
// Scientific coordinates live in `data`; poses are their explicitly scaled display.
export const ASSEMBLY_COUNT = 288;
export const MATH_MODEL_IDS = [
  'math',
  'math-integral',
  'math-explog',
  'math-partials',
  'math-complex',
];
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
const fmt = (value, digits = 3) => Number(value.toFixed(digits)).toString();
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
    poses.push({ position, rotation, scale, color, role });
  };
  const line = (a, b, width = 0.018, color = C.ivory, depth = width, role = 'curve') => {
    const d = b.map((v, i) => v - a[i]);
    const length = Math.hypot(...d);
    if (length < 1e-10) {
      poses.push(hidden());
      return;
    }
    box(
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
  const foot = () => {
    box([0, -1.28, -0.03], [2.95, 0.06, 0.27], C.dark);
    box([0, -1.239, 0.08], [2.76, 0.018, 0.03], C.titanium);
    for (const x of [-1.3, 1.3]) {
      box([x, -1.34, -0.04], [0.29, 0.06, 0.43], C.titanium);
      box([x, -1.376, -0.04], [0.23, 0.012, 0.35], C.dark);
      box([x, -1.245, 0.13], [0.055, 0.012, 0.055], C.ceramic);
    }
  };
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
  return { poses, box, line, curve, ring, arrow, foot, axes };
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

function derivative(model, raw) {
  const a = clamp(finite(raw, 0.8), -1.3, 1.3);
  const point = (x) => [0.95 * x, 0.8 * x * x - 0.95, 0.08];
  model.foot();
  model.axes([0, -0.95, -0.06], [-1.5, 1.5], [-1.1, 1.18], 0.475);
  model.curve(point, -1.5, 1.5, 80, 0.037, C.ivory, 0.12);
  // Exact tangent y = a² + 2a(x-a), rather than a sampled secant.
  const tangent = (x) => [0.95 * x, 0.8 * (a * a + 2 * a * (x - a)) - 0.95, 0.17];
  model.curve(
    tangent,
    Math.max(-1.5, a - 0.65),
    Math.min(1.5, a + 0.65),
    28,
    0.022,
    C.lime,
    0.045,
    'tangent',
  );
  const p = point(a);
  model.line([p[0], -0.95, 0], [p[0], p[1], 0], 0.01, C.ice, 0.014, 'projection');
  model.ring([p[0], p[1], 0.22]);
  return {
    metadata: {
      title: '导数与切线斜率',
      description:
        '象牙曲线为 y=x²，黄绿直线为所选点的真实切线。显示横轴 0.95、纵轴 0.8 的独立比例，数值斜率仍为 2a。',
      probeLabel: '切点 a',
      probeMin: -1.3,
      probeMax: 1.3,
      probeStep: 0.05,
      probeDefault: 0.8,
      readout: `a=${fmt(a)} · f(a)=${fmt(a * a)} · f′(a)=${fmt(2 * a)}`,
    },
    data: { a, value: a * a, slope: 2 * a, tangentIntercept: -a * a, displayScale: [0.95, 0.8] },
  };
}
function integral(model, raw) {
  const data = midpointRectangles(raw);
  model.foot();
  model.axes([-1.3, -1, -0.1], [-1.42, 1.42], [-1.08, 1.15], 0.26);
  model.curve((x) => [-1.3 + 2.6 * x, -1 + 2 * x * x, 0.2], 0, 1, 72, 0.028, C.ivory, 0.055);
  // Reserve exactly three slots per possible rectangle, including inactive slots.
  // Every solid rectangle has its actual interval width and midpoint height.
  for (let i = 0; i < 32; i++) {
    const r = data.rectangles[i];
    if (!r) {
      model.poses.push(hidden(), hidden(), hidden());
      continue;
    }
    const x = -1.3 + 2.6 * r.midpoint,
      h = 2 * r.height,
      width = 2.6 / data.n;
    model.box(
      [x, -1 + h / 2, 0.015],
      [width, h, 0.095],
      i % 2 ? C.ceramic : C.titanium,
      [0, 0, 0],
      'midpoint-rectangle',
    );
    model.box([x, -1 + h, 0.075], [width, 0.008, 0.025], C.lime, [0, 0, 0], 'rectangle-top');
    model.box([x, -1.045, 0.09], [0.009, 0.046, 0.035], C.ivory, [0, 0, 0], 'midpoint-tick');
  }
  return {
    metadata: {
      title: '定积分：从小片累积到总量',
      description:
        '固定 y=x²、区间 [0,1]。每片宽 1/n，高度取区间中点；矩形顶边逐渐贴近象牙曲线。这是中点和，不是右端点和。',
      probeLabel: '中点矩形数 n',
      probeMin: 4,
      probeMax: 32,
      probeStep: 1,
      probeDefault: 8,
      readout: `n=${data.n} · 中点和 ${fmt(data.sum, 6)} · 精确值 1/3 · 误差 ${fmt(data.sum - data.exact, 6)}`,
    },
    data,
  };
}
function explog(model, raw) {
  const t = clamp(finite(raw, 0.4), -1.1, 1);
  const map = (x, y, z = 0.08) => [0.7 * x - 0.48, 0.7 * y - 0.48, z];
  model.foot();
  model.axes(map(0, 0, -0.06), [-1.4, 1.65], [-1.4, 1.65], 0.35);
  model.curve((v) => map(v, Math.exp(v), 0.1), -1.2, 1.1, 64, 0.032, C.ivory, 0.095);
  model.curve((v) => map(Math.exp(v), v, 0.04), -1.2, 1.1, 64, 0.029, C.ice, 0.075);
  for (let i = 0; i < 16; i++) {
    const start = -1.2 + (i * 4.25) / 16;
    model.line(
      map(start, start, -0.03),
      map(start + (4.25 / 16) * 0.46, start + (4.25 / 16) * 0.46, -0.03),
      0.009,
      C.titanium,
      0.015,
      'reflection-axis',
    );
  }
  const p = map(t, Math.exp(t), 0.22),
    q = map(Math.exp(t), t, 0.22);
  for (let i = 0; i < 10; i++)
    model.line(
      p.map((v, k) => v + ((q[k] - v) * i) / 10),
      p.map((v, k) => v + ((q[k] - v) * (i + 0.5)) / 10),
      0.009,
      C.lime,
      0.015,
      'inverse-pair',
    );
  model.ring(p, 0.05, C.lime, 10);
  model.ring(q, 0.05, C.lime, 10);
  return {
    metadata: {
      title: '指数、对数与链式法则',
      description:
        '象牙曲线 y=eˣ，冷灰曲线 y=ln x；相同横纵比例使两者关于 y=x 对称。连线两端交换坐标，ln x 仅在 x>0 显示。',
      probeLabel: '指数输入 t',
      probeMin: -1.1,
      probeMax: 1,
      probeStep: 0.05,
      probeDefault: 0.4,
      readout: `e^${fmt(t)}=${fmt(Math.exp(t))} · ln(${fmt(Math.exp(t))})=${fmt(t)}`,
    },
    data: { t, exponential: [t, Math.exp(t)], inverse: [Math.exp(t), t], displayScale: 0.7 },
  };
}
function partials(model, raw) {
  const data = partialObservation(raw);
  const map = (x, y, f = x * x * y) => [2 * (x - 2), 0.12 * (f - 12), 2 * (y - 3)];
  model.foot();
  // Real f=x²y around (2,3), never the earlier saddle. Narrow ceramic scan
  // strips are chords of this exact surface; the center coordinates are fixed.
  const samples = [];
  for (let j = 0; j < 9; j++) {
    const y = 2.5 + j / 8;
    model.curve(
      (x) => map(x, y),
      1.45,
      2.55,
      16,
      0.024,
      j % 2 ? C.ceramic : C.ivory,
      0.15,
      'partial-surface',
    );
    for (let i = 0; i <= 16; i++) {
      const x = 1.45 + (1.1 * i) / 16;
      samples.push({ x, y, f: x * x * y });
    }
  }
  model.curve((x) => map(x, 3), 1.45, 2.55, 18, 0.038, C.lime, 0.026, 'fixed-y-section');
  model.curve((y) => map(2, y), 2.5, 3.5, 12, 0.038, C.ice, 0.026, 'fixed-x-section');
  // A sparse seven-strip tangent plane f=12+12(x-2)+4(y-3).
  // It remains a thin construction surface; no bright translucent rectangle.
  for (let j = 0; j < 7; j++) {
    const y = 2.65 + (j * 0.7) / 6;
    const tangent = (x) => map(x, y, 12 + 12 * (x - 2) + 4 * (y - 3));
    model.line(tangent(1.6), tangent(2.4), 0.008, C.titanium, 0.018, 'tangent-plane');
  }
  for (const x of [1.6, 2.4]) {
    const tangent = (y) => map(x, y, 12 + 12 * (x - 2) + 4 * (y - 3));
    model.line(tangent(2.65), tangent(3.35), 0.012, C.titanium, 0.018, 'tangent-plane');
  }
  const exact = map(data.x, data.y),
    linear = map(data.x, data.y, 12 + data.df),
    origin = map(2, 3);
  model.line(origin, linear, 0.025, C.lime, 0.033, 'differential');
  model.line(linear, exact, 0.034, C.ice, 0.034, 'remainder');
  model.box(exact, [0.055, 0.055, 0.055], C.ivory, [0, 0, Math.PI / 4], 'exact-value');
  model.box(origin, [0.06, 0.06, 0.06], C.lime, [0, 0, Math.PI / 4], 'expansion-point');
  return {
    metadata: {
      title: '偏导数与全微分',
      description:
        '真实曲面 f=x²y；以 (2,3,12) 为显示中心。横向=2(x−2)，纵深=2(y−3)，高度=0.12(f−12)。切面为 12+12(x−2)+4(y−3)；固定 y、固定 x 的截线分别为黄绿与冷灰。',
      probeLabel: '例题步长 t（dx=0.1t，dy=−0.2t）',
      probeMin: 0,
      probeMax: 1,
      probeStep: 0.05,
      probeDefault: 1,
      readout: `t=${fmt(data.fraction)} · df=${fmt(data.df, 4)} · Δf=${fmt(data.delta, 4)} · 高估 ${fmt(data.error, 4)}`,
    },
    data: { ...data, samples, displayScale: [2, 0.12, 2], displayOrigin: [2, 12, 3] },
  };
}
function complex(model, raw) {
  const data = complexObservation(raw);
  const map = (a, b, z = 0.08) => [-0.5 + 0.52 * a, -0.15 + 0.52 * b, z];
  model.foot();
  model.axes(map(0, 0, -0.06), [-1.62, 0.65], [-0.88, 0.97], 0.26);
  // An actual circular unit reference, built from thin ivory segments.
  model.curve(
    (t) => map(Math.cos(t), Math.sin(t), -0.015),
    0,
    Math.PI * 2,
    64,
    0.012,
    C.titanium,
    0.023,
    'unit-circle',
  );
  model.arrow(map(0, 0, 0.14), map(data.a, 1, 0.14), 0.033, C.ivory);
  model.arrow(map(0, 0, 0.24), map(...data.amplitude1, 0.24), 0.027, C.lime);
  const end = map(data.a, 1, 0.09);
  model.line(map(data.a, 0, 0.09), end, 0.009, C.ice, 0.013, 'imaginary-component');
  model.line(map(0, 1, 0.09), end, 0.009, C.ice, 0.013, 'real-component');
  // z₂=1 occupies the positive real axis. Its normalized length is shown on
  // that same axis; the two probabilities belong to orthogonal outcomes.
  model.arrow(map(0, 0, 0.3), map(data.amplitude2[0], 0, 0.3), 0.022, C.ice);
  model.ring(map(data.a, 1, 0.2), 0.047, C.ivory, 10);
  const bottom = -0.98,
    height = 1.72;
  for (let i = 0; i < 2; i++) {
    const x = 0.94 + i * 0.46,
      p = data.probabilities[i],
      color = i ? C.ice : C.lime;
    model.box(
      [x, bottom + height / 2, -0.06],
      [0.3, height, 0.045],
      C.dark,
      [0, 0, 0],
      'probability-scale',
    );
    model.box(
      [x, bottom + (height * p) / 2, 0.04],
      [0.25, height * p, 0.12],
      color,
      [0, 0, 0],
      'probability-bar',
    );
    model.box(
      [x, bottom + height * p, 0.11],
      [0.28, 0.012, 0.045],
      C.ivory,
      [0, 0, 0],
      'probability-cap',
    );
    for (let k = 0; k <= 4; k++)
      model.line(
        [x - 0.19, bottom + (height * k) / 4, 0.05],
        [x - 0.14, bottom + (height * k) / 4, 0.05],
        0.009,
        C.titanium,
        0.015,
        'probability-tick',
      );
    model.box([x, -1.08, 0.08], [0.18, 0.035, 0.1], color, [0, 0, 0], 'outcome-key');
  }
  return {
    metadata: {
      title: '复数、模平方与概率归一化',
      description:
        '左侧象牙箭头 z₁=a+i，黄绿箭头 z₁/√S；冷灰箭头 z₂/√S，固定 z₂=1。右侧两柱以同一 0–1 刻度显示正交结果概率，不表示波的叠加。',
      probeLabel: '实部 a（虚部固定为 1）',
      probeMin: -2,
      probeMax: 2,
      probeStep: 0.05,
      probeDefault: 1,
      readout: `|z₁|²=${fmt(data.weight1)} · S=${fmt(data.total)} · P₁=${fmt(data.probabilities[0], 4)} · P₂=${fmt(data.probabilities[1], 4)} · 和=1`,
    },
    data,
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

export function buildModelPoses(id, probe) {
  const model = builder();
  const functions = {
    math: derivative,
    'math-integral': integral,
    'math-explog': explog,
    'math-partials': partials,
    'math-complex': complex,
  };
  const result = Object.hasOwn(functions, id)
    ? functions[id](model, probe)
    : archive(model, String(id ?? 'archive'));
  if (model.poses.length > ASSEMBLY_COUNT)
    throw new Error(`Assembly exceeds ${ASSEMBLY_COUNT} instances: ${id}`);
  const activeCount = model.poses.filter((p) => p.scale.every((v) => v > 0)).length;
  while (model.poses.length < ASSEMBLY_COUNT) model.poses.push(hidden());
  return {
    poses: model.poses,
    metadata: { interactive: true, ...result.metadata },
    data: { ...result.data, activeCount },
  };
}
