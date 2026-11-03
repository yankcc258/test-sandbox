import assert from 'node:assert/strict';
import { COURSE } from '../laboratory/course-data.js';
import { createCourseSession, compareExample } from '../laboratory/course-session.js';

const session = createCourseSession();
const first = COURSE.questions[0];
assert.equal(session.check(first).status, 'invalid');
assert.deepEqual(session.summary(), { checked: 0, correct: 0, total: 5 });
session.setDraft(first.id, '12');
for (let i = 0; i < 10; i++) assert.equal(session.check(first).status, 'correct');
assert.deepEqual(session.summary(), { checked: 1, correct: 1, total: 5 });
session.setDraft(first.id, '7');
assert.equal(session.summary().correct, 0, 'editing an answer invalidates its stale result');
assert.equal(session.check(first).status, 'wrong');
const choice = COURSE.questions[4];
const draft = [0];
session.setDraft(choice.id, draft);
draft.push(1);
assert.equal(session.check(choice).status, 'partial', 'drafts must not share mutable arrays');
for (const question of COURSE.questions) {
  session.setDraft(question.id, question.answer);
  assert.equal(session.check(question).status, 'correct');
}
assert.deepEqual(session.summary(), { checked: 5, correct: 5, total: 5 });
assert.deepEqual(
  createCourseSession().summary(),
  { checked: 0, correct: 0, total: 5 },
  'new page/session is empty',
);
session.reset();
assert.deepEqual(session.summary(), { checked: 0, correct: 0, total: 5 });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10);
const original = compareExample(0.1, -0.2);
near(original.differential, 0.4);
near(original.exact, 0.348);
near(original.error, 0.052);
const half = compareExample(0.05, -0.1);
near(half.differential, 0.2);
near(half.exact, 0.18725);
near(half.error, 0.01275);
assert.ok(Math.abs(half.error) < Math.abs(original.error));
near(compareExample(0, 0).exact, 0);
assert.throws(() => compareExample(NaN, 0), TypeError);
console.log(
  'PASS: invalid/partial/latest answers, unique results, reset/session isolation, exact course example and halved increments.',
);
