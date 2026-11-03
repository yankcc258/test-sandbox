// Critically damped motion retains velocity when a new destination interrupts it.
// Exact integration stays stable on slow frames; there is no animation queue.
export function advanceRelease(value, velocity, target, dt, frequency = 7.2) {
  const seconds = Math.max(0, Math.min(dt, 0.06));
  const offset = value - target;
  const c = velocity + frequency * offset;
  const decay = Math.exp(-frequency * seconds);
  let next = target + (offset + c * seconds) * decay;
  let speed = (velocity - frequency * c * seconds) * decay;
  if (next < 0 || next > 1) {
    next = Math.max(0, Math.min(1, next));
    speed = 0;
  }
  if (Math.abs(next - target) < 0.0003 && Math.abs(speed) < 0.003) return [target, 0];
  return [next, speed];
}

// A small travelling release, from the inside of each fold toward its tips.
export function releasePhase(spread, along, fold) {
  const delay = 0.09 * Math.abs(along - 0.42) + fold * 0.025;
  const t = Math.max(0, Math.min(1, (spread - delay) / (1 - delay)));
  return t * t * (3 - 2 * t);
}
