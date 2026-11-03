import { orbitSkyToday, orbitSkyEvents } from './orbit-sky.js';

export function calculateSkyReport(A, timestamp) {
  const now = new Date(timestamp);
  return { today: orbitSkyToday(A, now), events: orbitSkyEvents(A, now) };
}
