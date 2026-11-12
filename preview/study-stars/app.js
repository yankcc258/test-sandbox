// 理解星图样稿：把数据、排布、画面接起来。平时画面是静止的，只有拖、缩放、点开、长出新星时才画新的帧。
import {
  REGIONS,
  STATES,
  edgesOf,
  hasWrong,
  neighborsOf,
  regionOf,
  starLevel,
  starState,
} from './model.js?v=1';
import { layoutStars, regionMarks } from './layout.js?v=1';
import { createRenderer } from './render.js?v=1';
import { STAGES, STARS, stageStars } from './data.js?v=1';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const query = new URLSearchParams(location.search);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches || query.get('motion') === '0';
const canvas = $('sky');
const renderer = createRenderer(canvas);
const cam = { x: 0, y: 0, k: 1, ox: 0, oy: 0 };
const scene = {
  stars: [],
  pos: new Map(),
  edges: [],
  marks: [],
  selected: null,
  hover: null,
  near: new Set(),
  grow: null,
};
let stage = STAGES.some((s) => s.id === query.get('stage')) ? query.get('stage') : 'grown';
let tween = null,
  frame = 0,
  fitted = false; // 镜头是不是还停在「全图」上（没被拖过、缩放过）；是的话窗口变了就重新框一次

// ---------- 画一帧 ----------
function paint() {
  frame = 0;
  const now = performance.now();
  if (tween) {
    const t = Math.min(1, (now - tween.start) / tween.ms),
      e = 1 - Math.pow(1 - t, 3);
    for (const key of ['x', 'y', 'k', 'ox', 'oy'])
      cam[key] = tween.from[key] + (tween.to[key] - tween.from[key]) * e;
    if (t >= 1) tween = null;
  }
  if (scene.grow) {
    scene.grow.t = (now - scene.grow.start) / 1100;
    if (scene.grow.t >= 1) scene.grow = null;
  }
  renderer.draw(scene, cam);
  if (tween || scene.grow) request();
}
function request() {
  if (!frame) frame = requestAnimationFrame(paint);
}
// 镜头挪到 to；关了动效就直接到位
function moveCamera(to, ms = 520) {
  const target = { ...cam, ...to };
  if (still || !ms) {
    Object.assign(cam, target);
    tween = null;
  } else tween = { from: { ...cam }, to: target, start: performance.now(), ms };
  request();
}
const isWide = () => innerWidth >= 900;
// 星的页面占掉的位置：电脑上在右边，窄屏在下面
function panelOffset() {
  if (!scene.selected) return { ox: 0, oy: 0 };
  return isWide()
    ? { ox: -$('star-panel').offsetWidth / 2, oy: 0 }
    : { ox: 0, oy: -innerHeight * 0.27 };
}
// 镜头框住所有的星；星少的时候离近一点，不留一大片空
function fitAll(ms) {
  const [W, H] = renderer.size(),
    points = scene.stars.length
      ? [
          ...scene.stars.map((s) => scene.pos.get(s.id)),
          ...scene.marks.filter((m) => m.count).map((m) => ({ x: m.x, y: m.y - 16 })),
        ]
      : scene.marks.filter((m) => !m.hidden).map((m) => ({ x: m.cx, y: m.cy })),
    xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    off = panelOffset(),
    padX = (isWide() ? 300 : 130) + Math.abs(off.ox) * 2,
    padY = (isWide() ? 300 : 330) + Math.abs(off.oy) * 2,
    w = Math.max(...xs) - Math.min(...xs),
    h = Math.max(...ys) - Math.min(...ys),
    k = Math.min((W - padX) / Math.max(w, 1), (H - padY) / Math.max(h, 1));
  moveCamera(
    {
      x: (Math.max(...xs) + Math.min(...xs)) / 2,
      y: (Math.max(...ys) + Math.min(...ys)) / 2 + (scene.stars.length ? 0 : 20),
      k: Math.min(Math.max(k, 0.14), scene.stars.length < 8 ? 1.12 : 1.5),
      ...off,
    },
    ms,
  );
  fitted = true;
}

