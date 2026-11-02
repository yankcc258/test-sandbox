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

const polygon = (q) =>
  `polygon(${q.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
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

export function createBoot({ motion, station }) {
  let el = null,
    job = 0,
    viewing = null,
    clockTimer = 0;
  function layer() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'boot';
    el.setAttribute('aria-hidden', 'true');
    if ('popover' in el) el.popover = 'manual';
    el.innerHTML = `<div class="boot-screen"><i class="boot-line"></i><div class="boot-face"><small>ZHIXU / PERSONAL RESEARCH</small><b>知序 · 个人终端</b><span class="boot-bar"><i></i></span><em>欢迎回来 · 正在启动</em></div></div>`;
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
  const quad = () => station()?.screenQuad?.() || null;
  function paint(q, { line = 1, lit = 1, face = 1, bar = 1 } = {}) {
    const b = bounds(q);
    el.querySelector('.boot-screen').style.clipPath = polygon(q);
    el.style.setProperty('--cx', `${(b.left + b.right) / 2}px`);
    el.style.setProperty('--cy', `${(b.top + b.bottom) / 2}px`);
    el.style.setProperty('--sw', `${Math.min(b.right - b.left, (b.bottom - b.top) * 1.75)}px`);
    el.style.setProperty('--line', line.toFixed(3));
    el.style.setProperty('--lit', lit.toFixed(3));
    el.style.setProperty('--face', face.toFixed(3));
    el.style.setProperty('--bar', bar.toFixed(3));
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
  function frames(duration, each) {
    const id = ++job;
    return new Promise((resolve) => {
      let t = 0,
        last = 0;
      function tick(now) {
        if (id !== job) return resolve(false);
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        t += dt;
        const stop = each(Math.min(t, duration));
        if (stop || t >= duration) return resolve(true);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }
  // 平板模式下窗口大小变了：重新算低头的角度，停稳后把终端贴回屏幕
  let refit = 0;
  addEventListener('resize', () => {
    if (!viewing) return;
    clearTimeout(refit);
    refit = setTimeout(async () => {
      const dialog = viewing;
      station()?.tabletView();
      await frames(BOOT.settle, () => station()?.settled);
      if (viewing === dialog) place(dialog);
    }, 120);
  });
  async function open(dialog) {
    dialog.classList.add('tablet-view');
    document.body.classList.add('tablet-viewing');
    chrome(dialog);
    dialog.style.opacity = '0';
    viewing = dialog;
    // 1. 低头看向平板（最多 1.8 秒）
    station().tabletView();
    if (!(await frames(BOOT.settle, () => station()?.settled))) return;
    if (!place(dialog)) return (dialog.style.opacity = '');
    show();
    // 2. 开机：横向一道光 → 屏幕点亮 → 标识与进度
    let ok = await frames(BOOT.on, (t) => {
      paint(quad(), {
        line: smooth(seg(t, 0, 0.25)) * (1 - seg(t, 0.45, 0.7)),
        lit: inOut(seg(t, 0.2, 0.6)),
        face: smooth(seg(t, 0.45, 0.8)),
        bar: inOut(seg(t, 0.55, 1.2)),
      });
    });
    if (!ok) return;
    // 3. 启动画面淡出，终端在同一块屏幕上亮起
    ok = await frames(BOOT.reveal, (t) => {
      const k = smooth(t / BOOT.reveal);
      paint(quad(), { line: 0, lit: 1, face: 1 - k, bar: 1 });
      dialog.style.opacity = String(k);
    });
    if (!ok) return;
    dialog.style.opacity = '';
    hide();
    // 镜头最后几帧还在微微收拢：停稳后再贴一次，边缘对齐屏幕
    await frames(0.6, () => station()?.settled);
    if (viewing === dialog) place(dialog);
  }
  async function close(dialog) {
    viewing = null;
    clearInterval(clockTimer);
    const q = quad();
    dialog.style.opacity = '0';
    if (q) {
      // 屏幕熄灭；镜头同时抬起回到座位，熄灭的光跟着屏幕走
      show();
      await frames(BOOT.off, (t) => {
        paint(quad() || q, { line: 0, lit: 1 - smooth(t / BOOT.off), face: 0, bar: 1 });
      });
      hide();
    }
    dialog.classList.remove('tablet-view');
    document.body.classList.remove('tablet-viewing');
    dialog.style.opacity = '';
  }
  return {
    // app.js 的 animatePanel 在平板打开 / 关闭时交给这里；返回的 Promise 结束后对话框才关闭
    animate(opening, dialog) {
      if (!motion() || !station()) return Promise.resolve();
      return opening ? open(dialog) : close(dialog);
    },
    cancel() {
      job++;
      hide();
    },
    // 测试用：低头看平板并停在开机的某一刻（phase: on / done）
    async pose(phase, t, dialog) {
      job++;
      station().tabletView();
      await frames(BOOT.settle * 20, () => station()?.settled);
      if (phase === 'done') {
        dialog.classList.add('tablet-view');
        document.body.classList.add('tablet-viewing');
        chrome(dialog);
        place(dialog);
        if (!dialog.open) dialog.showModal();
        dialog.style.opacity = '';
        hide();
        return true;
      }
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
