import assert from 'node:assert/strict';
import {
  radiusAt,
  properTimeAt,
  coordinateTimeAt,
  arrivalTimeAt,
  etaAtRadius,
  etaAtTime,
  duration,
  signalShift,
  fallEnergy,
  scales,
  infallState,
} from '../exhibits/schwarzschild/infall.js';
const close = (actual, expected, tolerance, label) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} vs ${expected}`,
  );
const derivative = (fn, x, h = 1e-6) => (fn(x + h) - fn(x - h)) / (2 * h);
for (const R of [6, 8, 16]) {
  const E = fallEnergy(R),
    horizon = etaAtRadius(R, 1);
  assert.equal(radiusAt(R, 0), R);
  assert.equal(properTimeAt(R, 0), 0);
  assert.equal(arrivalTimeAt(R, 0), 0);
  assert.ok(Number.isFinite(properTimeAt(R, horizon)));
  assert.equal(arrivalTimeAt(R, horizon), Infinity);
  assert.equal(coordinateTimeAt(R, horizon), Infinity);
  close(
    signalShift(R, R),
    Math.sqrt((1 - 1 / R) / (1 - 1 / 30)),
    1e-12,
    'initial static gravitational shift',
  );
  let previousR = R,
    previousArrival = -1,
    previousG = Infinity;
  for (let i = 1; i < 90; i++) {
    const eta = (horizon * i) / 90,
      r = radiusAt(R, eta),
      A = 1 - 1 / r;
    const tauPrime = derivative((x) => properTimeAt(R, x), eta);
    const dr = derivative((x) => radiusAt(R, x), eta) / tauPrime;
    const dt = derivative((x) => coordinateTimeAt(R, x), eta) / tauPrime;
    close(dr * dr + A, E * E, 1e-8, 'radial energy integral');
    close(A * dt, E, 2e-7, 'Schwarzschild conserved energy');
    close(-A * dt * dt + (dr * dr) / A, -1, 2e-6, 'timelike normalization');
    const g = signalShift(R, r),
      arrival = arrivalTimeAt(R, eta);
    close(
      derivative((x) => arrivalTimeAt(R, x), eta) / tauPrime,
      1 / g,
      2e-7,
      'frequency = inverse pulse arrival interval',
    );
    assert.ok(r < previousR && arrival > previousArrival && g < previousG);
    previousR = r;
    previousArrival = arrival;
    previousG = g;
    close(etaAtTime(R, properTimeAt(R, eta), 'proper'), eta, 1e-12, 'proper clock inversion');
    close(etaAtTime(R, arrival, 'received'), eta, 1e-12, 'receiver clock inversion');
  }
  // 独立按固有时间积分 r''=-1/(2r²)，从零初速度出发，穿过视界。
  const target = 0.75,
    eta = etaAtRadius(R, target),
    end = properTimeAt(R, eta);
  let t = 0,
    state = [R, 0];
  const deriv = ([r, v]) => [v, -1 / (2 * r * r)];
  const add = (a, b, h) => a.map((x, i) => x + h * b[i]);
  while (t < end) {
    const h = Math.min(0.005, end - t),
      a = deriv(state),
      b = deriv(add(state, a, h / 2)),
      c = deriv(add(state, b, h / 2)),
      d = deriv(add(state, c, h));
    state = state.map((x, i) => x + (h / 6) * (a[i] + 2 * b[i] + 2 * c[i] + d[i]));
    t += h;
  }
  close(state[0], target, 2e-7, 'independent geodesic crosses horizon');
  const atHorizon = infallState({
    R,
    mode: 'proper',
    progress: properTimeAt(R, horizon) / duration(R, 'proper'),
  });
  assert.equal(atHorizon.r, 1);
  assert.equal(atHorizon.exterior, false);
  assert.equal(atHorizon.g, 0);
  assert.equal(atHorizon.arrival, Infinity);
  assert.equal(atHorizon.speed, null);
  const inside = infallState({ R, progress: 1 });
  assert.ok(inside.r < 1 && inside.properSeconds > atHorizon.properSeconds);
  const received = infallState({ R, mode: 'received', progress: 1 });
  assert.ok(
    received.r > 1 && received.g > 0 && received.g < 1e-4 && Number.isFinite(received.arrival),
  );
}
const small = infallState({ mass: 10, progress: 0.5 }),
  large = infallState({ mass: 4e6, progress: 0.5 });
close(small.r, large.r, 1e-12, 'mass-independent dimensionless path');
close(large.properSeconds / small.properSeconds, 4e5, 1e-12, 'time scales with mass');
close(
  small.tidal / large.tidal,
  4e5 ** 2,
  1e-12,
  'tidal difference scales as inverse mass squared',
);
close(scales(1).radius, 2953.2500761, 1e-9, 'nominal solar Schwarzschild radius');
console.log(
  'PASS: free fall — independent timelike geodesic, energy/normalization, horizon crossing, retarded arrival clock, redshift/pulse intervals, mass and tidal scaling.',
);
