import assert from 'node:assert/strict';
import {
  bindExploreControls,
  clampZoom,
  wheelScale,
} from '../preview/starfield/explore-controls.js';
import { createSkyClient } from '../preview/starfield/sky-client.js';

const events = new Map(),
  captures = new Set(),
  buttons = new Map();
const originalDocument = globalThis.document;
globalThis.document = {
  getElementById(id) {
    if (!buttons.has(id)) buttons.set(id, {});
    return buttons.get(id);
  },
};
const canvas = {
  clientHeight: 800,
  classList: { add() {}, remove() {} },
  addEventListener(name, fn) {
    events.set(name, fn);
  },
  setPointerCapture(id) {
    captures.add(id);
  },
  hasPointerCapture(id) {
    return captures.has(id);
  },
  releasePointerCapture(id) {
    captures.delete(id);
  },
};
const turns = [],
  scales = [],
  picks = [];
bindExploreControls(canvas, {
  turn: (x) => turns.push(x),
  zoom: (x) => scales.push(x),
  pick: (...p) => picks.push(p),
  reset() {},
  close() {},
});
function pointer(name, id, x, y = 100, type = 'mouse') {
  events.get(name)({ pointerId: id, clientX: x, clientY: y, pointerType: type, button: 0 });
}
pointer('pointerdown', 1, 100);
pointer('pointermove', 1, 150);
pointer('pointerup', 1, 150);
assert.ok(turns[0] < 0);
assert.equal(picks.length, 0, 'drag must not click a body beneath its endpoint');
pointer('pointerdown', 1, 100);
pointer('pointerup', 1, 100);
assert.deepEqual(picks, [[100, 100]]);
pointer('pointerdown', 1, 100);
pointer('pointercancel', 1, 100);
pointer('pointerup', 1, 100);
assert.equal(picks.length, 1, 'cancelled gestures must not become taps');
pointer('pointerdown', 1, 100, 100, 'touch');
pointer('pointerdown', 2, 200, 100, 'touch');
pointer('pointermove', 2, 300, 100, 'touch');
assert.equal(scales.at(-1), 0.5, 'pinch out moves the camera closer');
pointer('pointerup', 2, 300, 100, 'touch');
pointer('pointerup', 1, 100, 100, 'touch');
assert.equal(picks.length, 1, 'neither end of a pinch may open details');
assert.equal(captures.size, 0);
assert.equal(clampZoom(0.001), 0.5);
assert.equal(clampZoom(900), 2.4);
assert.equal(wheelScale(1, 1, 800), wheelScale(16, 0, 800));
assert.equal(wheelScale(1, 2, 800), wheelScale(800, 0, 800));
globalThis.document = originalDocument;

// Report and detail requests can finish in a different order. Neither may
// overwrite the other's callback, including when the worker subsequently fails.
const originalWorker = globalThis.Worker;
let fake;
class FakeWorker {
  constructor() {
    fake = this;
    this.messages = [];
  }
  postMessage(message) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
}
globalThis.Worker = FakeWorker;
try {
  const request = createSkyClient();
  const report = request({ timestamp: 1 }),
    body = request({ type: 'body', body: 'mars', timestamp: 2 });
  const [r, b] = fake.messages;
  fake.onmessage({ data: { id: b.id, observation: 'mars' } });
  fake.onmessage({ data: { id: r.id, today: 'today' } });
  assert.equal((await body).observation, 'mars');
  assert.equal((await report).today, 'today');
  const failure = assert.rejects(request({ timestamp: 3 }));
  fake.onerror();
  await failure;
  assert.equal(fake.terminated, true);
  const retry = request({ timestamp: 4 });
  fake.onmessage({ data: { id: fake.messages[0].id, today: 'recovered' } });
  assert.equal((await retry).today, 'recovered');
} finally {
  globalThis.Worker = originalWorker;
}
console.log(
  'PASS: drag vs tap, cancellation, pinch release, zoom bounds, wheel units, concurrent report/detail replies and worker failure cleanup.',
);
