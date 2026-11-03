import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { COURSE_SNAPSHOT } from '../laboratory/course-snapshot.js';
import {
  COURSES,
  COURSE,
  DISCIPLINES,
  TRACKS,
  MATH_CATALOG,
  SOURCE_COMMIT,
  getCourse,
  gradeAnswer,
} from '../laboratory/course-data.js';

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Independently captured after git-show extraction. Tests need no main checkout.
assert.equal(SOURCE_COMMIT, '05be1e3f63e4a81f3e4b52ca37c06d43aeb38b4c');
assert.equal(
  hash(COURSE_SNAPSHOT),
  'd083b3e12ce1ba1fce8f6856d9200c1f2073e985207b87f447dc475aca469226',
);
assert.equal(COURSES.length, 17);
assert.equal(
  COURSES.reduce((n, c) => n + c.questions.length, 0),
  85,
);
assert.equal(DISCIPLINES.length, 6);
assert.equal(TRACKS.length, 5);
assert.equal(getCourse('missing'), undefined);
assert.equal(COURSE, getCourse('math-partials'));
assert.deepEqual(
  MATH_CATALOG.map((c) => c.id),
  ['math', 'math-integral', 'math-explog', 'math-partials', 'math-complex'],
);
assert.ok(MATH_CATALOG.every((c) => c.available));
assert.deepEqual(
  DISCIPLINES.filter((d) => !d.tracks.length).map((d) => d.id),
  ['computing', 'life', 'earth'],
);
assert.deepEqual(
  [...new Set(TRACKS.flatMap((t) => t.units))].sort(),
  COURSES.map((c) => c.id).sort(),
);
assert.deepEqual(
  [...new Set(DISCIPLINES.flatMap((d) => d.tracks))].sort(),
  TRACKS.map((t) => t.id).sort(),
);

const plain = (html) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
const sourceText = (text) => text.replace(/<\/?(?:sub|sup)>/g, ' ');
const strings = (value) =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(strings)
        : [];
const types = {};
const originalState = JSON.stringify(COURSES);
for (const raw of COURSE_SNAPSHOT.courses) {
  const c = getCourse(raw.id);
  assert.ok(c);
  assert.equal(c.title, raw.title);
  assert.equal(c.subtitle, raw.desc);
  assert.equal(c.duration, raw.time);
  assert.equal(c.track, raw.track);
  assert.ok(DISCIPLINES.find((d) => d.id === c.discipline).tracks.includes(c.track));
  assert.equal(c.source.path, COURSE_SNAPSHOT.courseFiles[c.id]);
  assert.deepEqual(c.prerequisites, raw.prereq);
  assert.deepEqual(c.prerequisiteIds, raw.prerequisiteIds);
  assert.equal(c.precheck.prompt, raw.check);
  assert.equal(c.precheck.answer, raw.checkAnswer);
  assert.equal(c.precheck.explanation, raw.checkExplain);
  assert.deepEqual(c.terms, raw.terms);
  assert.equal(new Set(c.sections.map((s) => s.id)).size, c.sections.length);
  const body = plain(c.sections.map((s) => s.html).join(''));
  for (const key of [
    'intro',
    'definition',
    'formula',
    'units',
    'steps',
    'example',
    'basic',
    'extra',
    'mis',
    'summary',
    'task',
    'goal',
    'prereq',
    'terms',
    'check',
    'checkAnswer',
    'checkExplain',
    'modelLegend',
  ])
    for (const text of strings(raw[key]))
      assert.ok(body.includes(sourceText(text)), `${c.id}: missing ${key}: ${text}`);
  for (const text of strings(COURSE_SNAPSHOT.depth[c.id]))
    assert.ok(body.includes(sourceText(text)), `${c.id}: missing detailed derivation: ${text}`);
  assert.equal(c.questions.length, raw.questions.length);
  for (const [i, q] of c.questions.entries()) {
    const original = raw.questions[i];
    assert.equal(q.id, `${c.id}:${i}`);
    assert.equal(q.index, i);
    assert.equal(q.type, original.type);
    assert.equal(q.prompt, original.text);
    assert.deepEqual(q.answer, original.answer);
    assert.equal(q.explanation, original.solution);
    assert.deepEqual(q.choices, original.options);
    assert.deepEqual(q.choiceExplanations, original.explain);
    assert.deepEqual(q.hints, original.hint);
    assert.equal(q.unit, original.unit || '');
    assert.equal(q.skill, original.skill);
    assert.equal(q.reinforce, original.reinforce);
    assert.equal(q.reinforceAnswer, original.reinforceAnswer);
    types[q.type] = (types[q.type] || 0) + 1;
    let canonical = q.answer;
    if (q.type === 'fill') canonical = q.answer[0];
    if (q.type === 'expression')
      canonical = q.answer.map((n, p) => `(${n})${p ? `*x^${p}` : ''}`).join('+');
    assert.equal(gradeAnswer(q, canonical).status, 'correct', q.id + ' canonical answer');
    if (q.type === 'number')
      assert.equal(
        gradeAnswer(q, String(q.answer) + q.unit).status,
        'correct',
        q.id + ' unit suffix',
      );
    if (q.type === 'fill')
      for (const variant of q.answer)
        assert.equal(gradeAnswer(q, variant).status, 'correct', q.id + ' fill variant');
    assert.equal(gradeAnswer(q, '').status, 'invalid', q.id + ' empty');
  }
}
assert.deepEqual(types, { single: 17, number: 48, multi: 17, expression: 1, fill: 2 });

