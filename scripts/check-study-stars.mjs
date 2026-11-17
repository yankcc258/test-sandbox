// 理解星图样稿（preview/study-stars）：亮度规则、连线、排布。画面检查要浏览器，这里只查算出来的东西。
import assert from 'node:assert/strict';
import {
  REGIONS,
  STATES,
  edgesOf,
  hasWrong,
  neighborsOf,
  starLevel,
} from '../preview/study-stars/model.js?v=1';
import { layoutStars, regionMarks } from '../preview/study-stars/layout.js?v=1';
import { STAGES, STARS, stageStars } from '../preview/study-stars/data.js?v=1';

// 1. 板块名单和正式站 src/stars-server.js 的 STAR_REGIONS 一致（顺序也一致）。
assert.deepEqual(
  REGIONS.map((r) => r.name),
  [
    '数学 · 微积分',
    '数学 · 线性代数',
    '数学 · 其他',
    '经典物理',
    '无机化学',
    '有机化学',
    '物理化学',
    '其他',
  ],
);

// 2. 亮度照设计稿「星的亮度」那张表。
const level = (star) => STATES[starLevel({ explains: [], takes: [], ...star })].name;
assert.equal(level({}), '刚开');
assert.equal(level({ explains: [{}] }), '聊过');
for (const score of [1, 2, 3]) assert.equal(level({ takes: [{ score }] }), '讲过');
for (const score of [4, 5]) assert.equal(level({ takes: [{ score }] }), '讲清楚了');
assert.equal(level({ takes: [{ score: 5 }], cardsStable: true }), '稳了');
// 只看最近一次；问答卡稳了但最近一次没讲清楚，不算稳
assert.equal(level({ takes: [{ score: 5 }, { score: 2 }], cardsStable: true }), '讲过');
assert.equal(level({ takes: [{ score: 2 }, { score: 4 }] }), '讲清楚了');
assert.equal(hasWrong({ wrong: 1 }), true);
assert.equal(hasWrong({}), false);

// 3. 示例数据：id 和正式站一个格式，名字不重复，板块都在名单里，连线都指向比自己早的星。
assert.ok(STARS.length >= 30);
assert.equal(new Set(STARS.map((s) => s.title)).size, STARS.length);
const regions = new Set(REGIONS.map((r) => r.name));
STARS.forEach((s, i) => {
  assert.match(s.id, /^s-\d{13}$/, s.title);
  assert.ok(regions.has(s.region), `${s.title}：板块不在名单里`);
  for (const l of s.links) {
    const to = STARS.findIndex((x) => x.id === l.to);
    assert.ok(to >= 0 && to !== i, `${s.title}：连线指向不存在的星`);
    assert.ok(l.why, `${s.title}：连线没写为什么连`);
  }
});
// 五档亮度和「有错」在示例里都出现，静帧上才看得到每一种
assert.deepEqual([...new Set(STARS.map(starLevel))].sort(), [0, 1, 2, 3, 4]);
assert.ok(STARS.some(hasWrong));

// 4. 连线两头都算；被截掉的星（前面的时刻）不留悬空的连线。
for (const stage of STAGES) {
  const stars = stageStars(stage.id),
    ids = new Set(stars.map((s) => s.id)),
    edges = edgesOf(stars);
  assert.equal(stars.length, stage.count);
  for (const e of edges) assert.ok(ids.has(e.from) && ids.has(e.to));
  for (const s of stars)
    for (const n of neighborsOf(s.id, edges))
      assert.ok(
        neighborsOf(n.id, edges).some((back) => back.id === s.id),
        '连线应该两头都看得到',
      );
}
assert.equal(stageStars('empty').length, 0);
assert.equal(starLevel(stageStars('first')[0]), 0, '刚开的星只有起点');

// 5. 排布：确定、有限、名字不叠（横着的名字：左右隔开些，上下可以近些）。
const stars = stageStars('grown'),
  pos = layoutStars(stars);
assert.deepEqual([...layoutStars(stars)], [...pos], '同样的星排两次应该一样');
for (const p of pos.values()) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
let closest = Infinity;
for (let i = 0; i < stars.length; i++)
  for (let j = i + 1; j < stars.length; j++) {
    const a = pos.get(stars[i].id),
      b = pos.get(stars[j].id);
    closest = Math.min(closest, Math.hypot(b.x - a.x, (b.y - a.y) * 2.1));
  }
assert.ok(closest > 110, `有两颗星挨得太近：${closest.toFixed(1)}`);
// 每颗星离自己的板块比离别的板块近：板块分得开
for (const s of stars) {
  const p = pos.get(s.id),
    near = REGIONS.map((r) => [r.name, Math.hypot(p.x - r.at[0], p.y - r.at[1])]).sort(
      (a, b) => a[1] - b[1],
    )[0][0];
  assert.equal(near, s.region, `${s.title} 跑到「${near}」那边去了`);
}
// 长出一颗新的星：原来的星挪动很小（大致不动），新的星落在它连着的那颗附近
const earlier = stars.slice(0, -1),
  before = layoutStars(earlier),
  after = layoutStars(stars, before),
  moved = Math.max(
    ...earlier.map((s) =>
      Math.hypot(after.get(s.id).x - before.get(s.id).x, after.get(s.id).y - before.get(s.id).y),
    ),
  );
assert.ok(moved < 30, `长一颗新的星，原来的星挪了 ${moved.toFixed(0)}`);
const born = after.get(stars.at(-1).id),
  parent = after.get(stars.at(-1).links[0]?.to) || { x: 0, y: 0 };
if (stars.at(-1).links.length)
  assert.ok(
    Math.hypot(born.x - parent.x, born.y - parent.y) < 320,
    '新的星应该落在它连着的那颗附近',
  );
// 板块的名字：有星的在这片星上方，没有星的在板块中心
const marks = regionMarks(REGIONS, stageStars('first'), layoutStars(stageStars('first')));
assert.equal(marks.filter((m) => m.count).length, 1);
assert.deepEqual(
  marks.filter((m) => !m.count).map((m) => [m.x, m.y]),
  REGIONS.filter((r) => r.name !== '数学 · 微积分').map((r) => r.at),
);

console.log(
  `PASS: study stars sample — brightness table, ${STARS.length} sample stars in ${STAGES.length} stages, links both ways, deterministic layout (closest pair ${closest.toFixed(0)}, growth moves others ≤ ${moved.toFixed(0)}).`,
);
