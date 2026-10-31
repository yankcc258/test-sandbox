import assert from 'node:assert/strict';
import { createHeart } from '../recall-backdrop.js';
import { bindPulseInput } from '../recall-pulse-input.js';
function advance(h, from, to) {
  for (let t = from; t < to - 1e-8; ) {
    const dt = Math.min(1 / 120, to - t);
    t += dt;
    h.step(dt, t);
  }
}
function pace(interval, count = 8) {
  const h = createHeart();
  let now = 0;
  for (let i = 0; i < count; i++) {
    h.click(now);
    advance(h, now, now + interval);
    now += interval;
  }
  return { h, now };
}
for (const [interval, bpm] of [
  [1, 60],
  [0.5, 120],
  [1.25, 48],
]) {
  const { h, now } = pace(interval);
  assert(Math.abs(h.tempo - bpm) < 0.01);
  assert(Math.abs(h.bpm - bpm) < 1, `${interval}s clicks should settle at ${bpm} BPM`);
  assert.equal(h.stage, '');
  advance(h, now, now + 22);
  assert.equal(h.bpm, 64);
  assert.equal(h.mode, 'rest');
}
{
  const h = createHeart();
  h.click(1);
  assert.equal(h.click(1.01), false);
  assert.equal(h.clicks.length, 1);
  let peak = 0;
  for (let t = 1; t < 1.1; t += 0.005) {
    h.step(0.005, t);
    peak = Math.max(peak, h.sample());
  }
  assert(peak > 0.85, 'A single click must visibly write a QRS peak within 100 ms');
}
{
  const h = createHeart();
  let now = 0;
  h.click(now);
  for (const interval of [0.49, 0.51, 0.5, 0.18, 0.5]) {
    advance(h, now, now + interval);
    now += interval;
    h.click(now);
  }
  assert(Math.abs(h.tempo - 120) < 0.1, 'One stray fast interval must not dominate the rhythm');
  advance(h, now, now + 3);
  h.click(now + 3);
  assert.equal(h.tempo, null, 'A paused session must learn the new rhythm afresh');
}
{
  const { h, now } = pace(0.5);
  h.locked = true;
  assert.equal(h.click(now), false);
  advance(h, now, now + 20);
  assert.equal(h.bpm, 64);
  assert.equal(h.stage, '');
  assert.equal(h.intervals.length, 0);
}
{
  const { h, now } = pace(0.25, 16);
  assert(h.overloadAt >= 0, 'Sustained rapid clicks retain the overload sequence');
  advance(h, now, now + 10);
  assert.equal(h.overloadAt, -1);
  assert.equal(h.bpm, 64);
  assert.equal(h.burst, 0);
  assert.equal(h.flat, false);
}
// Exercise input boundaries with event-shaped objects, including a drag that returns to its origin.
{
  const handlers = new Map(),
    stage = {
      addEventListener: (type, f) => handlers.set(type, f),
      removeEventListener: (type) => handlers.delete(type),
    };
  let enabled = true,
    pulses = 0;
  const dispose = bindPulseInput(stage, { enabled: () => enabled, onPulse: () => pulses++ });
  const emit = (type, patch = {}) =>
    handlers.get(type)({
      isPrimary: true,
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      target: { closest: () => false },
      ...patch,
    });
  emit('pointerdown');
  emit('pointerup');
  assert.equal(pulses, 1);
  emit('pointerdown');
  emit('pointermove', { clientX: 30 });
  emit('pointerup');
  assert.equal(pulses, 1, 'Dragging must not count even when ending at the origin');
  emit('pointerdown', { button: 2 });
  emit('pointerup');
  assert.equal(pulses, 1);
  emit('pointerdown', { isPrimary: false });
  emit('pointerup');
  assert.equal(pulses, 1);
  emit('pointerdown', { target: { closest: () => true } });
  emit('pointerup');
  assert.equal(pulses, 1, 'Content and dock controls must not stimulate the specimen');
  emit('pointerdown');
  enabled = false;
  emit('pointerup');
  assert.equal(pulses, 1);
  enabled = true;
  emit('pointerdown');
  emit('pointercancel');
  emit('pointerup');
  assert.equal(pulses, 1);
  dispose();
  assert.equal(handlers.size, 0);
}
console.log(
  'PASS · interval-based tempo, immediate pulse, jitter tolerance, rest recovery, content lock, overload recovery and click/drag/control filtering.',
);
