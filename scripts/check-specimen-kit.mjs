// 积木与配方检查（露娜）：
// 1. 公式解析器：四则、乘方右结合、比较、条件、自定义函数，以及不认识的写法会报错而不是乱算；
// 2. 每份配方在滑杆的最小、默认、最大和中间值上都能生成，构件不超过 288、坐标全部有限；
// 3. 配方的 checks 用这一章原题的答案核对（按原题的判题方式：数值题看容差）。
import assert from 'node:assert/strict';
import { compile, scope, evaluate, format, PART_TYPES } from '../laboratory/specimen-kit.js';
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
  const p = recipe.probe;
  for (const value of [p.min, p.default, p.max, (p.min + p.max) / 2]) {
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
