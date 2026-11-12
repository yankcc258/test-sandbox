// 标本积木与配方（露娜，2026-11-04）。
// 以后加一章观察模型，不再写三维代码，只在 specimen-recipes.js 里写一份「配方」：
// 用到哪些积木（坐标轴、曲线、薄片、参考线、墙、能级、驻波……）、公式是什么、滑杆调哪个量、读数怎么写。
// 公式用一个很小的、只认数学的解析器计算（不用 eval / Function），所以配方是纯数据，可以放进课程资料，
// 也可以先让 AI 起草再交给检查脚本核对（scripts/check-specimen-kit.mjs 会拿这一章的原题答案对一遍）。
// 产出的构件格式和 assembly-models.js 的数学模型完全一样，流星组装、环和入口照常使用。

// ---------- 公式 ----------
// 支持：数字、变量、+ - * / ^、括号、比较（< > <= >= == !=，结果 1 / 0）、条件 a ? b : c，
// 函数 exp ln log10 sqrt abs sin cos tan min max floor round，常数 pi、e，以及配方里定义的函数。
const FUNCS = {
  atan2: Math.atan2,
  exp: Math.exp,
  ln: Math.log,
  log10: Math.log10,
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  round: Math.round,
};
const CONSTS = { pi: Math.PI, e: Math.E };
const cache = new Map();
function tokenize(src) {
  const out = [],
    re =
      /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(<=|>=|==|!=|[-+*/^(),<>?:]))/y;
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < src.length) {
    if (/^\s*$/.test(src.slice(re.lastIndex))) break;
    if (!(m = re.exec(src)))
      throw new SyntaxError(`看不懂的公式片段：「${src.slice(re.lastIndex)}」`);
    out.push(
      m[1] ? { t: 'num', v: Number(m[1]) } : m[2] ? { t: 'id', v: m[2] } : { t: 'op', v: m[3] },
    );
  }
  return out;
}
export function compile(src) {
  src = String(src);
  if (cache.has(src)) return cache.get(src);
  const toks = tokenize(src);
  let i = 0;
  const peek = (v) => toks[i]?.t === 'op' && toks[i].v === v;
  const take = (v) => {
    if (!peek(v)) throw new SyntaxError(`公式「${src}」这里缺少「${v}」`);
    i++;
  };
  // 逐层：条件 → 比较 → 加减 → 乘除 → 负号 → 乘方 → 基本项
  function ternary() {
    const c = compare();
    if (!peek('?')) return c;
    i++;
    const a = ternary();
    take(':');
    const b = ternary();
    return (s) => (c(s) ? a(s) : b(s));
  }
  function compare() {
    let a = sum();
    while (['<', '>', '<=', '>=', '==', '!='].some(peek)) {
      const op = toks[i++].v,
        l = a,
        r = sum();
      a = {
        '<': (s) => +(l(s) < r(s)),
        '>': (s) => +(l(s) > r(s)),
        '<=': (s) => +(l(s) <= r(s)),
        '>=': (s) => +(l(s) >= r(s)),
        '==': (s) => +(Math.abs(l(s) - r(s)) < 1e-9),
        '!=': (s) => +(Math.abs(l(s) - r(s)) >= 1e-9),
      }[op];
    }
    return a;
  }
  function sum() {
    let a = product();
    while (peek('+') || peek('-')) {
      const op = toks[i++].v,
        l = a,
        r = product();
      a = op === '+' ? (s) => l(s) + r(s) : (s) => l(s) - r(s);
    }
    return a;
  }
  function product() {
    let a = unary();
    while (peek('*') || peek('/')) {
      const op = toks[i++].v,
        l = a,
        r = unary();
      a = op === '*' ? (s) => l(s) * r(s) : (s) => l(s) / r(s);
    }
    return a;
  }
  // 负号比乘方松：-2^2 = -(2^2) = -4，和数学书上的写法一致；指数里可以再带负号：2^-1
  function unary() {
    if (peek('-')) {
      i++;
      const a = unary();
      return (s) => -a(s);
    }
    if (peek('+')) {
      i++;
      return unary();
    }
    return power();
  }
  function power() {
    const base = atom();
    if (!peek('^')) return base;
    i++;
    const ex = unary(); // 右结合：2^3^2 = 2^9
    return (s) => base(s) ** ex(s);
  }
  function atom() {
    const tk = toks[i++];
    if (!tk) throw new SyntaxError(`公式「${src}」没写完`);
    if (tk.t === 'num') return () => tk.v;
    if (tk.t === 'op' && tk.v === '(') {
      const a = ternary();
      take(')');
      return a;
    }
    if (tk.t !== 'id') throw new SyntaxError(`公式「${src}」里多了「${tk.v}」`);
    const name = tk.v;
    if (peek('(')) {
      i++;
      const args = [];
      if (!peek(')'))
        do args.push(ternary());
        while (peek(',') && ++i);
      take(')');
      return (s) => {
        const f = s.fn?.[name] || FUNCS[name];
        if (!f) throw new ReferenceError(`公式里的函数「${name}」没有定义`);
        return f(...args.map((a) => a(s)));
      };
    }
    return (s) => {
      if (Object.hasOwn(s.vars, name)) return s.vars[name];
      if (Object.hasOwn(CONSTS, name)) return CONSTS[name];
      throw new ReferenceError(`公式里的「${name}」没有定义`);
    };
  }
  const fn = ternary();
  if (i < toks.length) throw new SyntaxError(`公式「${src}」后面多了「${toks[i].v}」`);
  cache.set(src, fn);
  return fn;
}

