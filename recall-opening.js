// 原创的知序标识 → 同一场景唤醒。资源完成前停在连接阶段，不伪造加载进度。
export function createOpening({ motion, onWake, onFinish }) {
  const el = document.getElementById('opening'),
    stage = document.getElementById('spine'),
    label = document.getElementById('opening-label'),
    key = 'zhixu-sandbox-opening-12';
  let ready = false,
    running = false,
    elapsed = 0,
    last = 0,
    raf = 0,
    previousFocus;
  const remembered = () => {
    try {
      return sessionStorage.getItem(key) === 'seen';
    } catch {
      return false;
    }
  };
  function finish() {
    const wasRunning = running;
    running = false;
    cancelAnimationFrame(raf);
    el.hidden = true;
    stage.inert = false;
    document.body.classList.remove('opening');
    onWake(1);
    try {
      sessionStorage.setItem(key, 'seen');
    } catch {
      /* storage may be unavailable */
    }
    if (wasRunning) {
      (previousFocus?.isConnected &&
      previousFocus !== document.body &&
      previousFocus.getClientRects().length
        ? previousFocus
        : document.getElementById('open-entry')
      ).focus({ preventScroll: true });
      onFinish?.();
    }
  }
  function tick(now) {
    raf = 0;
    if (!running || document.hidden) return;
    if (!motion()) return finish();
    elapsed += last ? Math.min(0.25, (now - last) / 1000) : 0;
    last = now;
    if (!ready) elapsed = Math.min(elapsed, 1.7);
    const phase =
      elapsed < 0.85 ? 'identity' : elapsed < 1.7 ? 'connect' : !ready ? 'waiting' : 'wake';
    el.dataset.phase = phase;
    label.textContent =
      phase === 'identity'
        ? '知序 · 让记忆继续生长'
        : phase === 'connect'
          ? '记忆系统 / 建立连接'
          : phase === 'waiting'
            ? '正在载入记忆空间…'
            : '连接就绪 · 欢迎回来';
    onWake(Math.max(0, Math.min(1, (elapsed - 1.7) / 1.35)));
    if (elapsed >= 3.05) return finish();
    raf = requestAnimationFrame(tick);
  }
  function start(force = false) {
    if ((!force && remembered()) || !motion()) return finish();
    cancelAnimationFrame(raf);
    previousFocus = document.activeElement;
    elapsed = last = 0;
    running = true;
    stage.inert = true;
    el.hidden = false;
    el.dataset.phase = 'identity';
    document.body.classList.add('opening');
    onWake(0);
    document.getElementById('opening-skip').focus({ preventScroll: true });
    raf = requestAnimationFrame(tick);
  }
  document.getElementById('opening-skip').onclick = finish;
  el.addEventListener('keydown', (e) => {
    if (['Escape', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      finish();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      document.getElementById('opening-skip').focus();
    }
  });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    last = 0;
    if (running && !document.hidden) raf = requestAnimationFrame(tick);
  });
  return {
    start,
    finish,
    ready() {
      ready = true;
    },
    get running() {
      return running;
    },
  };
}
