import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { COURSE, MATH_CATALOG, gradeAnswer } from '../laboratory/course-data.js';

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Verified at extraction against git show of the pinned main-site source.
// These snapshots keep the full source prose, order, formulas, hints and
// answers intact without requiring access to the main repository at test time.
assert.equal(COURSE.source.commit, '05be1e3f63e4a81f3e4b52ca37c06d43aeb38b4c');
assert.equal(COURSE.source.path, 'src/foundation-chapters.js');
assert.equal(
  hash(COURSE.sections),
  'a7762eae06c426fcf716181332f20af3f9a1ddb3a4ff44bed447aa30651767ac',
);
assert.equal(
  hash(COURSE.questions),
  'ea836fc0019230105e3af599f95358dff0eee0527958a1d6f68777b005a69bdb',
);
assert.equal(
  hash(MATH_CATALOG),
  '0d8da59d9666455ed67164af47b51f4b00d423f2dcea3ba015cf71bdb96f86ff',
);
assert.equal(COURSE.id, 'math-partials');
assert.equal(COURSE.title, '偏导数与全微分：为热力学建立语言');
assert.deepEqual(COURSE.prerequisites, [
  '导数：x² 的导数为 2x；求导前先确定自变量。',
  '多元函数：f(x,y) 的值同时取决于 x 与 y。',
]);
assert.deepEqual(COURSE.prerequisiteIds, ['math']);
assert.deepEqual(COURSE.precheck, { prompt: 'f(x)=x²，在 x=2 处 f′(x) 等于多少？', answer: '4' });
assert.equal(COURSE.questions.length, 5);
assert.deepEqual(
  COURSE.questions.map((q) => q.answer),
  [12, 0.4, 0.348, 12, [0, 1]],
);
assert.deepEqual(
  MATH_CATALOG.filter((c) => c.available).map((c) => c.id),
  ['math-partials'],
);
assert.equal(new Set(COURSE.sections.map((section) => section.id)).size, COURSE.sections.length);
assert.ok(COURSE.sections.some((s) => s.id === 'steps'));
assert.ok(
  COURSE.sections.some((s) => s.id === 'example' && s.html.includes('class="reading-note"')),
);

// All original answers must be accepted in their original types. Evaluating
// input must never mutate the data or the user's multiple-choice selection.
const before = JSON.stringify(COURSE);
for (const q of COURSE.questions) {
  const answer = structuredClone(q.answer);
  assert.equal(gradeAnswer(q, answer).status, 'correct');
  assert.equal(gradeAnswer(q, answer).correct, true);
  assert.deepEqual(answer, q.answer);
}
const number = COURSE.questions[0];
for (const input of ['', ' ', '0xC', '12+0', 'Infinity', 'NaN', '1e9999', '12 kg', [], null])
  assert.equal(gradeAnswer(number, input).status, 'invalid', `invalid number ${String(input)}`);
assert.equal(gradeAnswer(number, '12.059').status, 'correct');
assert.equal(gradeAnswer(number, '12.061').status, 'wrong');
assert.equal(gradeAnswer(number, '0').status, 'wrong');
assert.equal(gradeAnswer(number, '−12').status, 'wrong');
assert.equal(gradeAnswer(COURSE.questions[1], '.4').status, 'correct');
assert.equal(gradeAnswer(COURSE.questions[1], ' 4e-1 ').status, 'correct');
assert.equal(gradeAnswer(COURSE.questions[2], '.4').status, 'wrong');
assert.equal(gradeAnswer(COURSE.questions[2], '.348').status, 'correct');

const multi = COURSE.questions[4];
assert.equal(gradeAnswer(multi, [1, 0]).status, 'correct');
assert.equal(gradeAnswer(multi, [0, 0]).status, 'partial');
assert.equal(gradeAnswer(multi, [0]).status, 'partial');
assert.equal(gradeAnswer(multi, [0, 1, 2]).status, 'wrong');
assert.equal(gradeAnswer(multi, [2, 3]).status, 'wrong');
for (const input of [[], ['0', '1'], [4], [-1], [0.5], '0,1', null])
  assert.equal(gradeAnswer(multi, input).status, 'invalid');
assert.equal(gradeAnswer(null, 12).status, 'invalid');
assert.equal(JSON.stringify(COURSE), before);

console.log(
  'PASS: pinned course prose and all 5 questions, actual five-chapter catalog, original answer types, numeric tolerance, multi-select partial/wrong/invalid states, pure grading.',
);
