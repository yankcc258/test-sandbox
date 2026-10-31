import assert from 'node:assert/strict';
import { createLifeState, createSignal } from '../recall-life.js';
import { createVocabSession, SAMPLE_WORDS } from '../recall-vocab.js';

// Drive the same keyboard interface as the UI; verify the round, not just a counter.
const life = createLifeState(8);
let finishEvents = 0;
const fakeButton = { addEventListener() {} };
const root = {
  innerHTML: '',
  querySelector() {
    return fakeButton;
  },
  querySelectorAll() {
    return [];
  },
};
const session = createVocabSession(root, {
  words: SAMPLE_WORDS,
  onProgress: ({ completedKeys }) => life.progress(completedKeys),
  onDone: ({ tally }) => {
    finishEvents++;
    assert.equal(life.finish(tally), true);
  },
});
const key = (k) => session.key({ key: k });
const grade = (k) => {
  key(' ');
  key(k);
};
life.begin();
assert.equal(key('3'), false); // Cannot grade an unrevealed card.
grade('1'); // forgotten card must return, and must not count as completed.
assert.equal(life.snapshot.done, 0);
grade('2'); // uncertain card also returns.
grade('3');
assert.equal(life.snapshot.done, 1);
life.pause();
assert.equal(life.snapshot.phase, 'paused');
assert.equal(life.finish({}), false); // Browsing away cannot complete a round.
life.begin();
for (let i = 0; i < 12 && !session.finished; i++) grade('3');
assert.equal(session.finished, true);
assert.equal(finishEvents, 1);
assert.equal(life.snapshot.done, 8);
assert.equal(life.snapshot.left, 0);
assert.deepEqual(life.snapshot.record.tally, { again: 1, hard: 1, good: 6 });
grade('3');
life.progress([0, 0, -1, 30, 0.5]);
assert.equal(life.snapshot.done, 8);
assert.equal(finishEvents, 1);
assert.equal(life.finish({}), false);
life.begin();
life.pause();
assert.equal(life.snapshot.phase, 'complete');
life.reset();
assert.deepEqual(
  [life.snapshot.done, life.snapshot.left, life.snapshot.phase, life.snapshot.record],
  [0, 8, 'pending', null],
);

// Rapid retargeting replaces a signal; disabled motion clears it immediately.
const signal = createSignal();
signal.start('switch', 0, -8);
assert.ok(signal.step(0.2).y < 0);
signal.start('switch', -1, -2);
assert.equal(signal.step(0).y, -1);
assert.equal(signal.step(0.1).to, -2);
assert.equal(signal.step(0, false), null);
assert.equal(signal.step(0.2), null);
signal.start('complete', -2, 1, 2);
assert.ok(signal.step(1).strength > 0.99);
assert.equal(signal.step(1), null);
console.log(
  'PASS: actual card loop, pause/resume, unique progress, single completion, reset, transition interruption, motion off.',
);
