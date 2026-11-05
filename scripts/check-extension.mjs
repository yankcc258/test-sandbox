import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COURSE_SNAPSHOT } from '../laboratory/course-snapshot.js';
import { createCourseData, courseData } from '../laboratory/course-data.js';
import { initialState, reduceState } from '../laboratory/state.js';
import { sectorAt, sectorCenter, layoutSectors } from '../laboratory/layout.js';
import { buildModelPoses } from '../laboratory/assembly-models.js';
import { createCourseSessions } from '../laboratory/course-session.js';
import { RECIPES } from '../laboratory/specimen-recipes.js';
import { evaluateCaseStudy } from '../laboratory/specimen-kit.js';

// Change only input data: unknown chapter/subject IDs must pass the real adapter,
// directory query, state reducer, recipe builder and session/grade boundary.
for (let count = 1; count <= 10; count++) {
  const snapshot = structuredClone(COURSE_SNAPSHOT);
  snapshot.disciplines = Array.from({ length: count }, (_, i) => ({
    id: `new-${i}`,
    name: `新学科 ${i}`,
    en: `NEW ${i}`,
    tracks: [`track-${i}`],
    planned: ['方向甲', '方向乙'],
  }));
  snapshot.tracks = snapshot.disciplines.map((d, i) => ({
    id: d.tracks[0],
    title: d.name,
    units: [`new-course-${i}`],
  }));
  snapshot.courses = snapshot.tracks.map((t, i) => ({
    ...snapshot.courses[0],
    id: t.units[0],
    track: t.id,
  }));
  const recipe = {
    ...RECIPES.math,
    id: 'new-course-0',
    camera: { elevation: 0.7 },
    caseStudy: { controls: [{ name: 'k', default: 2 }], values: { doubled: '2*k' } },
  };
  const data = createCourseData(snapshot, { [recipe.id]: recipe });
  let state = initialState(data.DISCIPLINES);
  assert.equal(state.discipline, 'new-0');
  assert.equal(layoutSectors(data.DISCIPLINES).length, count);
  const coverage = new Set(Array.from({ length: 288 }, (_, i) => sectorAt(i, 288, count)));
  assert.equal(coverage.size, count);
  for (let i = 0; i < count; i++) {
    assert.equal(sectorAt(sectorCenter(i, count) * 288, 288, count), i);
    const c = data.disciplineCourses(`new-${i}`)[0];
    assert.equal(c.id, `new-course-${i}`);
    assert(c.sections.some((s) => s.id === 'example'));
    state = reduceState(state, { type: 'chapter', chapter: c });
    assert.equal(state.stage, 'lesson');
    const model = buildModelPoses(c.id, undefined, c.observation);
    assert.equal(model.poses.length, 288);
    assert.equal(model.metadata.interactive, i === 0);
  }
  assert.deepEqual(evaluateCaseStudy(recipe.caseStudy, { k: 7 }), { doubled: 14 });
  const events = [],
    sessions = createCourseSessions({ data, onResult: (e) => events.push(e), now: () => 42 });
  const c = data.COURSES[0],
    s = sessions.get(c.id),
    q = c.questions[0];
  s.check(q);
  assert.equal(events.length, 0, 'invalid input does not produce an attempt');
  s.setDraft(q.id, q.answer);
  s.check(q);
  assert.equal(events[0].index, 0);
  assert.equal(events[0].courseId, c.id);
  assert.equal(events[0].result.status, 'correct');
  assert.equal(events[0].time, 42);
  events[0].input.push(99);
  events[0].result.status = 'wrong';
  assert.deepEqual(s.getDraft(q.id), q.answer);
  assert.equal(s.getResult(q.id).status, 'correct');
  s.setRead(true);
  s.setRead(true);
  s.setRead(false);
  assert.deepEqual(
    events.slice(1).map((e) => e.read),
    [true, false],
  );
  s.reset();
  assert.equal(events.length, 3, 'local reset must not erase formal records');
  assert.equal(data.gradeAnswer(courseData.COURSES[0].questions[0], [1]).status, 'invalid');
}
for (const file of [
  'scene.js',
  'state.js',
  'particle-field.js',
  'course-workspace.js',
  'course-session.js',
  'course-data.js',
]) {
  const src = readFileSync(new URL('../laboratory/' + file, import.meta.url), 'utf8');
  assert(!src.includes('math-partials'), `${file} must not branch on chapter IDs`);
  if (file !== 'course-data.js')
    assert(!src.includes('course-snapshot'), `${file} must use the adapter`);
}
console.log(
  'PASS: 1–10 new disciplines, data-only new chapter/recipe and archive fallback, lesson state, shared grading, isolated result callbacks and generic case values.',
);
