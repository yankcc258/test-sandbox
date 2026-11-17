// 星怎么排开：力导向，但只算到停下来为止，不是一直在动的模拟（Yank：星图平时不要一直动）。
// 每颗星被拉向自己的板块，连着的星互相拉近，所有星互相推开。
// 结果是确定的：同样的星、同样的旧位置，排出来一样。旧位置会保留（prev），新长的星从它连着的那颗旁边出发。
import { edgesOf, hash, regionOf, rng } from './model.js?v=1';

const LINK_LENGTH = 132, // 同一板块里连着的两颗星大概隔多远
  CROSS_LENGTH = 250, // 跨板块的连线长一些、松一些，板块才分得开
  MIN_GAP = 118, // 两颗星至少隔这么远，名字才不叠
  TALL = 2.1; // 名字写在星的下面、是横着的一条：上下可以挨近些，左右要隔开些（算距离时把上下的差放大）

export function layoutStars(stars, prev = new Map(), steps = 420) {
  const edges = edgesOf(stars),
    byId = new Map(stars.map((s) => [s.id, s])),
    pos = new Map();
  for (const s of stars) {
    const had = prev.get(s.id);
    if (had) {
      // 已经在图上的星钉住（free 0）：长出新的星时，原来的星不乱跑。只有新的星挤得太近时才让一点（give）
      pos.set(s.id, { x: had.x, y: had.y, vx: 0, vy: 0, free: 0, give: 0.08 });
      continue;
    }
    // 新的星：从它指回去的那颗旁边出发；没有连线就从板块中心附近出发。
    const r = rng(hash(s.id)),
      angle = r() * Math.PI * 2,
      parent = (s.links || []).map((l) => pos.get(l.to) || prev.get(l.to)).find(Boolean),
      [ax, ay] = regionOf(s.region).at,
      from = parent || { x: ax, y: ay },
      d = parent ? 40 : 30 + r() * 90;
    pos.set(s.id, {
      x: from.x + Math.cos(angle) * d,
      y: from.y + Math.sin(angle) * d,
      vx: 0,
      vy: 0,
      free: 1,
      give: 1,
    });
  }
  const list = stars.map((s) => ({ s, p: pos.get(s.id), anchor: regionOf(s.region).at }));
  for (let step = 0; step < steps; step++) {
    const heat = 1 - step / steps;
    // 拉向板块
    for (const { p, anchor } of list) {
      p.vx += (anchor[0] - p.x) * 0.012;
      p.vy += (anchor[1] - p.y) * 0.012;
    }
    // 连线
    for (const e of edges) {
      const a = pos.get(e.from),
        b = pos.get(e.to),
        cross = byId.get(e.from).region !== byId.get(e.to).region,
        dx = b.x - a.x,
        dy = b.y - a.y,
        d = Math.hypot(dx, dy) || 1,
        f = ((d - (cross ? CROSS_LENGTH : LINK_LENGTH)) / d) * (cross ? 0.012 : 0.05);
      a.vx += dx * f;
      a.vy += dy * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
    }
    // 互相推开
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].p,
          b = list[j].p;
        let dx = b.x - a.x,
          dy = b.y - a.y,
          d = Math.hypot(dx, dy);
        if (d < 0.01) {
          dx = 0.5 - ((i * 7 + j) % 10) / 10;
          dy = 0.5 - ((i + j * 3) % 10) / 10;
          d = Math.hypot(dx, dy) || 1;
        }
        if (d > 420) continue;
        const f = 5200 / (d * d) / d;
        a.vx -= dx * f;
        a.vy -= dy * f;
        b.vx += dx * f;
        b.vy += dy * f;
      }
    for (const { p } of list) {
      const speed = Math.hypot(p.vx, p.vy),
        cap = 4 + 26 * heat,
        k = speed > cap ? cap / speed : 1;
      p.x += p.vx * k * p.free;
      p.y += p.vy * k * p.free;
      p.vx *= 0.62;
      p.vy *= 0.62;
    }
  }
  // 最后把挨得太近的星硬分开，保证名字不叠在一起
  for (let round = 0; round < 80; round++) {
    let moved = false;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].p,
          b = list[j].p,
          dx = b.x - a.x || 0.01 * (i - j),
          dy = (b.y - a.y) * TALL,
          d = Math.hypot(dx, dy);
        if (d >= MIN_GAP) continue;
        const push = (MIN_GAP - d) / d,
          share = a.give / (a.give + b.give); // 新的星让得多，老的星让得少
        a.x -= dx * push * share;
        a.y -= (dy * push * share) / TALL;
        b.x += dx * push * (1 - share);
        b.y += (dy * push * (1 - share)) / TALL;
        moved = true;
      }
    if (!moved) break;
  }
  return new Map([...pos].map(([id, p]) => [id, { x: p.x, y: p.y }]));
}

// 板块的名字放哪：有星就放在这片星的上方，没有星就放在板块中心。
export function regionMarks(regions, stars, pos) {
  return regions.map((region) => {
    const mine = stars.filter((s) => s.region === region.name).map((s) => pos.get(s.id));
    if (!mine.length)
      return {
        region,
        count: 0,
        x: region.at[0],
        y: region.at[1],
        cx: region.at[0],
        cy: region.at[1],
        spread: 0,
      };
    const cx = mine.reduce((n, p) => n + p.x, 0) / mine.length,
      cy = mine.reduce((n, p) => n + p.y, 0) / mine.length,
      top = Math.min(...mine.map((p) => p.y)),
      spread = Math.max(...mine.map((p) => Math.hypot(p.x - cx, p.y - cy)));
    return { region, count: mine.length, x: cx, y: top - 58, cx, cy, spread };
  });
}
