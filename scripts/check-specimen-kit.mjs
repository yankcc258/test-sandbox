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
