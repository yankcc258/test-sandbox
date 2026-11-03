import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import vm from 'node:vm';
import { flightPixelRatio } from '../workstation/flight.js';
import { STARFIELD_ASSETS, warmStarfield } from '../preview/starfield/preload.js';
import { calculateSkyReport } from '../preview/starfield/sky-report.js';
import '../preview/starfield/vendor/astronomy/astronomy.browser.min.js';
import { seekoNight } from '../sandbox/seeko.js';

for (const [w, h, dpr] of [
  [390, 844, 3],
  [1920, 1080, 2],
  [3840, 2160, 2],
  [1280, 720, 1],
]) {
  const scale = flightPixelRatio(w, h, dpr);
  assert.ok(scale <= dpr && scale <= 2 && w * h * scale * scale <= 2000000.001);
}
// Prefetch is bounded and best-effort; a failed asset cannot strand the flight.
await Promise.all(STARFIELD_ASSETS.map((url) => access(new URL(url))));
let active = 0,
  peak = 0,
  calls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  active++;
  peak = Math.max(peak, active);
  calls++;
  await new Promise((resolve) => setTimeout(resolve, 1));
  active--;
  if (calls % 4 === 0) throw Error('test network failure');
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
};
try {
  await warmStarfield();
  await warmStarfield();
  assert.equal(calls, STARFIELD_ASSETS.length);
  assert.ok(peak <= 2);
} finally {
  globalThis.fetch = originalFetch;
}

// Run the actual browser worker module with a thin Node message bridge. Dates
// and event order must survive structured cloning, including Tokyo midnight.
const url = new URL('../preview/starfield/sky-report-worker.js', import.meta.url).href;
const worker = new Worker(
  new URL(
    'data:text/javascript,' +
      encodeURIComponent(`import {parentPort} from 'node:worker_threads';
globalThis.self=globalThis;globalThis.postMessage=data=>parentPort.postMessage(data);
parentPort.on('message',data=>globalThis.onmessage({data}));
await import(${JSON.stringify(url)});parentPort.postMessage({ready:true});`),
  ),
);
const receive = () =>
  new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
try {
  await receive();
  for (const [id, stamp] of ['2026-11-02T14:59:59Z', '2026-11-02T15:00:01Z'].entries()) {
    const timestamp = Date.parse(stamp),
      expected = calculateSkyReport(globalThis.Astronomy, timestamp);
    const received = receive();
    worker.postMessage({ id, timestamp });
    const actual = await received;
    assert.equal(actual.id, id);
    delete actual.id;
    assert.deepEqual(actual, expected);
  }
} finally {
  await worker.terminate();
}
assert.equal(seekoNight(new Date('2026-11-02T13:59:00Z')), false);
assert.equal(seekoNight(new Date('2026-11-02T14:00:00Z')), true);
assert.equal(seekoNight(new Date('2026-11-02T21:00:00Z')), false);

// The arrival cover must wait for a rendered scene, not just navigation load.
const arrivalSource = await readFile(
  new URL('../preview/starfield/arrival.js', import.meta.url),
  'utf8',
);
function arrival(still = false) {
  let removed = false,
    timerId = 0;
  const events = new Map(),
    timers = new Map(),
    classes = new Set();
  const layer = {
    className: '',
    classList: { add: (c) => classes.add(c) },
    setAttribute() {},
    remove() {
      removed = true;
    },
    querySelector: () => ({ getContext: () => ({ scale() {}, fillRect() {} }) }),
  };
  const context = {
    Date,
    Math,
    JSON,
    URLSearchParams,
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
    sessionStorage: { getItem: () => JSON.stringify({ at: Date.now(), still }), removeItem() {} },
    matchMedia: () => ({ matches: false }),
    location: { search: '' },
    document: {
      createElement: () => layer,
      head: { append() {} },
      body: { append() {} },
      documentElement: { dataset: {} },
    },
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
    setTimeout: (fn, ms) => {
      timers.set(++timerId, { fn, ms });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => fn(),
  };
  vm.runInNewContext(arrivalSource, context);
  return {
    events,
    timers,
    classes,
    get removed() {
      return removed;
    },
  };
}
const cover = arrival();
cover.events.get('load')?.();
assert.equal(cover.classes.has('out'), false, 'page load alone cannot reveal unfinished textures');
cover.events.get('zhixu:starfield-ready')();
assert.equal(cover.classes.has('out'), true);
assert.equal(
  [...cover.timers.values()].some((t) => t.ms === 12000),
  false,
);
for (const timer of cover.timers.values()) timer.fn();
assert.equal(cover.removed, true);
const still = arrival(true);
still.events.get('zhixu:starfield-ready')();
assert.equal(still.removed, true);
const failed = arrival();
[...failed.timers.values()].find((t) => t.ms === 12000).fn();
assert.equal(failed.classes.has('out'), true);
console.log(
  'PASS: flight pixel budget, bounded best-effort prefetch, real sky worker results across Tokyo midnight, arrival readiness/fallback/reduced motion.',
);
