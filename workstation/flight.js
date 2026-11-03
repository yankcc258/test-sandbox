// 纸飞机 → 星空（露娜）。点窗台上的纸飞机：它从窗台起飞，画面跟着飞上天空，
// 同一条航线一路变成人类的飞行器——纸飞机 → 飞行者一号 → 双螺旋桨客机 → 喷气客机 → 航天飞机 → 运载火箭——
// 天色从窗外的颜色一路暗成太空，云层落到下面，星星亮起、地球的边缘出现，最后进入星空（观星台内容预览）。
// 星空页面接着这一帧淡出，所以这段动画也是星空的载入画面。
// 飞行器都是我们自己画的俯视剪影（机头朝上），火箭是侧视；不用任何航空公司、机构的涂装和标志。
import { atmosphere } from './atmosphere.js';
import { warmStarfield } from '../preview/starfield/preload.js?v=28';

// 各个世代有代表性的飞行器（高度是这段飞行里的高度，用来讲「越飞越高」，不是各自的纪录）
const STAGES = [
  { id: 'paper', t: 0, year: '窗台', name: '纸飞机', note: '从桌前出发', alt: 1 },
  {
    id: 'balloon',
    t: 1.2,
    year: '1783',
    name: '热气球',
    note: '蒙戈尔菲耶兄弟 · 人类第一次升空',
    alt: 300,
  },
  {
    id: 'flyer',
    t: 2.3,
    year: '1903',
    name: '飞行者一号',
    note: '莱特兄弟 · 第一次有动力的持续飞行',
    alt: 600,
  },
  {
    id: 'spirit',
    t: 3.4,
    year: '1927',
    name: '圣路易斯精神号',
    note: '林德伯格 · 第一次单人不着陆飞越大西洋',
    alt: 1500,
  },
  {
    id: 'dc3',
    t: 4.5,
    year: '1936',
    name: 'DC-3',
    note: '让航空旅行走进日常的螺旋桨客机',
    alt: 3000,
  },
  { id: 'x1', t: 5.6, year: '1947', name: 'X-1', note: '第一次在平飞中突破音障', alt: 13700 },
  {
    id: 'concorde',
    t: 6.7,
    year: '1969',
    name: '协和式',
    note: '以两倍音速载客的超音速客机',
    alt: 18000,
  },
  {
    id: 'saturn',
    t: 7.8,
    year: '1969',
    name: '土星五号',
    note: '把阿波罗 11 号送往月球',
    alt: 67000,
  },
  {
    id: 'shuttle',
    t: 8.9,
    year: '1981',
    name: '航天飞机',
    note: '第一种可部分重复使用的航天器',
    alt: 110000,
  },
  {
    id: 'cz2f',
    t: 10.0,
    year: '2003',
    name: '长征二号F',
    note: '神舟五号 · 中国第一次载人航天',
    alt: 343000,
  },
];
// env：天色、云、星星、地球边缘的时间表按这个倍数拉长（第一版是 6 种飞行器，现在 10 种）
export const FLIGHT = { total: 12.6, morph: 0.45, out: 10.8, env: 1.32 };
const KEY = 'zhixu-flight';

// ---------- 剪影（200 × 200 的格子，机头朝上，左右对称） ----------
function mirror(right) {
  const left = right
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [200 - x, y]);
  return right.concat(left);
}
function poly(points) {
  const p = new Path2D();
  points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}
