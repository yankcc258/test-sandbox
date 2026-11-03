import './vendor/astronomy/astronomy.browser.min.js';
import { calculateSkyReport } from './sky-report.js?v=28';

// Eclipse / elongation searches must not block the camera or the arrival fade.
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, ...calculateSkyReport(self.Astronomy, data.timestamp) });
  } catch {
    self.postMessage({ id: data.id, error: true });
  }
};
