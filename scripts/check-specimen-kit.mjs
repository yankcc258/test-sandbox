// 积木与配方检查（露娜）：
// 1. 公式解析器：四则、乘方右结合、比较、条件、自定义函数，以及不认识的写法会报错而不是乱算；
// 2. 每份配方在滑杆的最小、默认、最大和中间值上都能生成，构件不超过 288、坐标全部有限；
// 3. 配方的 checks 用这一章原题的答案核对（按原题的判题方式：数值题看容差）。
import assert from 'node:assert/strict';
import {
  compile,
  scope,
  evaluate,
  format,
  PART_TYPES,
  recipeControls,
  normalizeParameters,
  buildRecipe,
} from '../laboratory/specimen-kit.js';
import { RECIPES } from '../laboratory/specimen-recipes.js';
import { ASSEMBLY_COUNT, buildModelPoses } from '../laboratory/assembly-models.js';
import { getCourse, gradeAnswer } from '../laboratory/course-data.js';

const env = (vars, fn = {}) => ({ vars, fn });
assert.equal(compile('1 + 2 * 3')(env({})), 7);
assert.equal(compile('2 ^ 3 ^ 2')(env({})), 512);
assert.equal(compile('-2 ^ 2')(env({})), -4);
assert.equal(compile('2 ^ -1')(env({})), 0.5);
assert.equal(compile('(1 + 2) * 3')(env({})), 9);
assert.equal(compile('x > 1 ? 10 : 20')(env({ x: 2 })), 10);
assert.equal(compile('n == 3')(env({ n: 3 })), 1);
assert.ok(Math.abs(compile('ln(2) / k')(env({ k: 0.02 })) - 34.657359027997266) < 1e-12);
assert.equal(compile('max(1, 4, 2)')(env({})), 4);
assert.equal(compile('1.5e-3 * 2')(env({})), 0.003);
for (const bad of ['1 +', '2 ** 3', 'alert(1)', 'x = 1', '"a"', 'a.b'])
  assert.throws(() => compile(bad)(env({ x: 1 })), undefined, `应该拒绝：${bad}`);
assert.throws(() => compile('y + 1')(env({})), /没有定义/);

let checked = 0;
for (const [id, recipe] of Object.entries(RECIPES)) {
  assert.equal(recipe.id, id);
  const course = getCourse(id);
  assert.ok(course, `${id}：课程快照里没有这一章`);
  for (const part of recipe.parts)
    assert.ok(PART_TYPES.includes(part.part), `${id}：未知积木 ${part.part}`);
  const controls = recipeControls(recipe);
  const cases = controls.reduce(
    (all, p) =>
      all.flatMap((values) =>
        [p.min, p.default, p.max, (p.min + p.max) / 2].map((value) => ({
          ...values,
          [p.name]: value,
        })),
      ),
    [{}],
  );
  for (const value of cases) {
    const model = buildModelPoses(id, value);
    assert.equal(model.poses.length, ASSEMBLY_COUNT, `${id}@${value}：构件数`);
    const active = model.poses.filter((q) => q.scale.every((v) => v > 0));
    assert.ok(active.length > 20, `${id}@${value}：构件太少`);
    for (const q of model.poses)
      assert.ok(
        [...q.position, ...q.rotation, ...q.scale].every(Number.isFinite),
        `${id}@${value}：坐标不是有限值`,
      );
    assert.equal(model.metadata.title, recipe.title);
    assert.ok(
      !/—|NaN|undefined/.test(model.metadata.readout),
      `${id}@${value}：读数 ${model.metadata.readout}`,
    );
  }
  for (const c of recipe.checks || []) {
    const q = course.questions.find((x) => x.id === c.question);
    assert.ok(q, `${id}：没有原题 ${c.question}`);
    const value = evaluate(c.expr, scope(recipe, c.probe));
    const result = gradeAnswer(q, String(value));
    assert.equal(
      result.status ?? result,
      'correct',
      `${id}：${c.question}「${q.prompt}」用配方算出 ${value}，原题答案 ${q.answer}`,
    );
    checked++;
  }
  assert.ok(format(recipe.readout, scope(recipe)).length > 0);
}
console.log(
  `PASS: specimen kit parser, ${Object.keys(RECIPES).length} recipes build across their ranges, ${checked} values match the chapters' own answers.`,
);