function rect(x0, y0, x1, y1, r = 0) {
  const p = new Path2D();
  p.roundRect(x0, y0, x1 - x0, y1 - y0, r);
  return p;
}
function ellipse(cx, cy, rx, ry) {
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  return p;
}
function line(...pts) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  return p;
}
function fuselage(nose, tail, half) {
  return poly(
    mirror([
      [100, nose],
      [100 + half * 0.7, nose + 8],
      [100 + half, nose + 30],
      [100 + half, tail - 40],
      [100 + half * 0.35, tail],
      [100, tail],
    ]),
  );
}
// 每种飞行器：fill（剪影面）和 line（细节线），都按 200 × 200 画
// Path2D 只在浏览器里有：第一次画的时候才建
let shapeCache = null;
const shapes = () =>
  (shapeCache ||= {
    paper: {
      fill: [
        poly(
          mirror([
            [100, 10],
            [158, 172],
            [110, 152],
            [100, 182],
          ]),
        ),
      ],
      line: [line([100, 10], [100, 182]), line([100, 10], [110, 152]), line([100, 10], [90, 152])],
    },
    // 侧视：梨形气囊、横向装饰带、下面的吊篮和火光
    balloon: {
      fill: [
        (() => {
          const p = new Path2D();
          p.moveTo(100, 12);
          p.bezierCurveTo(162, 12, 164, 92, 128, 126);
          p.lineTo(116, 148);
          p.lineTo(84, 148);
          p.lineTo(72, 126);
          p.bezierCurveTo(36, 92, 38, 12, 100, 12);
          p.closePath();
          return p;
        })(),
        rect(82, 150, 118, 160, 2),
      ],
      dark: [rect(52, 58, 148, 66), rect(62, 100, 138, 106)],
      line: [
        line([100, 12], [100, 148]),
        line([100, 12], [80, 60], [86, 120], [92, 148]),
        line([100, 12], [120, 60], [114, 120], [108, 148]),
        line([84, 148], [86, 150]),
        line([116, 148], [114, 150]),
      ],
      dot: [100, 156],
    },
    // 俯视：上下两层长翼、前方的升降舵、后方双方向舵、两副推进式螺旋桨
    flyer: {
      fill: [
        rect(16, 90, 184, 108, 2),
        rect(72, 38, 128, 50, 2),
        rect(91, 146, 93, 172),
        rect(107, 146, 109, 172),
      ],
      line: [
        rect(20, 96, 180, 112, 2),
        line([92, 50], [92, 90]),
        line([108, 50], [108, 90]),
        line([92, 108], [92, 146]),
        line([108, 108], [108, 146]),
        line([56, 116], [84, 116]),
        line([116, 116], [144, 116]),
      ],
      dot: [100, 100],
    },
    // 俯视：上单翼、长机身、机头一副螺旋桨
    spirit: {
      fill: [
        rect(14, 66, 186, 88, 10),
        fuselage(38, 182, 9),
        poly(
          mirror([
            [100, 160],
            [130, 162],
            [134, 170],
            [128, 176],
            [100, 176],
          ]),
        ),
      ],
      line: [line([72, 34], [128, 34]), line([100, 66], [100, 88])],
    },
    // 俯视：梯形下单翼、两台发动机和螺旋桨、圆润的尾翼
    dc3: {
      fill: [
        fuselage(12, 190, 10),
        poly(
          mirror([
            [100, 76],
            [186, 94],
            [186, 103],
            [100, 110],
          ]),
        ),
        poly(
          mirror([
            [100, 166],
            [134, 172],
            [134, 180],
            [100, 184],
          ]),
        ),
        rect(129, 62, 139, 102, 4),
        rect(61, 62, 71, 102, 4),
      ],
      line: [line([116, 60], [152, 60]), line([48, 60], [84, 60])],
    },
    // 俯视：子弹形机身、短而薄的平直机翼
    x1: {
      fill: [
        poly(
          mirror([
            [100, 8],
            [106, 22],
            [111, 50],
            [111, 172],
            [104, 190],
            [100, 190],
          ]),
        ),
        poly(
          mirror([
            [100, 92],
            [166, 98],
            [166, 108],
            [100, 116],
          ]),
        ),
        poly(
          mirror([
            [100, 160],
            [132, 166],
            [132, 174],
            [100, 178],
          ]),
        ),
      ],
      line: [line([89, 34], [111, 34])],
    },
    // 俯视：修长的机身、尖头（下垂机鼻）、S 形前缘的大三角翼、翼下四台发动机
    concorde: {
      fill: [
        poly(
          mirror([
            [100, 4],
            [104, 16],
            [107, 34],
            [107, 192],
            [100, 194],
          ]),
        ),
        poly(
          mirror([
            [100, 62],
            [110, 70],
            [122, 98],
            [140, 132],
            [158, 160],
            [174, 180],
            [172, 187],
            [100, 187],
          ]),
        ),
        rect(112, 164, 121, 194, 2),
        rect(125, 164, 134, 194, 2),
        rect(79, 164, 88, 194, 2),
        rect(66, 164, 75, 194, 2),
      ],
      line: [line([95, 24], [105, 24])],
    },
    // 侧视：逃逸塔、指令舱、三级箭体（第一级黑白相间）、尾翼和五台发动机
    saturn: {
      fill: [
        poly([
          [100, 16],
          [108, 30],
          [92, 30],
        ]),
        rect(92, 30, 108, 40),
        poly([
          [92, 40],
          [108, 40],
          [112, 56],
          [88, 56],
        ]),
        rect(88, 56, 112, 90),
        rect(86, 92, 114, 138),
        rect(86, 140, 114, 186),
        poly([
          [86, 168],
          [76, 190],
          [86, 186],
        ]),
        poly([
          [114, 168],
          [124, 190],
          [114, 186],
        ]),
      ],
      dark: [
        rect(88, 74, 100, 90),
        rect(100, 92, 114, 110),
        rect(86, 140, 100, 160),
        rect(100, 160, 114, 186),
      ],
      line: [line([100, 2], [100, 16]), line([96, 8], [104, 8])],
      bells: [
        [92, 192],
        [100, 194],
        [108, 192],
      ],
      flame: [[88, 112, 196]],
    },
    // 侧视：中间的外储箱、一侧的固体助推器、另一侧的轨道器（机鼻朝上、尾翼伸向外侧）
    shuttle: {
      fill: [
        poly([
          [100, 8],
          [110, 26],
          [110, 176],
          [90, 176],
          [90, 26],
        ]),
        poly([
          [116, 22],
          [120, 34],
          [120, 188],
          [112, 188],
          [112, 34],
        ]),
        poly([
          [80, 52],
          [88, 64],
          [88, 168],
          [70, 168],
          [70, 74],
        ]),
        poly([
          [70, 136],
          [52, 166],
          [52, 174],
          [70, 166],
        ]),
      ],
      dark: [rect(91, 30, 109, 176)],
      line: [line([70, 110], [88, 110])],
      bells: [
        [75, 174],
        [83, 174],
        [116, 194],
      ],
      flame: [
        [70, 88, 176],
        [112, 120, 190],
      ],
    },
    // 侧视：逃逸塔、整流罩、芯级和两侧助推器（另外两台在背后）
    cz2f: {
      fill: [
        poly([
          [100, 14],
          [110, 28],
          [110, 60],
          [90, 60],
          [90, 28],
        ]),
        rect(92, 60, 108, 182),
        poly([
          [83, 92],
          [88, 106],
          [88, 184],
          [78, 184],
          [78, 106],
        ]),
        poly([
          [117, 92],
          [122, 106],
          [122, 184],
          [112, 184],
          [112, 106],
        ]),
        poly([
          [78, 172],
          [70, 186],
          [78, 184],
        ]),
        poly([
          [122, 172],
          [130, 186],
          [122, 184],
        ]),
      ],
      dark: [rect(92, 64, 108, 72), rect(92, 130, 108, 134)],
      line: [line([100, 0], [100, 14]), line([95, 10], [105, 10]), line([90, 44], [110, 44])],
      bells: [
        [83, 190],
        [100, 190],
        [117, 190],
      ],
      flame: [
        [78, 88, 186],
        [92, 108, 184],
        [112, 122, 186],
      ],
    },
  });