// ---------- 数据 → 画面 ----------
function setStars(stars, keep = true) {
  scene.stars = stars;
  scene.pos = layoutStars(stars, keep ? scene.pos : new Map());
  scene.edges = edgesOf(stars);
  scene.marks = regionMarks(REGIONS, stars, scene.pos).map((m) => ({
    ...m,
    hidden: m.region.name === '其他' && !m.count,
  }));
  if (scene.selected && !stars.some((s) => s.id === scene.selected)) scene.selected = null;
  scene.near = new Set(
    scene.selected ? neighborsOf(scene.selected, scene.edges).map((n) => n.id) : [],
  );
  renderList();
  renderPanel();
  $('count').textContent = stars.length
    ? `${stars.length} 颗星 · ${scene.edges.length} 条连线`
    : '还没有星';
  $('empty-hint').hidden = stars.length > 0;
}
function setStage(id) {
  stage = id;
  scene.selected = null;
  scene.grow = null;
  setStars(stageStars(id), false);
  for (const b of $('stages').querySelectorAll('button'))
    b.setAttribute('aria-pressed', b.dataset.stage === id);
  const url = new URL(location.href);
  url.searchParams.set('stage', id);
  url.searchParams.delete('open');
  history.replaceState(null, '', url);
  fitAll(0);
}
function select(id, move = true) {
  scene.selected = id;
  scene.near = new Set(id ? neighborsOf(id, scene.edges).map((n) => n.id) : []);
  renderPanel();
  for (const b of $('star-list').querySelectorAll('[data-star]'))
    b.setAttribute('aria-current', b.dataset.star === id);
  if (!move) return request();
  if (!id) return fitted ? fitAll() : moveCamera(panelOffset());
  const p = scene.pos.get(id);
  fitted = false;
  moveCamera({ x: p.x, y: p.y, k: Math.min(Math.max(cam.k, 0.95), 1.3), ...panelOffset() });
}
// 长出一颗新的星：播一次动画就停（新的星亮起来，连线从老的那颗画过来）
function grow(star) {
  setStars([...scene.stars, star]);
  if (!still) scene.grow = { id: star.id, start: performance.now(), t: 0 };
  const p = scene.pos.get(star.id),
    [W, H] = renderer.size(),
    [sx, sy] = renderer.project(cam, p.x, p.y);
  // 新的星不在画面里才挪镜头：退到能看到全图，不丢下原来在看的地方
  if (sx < 80 || sy < 120 || sx > W - 80 || sy > H - 140) fitAll();
  else request();
  toast(star.links.length ? `长出一颗新的星：${star.title}` : `开了一颗星：${star.title}`);
}
function growNext() {
  const have = new Set(scene.stars.map((s) => s.id)),
    next = STARS.find((s) => !have.has(s.id));
  if (!next) return toast('示例里的星都长出来了');
  grow({
    ...next,
    links: next.links.filter((l) => have.has(l.to)),
    explains: [],
    takes: [],
    cardsStable: false,
    wrong: 0,
  });
}

