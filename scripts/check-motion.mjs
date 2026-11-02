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

// Tablet perspective: all four projected corners must stay on the actual screen,
// including portrait and trapezoid views, rather than only matching its bounds.
const { screenTransform, createBoot } = await import('../workstation/boot.js');
for (const q of [
  [
    [0, 0],
    [640, 0],
    [640, 400],
    [0, 400],
  ],
  [
    [410, 290],
    [1020, 310],
    [1080, 650],
    [350, 635],
  ],
  [
    [30, 300],
    [340, 305],
    [380, 510],
    [10, 500],
  ],
  [
    [12, 20],
    [378, 20],
    [378, 810],
    [12, 810],
  ],
]) {
  const m = screenTransform(q);
  for (const [i, [x, y]] of [
    [0, [0, 0]],
    [1, [640, 0]],
    [2, [640, 400]],
    [3, [0, 400]],
  ]) {
    const w = m[3] * x + m[7] * y + 1;
    assert.ok(Math.abs((m[0] * x + m[4] * y + m[12]) / w - q[i][0]) < 1e-7);
    assert.ok(Math.abs((m[1] * x + m[5] * y + m[13]) / w - q[i][1]) < 1e-7);
  }
}
assert.equal(
  screenTransform([
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ]),
  null,
);

// Interruption regression: a superseded settle/close must never resurrect the
// old layer or hide the newer opening. No browser timing assumptions here.
const realDocument = globalThis.document,
  realRAF = globalThis.requestAnimationFrame,
  realListener = globalThis.addEventListener,
  realWidth = globalThis.innerWidth;
let queue = [],
  stamp = 0,
  layers = [];
const element = () => ({
  style: {
    setProperty(k, v) {
      this[k] = v;
    },
  },
  hidden: false,
  popover: '',
  up: false,
  classList: {
    values: new Set(),
    add(x) {
      this.values.add(x);
    },
    remove(x) {
      this.values.delete(x);
    },
    toggle(x, on) {
      on ? this.values.add(x) : this.values.delete(x);
    },
  },
  setAttribute() {},
  querySelector() {
    return element();
  },
  matches() {
    return this.up;
  },
  showPopover() {
    this.up = true;
  },
  hidePopover() {
    this.up = false;
  },
  getBoundingClientRect() {
    return { left: 20, top: 20, right: 1000, bottom: 700 };
  },
});
globalThis.document = {
  createElement: element,
  body: {
    classList: element().classList,
    append(el) {
      layers.push(el);
    },
  },
};
globalThis.addEventListener = () => {};
globalThis.innerWidth = 1536;
globalThis.requestAnimationFrame = (fn) => {
  queue.push(fn);
  return queue.length;
};
async function advance(ms = 100) {
  stamp += ms;
  const batch = queue;
  queue = [];
  batch.forEach((fn) => fn(stamp));
  await Promise.resolve();
  await Promise.resolve();
}
try {
  let settled = false;
  const station = {
    tabletView() {},
    get settled() {
      return settled;
    },
    screenQuad: () => [
      [100, 200],
      [600, 200],
      [650, 500],
      [50, 500],
    ],
  };
  const boot = createBoot({ motion: () => true, station: () => station }),
    dialog = element();
  const waiting = boot.animate(true, dialog);
  boot.cancel();
  await advance();
  await waiting;
  assert.equal(layers.length, 0, 'cancel during settle must not spawn the boot later');
  assert.equal(dialog.style.opacity, '');
  settled = true;
  const opening = boot.animate(true, dialog);
  await advance();
  await advance(500);
  assert.equal(layers[0].hidden, false);
  const closing = boot.animate(false, dialog);
  await advance();
  const reopening = boot.animate(true, dialog);
  await advance();
  await advance();
  assert.equal(layers[0].hidden, false, 'old close cannot hide the new opening');
  for (let i = 0; i < 40; i++) await advance();
  await Promise.all([opening, closing, reopening]);
  assert.equal(dialog.style.opacity, '');
  assert.equal(layers[0].hidden, true);
  assert.equal(dialog.classList.values.has('boot-moving'), false);
  boot.cancel();
} finally {
  globalThis.document = realDocument;
  globalThis.requestAnimationFrame = realRAF;
  globalThis.addEventListener = realListener;
  globalThis.innerWidth = realWidth;
}
console.log(
  'PASS: tablet perspective corners, cancellation during camera settle, rapid open/close/reopen cleanup.',
);
