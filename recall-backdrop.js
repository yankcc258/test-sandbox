// 复习脊柱的「心跳」和背景层（露娜）。
//   心跳：基础 64 BPM；三秒内点击越多，目标心率越高，停下来慢慢回落。超过阈值触发「记忆过载」彩蛋。
//   心电图：医院监护仪式的扫描写入——一根光标从左往右写波形，前方留一小段空隙擦掉旧波形。
//   背景：极淡的网格、四角取景框、右侧随深度滚动的标尺、几块小型数据读数，全部画在一张 2D 画布上，
//         垫在 WebGL 画布后面。保持冷清、极简：线条细、透明度低。
// 不依赖 Three.js，只读写自己的画布。

const BASE_BPM = 64,
  OVERLOAD_BPM = 152;

// 一个心动周期里的心电图波形（u ∈ [0,1)）：P 波、QRS 波群、T 波
export function ecg(u) {
  const g = (c, w, a) => a * Math.exp(-(((u - c) / w) ** 2));
  return (
    g(0.12, 0.035, 0.12) + // P
    g(0.235, 0.009, -0.16) + // Q
    g(0.255, 0.012, 1.0) + // R
    g(0.28, 0.012, -0.28) + // S
    g(0.48, 0.06, 0.22) // T
  );
}

