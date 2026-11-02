// 纸飞机 → 星空（露娜）。点窗台上的纸飞机：它从窗台起飞，画面跟着飞上天空，
// 同一条航线一路变成人类的飞行器——纸飞机 → 飞行者一号 → 双螺旋桨客机 → 喷气客机 → 航天飞机 → 运载火箭——
// 天色从窗外的颜色一路暗成太空，云层落到下面，星星亮起、地球的边缘出现，最后进入星空（观星台内容预览）。
// 星空页面接着这一帧淡出，所以这段动画也是星空的载入画面。
// 飞行器都是我们自己画的俯视剪影（机头朝上），火箭是侧视；不用任何航空公司、机构的涂装和标志。
import { atmosphere } from './atmosphere.js';

const STAGES = [
  { id: 'paper', t: 0, year: '窗台', name: '纸飞机', alt: 1 },
  { id: 'flyer', t: 1.9, year: '1903', name: '飞行者一号', alt: 30 },
  { id: 'twin', t: 3.4, year: '1930s', name: '双螺旋桨客机', alt: 3000 },
  { id: 'jet', t: 4.9, year: '1950s', name: '喷气客机', alt: 11000 },
  { id: 'shuttle', t: 6.4, year: '1981', name: '航天飞机', alt: 100000 },
  { id: 'rocket', t: 7.6, year: '今天', name: '运载火箭', alt: 400000 },
];
export const FLIGHT = { total: 9.8, morph: 0.45, out: 8.4 };
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
    twin: {
      fill: [
        fuselage(12, 190, 10),
        poly(
          mirror([
            [100, 76],
            [186, 90],
            [186, 99],
            [100, 106],
          ]),
        ),
        poly(
          mirror([
            [100, 166],
            [134, 172],
            [134, 180],
            [100, 182],
          ]),
        ),
        rect(131, 60, 141, 100, 4),
        rect(59, 60, 69, 100, 4),
      ],
      line: [line([118, 58], [154, 58]), line([46, 58], [82, 58])],
    },
    jet: {
      fill: [
        fuselage(8, 192, 8.5),
        poly(
          mirror([
            [100, 80],
            [188, 128],
            [188, 136],
            [150, 128],
            [100, 118],
          ]),
        ),
        poly(
          mirror([
            [100, 160],
            [138, 184],
            [138, 189],
            [100, 182],
          ]),
        ),
        rect(127, 98, 135, 118, 3),
        rect(155, 114, 162, 130, 3),
        rect(65, 98, 73, 118, 3),
        rect(38, 114, 45, 130, 3),
      ],
      line: [line([100, 30], [100, 176])],
    },
    shuttle: {
      fill: [
        poly(
          mirror([
            [100, 6],
            [109, 14],
            [113, 40],
            [113, 64],
            [124, 112],
            [178, 176],
            [176, 186],
            [100, 186],
          ]),
        ),
        rect(91, 186, 109, 193, 1),
      ],
      line: [line([113, 64], [113, 186]), line([87, 64], [87, 186]), line([100, 30], [100, 120])],
      bells: [
        [92, 196],
        [108, 196],
        [100, 199],
      ],
    },
    rocket: {
      fill: [
        poly(
          mirror([
            [100, 4],
            [108, 18],
            [112, 40],
            [112, 172],
            [100, 172],
          ]),
        ),
        poly([
          [112, 146],
          [128, 178],
          [112, 172],
        ]),
        poly([
          [88, 146],
          [72, 178],
          [88, 172],
        ]),
        rect(93, 172, 107, 182, 1),
      ],
      line: [line([88, 110], [112, 110]), line([88, 48], [112, 48])],
      flame: true,
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

export function createFlight({ motion, station }) {
  let run = null;
  function go(mood) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), mood }));
    } catch {}
    location.assign('../preview/starfield/?from=workstation&via=flight');
  }
  function build() {
    const el = document.createElement('section');
    el.className = 'flight';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '纸飞机飞向星空');
    el.innerHTML = `<canvas></canvas><div class="fl-read"><small>FLIGHT · 窗台 ⇡ 星空</small><strong data-alt>1 M</strong><span data-name></span></div><ol class="fl-stages" aria-hidden="true">${STAGES.map(
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
    const a = atmosphere(new Date(), mood),
      el = build(),
      canvas = el.querySelector('canvas'),
      ctx = canvas.getContext('2d'),
      altEl = el.querySelector('[data-alt]'),
      nameEl = el.querySelector('[data-name]'),
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
    let w = 0,
      h = 0,
      dpr = 1,
      climb = 0;
    function size() {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth;
      h = innerHeight;
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
      if (shape.flame) {
        // 火焰：每帧轻微抖动的长焰
        const len = 60 + Math.random() * 18,
          g = ctx.createLinearGradient(0, 182, 0, 182 + len);
        g.addColorStop(0, 'rgba(255,248,220,0.95)');
        g.addColorStop(0.3, 'rgba(201,231,85,0.75)');
        g.addColorStop(1, 'rgba(201,231,85,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(93, 182);
        ctx.quadraticCurveTo(100, 182 + len * 1.1, 107, 182);
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
    function frame(t, dt) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { i, stage, morph, alt } = flightStage(t),
        up = smooth(seg(t, 0.8, 7.6)),
        fade = smooth(seg(t, 0, 0.9)),
        speed = 0.15 + 1.6 * smooth(seg(t, 0.6, 7.8));
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
      const starK = seg(t, 5.6, 7.4);
      if (starK > 0)
        for (const s of stars) {
          ctx.globalAlpha = fade * starK * s.a * (0.7 + 0.3 * Math.sin(t * 3 + s.x * 40));
          ctx.fillStyle = '#eef3ff';
          ctx.fillRect(s.x * w, ((s.y + climb * 0.02) % 1) * h, s.s, s.s);
        }
      // 地球的边缘：大气层的一道蓝光
      const limb = smooth(seg(t, 6.4, 7.8)) * (1 - seg(t, 8.6, 9.6) * 0.6);
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
      const cloudK = (1 - seg(t, 4.8, 6.0)) * fade;
      if (cloudK > 0)
        for (const c of clouds) {
          const y = ((c.y + climb * 0.35) % 1.4) - 0.2,
            R = c.w * Math.max(w, h * 0.8);
          ctx.globalAlpha = cloudK * c.a * (up < 0.3 ? 1.2 : 1);
          for (const [dx, dy, k] of c.puffs) {
            const px = c.x * w + dx * R,
              py = y * h + dy * R,
              cg = ctx.createRadialGradient(px, py, 0, px, py, R * k);
            cg.addColorStop(0, 'rgba(235,240,242,0.8)');
            cg.addColorStop(1, 'rgba(235,240,242,0)');
            ctx.fillStyle = cg;
            ctx.beginPath();
            ctx.ellipse(px, py, R * k, R * k * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      // 速度线
      const lines = Math.round(6 + 26 * speed * (1 - seg(t, 8.4, 9.2)));
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
      altEl.textContent = fmtAlt(alt);
      nameEl.textContent = `${shown.year} · ${shown.name}`;
      items.forEach((li, k) => li.classList.toggle('on', k === STAGES.indexOf(shown)));
      items.forEach((li, k) => li.classList.toggle('past', k < STAGES.indexOf(shown)));
      el.style.setProperty('--ui', fade.toFixed(3));
      el.style.setProperty('--quote', smooth(seg(t, 8.4, 9.3)).toFixed(3));
    }
    let t = 0,
      last = 0,
      raf = 0,
      done = false;
    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      go(mood);
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
    run = { el, frame, setClimb: (v) => (climb = v) };
    if (test) return run;
    el.querySelector('.fl-skip').focus({ preventScroll: true });
    raf = requestAnimationFrame(tick);
    return true;
  }
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
