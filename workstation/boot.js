// 平板开机（露娜）。点平板：镜头推近（Codex 的 scene.focus）→ 屏幕在它真实的四个角里亮起：
// 一道横向的光从中间拉开、屏幕点亮、知序标识和进度出现 → 亮着的屏幕从平板的轮廓展开成个人终端。
// 关闭时反过来：终端收回到平板屏幕里（镜头同时退回座位，屏幕跟着移动），然后熄屏。
// 开机画面放在顶层（popover），这样能盖在终端对话框上面；只负责画面，不接收输入。
const clamp = (v) => Math.max(0, Math.min(1, v)),
  seg = (t, a, b) => clamp((t - a) / (b - a)),
  smooth = (t) => t * t * (3 - 2 * t),
  inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const BOOT = { settle: 1.2, on: 1.35, expand: 0.55, collapse: 0.6, off: 0.22 };

function rectQuad(r) {
  return [
    [r.left, r.top],
    [r.right, r.top],
    [r.right, r.bottom],
    [r.left, r.bottom],
  ];
}
const lerpQuad = (a, b, k) => a.map(([x, y], i) => [x + (b[i][0] - x) * k, y + (b[i][1] - y) * k]);
const polygon = (q) =>
  `polygon(${q.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;

export function createBoot({ motion, station }) {
  let el = null,
    job = 0;
  function layer() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'boot';
    el.setAttribute('aria-hidden', 'true');
    if ('popover' in el) el.popover = 'manual';
    el.innerHTML = `<div class="boot-screen"><i class="boot-line"></i><div class="boot-face"><small>ZHIXU / PERSONAL RESEARCH</small><b>知序 · 个人终端</b><span class="boot-bar"><i></i></span><em>欢迎回来 · 正在展开</em></div></div>`;
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
  function paint(q, { line = 1, lit = 1, face = 1, bar = 1, glass = 0 } = {}) {
    const screen = el.querySelector('.boot-screen'),
      xs = q.map((p) => p[0]),
      ys = q.map((p) => p[1]);
    screen.style.clipPath = polygon(q);
    // 屏幕内容放在四角的外接框中间
    el.style.setProperty('--cx', `${(Math.min(...xs) + Math.max(...xs)) / 2}px`);
    el.style.setProperty('--cy', `${(Math.min(...ys) + Math.max(...ys)) / 2}px`);
    el.style.setProperty('--sw', `${Math.max(...xs) - Math.min(...xs)}px`);
    el.style.setProperty('--line', line.toFixed(3));
    el.style.setProperty('--lit', lit.toFixed(3));
    el.style.setProperty('--face', face.toFixed(3));
    el.style.setProperty('--bar', bar.toFixed(3));
    el.style.setProperty('--glass', glass.toFixed(3));
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
  async function open(dialog) {
    dialog.style.opacity = '0';
    // 1. 等镜头推近到平板前（最多 1.2 秒）
    await frames(BOOT.settle, () => station()?.settled);
    const q0 = quad();
    if (!q0) return (dialog.style.opacity = '');
    show();
    // 2. 开机：横向一道光 → 屏幕点亮 → 标识与进度
    let ok = await frames(BOOT.on, (t) => {
      paint(quad() || q0, {
        line: smooth(seg(t, 0, 0.25)) * (1 - seg(t, 0.45, 0.7)),
        lit: inOut(seg(t, 0.2, 0.6)),
        face: smooth(seg(t, 0.45, 0.8)),
        bar: inOut(seg(t, 0.55, 1.2)),
      });
    });
    if (!ok) return;
    // 3. 亮着的屏幕展开成终端：四个角从平板屏幕移到终端面板的四个角
    const target = rectQuad(dialog.getBoundingClientRect()),
      from = quad() || q0;
    ok = await frames(BOOT.expand, (t) => {
      const k = inOut(t / BOOT.expand);
      paint(lerpQuad(from, target, k), {
        line: 0,
        lit: 1,
        face: 1 - smooth(seg(t, 0, 0.25)),
        bar: 1,
        glass: k,
      });
      dialog.style.opacity = String(smooth(seg(t, BOOT.expand * 0.45, BOOT.expand)));
    });
    if (!ok) return;
    dialog.style.opacity = '';
    hide();
  }
  async function close(dialog) {
    const start = rectQuad(dialog.getBoundingClientRect());
    show();
    paint(start, { line: 0, lit: 1, face: 0, bar: 1, glass: 1 });
    dialog.style.opacity = '0';
    // 1. 终端收回到平板屏幕（镜头同时退回座位，屏幕的位置每帧更新）
    let ok = await frames(BOOT.collapse, (t) => {
      const k = inOut(t / BOOT.collapse),
        q = quad() || start;
      paint(lerpQuad(start, q, k), { line: 0, lit: 1, face: 0, bar: 1, glass: 1 - k });
    });
    // 2. 熄屏
    if (ok)
      ok = await frames(BOOT.off, (t) => {
        paint(quad() || start, { line: 0, lit: 1 - t / BOOT.off, face: 0, bar: 1, glass: 0 });
      });
    hide();
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
    // 测试用：停在开机的某一刻（phase: on / expand）
    pose(phase, t, dialog) {
      job++;
      const q = quad();
      if (!q) return null;
      show();
      if (phase === 'on')
        paint(q, {
          line: smooth(seg(t, 0, 0.25)) * (1 - seg(t, 0.45, 0.7)),
          lit: inOut(seg(t, 0.2, 0.6)),
          face: smooth(seg(t, 0.45, 0.8)),
          bar: inOut(seg(t, 0.55, 1.2)),
        });
      else {
        const k = inOut(t / BOOT.expand);
        paint(lerpQuad(q, rectQuad(dialog.getBoundingClientRect()), k), {
          line: 0,
          lit: 1,
          face: 1 - k,
          bar: 1,
          glass: k,
        });
      }
      return q;
    },
  };
}