export function createHeart() {
  const h = {
    bpm: BASE_BPM,
    target: BASE_BPM,
    phase: 0,
    beat: 0, // 心跳包络 0～1，用来让屏幕、光点、扫描环跟着跳
    clicks: [],
    overloadAt: -1, // 过载开始的时间（秒），-1 表示没有过载
    stage: '',
    burst: 0,
    glitch: false,
    flat: false,
    wild: false,
  };
  // locked：进入内容后为 true。答题时的点击不计入心率，也不会触发过载，心率慢慢回落
  h.locked = false;
  h.click = (now) => {
    if (h.overloadAt >= 0 || h.locked) return;
    h.clicks.push(now);
  };
  h.step = (dt, now) => {
    h.clicks = h.locked ? [] : h.clicks.filter((t) => now - t < 3);
    h.target = Math.min(196, BASE_BPM + h.clicks.length * 12);
    // 心率上升快、回落慢
    const rate = h.target > h.bpm ? 46 : 9;
    h.bpm += Math.sign(h.target - h.bpm) * Math.min(Math.abs(h.target - h.bpm), rate * dt);
    if (h.overloadAt < 0 && !h.locked && h.bpm >= OVERLOAD_BPM) h.overloadAt = now;
    // 过载的时间线
    h.glitch = h.flat = h.wild = false;
    h.stage = '';
    if (h.overloadAt >= 0) {
      const t = now - h.overloadAt;
      if (t < 1.8) {
        h.stage = 'overload';
        h.burst = 1 - (1 - t / 1.8) ** 3;
        h.glitch = h.wild = true;
      } else if (t < 2.8) {
        h.stage = 'lost';
        h.burst = 1;
        h.flat = true;
      } else if (t < 4.2) {
        h.stage = 'recal';
        h.burst = (1 - (t - 2.8) / 1.4) ** 2;
        if (h.bpm > BASE_BPM + 1) {
          h.clicks = [];
          h.bpm = BASE_BPM;
        }
      } else {
        h.overloadAt = -1;
        h.burst = 0;
      }
    }
    const before = h.phase;
    if (!h.flat) h.phase += (dt * h.bpm) / 60;
    const u = h.phase % 1;
    // 包络：R 波处陡升，随后衰减；第二个小峰对应 T 波
    h.beat = h.flat
      ? 0
      : Math.exp(-(((u - 0.26 + 1) % 1) * 7)) * 0.9 + Math.exp(-(((u - 0.5) / 0.08) ** 2)) * 0.15;
    return h.phase - before;
  };
  h.sample = () => {
    if (h.flat) return 0;
    if (h.wild) return ecg(h.phase % 1) * (0.8 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.5;
    return ecg(h.phase % 1);
  };
  return h;
}

export function createBackdrop(canvas, heart) {
  const ctx = canvas.getContext('2d');
  let W = 1,
    H = 1,
    dpr = 1,
    trace = new Float32Array(1),
    head = 0;
  const SPEED = 190; // 心电图光标每秒前进的像素
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const old = trace;
    trace = new Float32Array(Math.ceil(W));
    trace.set(old.subarray(0, Math.min(old.length, trace.length)));
    head = Math.min(head, trace.length - 1);
  }
  // 每帧写入新的心电图采样（按前进的像素数插值）
  function write(dt, phaseDelta) {
    const n = Math.max(1, Math.round(SPEED * dt)),
      p0 = heart.phase - phaseDelta;
    for (let k = 1; k <= n; k++) {
      head = (head + 1) % trace.length;
      if (heart.flat) trace[head] = 0;
      else {
        const saved = heart.phase;
        heart.phase = p0 + (phaseDelta * k) / n;
        trace[head] = heart.sample();
        heart.phase = saved;
      }
    }
  }
  const mono = '"SFMono-Regular",Consolas,"Liberation Mono",monospace';
  const hex = (n) => Math.floor(n).toString(16).toUpperCase().padStart(4, '0');
  function draw(t, depth, live) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const ink = (a) => `rgba(220,234,230,${a})`;
    // 网格
    ctx.strokeStyle = ink(0.035);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (W / 2) % 80; x < W; x += 80) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, H);
    }
    for (let y = (H / 2) % 80; y < H; y += 80) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
    }
    ctx.stroke();
    // 中轴的细线（对着脊柱）
    ctx.strokeStyle = ink(0.06);
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(W * 0.5 + 0.5, 0);
    ctx.lineTo(W * 0.5 + 0.5, H);
    ctx.stroke();
    ctx.setLineDash([]);
    // 四角取景框
    ctx.strokeStyle = ink(0.28);
    const m = 26,
      l = 18;
    [
      [m, m, 1, 1],
      [W - m, m, -1, 1],
      [m, H - m, 1, -1],
      [W - m, H - m, -1, -1],
    ].forEach(([x, y, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * l);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * l, y);
      ctx.stroke();
    });
    // 右侧深度标尺：随滚动移动
    const rx = W - 92,
      pxPerUnit = 46,
      off = (depth * pxPerUnit) % (pxPerUnit / 2);
    ctx.font = `500 9px ${mono}`;
    ctx.textAlign = 'right';
    for (let y = -off; y < H; y += pxPerUnit / 2) {
      const k = Math.round((y + depth * pxPerUnit) / (pxPerUnit / 2)),
        major = k % 4 === 0;
      ctx.strokeStyle = ink(major ? 0.22 : 0.1);
      ctx.beginPath();
      ctx.moveTo(rx, Math.round(y) + 0.5);
      ctx.lineTo(rx + (major ? 14 : 6), Math.round(y) + 0.5);
      ctx.stroke();
      if (major && y > 110 && y < H - 120) {
        ctx.fillStyle = ink(0.28);
        ctx.fillText(`−${(k / 2 - H / pxPerUnit).toFixed(2).replace('-', '')}`, rx - 6, y + 3);
      }
    }
    // 心电图带
    const cy = H * 0.5,
      amp = Math.min(70, H * 0.075);
    ctx.strokeStyle = ink(0.06);
    ctx.beginPath();
    ctx.moveTo(0, cy + 0.5);
    ctx.lineTo(W, cy + 0.5);
    ctx.stroke();
    const gap = 36,
      n = trace.length;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    // 从光标往回画，越旧越淡；光标前方 gap 像素留空（擦除区）
    const segs = 6;
    for (let sgi = 0; sgi < segs; sgi++) {
      ctx.strokeStyle = `rgba(165,228,214,${0.55 * (1 - sgi / segs) ** 1.4})`;
      ctx.beginPath();
      const from = Math.floor((sgi / segs) * (n - gap)),
        to = Math.floor(((sgi + 1) / segs) * (n - gap)) + 1;
      for (let k = from; k <= to && k < n - gap; k++) {
        const x = (head - k + n) % n,
          y = cy - trace[x] * amp;
        if (k === from || x === n - 1) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 光标头
    const hy = cy - trace[head] * amp;
    ctx.fillStyle = heart.overloadAt >= 0 ? 'rgba(255,214,150,0.95)' : 'rgba(220,255,240,0.95)';
    ctx.beginPath();
    ctx.arc(head, hy, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
    // 数据读数：左上品牌下方、右下计数上方
    ctx.textAlign = 'left';
    ctx.font = `500 9.5px ${mono}`;
    ctx.fillStyle = ink(0.32);
    const lines = [
      `SYS · RECALL OS / NODE 7`,
      `PULSE  ${String(Math.round(heart.bpm)).padStart(3, '0')} BPM`,
      `CYCLE  ${String(Math.floor(heart.phase)).padStart(5, '0')}`,
      `DEPTH  −${depth.toFixed(2)} U`,
      `TRACE  ${hex(t * 37)} ${hex(t * 11 + 4096)} ${hex(heart.phase * 977)}`,
    ];
    lines.forEach((s, k) => ctx.fillText(s, 54, 196 + k * 15));
    ctx.textAlign = 'right';
    ctx.fillStyle = ink(0.22);
    ctx.fillText(`LAT 35.6812 N · LON 139.7671 E`, W - 128, H - 150);
    ctx.fillText(live ? 'SIGNAL · LIVE' : 'SIGNAL · STILL', W - 128, H - 135);
  }
  resize();
  return {
    resize,
    frame(dt, phaseDelta, t, depth, live) {
      if (live) write(dt, phaseDelta);
      draw(t, depth, live);
    },
    // 关闭动效时：预先写满一屏平静的心电图
    prefill() {
      const save = heart.phase;
      for (let k = 0; k < trace.length; k++) {
        heart.phase = save - ((trace.length - k) / SPEED) * (heart.bpm / 60);
        trace[k] = heart.sample();
      }
      heart.phase = save;
      head = trace.length - 1 - 80;
    },
    traceTail: (count) => {
      const out = [];
      for (let k = count - 1; k >= 0; k--)
        out.push(trace[(head - k * 2 + trace.length * 4) % trace.length]);
      return out;
    },
  };
}
