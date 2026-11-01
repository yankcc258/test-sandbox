// 把可读的 HTML 仪器屏贴回场景中的四个角，再展开到阅读位置。
// 同一进度可正放、反放、取消；不截图、不创建第二个 WebGL 场景。
export const clamp = (x) => Math.max(0, Math.min(1, x));
export const smooth = (x) => {
  const k = clamp(x);
  return k * k * (3 - 2 * k);
};
export const segment = (p, a, b) => smooth((p - a) / (b - a));

export function terminalRect(w, h) {
  const narrow = w <= 760;
  const width = Math.min(1000, w - (narrow ? 24 : 120));
  const height = narrow ? h - 32 : Math.min(670, h - 120);
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}

// 单位矩形到四边形的透视变换；列主序可直接用于 CSS matrix3d。
export function quadMatrix(q, width, height) {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(den) > 1e-8 ? (dx3 * dy2 - dx2 * dy3) / den : 0;
  const h = Math.abs(den) > 1e-8 ? (dx1 * dy3 - dx3 * dy1) / den : 0;
  return [
    (p1.x - p0.x + g * p1.x) / width,
    (p1.y - p0.y + g * p1.y) / width,
    0,
    g / width,
    (p3.x - p0.x + h * p3.x) / height,
    (p3.y - p0.y + h * p3.y) / height,
    0,
    h / height,
    0,
    0,
    1,
    0,
    p0.x,
    p0.y,
    0,
    1,
  ];
}

export function terminalFrame(source, rect, progress) {
  const k = segment(progress, 0.08, 1);
  const target = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  const corners = source.map((p, i) => ({
    x: p.x + (target[i].x - p.x) * k,
    y: p.y + (target[i].y - p.y) * k,
  }));
  return {
    matrix: quadMatrix(corners, rect.width, rect.height),
    opacity: segment(progress, 0, 0.2),
    ink: segment(progress, 0.18, 0.62),
    body: segment(progress, 0.42, 0.86),
    calm: smooth(progress),
  };
}
