// 实验室 ⇄ 复习区：竖井下沉（露娜）。
// 沙盒里的实验室只是正式站 v2.43.2 的一张截图（assets/lab/），真正的实验室在 yank-study-lab。
//   下沉：截图切成一条条横向薄片——和实验室缎带同一种「卡片」语言——从地面那道缝开始向上下逐片
//         翻成侧面，镜头穿过缝隙往下掉进竖井；竖井里深度刻度向上掠过，脊髓的光从脊柱顶端往下点亮，
//         镜头从脊柱正上方落回螺旋，复习区的界面最后亮起。
//   上升：界面先收起，信号沿脊髓往上爬，镜头升到脊柱正上方，进入竖井；薄片从外向缝逐片翻回，
//         缝最后闪一下合上，回到实验室。
// 关闭动效或系统减少动画时直接切换。时间线是纯函数 frameAt(dir, t)，测试可以停在任意一刻截图。

import { createPassage, passageFrame, savePassage, play, PASSAGE } from './sandbox/passage.js';

export const GATE = { down: 3.2, up: 2.7, seam: 0.56, strips: 24, hold: 1.5 };
const REGIONS = [
  ['lab', '实验室', 'LEARNING / 学习'],
  ['review', '复习区', 'RECALL / 复习'],
  ['cabin', '研究员工作台', 'WORKSTATION / 独立范本'],
];
const clamp = (v) => Math.max(0, Math.min(1, v)),
  seg = (t, a, b) => clamp((t - a) / (b - a)),
  smooth = (t) => t * t * (3 - 2 * t),
  inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outCubic = (t) => 1 - (1 - t) ** 3,
  inQuad = (t) => t * t;

// 每条薄片中心离地缝有多远（占画面高度的比例）
const stripDist = (j) => Math.abs((j + 0.5) / GATE.strips - GATE.seam);

// dir = 'down'（实验室 → 复习区）或 'up'（复习区 → 实验室）；t 秒
export function frameAt(dir, t) {
  const f = { dir, t, open: [] };
  if (dir === 'down') {
    for (let j = 0; j < GATE.strips; j++) {
      const a = 0.15 + stripDist(j) * 1.1;
      f.open.push(inOut(seg(t, a, a + 0.45)));
    }
    f.seam = smooth(seg(t, 0, 0.28)) * (1 - seg(t, 0.85, 1.25));
    f.fall = inQuad(seg(t, 0.25, 1.4));
    f.shaft = seg(t, 0.08, 0.3) * (1 - inOut(seg(t, 1.6, 2.3)));
    f.depth = inOut(seg(t, 0.3, 2.4));
    f.cord = smooth(seg(t, 0.7, 1.4));
    f.arrive = smooth(seg(t, 1.0, 1.5)) * (1 - seg(t, 1.75, 2.05));
    // 镜头：1 = 在脊柱正上方的竖井里，0 = 回到螺旋总览
    f.k = 1 - inOut(seg(t, 1.3, GATE.down));
    // 脊髓信号：从脊柱顶端一路往下，流到当前屏幕那一节
    const p = seg(t, 1.2, 2.8);
    f.sig = { from: 'top', p: outCubic(p), strength: p > 0 && p < 1 ? Math.sin(Math.PI * p) : 0 };
    f.hud = smooth(seg(t, 2.4, GATE.down));
  } else {
    for (let j = 0; j < GATE.strips; j++) {
      // 外侧的薄片先翻回来，地缝两边最后合上
      const a = 1.4 + (GATE.seam - stripDist(j)) * 1.0;
      f.open.push(1 - inOut(seg(t, a, a + 0.45)));
    }
    f.hud = 1 - smooth(seg(t, 0, 0.35));
    const p = seg(t, 0, 1.25);
    f.sig = { from: 'panel', p: inOut(p), strength: p > 0 && p < 1 ? Math.sin(Math.PI * p) : 0 };
    f.k = inOut(seg(t, 0.2, 1.5));
    f.shaft = inOut(seg(t, 1.0, 1.45));
    f.depth = 1 - inOut(seg(t, 0.7, 2.3));
    f.cord = 1 - smooth(seg(t, 1.2, 1.9));
    f.arrive = 0;
    f.fall = 1 - outCubic(seg(t, 1.35, 2.45));
    f.seam = Math.sin(Math.PI * seg(t, 2.15, GATE.up));
  }
  return f;
}

