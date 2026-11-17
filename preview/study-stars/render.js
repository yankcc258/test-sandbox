// 画星图：背景、板块的星云、连线、星、名字、选中的标记。二维画布，只在有变化时画一帧，平时不动。
// 星和星云先各画成一张小图（sprite）再贴，星多了也只是贴图，手机和 iPad 画得动。
import { REGIONS, hasWrong, hash, regionOf, rng, starLevel } from './model.js?v=1';

const INK = [232, 235, 228],
  BG = '#06080b',
  FONT = "Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  MONO = "'SFMono-Regular', Consolas, monospace";
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 五档亮度各自的样子：核、光晕、十字星芒、外环。数值是 sprite 里的像素。
const LOOK = [
  { core: 2.1, halo: 13, glow: 0.1, ring: 6.5, label: 0.5, size: 11.5 }, // 刚开：一个小点加一圈细环
  { core: 2.7, halo: 22, glow: 0.2, label: 0.64, size: 12 }, // 聊过
  { core: 3.5, halo: 34, glow: 0.32, label: 0.8, size: 12 }, // 讲过
  { core: 4.3, halo: 52, glow: 0.42, spike: 46, label: 0.94, size: 13 }, // 讲清楚了：出星芒
  { core: 5, halo: 68, glow: 0.5, spike: 82, diagonal: 26, orbit: 15, label: 1, size: 13 }, // 稳了：长星芒加一圈环
];
const SPRITE = 192;

