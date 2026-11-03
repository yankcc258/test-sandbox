import { orbitSkyToday, orbitSkyEvents } from './orbit-sky.js?v=29.1';

export function calculateSkyReport(A, timestamp) {
  const now = new Date(timestamp);
  return { today: orbitSkyToday(A, now), events: orbitSkyEvents(A, now) };
}
