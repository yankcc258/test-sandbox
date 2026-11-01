import assert from 'node:assert/strict';
import { terminalFrame, terminalRect, quadMatrix } from '../recall-terminal.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
function transform(m, x, y) {
  const w = m[3] * x + m[7] * y + m[15];
  return { x: (m[0] * x + m[4] * y + m[12]) / w, y: (m[1] * x + m[5] * y + m[13]) / w };
}
const source = [
  { x: 240, y: 230 },
  { x: 680, y: 210 },
  { x: 700, y: 490 },
  { x: 250, y: 520 },
];
for (const [w, h] of [
  [1440, 900],
  [390, 844],
  [320, 568],
  [844, 390],
]) {
  const rect = terminalRect(w, h);
  assert.ok(rect.x >= 12 && rect.y >= 16 && rect.width > 0 && rect.height > 0);
  const corners = [
    [0, 0],
    [rect.width, 0],
    [rect.width, rect.height],
    [0, rect.height],
  ];
  const projected = quadMatrix(source, rect.width, rect.height);
  corners.forEach(([x, y], i) => {
    const p = transform(projected, x, y);
    near(p.x, source[i].x);
    near(p.y, source[i].y);
  });
  const finish = terminalFrame(source, rect, 1);
  corners.forEach(([x, y]) => {
    const p = transform(finish.matrix, x, y);
    near(p.x, rect.x + x);
    near(p.y, rect.y + y);
  });
  assert.equal(finish.opacity, 1);
  assert.equal(finish.body, 1);
  assert.equal(terminalFrame(source, rect, 0).opacity, 0);
  // 任意帧可反转，不另建返回曲线；透视全程有限，画面没有翻转或跳变。
  let previous = source[0];
  for (let i = 0; i <= 100; i++) {
    const frame = terminalFrame(source, rect, i / 100);
    assert.ok(frame.matrix.every(Number.isFinite));
    const top = transform(frame.matrix, 0, 0);
    assert.ok(Math.hypot(top.x - previous.x, top.y - previous.y) < 15);
    previous = top;
  }
}
console.log(
  'PASS: projected glass corners, perspective handoff, responsive bounds, reversible continuous path.',
);
for (const [w, h] of [
  [1920, 900],
  [1440, 900],
  [390, 844],
  [320, 568],
  [844, 390],
]) {
  const r = terminalRect(w, h, true);
  assert.ok(r.width > 0 && r.height > 0 && r.x >= 8 && r.y >= 8);
  assert.ok(r.x + r.width <= w - 8 && r.y + r.height <= h - 8);
  if (w > 1200) assert.ok(r.width > 1000);
}