// Multiple parameters retain their own defaults, snap to step, and reject non-finite inputs.
const box = RECIPES['quantum-box'];
assert.deepEqual(
  normalizeParameters(box, 4),
  { N: 4, L: 1 },
  'legacy scalar selects first control',
);
assert.deepEqual(normalizeParameters(box, { N: 99, L: 1.277 }), { N: 5, L: 1.3 });
assert.deepEqual(normalizeParameters(box, { N: NaN, L: null }), { N: 2, L: 1 });
const energy = (L) => evaluate('E(N, L)', scope(box, { N: 2, L }));
assert.equal(energy(2), energy(1) / 4, 'doubling width quarters energy at fixed n');
const smallBox = buildModelPoses('quantum-box', { N: 2, L: 1 });
const wideBox = buildModelPoses('quantum-box', { N: 2, L: 2 });
assert.notDeepEqual(smallBox.poses, wideBox.poses, 'width changes geometry as well as the readout');
const nernst = RECIPES['electro-nernst'];
const voltage = (values) => evaluate('E(logZn-logCu)', scope(nernst, values));
assert.ok(Math.abs(voltage({ logZn: -1, logCu: -3 }) - 1.04084) < 1e-12);
assert.equal(voltage({ logZn: -2, logCu: -2 }), 1.1, 'Q=1 returns standard potential, not zero');
assert.ok(
  Math.abs(voltage({ logZn: -2, logCu: -3 }) - voltage({ logZn: -3, logCu: -3 }) + 0.02958) < 1e-12,
);
assert.ok(
  Math.abs(voltage({ logZn: -3, logCu: -2 }) - voltage({ logZn: -3, logCu: -3 }) - 0.02958) < 1e-12,
);
// No loop can hang when a future recipe contains a bad repetition/tick range.
const stub = { foot: () => ({ top: -1.2 }), box() {}, line() {}, details: { rearSupport() {} } };
assert.throws(
  () =>
    buildRecipe(stub, {
      ...nernst,
      parts: [{ part: 'hline', repeat: { var: 'i', from: 0, to: 2, step: 0 } }],
    }),
  /重复范围/,
);
assert.throws(
  () => buildRecipe(stub, { ...nernst, parts: [{ part: 'axes', ticks: { x: 0, y: 1 } }] }),
  /刻度/,
);
assert.throws(() => buildRecipe(stub, { ...nernst, view: { x: [0, 0], y: [0, 1] } }), /坐标/);
console.log(
  'PASS: multi-parameter defaults/clamping, quantum width scaling, Nernst signs, equal-activity reference and invalid recipe bounds.',
);

