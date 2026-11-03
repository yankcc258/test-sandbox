// Fetch only: the flight keeps its sole animation loop and WebGL scene.
// Do not execute the observatory or create a second renderer behind the flight.
export const STARFIELD_ASSETS = [
  './starfield.css',
  './starfield.js?v=28',
  './arrival.js?v=28',
  './orbit-models.js?v=28',
  './orbit-space.js',
  './orbit-sky.js',
  './sky-report.js?v=28',
  './sky-report-worker.js?v=28',
  './vendor/astronomy/astronomy.browser.min.js',
  './textures/stars.jpg',
  './textures/earth.jpg',
  './textures/earth-night.jpg',
  './textures/venus.jpg',
  './textures/mars.jpg',
  './textures/jupiter.jpg',
  './textures/saturn.jpg',
].map((path) => new URL(path, import.meta.url).href);
let warming;
export function warmStarfield() {
  if (warming) return warming;
  const pending = [...STARFIELD_ASSETS];
  async function fetchNext() {
    while (pending.length) {
      try {
        const response = await fetch(pending.shift(), { priority: 'low' });
        if (response.ok) await response.arrayBuffer();
      } catch {
        /* Navigation/loading still works if speculative fetch fails. */
      }
    }
  }
  warming = Promise.all([fetchNext(), fetchNext()]);
  return warming;
}
