// One worker shared by the daily report and selected-body observations. Requests
// have independent lifetimes: selecting another body cannot steal a report reply.
export function createSkyClient() {
  let worker = null,
    sequence = 0;
  const pending = new Map();
  function failWorker() {
    worker?.terminate();
    worker = null;
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error('天象计算暂不可用'));
    }
    pending.clear();
  }
  function startWorker() {
    try {
      worker = new Worker(new URL('./sky-report-worker.js?v=29', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = ({ data }) => {
        const request = pending.get(data.id);
        if (!request) return;
        pending.delete(data.id);
        clearTimeout(request.timer);
        data.error ? request.reject(new Error('天象计算暂不可用')) : request.resolve(data);
      };
      worker.onerror = failWorker;
      worker.onmessageerror = failWorker;
    } catch {
      worker = null; /* Static facts remain available without a worker. */
    }
  }
  startWorker();
  return function request(message) {
    // Keep expensive event searches off the rendering thread even on failure.
    if (!worker) startWorker();
    if (!worker) return Promise.reject(new Error('此浏览器无法启动天象计算'));
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(failWorker, 15000);
      pending.set(id, { resolve, reject, timer });
      try {
        worker.postMessage({ ...message, id });
      } catch {
        failWorker();
      }
    });
  };
}