const all = COURSES.flatMap((c) => c.questions);
const withUnit = (unit) => all.find((q) => q.type === 'number' && q.unit === unit);
for (const [unit, factor, suffix] of [
  ['mol', 1000, 'mmol'],
  ['L', 1000, 'mL'],
  ['V', 1000, 'mV'],
  ['m', 100, 'cm'],
  ['J', 0.001, 'kJ'],
  ['kJ/mol', 1000, 'J/mol'],
  ['m/s', 3.6, 'km/h'],
  ['s', 1 / 60, 'min'],
]) {
  const q = withUnit(unit);
  if (q)
    assert.equal(
      gradeAnswer(q, String(q.answer * factor) + suffix).status,
      'correct',
      unit + ' conversion',
    );
}
const numeric = COURSE.questions[0];
assert.equal(gradeAnswer(numeric, '１２').status, 'correct');
assert.equal(gradeAnswer(numeric, '12.059').status, 'correct');
assert.equal(gradeAnswer(numeric, '12.061').status, 'wrong');
for (const input of ['0xC', '12+0', 'Infinity', 'NaN', '1e9999', '12 kg'])
  assert.equal(gradeAnswer(numeric, input).status, 'unknown');
assert.equal(gradeAnswer(numeric, null).status, 'invalid');
assert.equal(gradeAnswer(COURSE.questions[1], '4×10^-1').status, 'correct');
assert.equal(gradeAnswer(COURSE.questions[1], '.4').status, 'correct');
assert.equal(gradeAnswer(COURSE.questions[2], '.4').status, 'wrong');
const multi = COURSE.questions[4];
assert.equal(gradeAnswer(multi, [1, 0]).status, 'correct');
assert.equal(gradeAnswer(multi, [0]).status, 'partial');
assert.equal(gradeAnswer(multi, [0, 0]).status, 'partial');
assert.equal(gradeAnswer(multi, [0, 1, 2]).status, 'wrong');
for (const input of [[], ['0', '1'], [4], [-1], [0.5], '0,1', null])
  assert.equal(gradeAnswer(multi, input).status, 'invalid');
const single = getCourse('math').questions[0];
assert.equal(gradeAnswer(single, [0, 1]).status, 'invalid');
assert.equal(gradeAnswer(single, [0]).status, 'wrong');
const fill = getCourse('chem').questions[4];
assert.equal(gradeAnswer(fill, '溶剂体积').status, 'unknown');
assert.equal(gradeAnswer(fill, ' 溶液 的体积 ').status, 'correct');
const expression = getCourse('math').questions[4];
for (const answer of ['4x-4', '4(x-2)+4', '(8x-8)/2', '4*x + (-4)'])
  assert.equal(gradeAnswer(expression, answer).status, 'correct');
for (const answer of ['4x+4', 'x', '4x-4+x*x'])
  assert.equal(gradeAnswer(expression, answer).status, 'wrong');
for (const answer of ['x/x', '4x/0', 'sin(x)', 'alert(1)', 'x^99'])
  assert.equal(gradeAnswer(expression, answer).status, 'unknown');
assert.equal(gradeAnswer(null, 12).status, 'invalid');
assert.equal(JSON.stringify(COURSES), originalState);
console.log(
  'PASS: pinned 17-chapter/85-question snapshot, six disciplines and five tracks, all source prose and twelve detailed derivations, every original answer/type/order, source unit conversions, partial/unknown/invalid semantics, symbolic expressions, no mutation.',
);
