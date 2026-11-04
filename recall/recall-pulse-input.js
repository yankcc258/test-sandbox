// A completed primary click is a stimulus. Dragging, secondary pointers and reading controls are not.
export function bindPulseInput(stage, { enabled, onPulse }) {
  let pending = null;
  const down = (e) => {
    if (
      !e.isPrimary ||
      e.button !== 0 ||
      !enabled() ||
      e.target.closest('.content, .dock, .about, .top')
    )
      return;
    pending = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  };
  const move = (e) => {
    if (pending?.id === e.pointerId && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 8)
      pending.moved = true;
  };
  const up = (e) => {
    if (pending?.id !== e.pointerId) return;
    const click = pending;
    pending = null;
    if (!click.moved && Math.hypot(e.clientX - click.x, e.clientY - click.y) <= 8 && enabled())
      onPulse();
  };
  const cancel = () => {
    pending = null;
  };
  stage.addEventListener('pointerdown', down, true);
  stage.addEventListener('pointermove', move, true);
  stage.addEventListener('pointerup', up, true);
  stage.addEventListener('pointercancel', cancel, true);
  return () => {
    stage.removeEventListener('pointerdown', down, true);
    stage.removeEventListener('pointermove', move, true);
    stage.removeEventListener('pointerup', up, true);
    stage.removeEventListener('pointercancel', cancel, true);
  };
}
