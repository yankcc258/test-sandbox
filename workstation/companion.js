// A local interaction preview. No AI requests, storage, or fabricated study results.
export function createCompanion({ scene, motion }) {
  const panel = document.querySelector('#companion');
  const reply = panel.querySelector('[data-companion-reply]');
  const choice = panel.querySelector('[data-companion-choice]');
  let returnTo = null;
  const lines = {
    hello: ['来打个招呼', '回来啦。书先放在这里，今天想从哪个小问题开始？'],
    study: ['陪我学一会儿', '好，我就在这里。先挑一小段读，遇到没想通的地方，就把它留下来。'],
    rest: ['一起歇一会儿', '那就先把肩膀放松。看看窗外的云吧，问题可以等一小会儿。'],
  };
  panel.addEventListener('click', (e) => {
    const button = e.target.closest('[data-say]');
    if (button) {
      const [prompt, response] = lines[button.dataset.say];
      choice.textContent = prompt;
      reply.textContent = response;
      panel
        .querySelectorAll('[data-say]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    }
    if (e.target.closest('[data-companion-close]')) close();
    if (e.target === panel) {
      const r = panel.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        close();
    }
  });
  panel.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  function close() {
    if (!panel.open) return;
    panel.close();
    document.body.classList.remove('companion-open');
    scene()?.reset();
    if (returnTo?.isConnected && !returnTo.closest('dialog:not([open])'))
      returnTo.focus({ preventScroll: true });
    else
      document.querySelector('.object-dock [data-object="seeko"]').focus({ preventScroll: true });
  }
  return {
    open(trigger) {
      if (panel.open) return;
      returnTo = trigger;
      document.body.classList.add('companion-open');
      scene()?.focus('seeko');
      panel.showModal();
      if (motion())
        panel.animate(
          [
            { opacity: 0, transform: 'translateY(12px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 300, easing: 'ease-out' },
        );
      panel.querySelector('[data-companion-close]').focus({ preventScroll: true });
    },
    close,
  };
}
