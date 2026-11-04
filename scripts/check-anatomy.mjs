import assert from 'node:assert/strict';
import { createAnatomy } from '../recall-anatomy.js';
import { createLifeState } from '../recall-life.js';

// Exercise the public panel API with deterministic reward ticks. An empty DOM
// adapter takes the normal render fallback and exposes the displayed readouts.
const root = { innerHTML: '', querySelectorAll: () => [] };
const life = createLifeState(8);
const timers = new Map();
let timerId = 0;
const original = { setInterval, clearInterval };
globalThis.setInterval = (callback) => {
  timers.set(++timerId, callback);
  return timerId;
};
globalThis.clearInterval = (id) => timers.delete(id);
const tick = () => [...timers.values()].forEach((callback) => callback());
try {
  const panel = createAnatomy({
    root,
    toggle: null,
    organs: { vocab: { en: 'BRAIN', name: '大脑' } },
    entries: Array.from({ length: 7 }, () => ({ count: 0 })),
    life: () => life.snapshot,
  });
  panel.show('vocab');
  life.progress([0, 1]);
  panel.grade({ completedKeys: [0, 1], tally: { again: 1, hard: 1, good: 2 } });
  assert.match(root.innerHTML, /首次回想模糊或忘了<\/span><b>2/);
  assert.match(root.innerHTML, /已经稳定<\/span><b>2/);
  assert.match(root.innerHTML, /--level:1\.000/);
  assert.equal(timers.size, 1);
  tick();
  assert.match(root.innerHTML, /--level:0\.860/);

  life.reset();
  panel.reset();
  assert.equal(timers.size, 0, 'reset cancels the old reward decay');
  assert.match(root.innerHTML, /首次回想模糊或忘了<\/span><b>0/);
  assert.match(root.innerHTML, /已经稳定<\/span><b>0/);
  assert.match(root.innerHTML, /--level:0\.120/);
  assert.match(root.innerHTML, /基线/);
  const resetView = root.innerHTML;
  tick();
  assert.equal(root.innerHTML, resetView, 'old timers cannot alter the reset view');

  life.progress([0]);
  panel.grade({ completedKeys: [0], tally: { again: 0, hard: 0, good: 1 } });
  assert.match(root.innerHTML, /--level:1\.000/, 'first completion of the new round rewards again');
  assert.equal(timers.size, 1);
  panel.grade({ completedKeys: [0], tally: { again: 1, hard: 0, good: 1 } });
  assert.equal(timers.size, 1, 'repeated progress does not create another reward timer');
  panel.reset();
  panel.reset();
  assert.equal(timers.size, 0, 'repeated resets remain safe');
} finally {
  globalThis.setInterval = original.setInterval;
  globalThis.clearInterval = original.clearInterval;
}
console.log(
  'PASS: anatomy reset clears recall tallies, reward baseline and decay; next-round rewards restart.',
);
