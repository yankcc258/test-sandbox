// 三个区域之间的「竖井」（露娜）。知序像一栋楼：2F 研究员工作台、1F 实验室、B1 脊柱复习区。
// 在区域之间移动都走同一条竖井：画面切成横向薄片翻开（实验室是缎带卡片，工作台是窗边百叶），
// 镜头穿过缝隙进入竖井，深度刻度掠过、右侧楼层表亮到目的地，再从薄片之间进入下一个区域。
// 沙盒里三个区域是不同的页面：在竖井完全挡住画面的那一刻换页，用 sessionStorage 把进度交给下一页接着播。
// 实验室 ⇄ 复习区在同一页里，由 recall-gateway.js 处理；它也读写这里的交接记录。

export const FLOORS = {
  workstation: { code: '2F', name: '研究员工作台', en: 'WORKSTATION', level: 1, alt: 36 },
  lab: { code: '1F', name: '实验室', en: 'LEARNING', level: 0, alt: 0 },
  review: { code: 'B1', name: '复习区', en: 'RECALL', level: -1, alt: -128 },
};
const KEY = 'zhixu-passage';

// ---------- 页面之间的交接 ----------
export function savePassage(from, to, extra = {}) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ from, to, at: Date.now(), ...extra }));
  } catch {
    /* 存不了就当没有交接，下一页直接显示 */
  }
}
// 只认 8 秒内、目的地是本页的交接；读过就删，刷新不会重播
export function takePassage(here) {
  try {
    const p = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!p || p.to !== here || Date.now() - p.at > 8000) return null;
    sessionStorage.removeItem(KEY);
    return p;
  } catch {
    return null;
  }
}

// ---------- 时间线（纯函数，测试可以停在任意一刻） ----------
const clamp = (v) => Math.max(0, Math.min(1, v)),
  seg = (t, a, b) => clamp((t - a) / (b - a)),
  smooth = (t) => t * t * (3 - 2 * t),
  inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outCubic = (t) => 1 - (1 - t) ** 3;
export const PASSAGE = { strips: 22, seam: 0.5, leave: 1.0, ride: 1.2, arrive: 1.5 };
// 三段：leave 薄片翻开、进入竖井（结束时竖井完全不透明，可以换页）；
//       ride 竖井里移动（楼层表从出发层亮到目的层）；arrive 薄片从外往缝翻回，露出目的地。
export function passageFrame(stage, t, seam = PASSAGE.seam) {
  const dist = (j) => Math.abs((j + 0.5) / PASSAGE.strips - seam),
    f = { stage, t, open: [] };
  if (stage === 'leave') {
    for (let j = 0; j < PASSAGE.strips; j++) {
      const a = 0.08 + dist(j) * 0.9;
      f.open.push(inOut(seg(t, a, a + 0.38)));
    }
    f.seam = smooth(seg(t, 0, 0.22)) * (1 - seg(t, 0.6, 0.9));
    f.fall = seg(t, 0.2, PASSAGE.leave) ** 2;
    f.shaft = smooth(seg(t, 0.05, 0.3));
    f.ride = 0;
  } else if (stage === 'ride') {
    f.open = Array(PASSAGE.strips).fill(1);
    f.seam = 0;
    f.fall = 1;
    f.shaft = 1;
    f.ride = inOut(seg(t, 0, PASSAGE.ride));
  } else {
    for (let j = 0; j < PASSAGE.strips; j++) {
      const a = (seam - dist(j)) * 0.9 + 0.1;
      f.open.push(1 - inOut(seg(t, a, a + 0.4)));
    }
    f.fall = 1 - outCubic(seg(t, 0, 1.0));
    f.shaft = 1;
    f.seam = Math.sin(Math.PI * seg(t, 1.05, PASSAGE.arrive));
    f.ride = 1;
  }
  return f;
}

