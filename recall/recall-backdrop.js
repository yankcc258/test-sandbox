// 复习脊柱的「心跳」和背景层（露娜）。
//   模拟脉搏：基础 64 BPM；有效点击直接定拍，连续点击的间隔决定目标节律，停下后慢慢回落。
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
    intervals: [],
    lastClick: -Infinity,
    tempo: null,
    mode: 'rest',
    kick: 0,
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
    if (h.overloadAt >= 0 || h.locked || !Number.isFinite(now)) return false;
    const interval = now - h.lastClick;
    if (interval < 0.12) return false; // Ignore duplicate events and implausibly short intervals.
    if (interval > 2.2) h.intervals = [];
    else h.intervals.push(interval);
    h.intervals = h.intervals.slice(-5);
    const sorted = [...h.intervals].sort((a, b) => a - b),
      n = sorted.length;
    const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    h.tempo = n ? Math.max(48, Math.min(180, 60 / median)) : null;
    h.lastClick = now;
    h.clicks.push(now);
    // Start just before QRS: each accepted click visibly writes a pulse, without a screen flash.
    h.phase = Math.ceil(h.phase - 0.21) + 0.21;
    h.kick = 1;
    return true;
  };
  h.step = (dt, now) => {
    dt = Math.max(0, dt);
    if (h.locked) {
      h.clicks = [];
      h.intervals = [];
      h.lastClick = -Infinity;
      h.tempo = null;
      h.kick = 0;
    }
    h.clicks = h.clicks.filter((t) => now - t < 3);
    const age = now - h.lastClick,
      coupling = Math.max(0, Math.min(1, 1 - (age - 2.2) / 4));
    h.target = BASE_BPM + ((h.tempo ?? BASE_BPM) - BASE_BPM) * coupling;
    h.mode =
      age < 2.2
        ? h.tempo
          ? 'coupled'
          : 'impulse'
        : Math.abs(h.bpm - BASE_BPM) > 1
          ? 'recover'
          : 'rest';
    // 心率上升快、回落慢
    const rate = h.target > h.bpm ? 46 : 9;
    h.bpm += Math.sign(h.target - h.bpm) * Math.min(Math.abs(h.target - h.bpm), rate * dt);
    if (h.overloadAt < 0 && !h.locked && h.bpm >= OVERLOAD_BPM && h.clicks.length >= 9)
      h.overloadAt = now;
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
          h.intervals = [];
          h.lastClick = -Infinity;
          h.tempo = null;
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
    h.kick *= Math.exp(-dt * 12);
    // 包络：R 波处陡升，随后衰减；第二个小峰对应 T 波
    h.beat = h.flat
      ? 0
      : Math.max(
          h.kick,
          Math.exp(-(((u - 0.26 + 1) % 1) * 7)) * 0.9 + Math.exp(-(((u - 0.5) / 0.08) ** 2)) * 0.15,
        );
    return h.phase - before;
  };
  h.sample = (phase = h.phase) => {
    if (h.flat) return 0;
    if (h.wild) return ecg(phase % 1) * (0.8 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.5;
    return ecg(((phase % 1) + 1) % 1);
  };
  return h;
}

export function createBackdrop(canvas, heart) {
  const ctx = canvas.getContext('2d');
  let W = 1,
    H = 1,
    dpr = 1,
    trace = new Float32Array(1),
    head = 0,
    pixelRemainder = 0;
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
    pixelRemainder += SPEED * dt;
    const n = Math.floor(pixelRemainder),
      p0 = heart.phase - phaseDelta;
    pixelRemainder -= n;
    for (let k = 1; k <= n; k++) {
      head = (head + 1) % trace.length;
      if (heart.flat) trace[head] = 0;
      else {
        trace[head] = heart.sample(p0 + (phaseDelta * k) / n);
      }
    }
  }
  const mono = '"SFMono-Regular",Consolas,"Liberation Mono",monospace';
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
      if (major && W >= 760 && y > 110 && y < H - 120) {
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
    // Specimen information replaces unrelated geographic/debug readouts.
    ctx.font = `500 9.5px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = ink(0.22);
    if (W >= 760) {
      ctx.fillText('SPECIMEN ZH-01 · IN ASSEMBLY', W - 128, H - 150);
      ctx.fillText(live ? 'SIGNAL · LIVE' : 'SIGNAL · STILL', W - 128, H - 135);
    }
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
        trace[k] = heart.sample(save - ((trace.length - k) / SPEED) * (heart.bpm / 60));
      }
      pixelRemainder = 0;
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