// scene：recall-spine.js 的场景接口（可能为 null——立体场景出错时只切换界面）
export function createGateway({ motion, scene, stage, onLeaveReview, onArriveReview }) {
  const lab = document.getElementById('lab'),
    blinds = document.getElementById('lab-blinds'),
    depthEl = document.getElementById('shaft-depth'),
    stateEl = document.getElementById('shaft-state');
  // 预先载入截图，返回实验室时薄片不会空白
  for (const src of ['assets/lab/lab-desktop.jpg', 'assets/lab/lab-mobile.jpg']) {
    const img = new Image();
    img.src = src;
  }
  blinds.replaceChildren(
    ...Array.from({ length: GATE.strips }, (_, j) => {
      const s = document.createElement('div');
      s.className = 'lab-strip';
      s.style.setProperty('--j', j);
      s.style.setProperty('--dir', (j + 0.5) / GATE.strips < GATE.seam ? -1 : 1);
      s.append(document.createElement('i'));
      return s;
    }),
  );
  blinds.style.setProperty('--n', GATE.strips);
  const strips = [...blinds.children];

  // 两处区域菜单：复习区右上角（替换原来的静态标签）、实验室占位页右上角
  const menus = [...document.querySelectorAll('[data-gateway]')];
  menus.forEach((m) => {
    m.innerHTML = `<summary aria-label="前往不同区域"><small>前往区域</small><b></b><i>⌄</i></summary><nav aria-label="区域">${REGIONS.map(
      ([id, name, note], i) =>
        `<button type="button" data-region="${id}"><small>0${i + 1}</small><span><b>${name}</b><em>${note}</em></span><i>↗</i></button>`,
    ).join('')}</nav>`;
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-region]');
      if (!b || b.disabled) return;
      m.open = false;
      goTo(b.dataset.region);
    });
  });
  document.addEventListener('pointerdown', (e) => {
    menus.forEach((m) => {
      if (m.open && !m.contains(e.target)) m.open = false;
    });
  });
  document.addEventListener(
    'keydown',
    (e) => {
      const m = menus.find((x) => x.open);
      if (m && e.key === 'Escape') {
        m.open = false;
        m.querySelector('summary').focus();
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );

  let region = 'review',
    run = null,
    raf = 0,
    last = 0,
    drift = 0;
  const modelReady = () =>
    !scene || ['true', 'error'].includes(document.getElementById('canvas').dataset.modelReady);

  function syncMenus() {
    const name = REGIONS.find((r) => r[0] === region)[1];
    menus.forEach((m) => {
      m.querySelector('summary b').textContent = name;
      m.querySelectorAll('[data-region]').forEach((b) =>
        b.setAttribute('aria-current', String(b.dataset.region === region)),
      );
    });
  }
  function apply(f) {
    strips.forEach((s, j) => {
      const o = f.open[j];
      s.style.setProperty('--o', o.toFixed(4));
      s.style.setProperty('--glint', Math.sin(Math.PI * o).toFixed(3));
    });
    lab.style.setProperty('--fall', f.fall.toFixed(4));
    lab.style.setProperty('--seam', f.seam.toFixed(3));
    lab.style.setProperty('--shaft', f.shaft.toFixed(3));
    lab.style.setProperty('--cord', f.cord.toFixed(3));
    lab.style.setProperty('--arrive', f.arrive.toFixed(3));
    lab.style.setProperty('--depth-px', `${(-(f.depth * 1800 + drift)).toFixed(1)}px`);
    depthEl.textContent = String(Math.round(f.depth * 128)).padStart(3, '0');
    stage.style.setProperty('--hud', f.hud.toFixed(3));
    scene?.setShaft(f.k, f.sig);
  }
  function settle(next) {
    region = next;
    run = null;
    cancelAnimationFrame(raf);
    raf = 0;
    lab.classList.remove('moving', 'holding', 'no-blinds');
    stage.classList.remove('gating');
    stage.style.removeProperty('--hud');
    const inLab = next === 'lab';
    lab.hidden = !inLab;
    lab.inert = !inLab;
    stage.inert = inLab;
    lab.style.setProperty('--fall', 0);
    lab.style.setProperty('--seam', 0);
    lab.style.setProperty('--shaft', 0);
    strips.forEach((s) => {
      s.style.setProperty('--o', 0);
      s.style.setProperty('--glint', 0);
    });
    scene?.setShaft(inLab ? 1 : 0, null);
    scene?.sleep(inLab);
    syncMenus();
    if (inLab) lab.querySelector('[data-gateway] summary').focus({ preventScroll: true });
    else onArriveReview?.();
  }
  // 楼层表：实验室 1F、复习区 B1（工作台 2F 只在跨页的竖井里经过）
  const floorEls = [...lab.querySelectorAll('.ps-floors li')],
    car = lab.querySelector('.ps-car');
  function floors(dir, depth) {
    if (!car) return;
    const level = -depth; // 下沉 0 → −1，上升 −1 → 0
    car.style.setProperty('--level', level.toFixed(3));
    floorEls.forEach((li) =>
      li.style.setProperty(
        '--lit',
        Math.max(0, 1 - Math.abs(Number(li.dataset.level) - level) * 1.6).toFixed(3),
      ),
    );
  }
  function tick(now) {
    raf = 0;
    if (!run) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    // 下沉时脊柱模型还没载入好：停在竖井里，刻度继续缓慢掠过，不伪造进度
    const holding = run.dir === 'down' && !modelReady() && run.t + dt > GATE.hold;
    lab.classList.toggle('holding', holding);
    if (holding) {
      run.t = GATE.hold;
      drift += dt * 90;
    } else run.t += dt;
    const frame = frameAt(run.dir, run.t);
    apply(frame);
    floors(run.dir, frame.depth);
    // 去工作台：到竖井完全挡住画面的那一刻停下，交给跨页的竖井
    if (run.until !== undefined && run.t >= run.until) {
      const done = run.onUntil;
      run = null;
      return done();
    }
    if (run.t >= (run.dir === 'down' ? GATE.down : GATE.up)) return settle(run.to);
    raf = requestAnimationFrame(tick);
  }
  function start(dir, { t0 = 0, until, onUntil, noBlinds = false } = {}) {
    const to = dir === 'down' ? 'review' : 'lab';
    drift = 0;
    run = { dir, t: t0, to, until, onUntil };
    lab.classList.toggle('no-blinds', noBlinds);
    lab.hidden = false;
    lab.inert = false; // 过渡期间整层挡住输入
    stage.inert = true;
    lab.classList.add('moving');
    stage.classList.add('gating');
    scene?.sleep(false);
    apply(frameAt(dir, 0));
    last = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }
  // ---- 去工作台（2F）：复习区先让镜头升出竖井，实验室先让截图薄片翻开，然后换页继续上行 ----
  function toStation() {
    const from = region;
    savePassage(from, 'workstation');
    location.assign('workstation/?via=passage');
  }
  async function leaveForStation() {
    if (region === 'review') {
      onLeaveReview?.();
      return start('up', { until: 1.46, onUntil: toStation });
    }
    // 实验室（截图占位）：截图切成薄片翻开，进入竖井
    const p = createPassage({ from: 'lab', to: 'workstation' });
    const shot = new URL(
      innerWidth <= 760 ? 'assets/lab/lab-mobile.jpg' : 'assets/lab/lab-desktop.jpg',
      location.href,
    );
    p.el.style.setProperty('--ps-img', `url("${shot.href}")`);
    p.el.style.setProperty('--ps-pos', 'center');
    p.el.style.setProperty('--ps-size', 'cover');
    p.apply(passageFrame('leave', 0));
    document.body.append(p.el);
    await play('leave', PASSAGE.leave, (t) => p.apply(passageFrame('leave', t)));
    toStation();
  }
  // ---- 从工作台下来：先在跨页的竖井里下行，再接上这一页原来的到达动画 ----
  async function arriveFromStation(to) {
    const p = createPassage({ from: 'workstation', to });
    p.apply(passageFrame('ride', 0));
    document.body.append(p.el);
    document.documentElement.classList.remove('passage-in');
    if (!motion()) {
      p.el.remove();
      return;
    }
    await play('ride', PASSAGE.ride, (t) => p.apply(passageFrame('ride', t)));
    // 复习区：接「下沉」的后半段（竖井已不透明，镜头从脊柱正上方落回螺旋）；实验室：接「上升」的结尾（薄片合上）
    if (to === 'review') start('down', { t0: 0.95, noBlinds: true });
    else start('up', { t0: 1.42 });
    requestAnimationFrame(() => p.el.remove());
  }
  function goTo(id) {
    if (run || id === region) return;
    if (id === 'cabin') {
      if (!motion()) return location.assign('workstation/?motion=0');
      return leaveForStation();
    }
    if (id === 'lab') onLeaveReview?.();
    if (!motion()) return settle(id);
    start(id === 'review' ? 'down' : 'up');
  }
  syncMenus();
  return {
    goTo,
    // 直接停在某个区域（用于 ?region=lab）
    settle,
    arriveFromStation,
    get region() {
      return region;
    },
    // 正在过渡或停在实验室时，复习区不响应按键
    get blocking() {
      return !!run || region === 'lab';
    },
    // 测试用：停在过渡的第 t 秒画一帧（不跑动画循环）
    pose(dir, t) {
      cancelAnimationFrame(raf);
      raf = 0;
      run = null;
      drift = 0;
      lab.hidden = false;
      lab.classList.add('moving');
      stage.classList.add('gating');
      scene?.sleep(false);
      const f = frameAt(dir, t);
      apply(f);
      scene?.shaftTest(f.k, f.sig);
      return f;
    },
  };
}