// ---------- 星的页面（朴素的写法，好看只放在图上） ----------
const day = (t) => new Date(t + 9 * 3600000).toISOString().slice(0, 10);
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const FORMULA = {
  derivative:
    '<math display="block"><mrow><mi>f</mi><mo lspace="0" rspace="0">′</mo><mo stretchy="false">(</mo><mi>x</mi><mo stretchy="false">)</mo><mo>=</mo><munder><mi>lim</mi><mrow><mi>h</mi><mo>→</mo><mn>0</mn></mrow></munder><mfrac><mrow><mi>f</mi><mo stretchy="false">(</mo><mi>x</mi><mo>+</mo><mi>h</mi><mo stretchy="false">)</mo><mo>−</mo><mi>f</mi><mo stretchy="false">(</mo><mi>x</mi><mo stretchy="false">)</mo></mrow><mi>h</mi></mfrac></mrow></math>',
};
function plotParabola() {
  // y = x²，x ∈ [-0.6, 2.4]；x = 1 处的切线（斜率 2）和过 x = 1、x = 2 的割线（斜率 3）
  const X = (x) => 20 + ((x + 0.6) / 3) * 300,
    Y = (y) => 150 - (y / 5.8) * 140,
    curve = Array.from({ length: 61 }, (_, i) => -0.6 + i * 0.05)
      .map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(x * x).toFixed(1)}`)
      .join(' '),
    line = (x1, x2, f) => `M${X(x1)} ${Y(f(x1)).toFixed(1)} L${X(x2)} ${Y(f(x2)).toFixed(1)}`;
  return `<svg class="plot" viewBox="0 0 340 170" role="img" aria-label="y = x² 的图像，带一条割线和一条切线"><path d="M20 150 H320 M${X(0)} 10 V160" class="axis"/><path d="${line(0.2, 2.4, (x) => 3 * x - 2)}" class="secant"/><path d="${line(0.1, 2.3, (x) => 2 * x - 1)}" class="tangent"/><path d="${curve}" class="curve"/><circle cx="${X(1)}" cy="${Y(1)}" r="3.2" class="dot"/><circle cx="${X(2)}" cy="${Y(4)}" r="2.6" class="dot dim"/></svg>`;
}
function block(b) {
  if (b.type === 'text') return `<p>${md(b.md)}</p>`;
  if (b.type === 'formula')
    return `<div class="formula">${FORMULA[b.id] || ''}${b.where?.length ? `<dl>${b.where.map((w) => `<div><dt>${esc(w.sym)}</dt><dd>${esc(w.mean)}</dd></div>`).join('')}</dl>` : ''}</div>`;
  if (b.type === 'plot')
    return `<figure>${plotParabola()}<figcaption>${esc(b.note)}</figcaption></figure>`;
  return '';
}
const KIND = { right: '对', wrong: '错', vague: '含糊', missing: '漏了' };
function takeView(t) {
  const c = t.compare,
    diff = c
      ? [
          ['忘了的', c.forgot, 'bad'],
          ['还是错的', c.still, 'bad'],
          ['改对了的', c.fixed, 'good'],
          ['新讲清楚的', c.better, 'good'],
        ]
          .filter(([, list]) => list?.length)
          .map(
            ([name, list, tone]) =>
              `<div class="diff ${tone}"><b>${name}</b>${list.map(esc).join('；')}</div>`,
          )
          .join('')
      : '';
  return `<li class="take"><div class="take-head"><b class="score s${t.score}">${t.score}<small>/5</small></b><span>${day(t.at)}</span>${t.comment ? `<em>${esc(t.comment)}</em>` : ''}</div>${
    diff ? `<div class="compare"><span>和上一次比</span>${diff}</div>` : ''
  }${t.said ? `<blockquote>${esc(t.said)}</blockquote>` : ''}${
    t.points?.length
      ? `<ul class="points">${t.points.map((p) => `<li class="${p.kind}"><i>${KIND[p.kind]}</i>${esc(p.text)}</li>`).join('')}</ul>`
      : ''
  }</li>`;
}
function renderPanel() {
  const panel = $('star-panel'),
    s = scene.stars.find((x) => x.id === scene.selected);
  document.body.classList.toggle('has-panel', !!s);
  if (!s) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  const state = starState(s),
    links = neighborsOf(s.id, scene.edges).map((n) => ({
      ...n,
      star: scene.stars.find((x) => x.id === n.id),
    })),
    named = s.explains.filter((e) => e.title),
    takes = [...s.takes].reverse();
  panel.hidden = false;
  panel.style.setProperty('--hue', regionOf(s.region).hue.join(','));
  panel.innerHTML = `<header><button class="close" data-close aria-label="关上这颗星的页面">×</button><div class="eyebrow">${esc(s.region)} · ${day(s.createdAt)} ${s.by === 'kiko' ? 'kiko 长出来的' : '开的'}</div><h2>${esc(s.title)}</h2>${
    s.aliases.length ? `<p class="muted">也叫：${s.aliases.map(esc).join('、')}</p>` : ''
  }<p class="chips"><span class="chip level-${starLevel(s)}"><i></i>${state.name}<small>${s.takes.length ? `最近一次 ${s.takes.at(-1).score} 分` : state.note}</small></span>${
    hasWrong(s)
      ? `<span class="chip wrong"><i></i>有错<small>错题本里 ${s.wrong} 道</small></span>`
      : ''
  }</p></header>