// 一个求值环境：常数、滑杆的量、配方里定义的函数，再加上临时变量（曲线自变量、重复序号）
export const recipeControls = (recipe) => recipe.controls || [recipe.probe];
export function normalizeParameters(recipe, input) {
  const controls = recipeControls(recipe);
  const supplied = input && typeof input === 'object' ? input : { [controls[0].name]: input };
  return Object.fromEntries(
    controls.map((p) => {
      if (
        !p ||
        ![p.min, p.max, p.step, p.default].every(Number.isFinite) ||
        p.max <= p.min ||
        p.step <= 0
      )
        throw new RangeError(`${recipe.id}: 无效的参数范围`);
      const raw = supplied[p.name];
      const value =
        raw !== null && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : p.default;
      const bounded = Math.min(p.max, Math.max(p.min, value));
      const snapped = p.min + Math.round((bounded - p.min) / p.step) * p.step;
      return [p.name, Number(Math.min(p.max, Math.max(p.min, snapped)).toPrecision(12))];
    }),
  );
}
export function scope(recipe, probe) {
  const vars = { ...recipe.constants, ...normalizeParameters(recipe, probe) };
  const s = { vars, fn: {} };
  for (const [name, [params, body]] of Object.entries(recipe.functions || {})) {
    const f = compile(body);
    s.fn[name] = (...args) =>
      f({ vars: { ...vars, ...Object.fromEntries(params.map((k, j) => [k, args[j]])) }, fn: s.fn });
  }
  for (const [name, expr] of Object.entries(recipe.derived || {})) vars[name] = evaluate(expr, s);
  return s;
}
export const evaluate = (src, s, extra) =>
  typeof src === 'number' ? src : compile(src)(extra ? { ...s, vars: { ...s.vars, ...extra } } : s);

// 读数：「k={k|3} · t½={ln(2)/k|3} s」，| 后面是有效数字（默认 4 位）
export function format(template, s) {
  return template.replace(/\{([^}|]+)(?:\|(\d+))?\}/g, (_, expr, digits) => {
    const v = evaluate(expr.trim(), s);
    if (!Number.isFinite(v)) return '—';
    if (Number.isInteger(v) && Math.abs(v) < 1e6) return String(v);
    return String(Number(v.toPrecision(Number(digits) || 4)));
  });
}

