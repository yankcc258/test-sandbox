import './vendor/astronomy/astronomy.browser.min.js';
import { calculateSkyReport } from './sky-report.js?v=29.1';
import { calculateBodyObservation } from './body-info.js?v=29.1';

// Eclipse / elongation searches must not block the camera or the arrival fade.
self.onmessage = ({ data }) => {
  try {
    const result =
      data.type === 'body'
        ? { observation: calculateBodyObservation(self.Astronomy, data.body, data.timestamp) }
        : calculateSkyReport(self.Astronomy, data.timestamp);
    self.postMessage({ id: data.id, ...result });
  } catch {
    self.postMessage({ id: data.id, error: true });
  }
};
