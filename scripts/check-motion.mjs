import assert from 'node:assert/strict';
import { passageFrame, PASSAGE, FLOORS } from '../sandbox/passage.js';

// 区域竖井（露娜）：三段时间线两端闭合；离开的最后一帧竖井完全不透明，才能换页。
const leave0 = passageFrame('leave', 0),
  leave1 = passageFrame('leave', PASSAGE.leave);
assert.ok(leave0.open.every((o) => o === 0) && leave0.shaft === 0);
assert.ok(
  leave1.open.every((o) => o === 1) && leave1.shaft === 1,
  '换页时竖井不透明、薄片全部翻开',
);
assert.equal(passageFrame('ride', 0).ride, 0);
assert.equal(passageFrame('ride', PASSAGE.ride).ride, 1);
const arrive0 = passageFrame('arrive', 0),
  arrive1 = passageFrame('arrive', PASSAGE.arrive);
assert.ok(arrive0.open.every((o) => o === 1) && arrive0.fall === 1);
assert.ok(arrive1.open.every((o) => o === 0) && arrive1.fall === 0, '到达时薄片全部合上');
// 楼层：工作台在实验室上面，复习区在实验室下面
assert.ok(FLOORS.workstation.level > FLOORS.lab.level && FLOORS.lab.level > FLOORS.review.level);

// 纸飞机（flight.js 依赖 DOM，这里只检查纯函数部分）
const { flightStage, FLIGHT } = await import('../workstation/flight.js');
assert.equal(flightStage(0).stage.id, 'paper');
assert.equal(flightStage(FLIGHT.total).stage.id, 'cz2f');
assert.equal(flightStage(0).stage.note, '从桌前出发');
let last = 0;
for (let t = 0; t <= FLIGHT.total; t += 0.1) {
  const { alt } = flightStage(t);
  assert.ok(alt >= last - 1e-9 && Number.isFinite(alt), '高度一路上升');
  last = alt;
}
console.log(
  'PASS: region passage timelines close at both ends, page switch hidden behind an opaque shaft, flight stages and rising altitude.',
);