// ---------- 积木 ----------
const C = {
  ivory: '#d9d5c8',
  ceramic: '#a5aca3',
  titanium: '#65736e',
  dark: '#35413f',
  lime: '#bdcc8e',
  ice: '#8faeb4',
};
const color = (name) => C[name] || name || C.ivory;
// 科学坐标 → 显示坐标：显示区固定在 x∈[-1.3, 1.3]、y∈[-1, 1.15]，和数学模型一致
const BOX = { x: [-1.3, 1.3], y: [-1, 1.15] };
function mapper(view, s) {
  const [x0, x1] = view.x.map((v) => evaluate(v, s)),
    [y0, y1] = view.y.map((v) => evaluate(v, s));
  if (![x0, x1, y0, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0)
    throw new RangeError('标本坐标范围必须有限且递增');
  const X = (x) => BOX.x[0] + ((x - x0) / (x1 - x0)) * (BOX.x[1] - BOX.x[0]),
    Y = (y) => BOX.y[0] + ((y - y0) / (y1 - y0)) * (BOX.y[1] - BOX.y[0]);
  return { X, Y, x0, x1, y0, y1, sx: (BOX.x[1] - BOX.x[0]) / (x1 - x0) };
}
export const range = (part, s) => {
  if (!part.repeat) return [{}];
  const { var: v, from, to, step = 1 } = part.repeat,
    a = evaluate(from, s),
    b = evaluate(to, s),
    out = [];
  if (![a, b, step].every(Number.isFinite) || step <= 0 || (b - a) / step > 288)
    throw new RangeError('标本重复范围无效或超过构件预算');
  for (let k = a; k <= b + 1e-9; k += step) out.push({ [v]: k });
  return out;
};
// Spatial primitives use explicit display coordinates; formulas remain recipe data.
// This is an allowlist, never dynamic execution of arbitrary object methods.
const SPATIAL = new Set([
  'foot',
  'axes',
  'box',
  'line',
  'ring',
  'arrow',
  'rearSupport',
  'depthRail',
  'surfaceSupport',
  'probabilityChannel',
]);
export function evaluateTree(value, s) {
  if (Array.isArray(value)) return value.map((v) => evaluateTree(v, s));
  if (value && typeof value === 'object') {
    if (Object.hasOwn(value, 'literal')) return value.literal;
    if (value.sample) {
      const values = range({ repeat: value.sample }, s).map((extra) =>
        evaluateTree(value.value, { ...s, vars: { ...s.vars, ...extra } }),
      );
      return value.flat ? values.flat() : values;
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, evaluateTree(v, s)]));
  }
  return evaluate(value, s);
}
function renderParts(model, parts, s, m) {
  for (const part of parts) {
    for (const extra of range(part, s)) {
      const local = { ...s, vars: { ...s.vars, ...extra, baseTop: model.base?.top ?? 0 } };
      for (const [name, expr] of Object.entries(part.let || {}))
        local.vars[name] = evaluate(expr, local);
      if (part.when && !evaluate(part.when, local)) continue;
      if (part.part === 'group') {
        renderParts(model, part.parts, local, m);
        continue;
      }
      const make = PARTS[part.part];
      if (!make) throw new Error(`Unknown recipe part: ${part.part}`);
      const start = model.poses?.length ?? 0;
      const selected = part.colors ? part.colors[evaluate(part.colorIndex, local)] : null;
      make(model, selected ? { ...part, color: selected } : part, local, m);
      if (selected) for (const pose of model.poses.slice(start)) pose.color = color(selected);
      if (part.show !== undefined && !evaluate(part.show, local))
        for (const pose of model.poses.slice(start)) {
          pose.scale = [0, 0, 0];
          pose.role = 'unused';
        }
      if (model.poses?.length > 288) throw new RangeError('Recipe exceeds instance budget');
    }
  }
}
const PARTS = {
  group() {},
  spatial(model, part, s) {
    if (!SPATIAL.has(part.op)) throw new RangeError('Unknown spatial primitive');
    const args = evaluateTree(part.args, s).map((v) => (typeof v === 'string' ? color(v) : v));
    const target = Object.hasOwn(model, part.op) ? model : model.details;
    target[part.op](...args);
  },
  path(model, part, s) {
    const n = part.segments;
    if (!Number.isInteger(n) || n < 1 || n > 288) throw new RangeError('Invalid path samples');
    model.curve(
      (x) => evaluateTree(part.point, { ...s, vars: { ...s.vars, [part.var || 'x']: x } }),
      evaluate(part.from, s),
      evaluate(part.to, s),
      n,
      part.width,
      color(part.color),
      part.depth,
      part.role,
    );
  },
  // 坐标轴和刻度（刻度按科学单位的间隔）
  axes(model, part, s, m) {
    const z = -0.06;
    model.line(
      [BOX.x[0] - 0.08, m.Y(m.y0), z],
      [BOX.x[1] + 0.1, m.Y(m.y0), z],
      0.014,
      C.titanium,
      0.028,
      'axis',
    );
    model.line(
      [m.X(m.x0), BOX.y[0] - 0.02, z],
      [m.X(m.x0), BOX.y[1] + 0.06, z],
      0.014,
      C.titanium,
      0.028,
      'axis',
    );
    const tx = evaluate(part.ticks?.x ?? (m.x1 - m.x0) / 4, s),
      ty = evaluate(part.ticks?.y ?? (m.y1 - m.y0) / 4, s);
    if (
      ![tx, ty].every((v) => Number.isFinite(v) && v > 0) ||
      (m.x1 - m.x0) / tx + (m.y1 - m.y0) / ty > 288
    )
      throw new RangeError('标本刻度间隔无效或超过构件预算');
    for (let x = m.x0 + tx; x <= m.x1 + 1e-9; x += tx)
      model.line(
        [m.X(x), m.Y(m.y0) - 0.032, z],
        [m.X(x), m.Y(m.y0) + 0.032, z],
        0.009,
        C.ceramic,
        0.015,
        'tick',
      );
    for (let y = m.y0 + ty; y <= m.y1 + 1e-9; y += ty)
      model.line(
        [m.X(m.x0) - 0.032, m.Y(y), z],
        [m.X(m.x0) + 0.032, m.Y(y), z],
        0.009,
        C.ceramic,
        0.015,
        'tick',
      );
  },
  // 函数曲线 y = fn(var)，可以整体上下平移（offset，科学单位）和缩放（amp）
  curve(model, part, s, m, extra) {
    const v = part.var || 'x',
      from = evaluate(part.from ?? m.x0, s, extra),
      to = evaluate(part.to ?? m.x1, s, extra),
      n = part.segments ?? 72,
      f = compile(part.fn),
      z = part.z ?? 0.12;
    if (!Number.isInteger(n) || n < 1 || n > 288) throw new RangeError('曲线段数超出范围');
    const at = (x) => {
      const local = { ...s, vars: { ...s.vars, ...extra, [v]: x } };
      return [m.X(x), m.Y(f(local)), z];
    };
    model.curve(
      at,
      from,
      to,
      n,
      part.width ?? 0.03,
      color(part.color),
      part.depth ?? 0.08,
      part.role || 'curve',
    );
  },
  // 曲线下的一排薄片：每片宽 (to-from)/count，高度取这一片中点的函数值
  bars(model, part, s, m, extra) {
    const v = part.var || 'x',
      count = Math.round(evaluate(part.count, s, extra)),
      from = evaluate(part.from ?? m.x0, s, extra),
      to = evaluate(part.to ?? m.x1, s, extra),
      f = compile(part.fn),
      w = (to - from) / count;
    if (!Number.isFinite(count) || count < 1 || count > 288) throw new RangeError('薄片数超出范围');
    for (let k = 0; k < count; k++) {
      const left = from + w * k,
        right =
          part.until === undefined
            ? left + w
            : Math.max(left, Math.min(left + w, evaluate(part.until, s, extra))),
        x = (left + right) / 2,
        y = f({ ...s, vars: { ...s.vars, ...extra, [v]: x } }),
        top = m.Y(y),
        bottom = m.Y(evaluate(part.baseline ?? m.y0, s, extra)),
        h =
          part.until === undefined
            ? Math.max(0.004, Math.abs(top - bottom))
            : right > left
              ? Math.abs(top - bottom)
              : 0;
      model.box(
        [m.X(x), (top + bottom) / 2, 0.015],
        [Math.abs((right - left) * m.sx) * (part.fill ?? 0.82), h, 0.09],
        part.color ? color(part.color) : k % 2 ? C.ceramic : C.titanium,
        [0, 0, 0],
        part.role || 'bar',
      );
    }
  },
  // 科学坐标中的有向线段，头部尺寸固定，参数变化不改变构件顺序。
  arrow(model, part, s, m, extra) {
    // show 为 0 时仍占住三个槽位（零长度会变成隐藏构件），参数变化时构件顺序不变（露娜，v39）
    if (part.show !== undefined && !evaluate(part.show, s, extra)) {
      for (let k = 0; k < 3; k++) model.line([0, 0, 0], [0, 0, 0]);
      return;
    }
    const a = [m.X(evaluate(part.from[0], s, extra)), m.Y(evaluate(part.from[1], s, extra)), 0.24];
    const b = [m.X(evaluate(part.to[0], s, extra)), m.Y(evaluate(part.to[1], s, extra)), 0.24];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = length ? (b[0] - a[0]) / length : 0;
    const dy = length ? (b[1] - a[1]) / length : 0;
    const head = Math.min(0.09, length * 0.3),
      c = color(part.color || 'lime');
    model.line(a, b, 0.018, c, 0.03, 'vector');
    for (const sign of [-1, 1])
      model.line(
        b,
        [
          b[0] - dx * head - sign * dy * head * 0.45,
          b[1] - dy * head + sign * dx * head * 0.45,
          b[2],
        ],
        0.018,
        c,
        0.03,
        'vector',
      );
  },
  // 线段：科学坐标里两点之间的一根实线（容器壁、轨道、坐标外的刻度），没有箭头（露娜，v39）
  segment(model, part, s, m, extra) {
    const a = [
      m.X(evaluate(part.from[0], s, extra)),
      m.Y(evaluate(part.from[1], s, extra)),
      part.z ?? 0.1,
    ];
    const b = [
      m.X(evaluate(part.to[0], s, extra)),
      m.Y(evaluate(part.to[1], s, extra)),
      part.z ?? 0.1,
    ];
    model.line(
      a,
      b,
      part.width ?? 0.02,
      color(part.color || 'titanium'),
      part.depth ?? 0.04,
      part.role || 'frame',
    );
  },
  // 粒子：在一块区域里撒 count 个小方块（最多 max 个）。位置用低差异序列，每个序号的相对位置固定，
  // 区域变大变小时粒子跟着伸缩，数量变化时只增减最后几个；没用到的槽位是零尺寸（隐藏），构件顺序不变。
  particles(model, part, s, m, extra) {
    const max = part.max;
    if (!Number.isInteger(max) || max < 1 || max > 200) throw new RangeError('粒子上限超出范围');
    const count = Math.max(0, Math.min(max, Math.round(evaluate(part.count, s, extra))));
    const [x0, x1] = part.region.x.map((v) => evaluate(v, s, extra)),
      [y0, y1] = part.region.y.map((v) => evaluate(v, s, extra)),
      size = part.size ?? 0.034;
    for (let k = 0; k < max; k++) {
      const u = (0.5 + k * 0.7548776662466927) % 1,
        v = (0.5 + k * 0.5698402909980532) % 1,
        x = x0 + (x1 - x0) * (0.06 + 0.88 * u),
        y = y0 + (y1 - y0) * (0.06 + 0.88 * v),
        on = k < count;
      model.box(
        [m.X(x), m.Y(y), 0.1 + (k % 3) * 0.035],
        on ? [size, size, size] : [0, 0, 0],
        color(part.color || 'ivory'),
        [0.4 * (k % 5), 0.3 * (k % 7), 0],
        part.role || 'particle',
      );
    }
  },
  // 物块：中心在 (x, y)、宽 w 高 h（科学单位）的一块方块，比如斜面上、桌面上的物体
  block(model, part, s, m, extra) {
    const x = m.X(evaluate(part.x, s, extra)),
      y = m.Y(evaluate(part.y, s, extra)),
      w = Math.abs(evaluate(part.w, s, extra) * m.sx),
      h = Math.abs(m.Y(evaluate(part.h, s, extra)) - m.Y(0));
    model.box(
      [x, y, 0.08],
      [Math.max(0.004, w), Math.max(0.004, h), 0.22],
      color(part.color || 'ivory'),
      [0, 0, 0],
      part.role || 'block',
    );
  },
  // 竖直参考线 x = at（虚线），可选从 y0 画到 to
  vline(model, part, s, m, extra) {
    const x = m.X(evaluate(part.at, s, extra)),
      y1 = m.Y(evaluate(part.to ?? m.y1, s, extra)),
      y0 = m.Y(evaluate(part.from ?? m.y0, s, extra)),
      n = part.dashes ?? 10;
    for (let k = 0; k < n; k++) {
      const a = y0 + ((y1 - y0) * k) / n,
        b = y0 + ((y1 - y0) * (k + 0.55)) / n;
      model.line(
        [x, a, 0.18],
        [x, b, 0.18],
        0.011,
        color(part.color || 'lime'),
        0.02,
        part.role || 'reference',
      );
    }
  },
  // 水平参考线 y = at，从 from 到 to（科学单位），实线或虚线
  hline(model, part, s, m, extra) {
    const y = m.Y(evaluate(part.at, s, extra)),
      a = m.X(evaluate(part.from ?? m.x0, s, extra)),
      b = m.X(evaluate(part.to ?? m.x1, s, extra)),
      hl = part.highlight ? evaluate(part.highlight, s, extra) : 0,
      c = color(hl ? part.highlightColor || 'lime' : part.color || 'ceramic');
    if (part.dashes) {
      for (let k = 0; k < part.dashes; k++)
        model.line(
          [a + ((b - a) * k) / part.dashes, y, 0.16],
          [a + ((b - a) * (k + 0.55)) / part.dashes, y, 0.16],
          0.011,
          c,
          0.02,
          part.role || 'reference',
        );
    } else
      model.line(
        [a, y, 0.1],
        [b, y, 0.1],
        hl ? 0.026 : 0.018,
        c,
        hl ? 0.05 : 0.035,
        part.role || 'level',
      );
  },
  // 一个点（小圈），标在 (x, y)
  point(model, part, s, m, extra) {
    model.ring(
      [m.X(evaluate(part.x, s, extra)), m.Y(evaluate(part.y, s, extra)), 0.22],
      part.radius ?? 0.055,
      color(part.color || 'lime'),
    );
  },
  // 墙：x = at 处的一块竖板，从 y0 到 y1
  wall(model, part, s, m, extra) {
    const x = m.X(evaluate(part.at, s, extra)),
      h = BOX.y[1] - BOX.y[0] + 0.1;
    model.box(
      [x, BOX.y[0] + h / 2 - 0.05, 0],
      [0.05, h, 0.34],
      C.titanium,
      [0, 0, 0],
      'hardware-metal',
    );
  },
};
// 配方 → 构件。model 是 assembly-models.js 的 builder（box / line / curve / ring / foot）
export function buildRecipe(model, recipe, probe) {
  const s = scope(recipe, probe),
    m = mapper(recipe.view, s);
  if (recipe.frame !== false) {
    const base = model.foot();
    model.box(
      [0, BOX.y[0] - 0.012, 0.015],
      [2.65, 0.024, 0.115],
      '#b9c0c2',
      [0, 0, 0],
      'hardware-metal',
    );
    for (const x of [-1.12, 1.12])
      model.details.rearSupport([x, BOX.y[0] - 0.024, 0.015], -0.0425, base.top);
  }
  renderParts(model, recipe.parts, s, m);
  const controls = recipeControls(recipe),
    p = controls[0];
  return {
    metadata: {
      title: recipe.title,
      description: recipe.description,
      probeLabel: p.label,
      probeMin: p.min,
      probeMax: p.max,
      probeStep: p.step,
      probeDefault: p.default,
      controls: controls.map((control) => ({ ...control, value: s.vars[control.name] })),
      legend: recipe.legend || '',
      readout: format(recipe.readout, s),
    },
    data: {
      ...evaluateTree(recipe.outputs || {}, s),
      recipe: recipe.id,
      probe: s.vars[p.name],
      parameters: normalizeParameters(recipe, probe),
    },
  };
}
export const PART_TYPES = Object.keys(PARTS);

// Case values are independent of model controls and never answer questions.
export function evaluateCaseStudy(config, parameters) {
  if (!Object.values(parameters).every(Number.isFinite))
    throw new TypeError('Finite case parameters required');
  return evaluateTree(config.values, { vars: parameters, fn: {} });
}
