import assert from 'node:assert/strict';
import { COURSES, getCourse } from '../laboratory/course-data.js';
import { createCourseSession, createCourseSessions } from '../laboratory/course-session.js';

import { evaluateCaseStudy } from '../laboratory/specimen-kit.js';
const COURSE = getCourse('math-partials');
const compareExample = (dx, dy) => evaluateCaseStudy(COURSE.observation.caseStudy, { dx, dy });
const session = createCourseSession(COURSE.id);
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

// All chapters have independent latest answers. Opening/finishing practice must
// never mark a chapter as read, and a practice reset must not revoke that mark.
let time = 100;
const registry = createCourseSessions({ now: () => time++ });
const answerFor = (question) =>
  question.type === 'expression'
    ? '4x-4'
    : question.type === 'fill'
      ? question.answer[0]
      : Array.isArray(question.answer)
        ? [...question.answer]
        : String(question.answer);
for (const course of COURSES) {
  const owner = registry.get(course.id);
  assert.equal(owner, registry.get(course.id), 'reopening a chapter reuses its page session');
  for (const question of course.questions) {
    owner.setDraft(question.id, answerFor(question));
    assert.equal(owner.check(question).status, 'correct', question.id);
  }
  assert.deepEqual(registry.getProgress(course.id), {
    read: false,
    checked: course.questions.length,
    correct: course.questions.length,
    total: course.questions.length,
    results: course.questions.map(() => 'correct'),
  });
}
const partials = registry.get('math-partials');
const math = registry.get('math');
const mathFirst = getCourse('math').questions[0];
partials.setRead(true);
partials.reset();
assert.equal(registry.getProgress('math-partials').read, true);
assert.equal(registry.getProgress('math-partials').correct, 0);
assert.equal(registry.getProgress('math').correct, 5, 'reset only affects its own course');
assert.equal(partials.setRead(false), true);
assert.equal(partials.setRead(false), false);
assert.equal(registry.getProgress('math-partials').read, false);
assert.equal(
  partials.setDraft(mathFirst.id, [1]),
  false,
  'foreign questions cannot enter a course session',
);
assert.equal(partials.check(mathFirst).status, 'invalid');
assert.equal(partials.summary().checked, 0);

// Read APIs expose copies. A consumer cannot mutate drafts, verdicts, course
// status or visit history while painting a directory or rebuilding its forms.
const savedChoice = math.getDraft(mathFirst.id);
savedChoice.push(0);
assert.deepEqual(math.getDraft(mathFirst.id), [1]);
const savedResult = math.getResult(mathFirst.id);
savedResult.status = 'wrong';
savedResult.correct = false;
assert.equal(math.getResult(mathFirst.id).status, 'correct');
const savedProgress = registry.getProgress('math');
savedProgress.read = true;
savedProgress.results[0] = 'wrong';
assert.equal(registry.getProgress('math').read, false);
assert.equal(registry.getProgress('math').results[0], 'correct');

// Unknown free wording/parsing retains its own status rather than becoming a
// false wrong answer; changing that draft clears the stale submitted result.
const chemistry = registry.get('chem');
const fill = getCourse('chem').questions.find((question) => question.type === 'fill');
chemistry.setDraft(fill.id, '用自己的话描述，尚未匹配');
assert.equal(chemistry.check(fill).status, 'unknown');
assert.equal(registry.getProgress('chem').results[fill.index], 'unknown');
assert.equal(registry.getProgress('chem').correct, 4);
chemistry.setDraft(fill.id, fill.answer[0]);
assert.equal(registry.getProgress('chem').results[fill.index], 'unanswered');
assert.equal(chemistry.getResult(fill.id), undefined);
assert.equal(
  chemistry.check({ ...fill, answer: ['篡改答案'] }).status,
  'correct',
  'grade uses its pinned canonical question',
);

registry.recordVisit('math', 'details');
registry.recordVisit('math', 'study');
registry.recordVisit('math-partials', 'study');
assert.deepEqual(registry.getVisits('math'), [
  { id: 'math', action: 'study', time: 101 },
  { id: 'math', action: 'details', time: 100 },
]);
assert.equal(registry.recordVisit('math', 'read'), null);
assert.equal(registry.recordVisit('not-a-course', 'study'), null);
const copiedVisits = registry.getVisits('math');
copiedVisits[0].action = 'details';
copiedVisits.pop();
assert.equal(registry.getVisits('math').length, 2);
assert.equal(registry.getVisits('math')[0].action, 'study');
assert.equal(createCourseSessions().getVisits().length, 0, 'new page has no previous visits');
assert.deepEqual(createCourseSessions().getProgress('math'), {
  read: false,
  checked: 0,
  correct: 0,
  total: 5,
  results: Array(5).fill('unanswered'),
});
assert.equal(registry.get('not-a-course'), null);
assert.throws(() => createCourseSession('not-a-course'), RangeError);
console.log(
  'PASS: all 17 independent course sessions, all answer types, explicit read/undo, isolated reset/drafts/results, unknown verdicts, page-only visit snapshots, exact course example and halved increments.',
);
