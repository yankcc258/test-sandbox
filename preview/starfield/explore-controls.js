export const clampZoom = (zoom) => Math.max(0.5, Math.min(2.4, zoom));
export const wheelScale = (delta, mode, height) =>
  Math.exp(
    Math.max(-180, Math.min(180, delta * (mode === 1 ? 16 : mode === 2 ? height : 1))) * 0.0018,
  );

export function bindExploreControls(canvas, { turn, zoom, pick, reset, close }) {
  const pointers = new Map();
  let pinch = 0;
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    });
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
    if (pointers.size > 1) {
      pointers.forEach((p) => {
        p.moved = true;
      });
      pinch = distance();
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    const dx = event.clientX - p.x;
    p.x = event.clientX;
    p.y = event.clientY;
    if (Math.hypot(p.x - p.startX, p.y - p.startY) > 7) p.moved = true;
    if (pointers.size > 1) {
      const next = distance();
      if (pinch > 10 && next > 10) zoom(pinch / next);
      pinch = next;
    } else if (
      p.moved &&
      (event.pointerType !== 'touch' || Math.abs(p.x - p.startX) > Math.abs(p.y - p.startY))
    ) {
      turn(-dx * 0.005);
    }
  });
  function release(event, cancelled) {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    const tap = !cancelled && !p.moved && pointers.size === 1;
    pointers.delete(event.pointerId);
    pinch = 0;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!pointers.size) canvas.classList.remove('dragging');
    if (tap) pick(event.clientX, event.clientY);
  }
  canvas.addEventListener('pointerup', (event) => release(event, false));
  canvas.addEventListener('pointercancel', (event) => release(event, true));
  canvas.addEventListener('lostpointercapture', (event) => release(event, true));
  // Keep one-finger vertical scrolling outside the drag direction; claim pinch
  // only on this viewport, never on the document or the reading panel.
  canvas.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );
  canvas.addEventListener(
    'wheel',
    (event) => {
      // Trackpad pinch (ctrl+wheel) uses the same bounded scene zoom.
      event.preventDefault();
      zoom(wheelScale(event.deltaY, event.deltaMode, canvas.clientHeight));
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (event) => {
    const actions = {
      ArrowLeft: () => turn(-0.16),
      ArrowRight: () => turn(0.16),
      '+': () => zoom(0.85),
      '=': () => zoom(0.85),
      '-': () => zoom(1.18),
      Home: reset,
      Escape: close,
    };
    if (actions[event.key]) {
      event.preventDefault();
      actions[event.key]();
    }
  });
  for (const [id, action] of Object.entries({
    'sky-left': () => turn(-0.25),
    'sky-right': () => turn(0.25),
    'sky-zoom-in': () => zoom(0.8),
    'sky-zoom-out': () => zoom(1.25),
    'sky-reset': reset,
  })) {
    document.getElementById(id).onclick = action;
  }
}
