// 展品 04 · 大螺旋（exhibits/spiral）：自成一体、课程快照、目录大类、每章都能组装出观察模型。
// 画面检查在 check-spiral-browser.mjs（要浏览器）。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COURSE_SNAPSHOT } from '../exhibits/spiral/course-snapshot.js';
import {
  COURSES,
  DISCIPLINES,
  SOURCE_COMMIT,
  createCourseData,
  disciplineCourses,
  disciplineGroups,
  gradeAnswer,
} from '../exhibits/spiral/course-data.js';
import { ASSEMBLY_COUNT, buildModelPoses } from '../exhibits/spiral/assembly-models.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (path) => relative(root, path).split(sep).join('/');

// 1. 自成一体：从页面出发的模块只在 exhibits/spiral/ 和 vendor/three/ 里，
//    不引用 laboratory/。以后一楼换成别的东西，这件展品不受影响。
const html = await readFile(resolve(root, 'exhibits/spiral/index.html'), 'utf8');
const entry = html.match(/<script type="module" src="([^"]+)"/)[1];
const tags = new Set(),
  seen = new Set();
async function walk(path) {
  if (seen.has(path)) return;
  seen.add(path);
  const text = await readFile(path, 'utf8');
  for (const [, ref] of text.matchAll(/(?:\bfrom\s+|\bimport\s*\()['"](\.[^'"]+)['"]/g)) {
    const [file, query = ''] = ref.split('?');
    const target = resolve(dirname(path), file);
    if (rel(target).startsWith('exhibits/spiral/')) tags.add(query);
    await walk(target);
  }
}
const [entryFile, entryQuery = ''] = entry.split('?');
tags.add(entryQuery);
await walk(resolve(root, 'exhibits/spiral', entryFile));
const modules = [...seen].map(rel).sort();
const outside = modules.filter(
  (m) => !m.startsWith('exhibits/spiral/') && !m.startsWith('vendor/three/'),
);
assert.deepEqual(outside, [], `展品引用了目录外的模块：${outside.join('、')}`);
assert.equal(modules.filter((m) => m.startsWith('exhibits/spiral/')).length, 20);
// 同一个模块带不同的 ?v= 会被浏览器当成两份，状态就分家了。
assert.deepEqual([...tags], ['v=1'], `模块版本号不一致：${[...tags].join('、')}`);
for (const [, href] of html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g))
  assert.match(href, /^\.\/[\w-]+\.css\?v=1$/);

// 2. 课程快照：和 laboratory/ 同一份正式站内容（17 章、85 题、6 个学科），只多了大类。
assert.equal(SOURCE_COMMIT, '05be1e3f63e4a81f3e4b52ca37c06d43aeb38b4c');
assert.equal(COURSES.length, 17);
assert.equal(
  COURSES.reduce((n, c) => n + c.questions.length, 0),
  85,
);
assert.equal(DISCIPLINES.length, 6);
const { COURSE_SNAPSHOT: LAB_SNAPSHOT } = await import('../laboratory/course-snapshot.js');
const withoutGroups = (snapshot) => ({
  ...snapshot,
  tracks: snapshot.tracks.map(({ groups, ...track }) => track),
});
assert.deepEqual(
  withoutGroups(COURSE_SNAPSHOT),
  withoutGroups(LAB_SNAPSHOT),
  '展品的课程快照应与 laboratory/ 的一致（大类除外）',
);

// 3. 目录大类（正式站 v3.2）：数学分成微积分、线性代数（规划中）、其他；
//    每章恰好出现一次，顺序和扁平目录一致。
const names = (id) => disciplineGroups(id).map((g) => `${g.name}:${g.courses.length}`);
assert.deepEqual(names('mathematics'), ['微积分:4', '线性代数:0', '其他:1']);
for (const d of DISCIPLINES) {
  const groups = disciplineGroups(d.id),
    flat = groups.flatMap((g) => g.courses.map((c) => c.id));
  assert.deepEqual(
    flat,
    disciplineCourses(d.id).map((c) => c.id),
  );
  assert.equal(new Set(flat).size, flat.length, `${d.name}：有章节重复出现`);
  assert.equal(new Set(groups.map((g) => g.key)).size, groups.length);
}
assert.equal(
  DISCIPLINES.flatMap((d) => disciplineCourses(d.id)).length,
  17,
  '17 章都应能从某个学科进入',
);
// groups 漏写的章节归到最后的「其他」，不会从目录里消失。
const partial = createCourseData({
  ...COURSE_SNAPSHOT,
  tracks: COURSE_SNAPSHOT.tracks.map((t) =>
    t.id === 'math' ? { ...t, groups: [{ name: '微积分', units: ['math'] }] } : t,
  ),
});
assert.deepEqual(
  partial.disciplineGroups('mathematics').map((g) => `${g.name}:${g.courses.length}`),
  ['微积分:1', '其他:4'],
);

// 4. 判题照常能用：空答案被拦下，不会抛错。
for (const course of COURSES)
  for (const question of course.questions)
    assert.equal(gradeAnswer(question, '').status, 'invalid');

// 5. 每一章都能组装：288 片薄片，位置、朝向、大小都是有限数。
for (const course of COURSES) {
  const model = buildModelPoses(course.id);
  assert.equal(model.poses.length, ASSEMBLY_COUNT, `${course.id}：薄片数不对`);
  for (const pose of model.poses)
    for (const key of ['position', 'rotation', 'scale'])
      assert.ok(pose[key].every(Number.isFinite), `${course.id}：${key} 不是有限数`);
  assert.ok(model.metadata.title, `${course.id}：观察模型没有标题`);
}

// 6. 正式站 v3.0.1 的样子：螺旋大而居中，螺旋上不挂文字标签。
const scene = await readFile(resolve(root, 'exhibits/spiral/scene.js'), 'utf8');
assert.match(scene, /SPIRAL_OVERVIEW_DISTANCE = 4\.4,\s+SPIRAL_FOCUS_DISTANCE = 4\.6;/);
assert.ok(scene.includes('let cameraDistance = SPIRAL_OVERVIEW_DISTANCE,'));
assert.ok(scene.includes('? SPIRAL_FOCUS_DISTANCE'));
assert.ok(scene.includes(': SPIRAL_OVERVIEW_DISTANCE) * fit;'));
const css = await readFile(resolve(root, 'exhibits/spiral/spiral.css'), 'utf8');
assert.match(css, /\.model-anchor \{\s+display: none !important;/);

console.log(
  'PASS: spiral exhibit is self-contained (20 modules), 17 courses / 85 questions, grouped directory, every chapter assembles 288 slices.',
);
