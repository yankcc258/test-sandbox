import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import '../preview/starfield/vendor/astronomy/astronomy.browser.min.js';
import { BODY_INFO, calculateBodyObservation } from '../preview/starfield/body-info.js';
import { calculateSkyReport } from '../preview/starfield/sky-report.js';
import { skyDay } from '../preview/starfield/orbit-sky.js';

const A = globalThis.Astronomy;
const beforeMidnight = Date.parse('2026-11-03T14:59:59Z');
const afterMidnight = Date.parse('2026-11-03T15:00:01Z');
assert.equal(skyDay(beforeMidnight), '2026-11-03');
assert.equal(skyDay(afterMidnight), '2026-11-04');
assert.equal(Object.keys(BODY_INFO).length, 8);

let slowest = 0;
for (const timestamp of [beforeMidnight, afterMidnight, Date.parse('2026-06-21T03:00:00Z')]) {
  for (const [id, info] of Object.entries(BODY_INFO)) {
    assert.ok(info.name && info.en && info.kind && info.description);
    assert.ok(info.facts.every(([label, value]) => label && value));
    assert.equal(new URL(info.source.url).hostname, 'science.nasa.gov');
    const start = performance.now();
    const observation = calculateBodyObservation(A, id, timestamp);
    slowest = Math.max(slowest, performance.now() - start);
    assert.equal(observation.id, id);
    assert.equal(observation.timestamp, timestamp);
    if (id === 'earth') {
      assert.deepEqual(observation, { id, timestamp, observer: true });
      continue;
    }
    assert.ok(Number.isFinite(observation.distanceKm) && observation.distanceKm > 0);
    assert.ok(observation.altitude >= -90 && observation.altitude <= 90);
    assert.ok(observation.azimuth >= 0 && observation.azimuth < 360);
    for (const direction of ['rise', 'set']) {
      const event = observation[direction];
      assert.ok(event === null || event instanceof Date);
      if (event) {
        assert.ok(event.getTime() >= timestamp);
        assert.ok(event.getTime() <= timestamp + 2 * 86400000);
      }
    }
  }
}

// Tokyo must observe a daytime Sun at local noon, not UTC noon. The night
// counterpart checks longitude, timezone and the horizontal coordinate frame.
const midday = calculateBodyObservation(A, 'sun', Date.parse('2026-11-03T03:00:00Z'));
const midnight = calculateBodyObservation(A, 'sun', afterMidnight);
assert.ok(midday.altitude > 35 && midday.altitude < 45);
assert.ok(midday.azimuth > 160 && midday.azimuth < 210);
assert.ok(midnight.altitude < -60);
assert.ok(midday.distanceKm > 145000000 && midday.distanceKm < 153000000);

// These are the NEXT events. Crossing a sunrise must advance the returned
// sunrise to the following day; sunset remains the upcoming evening.
assert.ok(midnight.rise instanceof Date && midnight.set instanceof Date);
const justBeforeRise = calculateBodyObservation(A, 'sun', midnight.rise.getTime() - 120000);
const justAfterRise = calculateBodyObservation(A, 'sun', midnight.rise.getTime() + 120000);
assert.ok(justAfterRise.altitude > justBeforeRise.altitude);
assert.ok(Math.abs(justBeforeRise.rise - midnight.rise) < 1000);
assert.ok(justAfterRise.rise - midnight.rise > 20 * 3600000);
assert.ok(Math.abs(justBeforeRise.set - justAfterRise.set) < 1000);

const moon = calculateBodyObservation(A, 'luna', beforeMidnight);
assert.ok(moon.distanceKm > 350000 && moon.distanceKm < 410000);
assert.ok(moon.illumination >= 0 && moon.illumination <= 1);
const newMoon = A.SearchMoonPhase(0, new Date(beforeMidnight), 40).date;
const fullMoon = A.SearchMoonPhase(180, new Date(beforeMidnight), 40).date;
assert.ok(calculateBodyObservation(A, 'luna', +newMoon).illumination < 0.01);
assert.ok(calculateBodyObservation(A, 'luna', +fullMoon).illumination > 0.99);
assert.ok(calculateBodyObservation(A, 'jupiter', beforeMidnight).distanceKm > 5e8);
// Earth is an observing site, never a fabricated Earth-to-Earth sky direction.
assert.deepEqual(calculateBodyObservation({}, 'earth', beforeMidnight), {
  id: 'earth',
  timestamp: beforeMidnight,
  observer: true,
});
assert.throws(() => calculateBodyObservation(A, 'constructor', beforeMidnight), RangeError);
assert.throws(() => calculateBodyObservation(A, 'pluto', beforeMidnight), RangeError);
assert.throws(() => calculateBodyObservation(A, 'earth', NaN), RangeError);

// Exercise the real worker with concurrent report/selected-body messages.
// Dates and correlation IDs must survive structured cloning and errors.
const url = new URL('../preview/starfield/sky-report-worker.js', import.meta.url).href;
const worker = new Worker(
  new URL(
    'data:text/javascript,' +
      encodeURIComponent(`
import { parentPort } from 'node:worker_threads';
globalThis.self = globalThis;
globalThis.postMessage = data => parentPort.postMessage(data);
parentPort.on('message', data => globalThis.onmessage({ data }));
await import(${JSON.stringify(url)});
parentPort.postMessage({ ready: true });
`),
  ),
);
const pending = new Map();
let resolveReady, rejectReady;
const ready = new Promise((resolve, reject) => {
  resolveReady = resolve;
  rejectReady = reject;
});
worker.on('message', (data) => {
  if (data.ready) return resolveReady();
  pending.get(data.id)?.resolve(data);
  pending.delete(data.id);
});
worker.on('error', (error) => {
  rejectReady(error);
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
});
function request(data) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(data.id);
      reject(Error('Worker timeout'));
    }, 10000);
    pending.set(data.id, {
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    worker.postMessage(data);
  });
}
try {
  await ready;
  const [bodyResult, reportResult, errorResult, earthResult] = await Promise.all([
    request({ id: 1, type: 'body', body: 'luna', timestamp: beforeMidnight }),
    request({ id: 2, timestamp: afterMidnight }),
    request({ id: 3, type: 'body', body: 'unknown', timestamp: afterMidnight }),
    request({ id: 4, type: 'body', body: 'earth', timestamp: afterMidnight }),
  ]);
  assert.deepEqual(bodyResult, { id: 1, observation: moon });
  assert.ok(bodyResult.observation.rise instanceof Date);
  assert.deepEqual(reportResult, { id: 2, ...calculateSkyReport(A, afterMidnight) });
  assert.deepEqual(errorResult, { id: 3, error: true });
  assert.deepEqual(earthResult, {
    id: 4,
    observation: { id: 'earth', timestamp: afterMidnight, observer: true },
  });
} finally {
  await worker.terminate();
}
console.log(
  `PASS: eight body archives, Tokyo day/night and midnight, physical distance/phase ranges, next-rise rollover, concurrent worker messages. Slowest observation ${slowest.toFixed(1)} ms.`,
);