// Wave probability is an area, not amplitude or density at a point.
const wave = RECIPES['quantum-wave'];
const close = (a, b, message, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `${message}: ${a} vs ${b}`);
for (let N = 1; N <= 4; N++) {
  const env = scope(wave, { N });
  const f = (name, u) => evaluate(`${name}(${u})`, env);
  close(f('P', 0), 0, 'empty interval');
  close(f('P', 1), 1, 'normalized whole box');
  close(f('P', 0.5), 0.5, 'left half for every stationary state');
  for (let j = 0; j <= N; j++) close(f('rho', j / N), 0, 'node density');
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const b = i / 100,
      probability = f('P', b);
    assert.ok(probability >= -1e-12 && probability <= 1 + 1e-12 && probability >= previous - 1e-12);
    previous = probability;
    close(f('rho', b), f('psi', b) ** 2, 'Born rule');
    // Independent numerical integral, including both endpoints and partial cells.
    const count = 512;
    let area = 0;
    for (let k = 0; k < count; k++)
      area += (2 * Math.sin((N * Math.PI * b * (k + 0.5)) / count) ** 2 * b) / count;
    close(probability, area, 'analytic interval agrees with numerical quadrature', 2e-5);
  }
}
assert.ok(evaluate('psi(0.75)', scope(wave, { N: 2 })) < 0);
const zeroY = -1 + (1.6 / 3.8) * 2.15;
for (const b of [0, 0.01, 0.5, 0.99, 1]) {
  const pieces = buildModelPoses('quantum-wave', { N: 2, b }).poses.filter(
    (p) => p.role === 'probability-area',
  );
  assert.equal(pieces.length, 32, 'fixed slots during interval expansion');
  const shown = pieces.filter((p) => p.scale.every((v) => v > 0));
  if (!b) assert.equal(shown.length, 0, 'empty interval has no visible probability bars');
  for (const p of shown) {
    close(
      p.position[1] - p.scale[1] / 2,
      zeroY,
      'probability bars start at zero, not chart minimum',
    );
    assert.ok(
      p.position[0] + p.scale[0] / 2 <= -1.3 + 2.6 * b + 1e-10,
      'no selected bar crosses b',
    );
  }
}
// Ideal A <-> B: G minimum, reaction derivative and conserved composition.
const gibbs = RECIPES['physical-gibbs'];
for (const K of [1, 1.25, 4, 10]) {
  const env = scope(gibbs, { K });
  const eq = evaluate('equilibriumB(1)', env);
  const minimum = evaluate(`G(${eq})`, env);
  close(evaluate(`reactionG(${eq})`, env), 0, 'reaction free energy vanishes at equilibrium');
  assert.ok(minimum < 0, 'system G at its chosen reference is not forced to zero');
  close(evaluate('G(0)', env), 0, 'pure A reference is finite');
  close(evaluate('G(1)', env), evaluate('standardG(K)', env), 'pure B endpoint limit');
  for (let i = 1; i < 100; i++) {
    const y = i / 100,
      h = 1e-5;
    const g = evaluate(`G(${y})`, env),
      dg = evaluate(`reactionG(${y})`, env);
    assert.ok(g >= minimum - 1e-10, 'equilibrium is the global minimum');
    const slope = (evaluate(`G(${y + h})`, env) - evaluate(`G(${y - h})`, env)) / (2 * h);
    close(slope, dg, 'G composition derivative equals reaction free energy', 1e-6);
    if (y < eq - 1e-10) assert.ok(dg < 0, 'forward direction');
    if (y > eq + 1e-10) assert.ok(dg > 0, 'reverse direction');
    close(1 - y + y, 1, 'material balance');
  }
}
console.log(
  'PASS: normalized wave density, exact interval probability, node/negative-amplitude distinction, clipped zero-based bars, Gibbs minimum, endpoint limits, dG/dy and mass balance.',
);