// ---------- 覆盖层 ----------
export function createPassage({ from, to }) {
  const a = FLOORS[from],
    b = FLOORS[to],
    up = b.level > a.level,
    el = document.createElement('section');
  el.className = 'passage';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="ps-shaft"><div class="ps-walls"></div><div class="ps-scale l"></div><div class="ps-scale r"></div><div class="ps-cord"></div><div class="ps-arrive"><small>${b.code} · ${b.en}</small><b>${b.name}</b><span class="ps-state"><span class="go">${up ? '上行' : '下行'} · 正在接入</span><span class="hold">正在载入…</span></span></div><div class="ps-read"><span>PASSAGE · ${a.code} ${up ? '⇡' : '⇣'} ${b.code}</span><strong data-alt>${fmtAlt(a.alt)}</strong></div><ol class="ps-floors">${Object.values(
    FLOORS,
  )
    .map(
      (f) =>
        `<li data-level="${f.level}"${f === a ? ' class="from"' : ''}><b>${f.code}</b><span>${f.name}</span></li>`,
    )
    .join(
      '',
    )}<i class="ps-car"></i></ol></div><div class="ps-blinds" style="--n:${PASSAGE.strips}">${Array.from(
    { length: PASSAGE.strips },
    (_, j) =>
      `<div class="ps-strip" style="--j:${j};--dir:${(j + 0.5) / PASSAGE.strips < PASSAGE.seam ? -1 : 1}"><i></i></div>`,
  ).join('')}</div><i class="ps-seam"></i>`;
  const strips = [...el.querySelectorAll('.ps-strip')],
    alt = el.querySelector('[data-alt]'),
    floors = [...el.querySelectorAll('.ps-floors li')],
    car = el.querySelector('.ps-car');
  el.classList.toggle('up', up);
  let drift = 0;
  function apply(f) {
    strips.forEach((s, j) => {
      s.style.setProperty('--o', f.open[j].toFixed(4));
      s.style.setProperty('--glint', Math.sin(Math.PI * f.open[j]).toFixed(3));
    });
    // 往上走时画面往下掠，往下走时往上掠
    el.style.setProperty('--fall', ((up ? -1 : 1) * f.fall).toFixed(4));
    el.style.setProperty('--seam', f.seam.toFixed(3));
    el.style.setProperty('--shaft', f.shaft.toFixed(3));
    const travel =
        f.stage === 'leave' ? 0.08 * f.shaft : f.stage === 'ride' ? 0.08 + 0.84 * f.ride : 1,
      level = a.level + (b.level - a.level) * travel;
    el.style.setProperty('--depth-px', `${((up ? 1 : -1) * (travel * 1600 + drift)).toFixed(1)}px`);
    alt.textContent = fmtAlt(Math.round(a.alt + (b.alt - a.alt) * travel));
    // 楼层表：小方块沿着楼层移动，经过哪层亮哪层
    car.style.setProperty('--level', level.toFixed(3));
    floors.forEach((li) => {
      const d = Math.abs(Number(li.dataset.level) - level);
      li.style.setProperty('--lit', Math.max(0, 1 - d * 1.6).toFixed(3));
    });
    el.style.setProperty(
      '--arrive',
      (f.stage === 'arrive' ? 1 - seg(f.t, 0.3, 0.8) : f.ride).toFixed(3),
    );
  }
  return {
    el,
    apply,
    hold(on, dt = 0) {
      el.classList.toggle('holding', on);
      if (on) drift += dt * 90;
    },
    // 薄片里的画面：一张图（截图或 3D 画面），在页面上的位置和大小原样保留，其余填底色
    picture(shot, bg) {
      el.style.setProperty('--ps-bg', bg || '#15191b');
      el.style.setProperty('--ps-img', shot ? `url("${shot.url}")` : 'none');
      el.style.setProperty('--ps-pos', shot ? `${shot.x}px ${shot.y}px` : '0 0');
      el.style.setProperty('--ps-size', shot ? `${shot.w}px ${shot.h}px` : 'auto');
    },
  };
}
function fmtAlt(m) {
  return (m < 0 ? '−' : m > 0 ? '+' : '±') + String(Math.abs(m)).padStart(3, '0');
}

// 按真实经过时间推进一段时间线；hold() 返回 true 时停在原处等待（比如模型还没载入）
export function play(stage, duration, onFrame, { hold, from = 0 } = {}) {
  return new Promise((resolve) => {
    let t = from,
      last = 0;
    function tick(now) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const waiting = hold?.(t + dt, dt);
      if (!waiting) t += dt;
      onFrame(Math.min(t, duration), dt, waiting);
      if (t >= duration) return resolve();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}