<section><h3>起点</h3>${s.seed.map(block).join('')}</section>
<section><h3>讲解<small>${s.explains.length ? `${s.explains.length} 条` : '还没有'}</small></h3>${
    named.length
      ? `<ul class="explains">${named.map((e) => `<li><span>${esc(e.title)}</span><time>${day(e.at).slice(5)}</time></li>`).join('')}</ul>`
      : `<p class="muted">${s.explains.length ? '聊天里问过的讲解挂在这里（示例数据没有写内容）。' : '在聊天里问她，聊过的讲解会挂到这里。'}</p>`
  }</section>
<section><h3>理解记录<small>${takes.length ? `讲过 ${takes.length} 次` : '还没讲过'}</small></h3>${
    takes.length
      ? `<ol class="takes">${takes.map(takeView).join('')}</ol>`
      : '<p class="muted">用自己的话讲一遍，kiko 逐条点评、打 1–5 分；再讲一次会和上一次比。</p>'
  }<button class="primary" data-tell>讲给她听</button></section>
${
  links.length
    ? `<section><h3>连着的星<small>${links.length} 颗</small></h3><ul class="links">${links
        .map(
          (l) =>
            `<li><button data-star="${l.star.id}"><i class="dot level-${starLevel(l.star)}" style="--hue:${regionOf(l.star.region).hue.join(',')}"></i>${esc(l.star.title)}</button><small>${esc(l.why)}</small></li>`,
        )
        .join('')}</ul></section>`
    : ''
}`;
  panel.scrollTop = 0;
}
// 画面之外的列表：按板块分，亮的排前面。星图坏了也能用它点开星的页面。
function renderList() {
  $('star-list').innerHTML = REGIONS.map((region) => {
    const list = scene.stars
      .filter((s) => s.region === region.name)
      .sort((a, b) => starLevel(b) - starLevel(a) || a.createdAt - b.createdAt);
    if (!list.length && region.name === '其他') return '';
    return `<section style="--hue:${region.hue.join(',')}"><h3>${esc(region.name)}<small>${list.length ? `${list.length} 颗` : '还没有星'}</small></h3>${
      list.length
        ? `<ul>${list
            .map(
              (s) =>
                `<li><button data-star="${s.id}" aria-current="${s.id === scene.selected}"><i class="dot level-${starLevel(s)}${hasWrong(s) ? ' wrong' : ''}"></i><span>${esc(s.title)}</span><small>${starState(s).name}${s.takes.length ? ` · ${s.takes.at(-1).score} 分` : ''}</small></button></li>`,
            )
            .join('')}</ul>`
        : ''
    }</section>`;
  }).join('');
}
let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

// ---------- 拖、缩放、点 ----------
const pointers = new Map();
let drag = null;
const local = (e) => {
  const box = canvas.getBoundingClientRect();
  return [e.clientX - box.left, e.clientY - box.top];
};
function zoomAt(sx, sy, factor) {
  const [W, H] = renderer.size(),
    k = Math.min(2.4, Math.max(0.14, cam.k * factor)),
    wx = (sx - W / 2 - cam.ox) / cam.k + cam.x,
    wy = (sy - H / 2 - cam.oy) / cam.k + cam.y;
  tween = null;
  fitted = false;
  cam.k = k;
  cam.x = wx - (sx - W / 2 - cam.ox) / k;
  cam.y = wy - (sy - H / 2 - cam.oy) / k;
  request();
}
canvas.addEventListener('pointerdown', (e) => {
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // 合成的指针事件没有可以捕获的指针，不影响拖动
  }
  pointers.set(e.pointerId, local(e));
  drag = { x: e.clientX, y: e.clientY, moved: false, pinch: 0 };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    drag.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
});
canvas.addEventListener('pointermove', (e) => {
  const at = local(e);
  if (!pointers.has(e.pointerId)) {
    const hit = renderer.hit(scene, cam, ...at)?.id || null;
    if (hit !== scene.hover) {
      scene.hover = hit;
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      request();
    }
    return;
  }
  pointers.set(e.pointerId, at);
  if (pointers.size === 2 && drag?.pinch) {
    const [a, b] = [...pointers.values()],
      d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / drag.pinch);
    drag.pinch = d;
    drag.moved = true;
    return;
  }
  const dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 5) return;
  drag.moved = true;
  tween = null;
  fitted = false;
  cam.x -= dx / cam.k;
  cam.y -= dy / cam.k;
  drag.x = e.clientX;
  drag.y = e.clientY;
  canvas.style.cursor = 'grabbing';
  request();
});
const release = (e) => {
  if (!pointers.has(e.pointerId)) return;
  const at = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  canvas.style.cursor = 'grab';
  if (drag && !drag.moved && e.type === 'pointerup')
    select(renderer.hit(scene, cam, ...at)?.id || null);
  if (!pointers.size) drag = null;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    zoomAt(...local(e), Math.exp(-e.deltaY * 0.0016));
  },
  { passive: false },
);

// ---------- 按钮 ----------
$('stages').innerHTML =
  STAGES.map(
    (s) =>
      `<button data-stage="${s.id}" aria-pressed="false" title="${esc(s.note)}">${esc(s.name)}</button>`,
  ).join('') + '<button data-grow title="播一次长出新星的动画">＋ 长一颗星</button>';
$('stages').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.stage) setStage(b.dataset.stage);
  else growNext();
});
$('legend').innerHTML =
  STATES.map(
    (s, i) => `<li><i class="dot level-${i}"></i><b>${s.name}</b><span>${s.note}</span></li>`,
  ).join('') +
  '<li><i class="dot level-2 wrong"></i><b>有错</b><span>错题本里有这颗星的错题</span></li>';
document.addEventListener('click', (e) => {
  const star = e.target.closest('[data-star]');
  if (star) {
    select(star.dataset.star);
    if (!isWide()) document.body.classList.remove('show-list');
  } else if (e.target.closest('[data-close]')) select(null);
  else if (e.target.closest('[data-tell]'))
    toast('样稿里不连 kiko。正式站上这里打开「讲给她听」的对话框。');
});
$('zoom-in').addEventListener('click', () =>
  zoomAt(renderer.size()[0] / 2 + cam.ox, renderer.size()[1] / 2 + cam.oy, 1.3),
);
$('zoom-out').addEventListener('click', () =>
  zoomAt(renderer.size()[0] / 2 + cam.ox, renderer.size()[1] / 2 + cam.oy, 1 / 1.3),
);
$('fit').addEventListener('click', () => fitAll());
$('toggle-list').addEventListener('click', () => {
  const on = document.body.classList.toggle('show-list');
  $('toggle-list').setAttribute('aria-pressed', on);
});
$('new-star').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('new-title').value.trim();
  if (!title) return toast('写一下想学什么');
  const had = scene.stars.find((s) => s.title === title || s.aliases.includes(title));
  $('new-title').value = '';
  if (had) {
    toast(`已经有这颗星了：${had.title}`);
    return select(had.id);
  }
  // 样稿里不连 kiko：示例里有这个名字就用示例的，没有就放进「其他」，起点空着
  const known = STARS.find((s) => s.title === title),
    have = new Set(scene.stars.map((s) => s.id));
  grow(
    known
      ? {
          ...known,
          links: known.links.filter((l) => have.has(l.to)),
          explains: [],
          takes: [],
          cardsStable: false,
          wrong: 0,
          by: 'yank',
        }
      : {
          id: 's-' + Date.now(),
          title,
          aliases: [],
          region: '其他',
          gist: '',
          seed: [{ type: 'text', md: '样稿里不连 kiko，这颗星的起点是空的。' }],
          links: [],
          by: 'yank',
          createdAt: Date.now(),
          explains: [],
          takes: [],
          cardsStable: false,
          wrong: 0,
        },
  );
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && scene.selected) select(null);
});
addEventListener('resize', () => {
  renderer.resize();
  if (fitted) fitAll(0);
  else Object.assign(cam, panelOffset());
  request();
});

// ---------- 开始 ----------
setStage(stage);
if (query.get('list') === '1') $('toggle-list').click();
const open = query.get('open');
if (open) {
  const s = scene.stars.find((x) => x.title === open || x.id === open);
  if (s) {
    select(s.id, false);
    const p = scene.pos.get(s.id);
    moveCamera({ x: p.x, y: p.y, k: 1.05, ...panelOffset() }, 0);
  }
}
document.fonts?.ready.then(request);
document.body.dataset.ready = 'true';
// 给检查脚本用：现在画面的状态
window.zhixuStars = { scene, cam, renderer, fitAll, select, growNext, setStage };