// ---------- 小工具 ----------
const clamp = (v) => Math.max(0, Math.min(1, v)),
  seg = (t, a, b) => clamp((t - a) / (b - a)),
  smooth = (t) => t * t * (3 - 2 * t),
  mixHex = (a, b, k) =>
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
function fmtAlt(m) {
  return m < 1000 ? `${Math.round(m)} M` : `${(m / 1000).toFixed(m < 100000 ? 1 : 0)} KM`;
}
// 当前在哪一段、和下一段的过渡进度
export function flightStage(t) {
  let i = 0;
  while (i < STAGES.length - 1 && t >= STAGES[i + 1].t) i++;
  const next = STAGES[i + 1],
    morph = next ? seg(t, next.t - FLIGHT.morph, next.t) : 0;
  const prev = STAGES[i],
    // 高度按对数插值：几米到几百公里都能平滑地读
    alt = next
      ? Math.exp(
          Math.log(prev.alt) + (Math.log(next.alt) - Math.log(prev.alt)) * seg(t, prev.t, next.t),
        )
      : prev.alt;
  return { i, stage: prev, morph, alt };
}

// Keep the moving canvas within a pixel budget. DOM text remains native-resolution.
export function flightPixelRatio(width, height, pixelRatio) {
  return Math.min(2, pixelRatio || 1, Math.sqrt(2000000 / Math.max(1, width * height)));
}
function cloudTexture(puffs) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 144;
  const g = c.getContext('2d'),
    R = 256 / 4.4;
  for (const [dx, dy, k] of puffs) {
    const x = 128 + dx * R,
      y = 72 + dy * R;
    const gradient = g.createRadialGradient(x, y, 0, x, y, R * k);
    gradient.addColorStop(0, 'rgba(235,240,242,0.8)');
    gradient.addColorStop(1, 'rgba(235,240,242,0)');
    g.fillStyle = gradient;
    g.beginPath();
    g.ellipse(x, y, R * k, R * k * 0.55, 0, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

export function createFlight({ motion, station }) {
  let run = null;
  function go(mood, picture = null) {
    try {
      sessionStorage.setItem(
        KEY,
        JSON.stringify({ at: Date.now(), mood, picture, still: !motion() }),
      );
    } catch {}
    location.assign(
      '../preview/starfield/?from=workstation&via=flight' + (!motion() ? '&motion=0' : ''),
    );
  }
  function build() {
    const el = document.createElement('section');
    el.className = 'flight';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '纸飞机飞向星空');
    el.innerHTML = `<canvas></canvas><div class="fl-read"><small>FLIGHT · 窗台 ⇡ 星空</small><strong data-alt>1 M</strong><span data-name></span><em data-note></em></div><ol class="fl-stages" aria-hidden="true">${STAGES.map(
      (s) => `<li><b>${s.year}</b><span>${s.name}</span></li>`,
    ).join(
      '',
    )}</ol><p class="fl-quote"><span>地球是人类的摇篮，</span><span>但人不能永远生活在摇篮里。</span><small>— 康斯坦丁 · 齐奥尔科夫斯基</small></p><button type="button" class="fl-skip">跳过 <kbd>ESC</kbd></button>`;
    document.body.append(el);
    return el;
  }
  function start(test = false) {
    const mood = window.zxStation?.mood?.() || 'auto';
    if (run) return true;
    if (!motion() && !test) {
      go(mood);
      return true;
    }
    if (!test) warmStarfield();
    const a = atmosphere(new Date(), mood),
      el = build(),
      canvas = el.querySelector('canvas'),
      ctx = canvas.getContext('2d'),
      altEl = el.querySelector('[data-alt]'),
      nameEl = el.querySelector('[data-name]'),
      noteEl = el.querySelector('[data-note]'),
      items = [...el.querySelectorAll('.fl-stages li')];
    // 纸飞机在屏幕上的起点：窗台上那只的位置
    const from = window.zxStation?.anchor?.('sky') || {
      x: innerWidth * 0.62,
      y: innerHeight * 0.45,
    };
    const rand = (n) => {
      let s = n * 9301 + 49297;
      return () => (s = (s * 9301 + 49297) % 233280) / 233280;
    };
    const r = rand(7),
      // 每朵云是几团错开的小绒团，不要拉成横条
      clouds = Array.from({ length: 18 }, () => ({
        x: r(),
        y: r() * 1.4,
        w: 0.06 + r() * 0.1,
        a: 0.06 + r() * 0.1,
        puffs: Array.from({ length: 4 }, () => [r() * 2 - 1, r() * 0.8 - 0.4, 0.55 + r() * 0.6]),
      })),
      stars = Array.from({ length: 160 }, () => ({
        x: r(),
        y: r(),
        s: 0.4 + r() * 1.3,
        a: 0.3 + r() * 0.7,
      }));
    clouds.forEach((c) => {
      c.sprite = cloudTexture(c.puffs);
    });
    shapes();
    let w = 0,
      h = 0,
      dpr = 1,
      climb = 0;
    function size() {
      w = innerWidth;
      h = innerHeight;
      dpr = flightPixelRatio(w, h, devicePixelRatio);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    size();
    addEventListener('resize', size);
    station()?.focus?.('sky');
    function drawShape(id, x, y, s, alpha, rot = 0) {
      const shape = shapes()[id];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(s / 200, s / 200);
      ctx.translate(-100, -100);
      ctx.globalAlpha = alpha;
      // 火焰：每帧轻微抖动的长焰（[左, 右, 喷口高度]，可以有几股）
      for (const [x0, x1, y0] of shape.flame || []) {
        const len = (x1 - x0) * (3.2 + Math.random() * 0.8),
          g = ctx.createLinearGradient(0, y0, 0, y0 + len);
        g.addColorStop(0, 'rgba(255,248,220,0.95)');
        g.addColorStop(0.3, 'rgba(201,231,85,0.75)');
        g.addColorStop(1, 'rgba(201,231,85,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2, y0 + len * 1.1, x1, y0);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(232,235,228,0.16)';
      ctx.strokeStyle = 'rgba(240,243,236,0.95)';
      ctx.lineWidth = 2.2 * (200 / s) * 0.9;
      ctx.lineJoin = 'round';
      for (const p of shape.fill) {
        ctx.fill(p);
        ctx.stroke(p);
      }
      // 深色色块：土星五号的黑白相间、航天飞机的外储箱等
      ctx.fillStyle = 'rgba(232,235,228,0.55)';
      for (const p of shape.dark || []) ctx.fill(p);
      ctx.lineWidth *= 0.6;
      ctx.strokeStyle = 'rgba(240,243,236,0.6)';
      for (const p of shape.line || []) ctx.stroke(p);
      if (shape.dot) {
        ctx.fillStyle = '#c9e755';
        ctx.beginPath();
        ctx.arc(...shape.dot, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const [bx, by] of shape.bells || []) {
        ctx.fillStyle = 'rgba(201,231,85,0.7)';
        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    let lastRead = -Infinity,
      lastStage = null,
      lastUi = null,
      lastQuote = null;
    function frame(t, dt) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const e = t / FLIGHT.env, // 天色、云、星的时间表按飞行总长拉长
        { i, stage, morph, alt } = flightStage(t),
        up = smooth(seg(e, 0.8, 7.6)),
        fade = smooth(seg(t, 0, 0.9)),
        speed = 0.15 + 1.6 * smooth(seg(e, 0.6, 7.8));
      climb += dt * speed;
      // 天空：窗外的颜色 → 高空的深蓝 → 太空
      const sky =
          up < 0.55
            ? mixHex(a.sky, '#1b3554', up / 0.55)
            : mixHex('#1b3554', '#04060c', (up - 0.55) / 0.45),
        horizon =
          up < 0.55
            ? mixHex(a.horizon, '#3f6a8a', up / 0.55)
            : mixHex('#3f6a8a', '#0a1426', (up - 0.55) / 0.45);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = fade;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, sky);
      g.addColorStop(1, horizon);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // 星星：高空以上慢慢亮起
      const starK = seg(e, 5.6, 7.4);
      if (starK > 0)
        for (const s of stars) {
          ctx.globalAlpha = fade * starK * s.a * (0.7 + 0.3 * Math.sin(t * 3 + s.x * 40));
          ctx.fillStyle = '#eef3ff';
          ctx.fillRect(s.x * w, ((s.y + climb * 0.02) % 1) * h, s.s, s.s);
        }
      // 地球的边缘：大气层的一道蓝光
      const limb =
        smooth(seg(e, 6.4, 7.8)) * (1 - seg(t, FLIGHT.out + 0.2, FLIGHT.out + 1.2) * 0.6);
      if (limb > 0) {
        const R = Math.max(w, h) * 1.6,
          cy = h + R - h * 0.18 * limb;
        ctx.globalAlpha = fade * limb;
        const lg = ctx.createRadialGradient(w / 2, cy, R * 0.97, w / 2, cy, R * 1.06);
        lg.addColorStop(0, 'rgba(70,140,200,0.0)');
        lg.addColorStop(0.45, 'rgba(120,190,230,0.55)');
        lg.addColorStop(1, 'rgba(120,190,230,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(w / 2, cy, R * 1.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0b1a28';
        ctx.beginPath();
        ctx.arc(w / 2, cy, R * 0.985, 0, Math.PI * 2);
        ctx.fill();
      }
      // 云：越飞越快地落到下面，穿出云层后消失
      const cloudK = (1 - seg(e, 4.8, 6.0)) * fade;
      if (cloudK > 0)
        for (const c of clouds) {
          const y = ((c.y + climb * 0.35) % 1.4) - 0.2,
            R = c.w * Math.max(w, h * 0.8);
          ctx.globalAlpha = cloudK * c.a * (up < 0.3 ? 1.2 : 1);
          // Baked once at launch: 18 texture draws replace 72 radial gradients.
          ctx.drawImage(
            c.sprite,
            c.x * w - 2.2 * R,
            y * h - (144 / 256) * 2.2 * R,
            4.4 * R,
            (144 / 256) * 4.4 * R,
          );
        }
      // 速度线
      const lines = Math.round(6 + 26 * speed * (1 - seg(t, FLIGHT.out, FLIGHT.out + 0.8)));
      ctx.strokeStyle = 'rgba(232,240,236,0.18)';
      ctx.lineWidth = 1;
      for (let k = 0; k < lines; k++) {
        const x = ((k * 0.6180339) % 1) * w,
          y = ((k * 0.7548776 + climb * (0.6 + (k % 5) * 0.12)) % 1.2) * h - 0.1 * h,
          len = 20 + speed * 60;
        ctx.globalAlpha = fade * 0.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + len);
        ctx.stroke();
      }
      // 飞行器：从窗台的位置飞到画面中上方，之后轻轻起伏；最后火箭越飞越远，变成一颗星
      const size = Math.min(w, h) * (w < 700 ? 0.42 : 0.26),
        launch = smooth(seg(t, 0, 0.9)),
        gone = smooth(seg(t, FLIGHT.out, FLIGHT.out + 1.1)),
        cx = from.x + (w / 2 - from.x) * launch,
        cy =
          from.y + (h * 0.46 - from.y) * launch - gone * h * 0.42 + Math.sin(t * 1.7) * 4 * launch,
        s = size * (0.18 + 0.82 * launch) * (1 - 0.94 * gone),
        rot = (1 - launch) * -1.1;
      const cur = STAGES[i].id,
        nxt = STAGES[i + 1]?.id;
      drawShape(cur, cx, cy, s * (1 + 0.08 * Math.sin(Math.PI * morph)), (1 - morph) * fade, rot);
      if (nxt && morph > 0) drawShape(nxt, cx, cy, s * (0.9 + 0.1 * morph), morph * fade, rot);
      if (morph > 0 && morph < 1) {
        // 换代时一圈淡淡的光
        ctx.globalAlpha = Math.sin(Math.PI * morph) * 0.5 * fade;
        ctx.strokeStyle = '#c9e755';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, s * (0.55 + 0.4 * morph), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (gone > 0.9) {
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#fffbe8';
        ctx.beginPath();
        ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 读数
      const shown = morph > 0.5 && STAGES[i + 1] ? STAGES[i + 1] : stage;
      if (t - lastRead >= 0.1 || t < lastRead || t >= FLIGHT.total) {
        const value = fmtAlt(alt);
        if (altEl.textContent !== value) altEl.textContent = value;
        lastRead = t;
      }
      if (lastStage !== shown.id) {
        nameEl.textContent = `${shown.year} · ${shown.name}`;
        noteEl.textContent = shown.note;
        const index = STAGES.indexOf(shown);
        items.forEach((li, k) => {
          li.classList.toggle('on', k === index);
          li.classList.toggle('past', k < index);
        });
        lastStage = shown.id;
      }
      const quote = smooth(seg(t, FLIGHT.out, FLIGHT.out + 0.9)).toFixed(3);
      const ui = (fade * (1 - smooth(seg(t, FLIGHT.out, FLIGHT.out + 0.9)))).toFixed(3);
      if (ui !== lastUi) {
        el.style.setProperty('--ui', ui);
        lastUi = ui;
      }
      if (quote !== lastQuote) {
        el.style.setProperty('--quote', quote);
        lastQuote = quote;
      }
    }
    let t = 0,
      last = 0,
      raf = 0,
      done = false;
    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
      document.removeEventListener('visibilitychange', visibility);
      let picture = null;
      try {
        picture = canvas.toDataURL('image/jpeg', 0.82);
      } catch {}
      go(mood, picture);
    }
    function tick(now) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      t += dt;
      frame(Math.min(t, FLIGHT.total), dt);
      if (t >= FLIGHT.total) return finish();
      raf = requestAnimationFrame(tick);
    }
    // 跳过：直接到引言那一刻，稍停一下再进星空
    function skip() {
      if (t < FLIGHT.out + 1.1) t = FLIGHT.out + 1.1;
    }
    el.querySelector('.fl-skip').onclick = skip;
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        skip();
      }
    });
    function visibility() {
      cancelAnimationFrame(raf);
      last = 0;
      if (!document.hidden && !done) raf = requestAnimationFrame(tick);
    }
    function cleanup() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
      document.removeEventListener('visibilitychange', visibility);
      el.remove();
      run = null;
      station()?.reset?.();
    }
    run = { el, frame, setClimb: (v) => (climb = v), cleanup };
    document.addEventListener('visibilitychange', visibility);
    if (test) return run;
    el.querySelector('.fl-skip').focus({ preventScroll: true });
    raf = requestAnimationFrame(tick);
    return true;
  }
  addEventListener('pageshow', (e) => {
    if (e.persisted) run?.cleanup();
  });
  return {
    start,
    // 测试用：画出第 t 秒的样子（不跑循环、不跳转）
    pose(t) {
      if (!run) start(true);
      // 测试时没有逐帧累积：按时间估一个爬升量
      run.setClimb(t * 0.9);
      run.frame(t, 0);
      return t;
    },
  };
}
