// Original schematic plates for a fictional organism, not medical diagrams.
// Functional review names remain primary; these are its biological descriptions.
export const SYSTEMS = {
  today: {
    name: '心脏',
    tissue: '循环维持',
    en: 'HEART',
    state: '维持中',
    description: '让今日的记忆重新进入循环。每一次回想，都为这具生命体补充一次供给。',
  },
  vocab: {
    name: '大脑',
    tissue: '记忆皮层',
    en: 'BRAIN',
    state: '编码中',
    description: '为新的词义留下痕迹。反复唤醒，让陌生的信号逐渐成为稳定的记忆。',
  },
  notes: {
    name: '神经丛',
    tissue: '关联路径',
    en: 'NEURAL PLEXUS',
    state: '连接中',
    description: '把孤立的知识接入同一条路径。连接越清晰，下一次回想就越容易抵达。',
  },
  mistakes: {
    name: '修复组织',
    tissue: '断点再连接',
    en: 'REPAIR TISSUE',
    state: '修复中',
    description: '重新暴露失效的连接，找到断点，再让信号通过。错误留下的是修复的位置。',
  },
  quiz: {
    name: '感知系统',
    tissue: '反应校验',
    en: 'SENSORY SYSTEM',
    state: '校验中',
    description: '输入新的刺激，观察独立的回应。让已经形成的连接接受一次完整检验。',
  },
  log: {
    name: '细胞谱系',
    tissue: '生长档案',
    en: 'CELL LINEAGE',
    state: '记录中',
    description: '保存每一次巩固留下的变化。从最初的痕迹，到逐渐稳定的记忆结构。',
  },
  settings: {
    name: '内分泌',
    tissue: '稳态调节',
    en: 'ENDOCRINE',
    state: '调节中',
    description: '调节负荷、间隔与恢复。让这具生命体按适合你的节律持续生长。',
  },
};

