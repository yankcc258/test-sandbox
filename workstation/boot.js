// 平板开机（露娜，v25）。点平板：你低头看着桌上的平板（镜头沿屏幕法线移到正上方，scene.tabletView），
// 屏幕在它真实的四个角里亮起——一道横向的光拉开、屏幕点亮、知序标识和进度出现——
// 然后个人终端就显示在这块屏幕里：四周还看得到平板的边框、支架和桌面，屏幕上有状态栏、
// 底部的横条和一层玻璃反光。手机上像把平板竖起来看（镜头绕视线转 90°）。
// 关闭时屏幕熄灭，镜头抬起回到座位（Codex 的 close 会先调用 scene.reset）。
// 开机画面放在顶层（popover），能盖在终端对话框上面；只负责画面，不接收输入。
const clamp = (v) => Math.max(0, Math.min(1, v)),
  seg = (t, a, b) => clamp((t - a) / (b - a)),
  smooth = (t) => t * t * (3 - 2 * t),
  inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const BOOT = { settle: 1.8, on: 1.35, reveal: 0.45, off: 0.6 };

const bounds = (q) => {
  const xs = q.map((p) => p[0]),
    ys = q.map((p) => p[1]);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
};
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// A fixed-size plane is projected into the real screen. Only transform/opacity
// change during playback; no viewport-sized clip, gradient or text re-layout.
export function screenTransform(q, width = 640, height = 400) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2,
    dx2 = x3 - x2,
    dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2,
    dy2 = y3 - y2,
    dy3 = y0 - y1 + y2 - y3;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < 1e-8) return null;
  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  return [
    (x1 - x0 + g * x1) / width,
    (y1 - y0 + g * y1) / width,
    0,
    g / width,
    (x3 - x0 + h * x3) / height,
    (y3 - y0 + h * y3) / height,
    0,
    h / height,
    0,
    0,
    1,
    0,
    x0,
    y0,
    0,
    1,
  ];
}

