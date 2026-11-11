import assert from 'node:assert/strict';
import {
  buildFlight,
  flightCamera,
  flightTime,
  fallingFrame,
  probePhoton,
  radialVelocity,
  sampleAtTime,
  timeAtRadius,
  traceProbeRay,
  FLIGHT_L,
} from '../exhibits/schwarzschild/flight.js';
import { observerOrbit, traceObserverRay } from '../exhibits/schwarzschild/orbit.js';
const close = (a, b, t, label) => assert.ok(Math.abs(a - b) < t, `${label}: ${a} / ${b}`);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (a) => a.map((x) => x / Math.hypot(...a));
const coarse = buildFlight(),
  fine = buildFlight({ step: 0.005 });
let previousTime = -1;
for (let i = 0; i <= 1000; i++) {
  const t = flightTime(coarse, i / 1000);
  assert.ok(t > previousTime, 'presentation clock is monotone');
  previousTime = t;
  assert.ok(t >= 0 && t <= coarse.at(-1).tau, 'presentation clock stays on trajectory');
}
for (const p of [0.3, 0.72, 0.88]) {
  const e = 1e-6,
    t = flightTime(coarse, p);
  const left = (t - flightTime(coarse, p - e)) / e,
    right = (flightTime(coarse, p + e) - t) / e;
  close(left, right, 0.01, 'presentation speed is continuous at scene transition');
}
for (const p of [0, 0.25, 0.52, 0.88, 1]) {
  const base = flightCamera(coarse, p),
    e = 1e-5;
  const yaw = flightCamera(coarse, p, e),
    pitch = flightCamera(coarse, p, 0, e);
  close(dot(yaw.fwd, base.right) / e, 1, 1e-8, 'yaw follows screen horizontal after roll');
  close(dot(yaw.fwd, base.up), 0, 1e-10, 'yaw does not drift vertically');
  close(dot(pitch.fwd, base.up) / e, 1, 1e-8, 'pitch follows screen vertical after roll');
}
for (const r of [18, 6, 3, 2.1, 2, 1.7, 1.000001, 1, 0.999999, 0.6, 0.21]) {
  const ur = radialVelocity(r),
    f = fallingFrame(r, ur, FLIGHT_L),
    A = 1 - 1 / r;
  close(f.gamma ** 2 * (1 - f.radial ** 2 - f.tangent ** 2), 1, 2e-11, 'timelike unit norm');
  close(f.gamma * (1 - Math.sqrt(1 / r) * f.radial), 1, 1e-12, 'Killing energy');
  close(f.gamma * f.tangent * r, FLIGHT_L, 1e-12, 'angular momentum');
  close(ur ** 2 + A * (1 + FLIGHT_L ** 2 / r ** 2), 1, 1e-12, 'radial first integral');
  close(timeAtRadius(coarse, r), timeAtRadius(fine, r), 0.0002, 'proper time convergence');
}
// 独立二阶测地线积分；不调用一阶根式 RHS，核对穿越及近临界绕行。
let s = [18, radialVelocity(18), 0],
  tau = 0;
const h = 0.002,
  L = FLIGHT_L;
const deriv = ([r, v]) => [
  v,
  -0.5 / r ** 2 + L ** 2 / r ** 3 - (1.5 * L ** 2) / r ** 4,
  L / r ** 2,
];
const add = (a, b, k) => a.map((x, i) => x + k * b[i]);
while (s[0] > 0.3) {
  const a = deriv(s),
    b = deriv(add(s, a, h / 2)),
    c = deriv(add(s, b, h / 2)),
    d = deriv(add(s, c, h));
  s = s.map((x, i) => x + (h / 6) * (a[i] + 2 * b[i] + 2 * c[i] + d[i]));
  tau += h;
  if (Math.round(tau / h) % 100 === 0) {
    const at = sampleAtTime(fine, tau);
    close(at.r, s[0], 0.0002, 'independent orbit radius');
    close(at.phi, s[2], 0.0002, 'independent orbit angle');
  }
}
assert.ok(coarse.at(-1).phi / (2 * Math.PI) > 2, 'multiple physical revolutions');
// 静止相机是 PG 标架的一次径向 boost；新旧初值与终点必须相同。
for (const r of [1.6, 4, 22, 60])
  for (const n of [
    [-1, 0.2, 0.3],
    [-1, 0.8, 0.1],
    [1, 0.2, 0.5],
  ]) {
    const gamma = 1 / Math.sqrt(1 - 1 / r),
      beta = [Math.sqrt(1 / r), 0, 0],
      cam = [r, 0, 0];
    const ray = probePhoton(cam, n, beta, gamma),
      old = observerOrbit(cam, n);
    close(ray.state[1], old.state[1], 1e-12, 'static boost reduction');
    close(ray.energy, Math.sqrt(1 - 1 / r), 1e-12, 'static photon energy');
    assert.equal(traceProbeRay(cam, n, beta, gamma).status, traceObserverRay(cam, n).status);
  }
let litInside = 0;
for (const p of [0, 0.3, 0.52, 0.72, 0.87999, 0.88, 0.88001, 0.96, 1]) {
  const f = flightCamera(coarse, p);
  close(dot(f.fwd, f.right), 0, 1e-12, 'camera orthogonality');
  for (let j = 0; j < 12; j++)
    for (let k = 0; k < 8; k++) {
      const n = norm(f.fwd.map((x, i) => x + (j / 5.5 - 1) * f.right[i] + (k / 3.5 - 1) * f.up[i]));
      const ray = probePhoton(f.cam, n, f.beta, f.gamma);
      close(dot(ray.spatial, ray.spatial) - ray.kt ** 2, 0, 1e-11, 'photon null norm');
      close(
        ray.kr ** 2 + (1 - 1 / f.r) * ray.nt ** 2,
        ray.energy ** 2,
        1e-11,
        'null radial energy',
      );
      const a = traceProbeRay(f.cam, n, f.beta, f.gamma),
        b = traceProbeRay(f.cam, n, f.beta, f.gamma, { step: 0.0125, maxSteps: 2048 });
      assert.notEqual(a.status, 'unresolved');
      assert.equal(a.status, b.status, 'half-step ray classification');
      if (a.status === 'disk') {
        assert.ok(a.g > 0 && Number.isFinite(a.g));
        close(a.radius, b.radius, 0.0001, 'disk intersection convergence');
      }
      if (a.status === 'escaped')
        close(
          Math.hypot(...a.direction.map((x, i) => x - b.direction[i])),
          0,
          0.0001,
          'sky direction convergence',
        );
      if (f.r < 1 && a.status !== 'captured') litInside++;
    }
}
assert.ok(litInside > 10, 'external light reaches probe inside horizon');
close(flightCamera(coarse, 0.88).r, 1, 1e-12, 'horizon checkpoint');
console.log(
  'PASS: probe orbit — independent geodesic, energy/angular momentum, regular horizon frame, Lorentz/null invariants, static reduction, interior rays and numerical convergence.',
);