const plates = {
  today: [
    'M-13-59 C-48-91-89-55-73-13 C-67 19-30 62 1 87 C29 63 66 30 67-8 C68-45 35-72 12-48 L5-82 L-13-82 Z',
    'M-49-44 C-34-31-29-11-25 14 C-21 38-10 64 1 87 M13-48 C-2-25-5-9 3 17 C10 41 22 52 36 59 M-43-27 L-13-15 L-8 10 M20-26 L43-16 L56 9 M-25 14 L-45 14 M3 17 L28 27 M-2-68 L-3-89 M19-53 L32-73 L44-71',
  ],
  vocab: [
    'M-3-73 C-17-94-43-91-53-75 C-77-77-92-58-88-38 C-107-20-101 8-86 21 C-91 45-69 64-48 59 C-35 79-12 73-3 58 Z M3-73 C17-94 43-91 53-75 C77-77 92-58 88-38 C107-20 101 8 86 21 C91 45 69 64 48 59 C35 79 12 73 3 58 Z',
    'M-3-58 C-30-74-46-53-31-38 C-14-20-47-18-49-2 C-51 14-27 6-22 25 C-16 42-33 53-48 59 M-53-75 C-40-55-70-55-66-34 C-59-16-80-12-86 2 M-88-38 C-69-37-58-25-62-9 M-86 21 C-71 12-54 27-63 44 M-27-69 L-30-83 M-49-2 C-61 1-63 12-56 20 M3-56 C29-73 48-55 31-36 C14-18 49-17 48 0 C48 17 24 7 22 27 C21 43 34 52 48 59 M53-75 C40-55 70-55 67-34 C61-18 81-11 86 2 M88-38 C69-37 57-23 62-9 M86 21 C71 12 54 27 63 44 M29-68 L30-83 M48 0 C61 3 65 14 56 22 M-12 70 L-11 91 L9 91 L13 70',
  ],
  notes: [
    'M-26-8 C-32-31-8-45 9-29 C29-34 42-13 27 5 C33 27 12 39-5 25 C-24 32-41 12-26-8 Z',
    'M-19-25 L-44-49 L-51-80 M-44-49 L-72-48 L-88-70 M-72-48 L-91-26 M12-30 L31-63 L29-88 M31-63 L57-74 L78-71 M31-63 L51-43 M29-3 L62-12 L83-40 M62-12 L92 5 M-30 5 L-61 19 L-88 11 M-61 19 L-75 47 M-3 26 C-9 51 21 62 5 87 M-4 44 L-28 61 L-41 88 M11 67 L41 78 L67 71 M-2-8 C-15-20-25-1-13 11 C-2 21 13 8 7-2 Z',
  ],
  mistakes: [
    'M-85-66 L-29-70 L-13-43 L-25-16 L-8 7 L-20 32 L-9 71 L-83 66 Z M85-66 L29-70 L13-43 L25-16 L8 7 L20 32 L9 71 L83 66 Z',
    'M-70-47 L-38-46 M-68-22 L-42-21 M-69 6 L-34 7 M-68 33 L-39 34 M-67 53 L-30 55 M70-47 L38-46 M68-22 L42-21 M69 6 L34 7 M68 33 L39 34 M67 53 L30 55 M-30-45 L31-22 M30-45 L-31-22 M-29-2 L27 21 M29-2 L-27 21 M-26 39 L24 61 M26 39 L-24 61',
  ],
  quiz: [
    'M-104 0 C-56-63 48-69 104 0 C53 64-54 64-104 0 Z',
    'M-104 0 C-59-39 48-47 104 0 M-104 0 C-59 42 48 47 104 0 M0-39 A39 39 0 1 1-.1-39 M0-21 A21 21 0 1 1-.1-21 M-27-28 L-15-15 M27-28 L15-15 M-27 28 L-15 15 M27 28 L15 15 M0-53 L0-75 M-12-75 L12-75 M0 53 L0 75 M-12 75 L12 75',
  ],
  log: [
    'M0-72 m-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0-32 0 M-45-10 m-19 0 a19 19 0 1 0 38 0 a19 19 0 1 0-38 0 M45-10 m-19 0 a19 19 0 1 0 38 0 a19 19 0 1 0-38 0 M-76 64 m-14 0 a14 14 0 1 0 28 0 a14 14 0 1 0-28 0 M-24 64 m-14 0 a14 14 0 1 0 28 0 a14 14 0 1 0-28 0 M24 64 m-14 0 a14 14 0 1 0 28 0 a14 14 0 1 0-28 0 M76 64 m-14 0 a14 14 0 1 0 28 0 a14 14 0 1 0-28 0',
    'M0-56 L0-43 L-45-29 M0-43 L45-29 M-45 9 L-45 30 L-76 50 M-45 30 L-24 50 M45 9 L45 30 L24 50 M45 30 L76 50 M-7-72 L7-72 M-45-17 L-45-3 M38-10 L52-10 M-79 64 L-73 64 M-27 64 L-21 64 M21 64 L27 64 M73 64 L79 64',
  ],
  settings: [
    'M-10-13 C-18-47-51-71-70-44 C-93-12-67 44-31 53 C-11 51-14 25-7 14 L7 14 C14 25 11 51 31 53 C67 44 93-12 70-44 C51-71 18-47 10-13 Z',
    'M-5-76 L-5-17 M5-76 L5-17 M-12-68 L12-68 M-12-55 L12-55 M-12-42 L12-42 M-12-29 L12-29 M-48-34 C-75-3-44 26-31 33 M48-34 C75-3 44 26 31 33 M-32-12 L-49 3 L-29 18 M32-12 L49 3 L29 18 M-7 14 L-7 82 M7 14 L7 82 M-14 64 L14 64 M-14 77 L14 77',
  ],
};
const cache = new Map();
export function drawSpecimen(ctx, id, x, y, scale = 1) {
  if (!cache.has(id))
    cache.set(
      id,
      plates[id].map((path) => new Path2D(path)),
    );
  const [outline, detail] = cache.get(id);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = 'rgba(215,230,224,0.18)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 7]);
  ctx.beginPath();
  ctx.moveTo(-122, 0);
  ctx.lineTo(122, 0);
  ctx.moveTo(0, -108);
  ctx.lineTo(0, 108);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(197,211,204,0.055)';
  ctx.fill(outline);
  ctx.save();
  ctx.clip(outline);
  ctx.strokeStyle = 'rgba(215,230,224,0.09)';
  ctx.beginPath();
  for (let a = -220; a < 220; a += 10) {
    ctx.moveTo(a, -110);
    ctx.lineTo(a + 110, 110);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(220,234,230,0.58)';
  ctx.lineWidth = 1.8;
  ctx.stroke(outline);
  ctx.strokeStyle = 'rgba(220,234,230,0.36)';
  ctx.lineWidth = 1.4;
  ctx.stroke(detail);
  ctx.strokeStyle = 'rgba(220,234,230,0.22)';
  ctx.beginPath();
  ctx.moveTo(108, -85);
  ctx.lineTo(126, -85);
  ctx.lineTo(126, 85);
  ctx.lineTo(108, 85);
  ctx.stroke();
  ctx.fillStyle = '#9cc2b9';
  ctx.fillRect(123, -3, 6, 6);
  ctx.restore();
}