export function createBoot({ motion, station }) {
  let el = null,
    job = 0,
    activeDialog = null,
    viewing = null,
    clockTimer = 0,
    refit = 0,
    portrait = false,
    screen,
    glow,
    lineEl,
    faceEl,
    barEl;
  function layer() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'boot';
    el.setAttribute('aria-hidden', 'true');
    if ('popover' in el) el.popover = 'manual';
    el.innerHTML = `<div class="boot-screen"><div class="boot-glow"></div><i class="boot-line"></i><div class="boot-face"><small>ZHIXU / PERSONAL RESEARCH</small><b>知序 · 个人终端</b><span class="boot-bar"><i></i></span><em>欢迎回来 · 正在启动</em></div></div>`;
    screen = el.querySelector('.boot-screen');
    glow = el.querySelector('.boot-glow');
    lineEl = el.querySelector('.boot-line');
    faceEl = el.querySelector('.boot-face');
    barEl = el.querySelector('.boot-bar i');
    document.body.append(el);
    return el;
  }
  function show() {
    const l = layer();
    try {
      if (l.popover && !l.matches(':popover-open')) l.showPopover();
    } catch {
      /* 不支持顶层时也能看，只是在对话框下面 */
    }
    l.hidden = false;
    return l;
  }
  function hide() {
    if (!el) return;
    try {
      if (el.matches(':popover-open')) el.hidePopover();
    } catch {}
    el.hidden = true;
  }
  // 屏幕四个角（镜头还在动时每帧都重新取）
  const quad = () => station()?.screenQuad?.() || null;
  function paint(q, { line = 1, lit = 1, face = 1, bar = 1, alpha = 1 } = {}) {
    const upright = portrait ? [q[3], q[0], q[1], q[2]] : q;
    const matrix = screenTransform(upright, portrait ? 400 : 640, portrait ? 640 : 400);
    if (!matrix) return;
    screen.style.transform = `matrix3d(${matrix.join(',')})`;
    screen.classList.toggle('is-portrait', portrait);
    screen.style.opacity = alpha;
    glow.style.opacity = lit;
    lineEl.style.opacity = line;
    lineEl.style.transform = `scaleX(${line})`;
    faceEl.style.opacity = face;
    barEl.style.transform = `scaleX(${bar})`;
  }
  function frames(id, duration, each) {
    return new Promise((resolve) => {
      let start;
      function tick(now) {
        if (id !== job) return resolve(false);
        start ??= now;
        const t = Math.min(duration, (now - start) / 1000);
        const stop = each(t);
        if (stop || t >= duration) return resolve(true);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }
  function cleanup() {
    hide();
    if (activeDialog) {
      activeDialog.style.opacity = '';
      activeDialog.classList.remove('boot-moving');
    }
    activeDialog = null;
  }

  // 平板屏幕上的「硬件」细节：状态栏、底部横条、玻璃反光；挂在终端对话框里，只在平板模式下显示
  function chrome(dialog) {
    if (!dialog.querySelector('.tablet-chrome')) {
      const c = document.createElement('div');
      c.className = 'tablet-chrome';
      c.setAttribute('aria-hidden', 'true');
      c.innerHTML = `<div class="tablet-status"><time></time><span>知序 OS · 个人终端</span><span class="tablet-icons"><svg viewBox="0 0 16 12"><path d="M1 4.2a10 10 0 0 1 14 0M3.4 6.6a6.6 6.6 0 0 1 9.2 0M5.8 9a3.2 3.2 0 0 1 4.4 0"/><circle cx="8" cy="10.8" r=".9"/></svg><b>86%</b><i class="tablet-battery"><i></i></i></span></div><i class="tablet-home"></i><i class="tablet-glare"></i>`;
      dialog.append(c);
    }
    const t = dialog.querySelector('.tablet-status time');
    const tick = () => (t.textContent = clock.format(new Date()));
    tick();
    clearInterval(clockTimer);
    clockTimer = setInterval(tick, 20000);
  }
  // 终端对话框贴到平板屏幕上（镜头正对屏幕，四个角几乎就是一个矩形）
  function place(dialog) {
    const q = quad();
    if (!q) return false;
    const b = bounds(q);
    dialog.style.setProperty('--tx', `${b.left}px`);
    dialog.style.setProperty('--ty', `${b.top}px`);
    dialog.style.setProperty('--tw', `${b.right - b.left}px`);
    dialog.style.setProperty('--th', `${b.bottom - b.top}px`);
    return true;
  }

  function leaveView() {
    clearInterval(clockTimer);
    clearTimeout(refit);
    if (viewing) viewing.classList.remove('tablet-view');
    document.body.classList.remove('tablet-viewing');
    viewing = null;
  }
  function enterView(dialog) {
    viewing = dialog;
    portrait = innerWidth < 700;
    dialog.classList.add('tablet-view');
    document.body.classList.add('tablet-viewing');
    chrome(dialog);
  }
  addEventListener('resize', () => {
    if (!viewing) return;
    clearTimeout(refit);
    const id = job;
    refit = setTimeout(async () => {
      const dialog = viewing;
      if (!dialog || id !== job) return;
      portrait = innerWidth < 700;
      station()?.tabletView();
      if (await frames(id, BOOT.settle, () => station()?.settled))
        if (viewing === dialog) place(dialog);
    }, 120);
  });
  async function open(dialog, id) {
    enterView(dialog);
    dialog.style.opacity = '0';
    station().tabletView();
    if (!(await frames(id, BOOT.settle, () => station()?.settled))) return;
    const q0 = quad();
    if (!q0 || !place(dialog)) {
      leaveView();
      return;
    }
    show();
    if (
      !(await frames(id, BOOT.on, (t) => {
        paint(quad() || q0, {
          line: smooth(seg(t, 0, 0.25)) * (1 - seg(t, 0.45, 0.7)),
          lit: inOut(seg(t, 0.2, 0.6)),
          face: smooth(seg(t, 0.45, 0.8)),
          bar: inOut(seg(t, 0.55, 1.2)),
        });
      }))
    )
      return;
    // Crossfade both surfaces: leaving the opaque boot above a fading dialog
    // would conceal the entire reveal and produce a visible cut at the end.
    if (
      !(await frames(id, BOOT.reveal, (t) => {
        const k = smooth(t / BOOT.reveal);
        paint(quad() || q0, { line: 0, lit: 1, face: 1 - k, bar: 1, alpha: 1 - k });
        dialog.style.opacity = String(k);
      }))
    )
      return;
    place(dialog);
  }
  async function close(dialog, id) {
    clearInterval(clockTimer);
    clearTimeout(refit);
    const q = quad();
    dialog.style.opacity = '0';
    if (q) {
      show();
      if (
        !(await frames(id, BOOT.off, (t) => {
          const k = smooth(t / BOOT.off);
          paint(quad() || q, {
            line: 0,
            lit: 1 - k,
            face: 0,
            bar: 1,
            alpha: 1 - smooth(seg(k, 0.65, 1)),
          });
        }))
      )
        return;
    }
    leaveView();
  }
  return {
    // app.js 的 animatePanel 在平板打开 / 关闭时交给这里；返回的 Promise 结束后对话框才关闭
    animate(opening, dialog) {
      ++job;
      cleanup();
      leaveView();
      if (!motion() || !station()) return Promise.resolve();
      const id = job;
      activeDialog = dialog;
      dialog.classList.add('boot-moving');
      return (opening ? open(dialog, id) : close(dialog, id)).finally(() => {
        if (id === job) cleanup();
      });
    },
    cancel() {
      job++;
      cleanup();
      leaveView();
    },
    // Preview tools can stop on the lit screen or the completed tablet view.
    async pose(phase, t, dialog) {
      this.cancel();
      const id = job;
      enterView(dialog);
      station().tabletView();
      if (!(await frames(id, BOOT.settle * 20, () => station()?.settled))) return false;
      if (!place(dialog)) {
        leaveView();
        return false;
      }
      if (!dialog.open) dialog.showModal();
      if (phase === 'done') {
        dialog.style.opacity = '';
        hide();
        return true;
      }
      activeDialog = dialog;
      dialog.style.opacity = '0';
      show();
      paint(quad(), {
        line: smooth(seg(t, 0, 0.25)) * (1 - seg(t, 0.45, 0.7)),
        lit: inOut(seg(t, 0.2, 0.6)),
        face: smooth(seg(t, 0.45, 0.8)),
        bar: inOut(seg(t, 0.55, 1.2)),
      });
      return true;
    },
  };
}