// ---------- 露娜 v39：浓度、原电池与电解、电子排布、受力与功 ----------
{
  const atom = RECIPES['inorganic-periodicity'];
  const conf = (Z, q) => {
    const s = scope(atom, { Z, q }),
      o = (k) => evaluate(`o${k}(Z, q)`, s);
    return {
      s1: o('s1'),
      s2: o('s2'),
      p2: o('p2'),
      s3: o('s3'),
      p3: o('p3'),
      s4: o('s4'),
      d3: o('d3'),
      p4: o('p4'),
    };
  };
  const total = (c) => Object.values(c).reduce((a, b) => a + b, 0);
  assert.deepEqual(conf(26, 0), { s1: 2, s2: 2, p2: 6, s3: 2, p3: 6, s4: 2, d3: 6, p4: 0 }, 'Fe');
  assert.deepEqual([conf(26, 2).s4, conf(26, 2).d3], [0, 6], 'Fe²⁺ 是 [Ar]3d⁶，4s 先空');
  assert.deepEqual([conf(26, 3).s4, conf(26, 3).d3], [0, 5], 'Fe³⁺ 是 [Ar]3d⁵');
  assert.deepEqual([conf(24, 0).s4, conf(24, 0).d3], [1, 5], 'Cr 是 3d⁵4s¹');
  assert.deepEqual([conf(29, 0).s4, conf(29, 0).d3], [1, 10], 'Cu 是 3d¹⁰4s¹');
  assert.deepEqual([conf(29, 1).s4, conf(29, 1).d3], [0, 10], 'Cu⁺ 是 3d¹⁰');
  assert.deepEqual([conf(8, -2).p2, total(conf(8, -2))], [6, 10], 'O²⁻ 有 10 个电子');
  assert.deepEqual([conf(11, 1).s3, total(conf(11, 1))], [0, 10], 'Na⁺ 失去 3s');
  assert.deepEqual([conf(30, 0).s4, conf(30, 0).d3, conf(31, 0).p4], [2, 10, 1], 'Zn、Ga');
  let poses = null;
  for (let Z = 1; Z <= 36; Z++)
    for (let q = -2; q <= 3; q++) {
      const c = conf(Z, q),
        want = Math.max(0, Z - q);
      if (want <= 36) assert.equal(total(c), want, `Z=${Z} q=${q} 电子总数`);
      for (const [k, cap] of Object.entries({
        s1: 2,
        s2: 2,
        p2: 6,
        s3: 2,
        p3: 6,
        s4: 2,
        d3: 10,
        p4: 6,
      }))
        assert.ok(c[k] >= 0 && c[k] <= cap, `Z=${Z} q=${q} ${k}=${c[k]}`);
      const model = buildModelPoses('inorganic-periodicity', { Z, q });
      poses ??=
        model.data.activeCount + model.poses.filter((p) => !p.scale.every((v) => v > 0)).length;
      // 箭头不画时也占住槽位：构件总顺序不随 Z、q 变化
      assert.equal(model.poses.length, ASSEMBLY_COUNT);
    }
  const fe2 = buildModelPoses('inorganic-periodicity', { Z: 26, q: 2 }).poses.filter(
    (p) => p.role === 'vector' && p.scale.every((v) => v > 0),
  ).length;
  assert.equal(fe2, (24 + 1) * 3, 'Fe²⁺：24 个电子箭头 + 能量轴，每支箭头 3 段');

  const chem = RECIPES.chem;
  for (const [n, V] of [
    [0.025, 0.25],
    [0.1, 0.05],
    [0.005, 0.5],
  ]) {
    const model = buildModelPoses('chem', { n, V });
    const shown = model.poses.filter(
      (p) => p.role === 'particle' && p.scale.every((v) => v > 0),
    ).length;
    assert.equal(shown, Math.round(n / 0.001), `浓度：n=${n} 时粒子数`);
    assert.equal(
      model.poses.filter((p) => p.role === 'particle').length,
      100,
      '粒子槽位固定 100 个',
    );
  }
  assert.ok(
    Math.abs(evaluate('n * M', scope(chem, { n: 0.025, V: 0.25 })) - 1.461) < 1e-3,
    '例题 1.461 g',
  );

  const cell = RECIPES['electro-cell'];
  assert.ok(
    Math.abs(evaluate('mass(I, t)', scope(cell, { I: 1, t: 1930 })) - 0.6356) < 1e-3,
    '例题 0.6356 g',
  );
  assert.equal(evaluate('mass(I, t)', scope(cell, { I: 2, t: 0 })), 0);

  const work = RECIPES['physics-energy'];
  const w = (F, x) => scope(work, { F, s: x });
  assert.equal(evaluate('v(4)', w(6, 4)), 4);
  assert.equal(evaluate('K(s)', w(2, 5)), 0, 'F=f 时物块不动');
  assert.equal(evaluate('K(s)', w(1, 5)), 0, 'F<f 时动能不会变成负的');
  assert.equal(
    evaluate('F * s + -f * s', w(7, 3)),
    evaluate('K(s)', w(7, 3)),
    '功能定理：W拉 + W摩 = ΔK',
  );
  console.log(
    'PASS: electron filling (Hund, 4s-first cations, Cr/Cu exceptions, totals for every Z and charge), stable slots, particle counts, deposition and work–energy balance.',
  );
}
