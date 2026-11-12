// 理解星图样稿（正式站设计 docs/study-stars-design.md 的 S4）：板块、星的亮度、连线。
// 这里的规则照设计稿写，画面和正式站的数据对得上：星是 /api/stars 给的样子，
// 亮度按「刚开 / 聊过 / 讲过 / 讲清楚了 / 稳了」算，有错另画一圈红。

// 板块：名单和正式站 src/stars-server.js 的 STAR_REGIONS 一致。颜色和位置是这边定的。
// at 是板块在星空里的位置（世界坐标，星图的力导向把星拉向自己的板块）。
export const REGIONS = [
  { name: '数学 · 微积分', hue: [118, 190, 255], at: [-560, -240] },
  { name: '数学 · 线性代数', hue: [146, 150, 255], at: [-800, 170] },
  { name: '数学 · 其他', hue: [104, 214, 204], at: [-360, 300] },
  { name: '经典物理', hue: [255, 194, 108], at: [40, -340] },
  { name: '无机化学', hue: [150, 222, 140], at: [640, -220] },
  { name: '有机化学', hue: [255, 150, 138], at: [760, 230] },
  { name: '物理化学', hue: [204, 152, 255], at: [210, 210] },
  { name: '其他', hue: [172, 180, 188], at: [-60, 560] },
];
export const regionOf = (name) => REGIONS.find((r) => r.name === name) || REGIONS.at(-1);

// 亮度从暗到亮的五档；数组下标就是亮度等级。
export const STATES = [
  { id: 'new', name: '刚开', note: '只有起点' },
  { id: 'talked', name: '聊过', note: '挂了讲解，还没讲给她听' },
  { id: 'told', name: '讲过', note: '最近一次 1–3 分' },
  { id: 'clear', name: '讲清楚了', note: '最近一次 4–5 分' },
  { id: 'steady', name: '稳了', note: '讲清楚了，问答卡也复习稳了' },
];
// 设计稿「星的亮度」那张表。star.takes 是这颗星的理解记录（按时间），explains 是挂着的讲解。
export function starLevel(star) {
  const last = star.takes?.at(-1);
  if (!last) return star.explains?.length ? 1 : 0;
  if (last.score <= 3) return 2;
  return star.cardsStable ? 4 : 3;
}
export const starState = (star) => STATES[starLevel(star)];
export const hasWrong = (star) => (star.wrong || 0) > 0;

// 连线只存在一头（新长出来的那颗指回去），画的时候两头都画。指向不存在的星的连线丢掉。
export function edgesOf(stars) {
  const ids = new Set(stars.map((s) => s.id));
  return stars.flatMap((s) =>
    (s.links || [])
      .filter((l) => ids.has(l.to) && l.to !== s.id)
      .map((l) => ({ from: s.id, to: l.to, why: l.why, by: l.by })),
  );
}
export function neighborsOf(id, edges) {
  return edges
    .filter((e) => e.from === id || e.to === id)
    .map((e) => ({ id: e.from === id ? e.to : e.from, why: e.why, by: e.by }));
}

// 确定的伪随机：同一份数据每次画出来都一样。
export function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