function canvasOf(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function starSprite(level, hue) {
  const look = LOOK[level],
    c = canvasOf(SPRITE),
    g = c.getContext('2d'),
    m = SPRITE / 2,
    tint = mix(hue, [255, 255, 255], 0.25);
  g.globalCompositeOperation = 'lighter';
  const halo = g.createRadialGradient(m, m, 0, m, m, look.halo);
  halo.addColorStop(0, rgba(tint, look.glow));
  halo.addColorStop(0.3, rgba(hue, look.glow * 0.42));
  halo.addColorStop(1, rgba(hue, 0));
  g.fillStyle = halo;
  g.fillRect(0, 0, SPRITE, SPRITE);
  const spike = (length, width, alpha, angle) => {
    g.save();
    g.translate(m, m);
    g.rotate(angle);
    const line = g.createLinearGradient(-length, 0, length, 0);
    line.addColorStop(0, rgba(tint, 0));
    line.addColorStop(0.5, rgba([255, 255, 255], alpha));
    line.addColorStop(1, rgba(tint, 0));
    g.fillStyle = line;
    g.beginPath();
    g.moveTo(-length, 0);
    g.quadraticCurveTo(0, -width, length, 0);
    g.quadraticCurveTo(0, width, -length, 0);
    g.fill();
    g.restore();
  };
  if (look.spike) {
    spike(look.spike, 1.5, 0.75, 0);
    spike(look.spike * 0.86, 1.5, 0.75, Math.PI / 2);
  }
  if (look.diagonal) {
    spike(look.diagonal, 1, 0.4, Math.PI / 4);
    spike(look.diagonal, 1, 0.4, -Math.PI / 4);
  }
  g.globalCompositeOperation = 'source-over';
  const stroke = (radius, alpha) => {
    g.strokeStyle = rgba(tint, alpha);
    g.lineWidth = 1;
    g.beginPath();
    g.arc(m, m, radius, 0, Math.PI * 2);
    g.stroke();
  };
  if (look.ring) stroke(look.ring, 0.42);
  if (look.orbit) stroke(look.orbit, 0.34);
  const core = g.createRadialGradient(m, m, 0, m, m, look.core);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.6, rgba(mix(hue, [255, 255, 255], 0.7), level ? 1 : 0.85));
  core.addColorStop(1, rgba(hue, 0));
  g.fillStyle = core;
  g.beginPath();
  g.arc(m, m, look.core, 0, Math.PI * 2);
  g.fill();
  return c;
}
// 一片星云：十来团大小不一的柔光叠在一起，形状由板块名字定下来，每次都一样。
const NEBULA = 640;
function nebulaSprite(region) {
  const c = canvasOf(NEBULA),
    g = c.getContext('2d'),
    r = rng(hash(region.name)),
    m = NEBULA / 2;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 13; i++) {
    const angle = r() * Math.PI * 2,
      away = Math.pow(r(), 0.8) * 150,
      x = m + Math.cos(angle) * away * 1.25,
      y = m + Math.sin(angle) * away * 0.8,
      radius = 70 + r() * 110,
      color = mix(region.hue, i % 3 ? [70, 96, 150] : [255, 255, 255], i % 3 ? 0.35 : 0.12),
      blob = g.createRadialGradient(x, y, 0, x, y, radius);
    blob.addColorStop(0, rgba(color, 0.16));
    blob.addColorStop(0.45, rgba(color, 0.06));
    blob.addColorStop(1, rgba(color, 0));
    g.fillStyle = blob;
    g.fillRect(0, 0, NEBULA, NEBULA);
  }
  return c;
}
// 很淡的背景星，铺成一张可以平铺的图。
const FIELD = 1024;
function fieldSprite() {
  const c = canvasOf(FIELD),
    g = c.getContext('2d'),
    r = rng(20261112);
  for (let i = 0; i < 520; i++) {
    const x = r() * FIELD,
      y = r() * FIELD,
      big = r() > 0.94;
    g.fillStyle = rgba(mix(INK, [150, 190, 255], r()), big ? 0.5 : 0.1 + r() * 0.22);
    g.beginPath();
    g.arc(x, y, big ? 1 : 0.4 + r() * 0.5, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}
// 一点点噪点，盖住深色渐变的色带。
function grainSprite() {
  const c = canvasOf(128),
    g = c.getContext('2d'),
    data = g.createImageData(128, 128),
    r = rng(7);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = r() * 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 10;
  }
  g.putImageData(data, 0, 0);
  return c;
}

export function createRenderer(canvas) {
  const g = canvas.getContext('2d'),
    stars = new Map(),
    nebulae = new Map(REGIONS.map((r) => [r.name, nebulaSprite(r)])),
    field = fieldSprite(),
    grain = grainSprite();
  let W = 0,
    H = 0,
    ratio = 1;
  const sprite = (level, region) => {
    const key = level + '|' + region.name;
    if (!stars.has(key)) stars.set(key, starSprite(level, region.hue));
    return stars.get(key);
  };
  function resize() {
    const box = canvas.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(box.width));
    H = Math.max(1, Math.round(box.height));
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
  }
  // 世界坐标 → 屏幕坐标。cam.x/y 是屏幕中心对着的世界坐标，cam.k 是缩放；cam.ox 是给右边的星的页面让出的位置。
  const project = (cam, x, y) => [
    (x - cam.x) * cam.k + W / 2 + (cam.ox || 0),
    (y - cam.y) * cam.k + H / 2 + (cam.oy || 0),
  ];
  const starScale = (cam) => clamp(Math.pow(cam.k, 0.55), 0.62, 1.3);

  // scene: { stars, pos, edges, marks, selected, hover, near(Set), fade(0–1，整张图淡入), grow: { id, t } }
  function draw(scene, cam) {
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(
      W * 0.5,
      H * 0.46,
      0,
      W * 0.5,
      H * 0.46,
      Math.max(W, H) * 0.75,
    );
    glow.addColorStop(0, 'rgba(22,30,44,0.55)');
    glow.addColorStop(1, 'rgba(6,8,11,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    // 背景星：跟着镜头慢慢挪（视差），不随缩放变大
    const fx = (((-cam.x * cam.k * 0.18) % FIELD) + FIELD) % FIELD,
      fy = (((-cam.y * cam.k * 0.18) % FIELD) + FIELD) % FIELD;
    for (let x = fx - FIELD; x < W; x += FIELD)
      for (let y = fy - FIELD; y < H; y += FIELD) g.drawImage(field, x, y);

    // 板块的星云：没有星的很暗，星越多越亮、越大
    g.globalCompositeOperation = 'lighter';
    for (const mark of scene.marks) {
      if (mark.hidden) continue;
      const [x, y] = project(cam, mark.cx, mark.cy),
        size = (NEBULA * 1.05 + mark.spread * 1.9) * cam.k;
      g.globalAlpha = mark.count ? clamp(0.5 + mark.count * 0.05, 0.5, 0.92) : 0.3;
      g.drawImage(nebulae.get(mark.region.name), x - size / 2, y - size / 2, size, size);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    const sel = scene.selected,
      near = scene.near,
      dimmed = (id) => sel && id !== sel && !near.has(id),
      byId = new Map(scene.stars.map((s) => [s.id, s])),
      scale = starScale(cam);

    // 连线
    g.lineCap = 'round';
    for (const e of scene.edges) {
      const a = scene.pos.get(e.from),
        b = scene.pos.get(e.to);
      if (!a || !b) continue;
      const [x1, y1] = project(cam, a.x, a.y),
        [x2, y2] = project(cam, b.x, b.y),
        d = Math.hypot(x2 - x1, y2 - y1);
      if (d < 20) continue;
      const lit = sel && (e.from === sel || e.to === sel),
        alpha = sel ? (lit ? 0.72 : 0.07) : 0.3,
        gap = 9 * scale,
        ux = (x2 - x1) / d,
        uy = (y2 - y1) / d,
        line = g.createLinearGradient(x1, y1, x2, y2);
      line.addColorStop(0, rgba(regionOf(byId.get(e.from).region).hue, alpha));
      line.addColorStop(1, rgba(regionOf(byId.get(e.to).region).hue, alpha));
      g.strokeStyle = line;
      g.lineWidth = lit ? 1.3 : 1;
      // 新长出来的线：从老的那颗星往新的那颗星画过去
      const t = scene.grow && scene.grow.id === e.from ? clamp(scene.grow.t * 1.4, 0, 1) : 1;
      g.beginPath();
      g.moveTo(x2 - ux * gap, y2 - uy * gap);
      g.lineTo(x2 - ux * gap - ux * (d - gap * 2) * t, y2 - uy * gap - uy * (d - gap * 2) * t);
      g.stroke();
    }

    // 星
    for (const s of scene.stars) {
      const p = scene.pos.get(s.id);
      if (!p) continue;
      const [x, y] = project(cam, p.x, p.y);
      if (x < -120 || y < -120 || x > W + 120 || y > H + 120) continue;
      const level = starLevel(s),
        growing = scene.grow && scene.grow.id === s.id ? clamp(scene.grow.t, 0, 1) : 1,
        size = SPRITE * scale * (0.4 + 0.6 * growing);
      g.globalAlpha = (dimmed(s.id) ? 0.32 : 1) * growing;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(sprite(level, regionOf(s.region)), x - size / 2, y - size / 2, size, size);
      g.globalCompositeOperation = 'source-over';
      if (hasWrong(s)) {
        // 有错：另画一圈红
        g.strokeStyle = 'rgba(255,98,84,0.92)';
        g.lineWidth = 1.3;
        g.beginPath();
        g.arc(x, y, (LOOK[level].core * 2 + 7) * scale, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.globalAlpha = 1;

    // 星的名字：镜头拉远时只留亮的
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.lineJoin = 'round';
    // 名字不叠着写：先写选中的和亮的，后写的要是会压到已经写好的名字（或者板块的名字）就不写，放大了再出来
    const taken = scene.marks
      .filter((m) => !m.hidden)
      .map((m) => {
        const [x, y] = project(cam, m.x, m.y);
        return [x - 70, y - 10, 140, 36];
      });
    const free = (x, y, w, h) =>
      taken.every((t) => x + w < t[0] || x > t[0] + t[2] || y + h < t[1] || y > t[1] + t[3]);
    const isFocus = (s) => s.id === sel || s.id === scene.hover || near.has(s.id);
    const ordered = [...scene.stars].sort(
      (a, b) => isFocus(b) - isFocus(a) || starLevel(b) - starLevel(a),
    );
    for (const s of ordered) {
      const p = scene.pos.get(s.id);
      if (!p) continue;
      const level = starLevel(s),
        focus = isFocus(s);
      const [x, y] = project(cam, p.x, p.y),
        look = LOOK[level],
        alpha =
          (dimmed(s.id) ? 0.3 : focus ? 1 : look.label) *
          (scene.grow?.id === s.id ? clamp(scene.grow.t * 2 - 1, 0, 1) : 1);
      g.font = `${focus || level > 2 ? 500 : 400} ${look.size}px ${FONT}`;
      // 名字先试着写在星的下面，放不下就试右边、左边、上面；都放不下就先不写，放大了再出来
      const width = g.measureText(s.title).width,
        off = (look.core * 2 + 8) * scale,
        spots = [
          ['center', x, y + off],
          ['left', x + off + 2, y - look.size / 2 - 1],
          ['right', x - off - 2, y - look.size / 2 - 1],
          ['center', x, y - off - look.size - 2],
        ].map(([align, tx, ty]) => ({
          align,
          tx,
          ty,
          box: [
            align === 'center' ? tx - width / 2 - 3 : align === 'left' ? tx - 3 : tx - width - 3,
            ty - 1,
            width + 6,
            look.size + 4,
          ],
        })),
        spot = spots.find((o) => free(...o.box)) || (focus ? spots[0] : null);
      if (!spot) continue;
      taken.push(spot.box);
      g.textAlign = spot.align;
      g.strokeStyle = `rgba(6,8,11,${0.85 * alpha})`;
      g.lineWidth = 3.5;
      g.strokeText(s.title, spot.tx, spot.ty);
      g.fillStyle = rgba(INK, alpha);
      g.fillText(s.title, spot.tx, spot.ty);
      // 选中一颗星时，连着的星的名字下面写为什么连
      const why =
        sel &&
        near.has(s.id) &&
        scene.edges.find(
          (e) => (e.from === sel && e.to === s.id) || (e.to === sel && e.from === s.id),
        )?.why;
      if (why) {
        const text = why.length > 17 ? why.slice(0, 16) + '…' : why,
          top = spot.ty + look.size + 5;
        g.font = `10.5px ${FONT}`;
        const w2 = g.measureText(text).width;
        taken.push([
          spot.align === 'center'
            ? spot.tx - w2 / 2
            : spot.align === 'left'
              ? spot.tx
              : spot.tx - w2,
          top - 1,
          w2,
          14,
        ]);
        g.strokeText(text, spot.tx, top);
        g.fillStyle = rgba(mix(regionOf(s.region).hue, INK, 0.45), 0.86);
        g.fillText(text, spot.tx, top);
      }
    }
    g.textAlign = 'center';

    // 板块的名字
    for (const mark of scene.marks) {
      if (mark.hidden) continue;
      const [x, y] = project(cam, mark.x, mark.y),
        on = mark.count > 0;
      g.globalAlpha = sel ? 0.45 : 1;
      g.font = `500 12px ${FONT}`;
      if ('letterSpacing' in g) g.letterSpacing = '3px';
      g.fillStyle = rgba(mix(mark.region.hue, INK, 0.25), on ? 0.9 : 0.5);
      g.textBaseline = 'middle';
      g.fillText(mark.region.name, x, y);
      if ('letterSpacing' in g) g.letterSpacing = '1px';
      g.font = `10px ${MONO}`;
      g.fillStyle = rgba(INK, on ? 0.46 : 0.3);
      g.fillText(on ? `${mark.count} 颗` : '还没有星', x, y + 17);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    }
    g.globalAlpha = 1;

    // 选中的星：一圈标记
    if (sel && scene.pos.get(sel)) {
      const p = scene.pos.get(sel),
        [x, y] = project(cam, p.x, p.y),
        radius = 24 * scale;
      g.strokeStyle = rgba(INK, 0.78);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, radius, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        g.beginPath();
        g.moveTo(x + Math.cos(a) * (radius + 3), y + Math.sin(a) * (radius + 3));
        g.lineTo(x + Math.cos(a) * (radius + 9), y + Math.sin(a) * (radius + 9));
        g.stroke();
      }
    }

    // 噪点
    g.globalAlpha = 1;
    g.fillStyle = g.createPattern(grain, 'repeat');
    g.fillRect(0, 0, W, H);
  }

  // 点到了哪颗星（屏幕坐标），没点到返回 null
  function hit(scene, cam, sx, sy) {
    let best = null,
      bestD = 22;
    for (const s of scene.stars) {
      const p = scene.pos.get(s.id);
      if (!p) continue;
      const [x, y] = project(cam, p.x, p.y),
        d = Math.hypot(x - sx, y - sy);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }
  resize();
  return { draw, hit, resize, project, size: () => [W, H] };
}
