// 右上角的胶囊导航（借鉴同人站的交互思路，代码和音乐全部自写）：
//   左 ARCHIVE：回到螺旋最上面；中间一条波：背景音乐开关（播放时随音量起伏，暂停时是直线）；
//   右 ABOUT：打开关于页，打开后变成 CLOSE ✕。胶囊下面一个小框切换曲目。
// 音乐不是音频文件，而是用 Web Audio 实时合成的氛围长音（和弦 + 慢速滤波 + 回声），没有版权问题。
// 只操作自己的元素；需要页面配合的动作（回到顶部、离开内容页）通过 hooks 传进来。

// 曲目：每首是一组和弦（频率，Hz）和音色参数。和弦每 10～14 秒缓慢换一次。
const TRACKS = [
  {
    name: '01. FIRST LIGHT',
    chords: [
      [130.81, 196.0, 246.94, 329.63], // C maj7（去三音的开放排列）
      [110.0, 164.81, 246.94, 293.66], // Am9
      [87.31, 174.61, 220.0, 329.63], // Fmaj7
      [98.0, 146.83, 246.94, 293.66], // G6
    ],
    cutoff: 900,
    hold: 12,
  },
  {
    name: '02. DEEP RECALL',
    chords: [
      [73.42, 110.0, 174.61, 220.0], // Dm
      [65.41, 98.0, 155.56, 233.08], // Cm 色彩
      [58.27, 116.54, 174.61, 233.08], // B♭
      [69.3, 103.83, 164.81, 207.65], // C♯ 悬挂
    ],
    cutoff: 620,
    hold: 14,
  },
  {
    name: '03. ABOVE THE SKY',
    chords: [
      [164.81, 246.94, 329.63, 415.3], // E 开放
      [146.83, 220.0, 293.66, 369.99], // D
      [123.47, 185.0, 277.18, 369.99], // B 悬挂
      [138.59, 207.65, 277.18, 415.3], // C♯m
    ],
    cutoff: 1300,
    hold: 10,
  },
];

function createSynth() {
  let ctx = null,
    master,
    filter,
    analyser,
    voices = [],
    timer = 0,
    track = 0,
    step = 0,
    playing = false;
  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    // 回声：两条交叉的延迟线
    const dl = ctx.createDelay(2),
      dr = ctx.createDelay(2),
      fb = ctx.createGain(),
      wet = ctx.createGain();
    dl.delayTime.value = 0.43;
    dr.delayTime.value = 0.61;
    fb.gain.value = 0.38;
    wet.gain.value = 0.32;
    filter.connect(master);
    filter.connect(dl);
    dl.connect(dr);
    dr.connect(fb);
    fb.connect(dl);
    dr.connect(wet);
    dl.connect(wet);
    wet.connect(master);
    // 滤波器的截止频率缓慢呼吸
    const lfo = ctx.createOscillator(),
      lfoGain = ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    master.connect(analyser);
    analyser.connect(ctx.destination);
  }
  // 一个和弦：每个音两只略微失谐的振荡器，淡入淡出
  function chord(freqs, at, len) {
    const out = [];
    freqs.forEach((f, k) => {
      [-4, 4].forEach((cents) => {
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.type = k === 0 ? 'sine' : 'triangle';
        o.frequency.value = f;
        o.detune.value = cents;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.05 / (1 + k * 0.3), at + 3.5);
        g.gain.setValueAtTime(0.05 / (1 + k * 0.3), at + len - 3);
        g.gain.linearRampToValueAtTime(0, at + len + 1.5);
        o.connect(g).connect(filter);
        o.start(at);
        o.stop(at + len + 2);
        out.push(o);
      });
    });
    return out;
  }
  function schedule() {
    const t = TRACKS[track],
      at = ctx.currentTime + 0.05;
    filter.frequency.setTargetAtTime(t.cutoff, at, 1.5);
    voices = voices.concat(chord(t.chords[step % t.chords.length], at, t.hold));
    step++;
    timer = setTimeout(schedule, (t.hold - 2) * 1000);
  }
  function stopVoices(fade = 1.2) {
    clearTimeout(timer);
    const now = ctx.currentTime;
    voices.forEach((o) => {
      try {
        o.stop(now + fade);
      } catch {}
    });
    voices = [];
  }
  return {
    get playing() {
      return playing;
    },
    get track() {
      return TRACKS[track].name;
    },
    play() {
      if (!ctx) init();
      ctx.resume();
      playing = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.55, ctx.currentTime, 0.8);
      step = 0;
      schedule();
    },
    pause() {
      if (!ctx) return;
      playing = false;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      stopVoices(1.6);
    },
    next(d) {
      track = (track + d + TRACKS.length) % TRACKS.length;
      if (playing) {
        stopVoices(2.5);
        step = 0;
        schedule();
      }
    },
    // 当前音量 0～1（用来驱动波形）
    level() {
      if (!analyser || !playing) return 0;
      const buf = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / buf.length) * 9);
    },
  };
}

export function createDock({ onArchive, motion, onOpen, onClose }) {
  const dock = document.getElementById('dock'),
    wave = document.getElementById('dock-wave'),
    path = wave.querySelector('path'),
    about = document.getElementById('about'),
    aboutBtn = document.getElementById('dock-about'),
    trackEl = document.getElementById('dock-track'),
    synth = createSynth();
  let amp = 0,
    phase = 0,
    raf = 0,
    last = 0,
    open = false;
  // 波形：中间一条线。amp = 0 时是直线
  function drawWave() {
    const W = 64,
      H = 22,
      pts = [];
    for (let k = 0; k <= 32; k++) {
      const x = (k / 32) * W,
        env = Math.sin((Math.PI * k) / 32),
        y =
          H / 2 +
          amp * env * (Math.sin(k * 0.55 + phase) * 6 + Math.sin(k * 1.3 - phase * 1.7) * 2.2);
      pts.push(`${x.toFixed(1)},${y.toFixed(2)}`);
    }
    path.setAttribute('d', `M${pts.join(' L')}`);
  }
  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    const goal = synth.playing ? 0.35 + 0.65 * synth.level() : 0;
    amp += (goal - amp) * (1 - Math.exp(-dt * 6));
    if (motion()) phase += dt * 3.2;
    drawWave();
    globe(now / 1000);
    if (synth.playing || amp > 0.01 || open) raf = requestAnimationFrame(tick);
    else {
      amp = 0;
      last = 0;
      drawWave();
    }
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  function setTrackLabel() {
    trackEl.querySelector('span').textContent = synth.track;
  }
  wave.onclick = () => {
    synth.playing ? synth.pause() : synth.play();
    wave.setAttribute('aria-pressed', String(synth.playing));
    wave.setAttribute('aria-label', synth.playing ? '暂停背景音乐' : '播放背景音乐');
    dock.classList.toggle('playing', synth.playing);
    if (!motion() && synth.playing) amp = 0.6;
    kick();
  };
  document.getElementById('dock-prev').onclick = () => {
    synth.next(-1);
    setTrackLabel();
  };
  document.getElementById('dock-next').onclick = () => {
    synth.next(1);
    setTrackLabel();
  };
  document.getElementById('dock-archive').onclick = () => {
    if (open) setOpen(false);
    onArchive();
  };
  aboutBtn.onclick = () => setOpen(!open);

  // 关于页的经纬线球：经线的横半径随角度变化，看起来在缓慢自转
  const meridians = [...about.querySelectorAll('.meridian')];
  function globe(t) {
    if (!open) return;
    const a = motion() ? t * 0.12 : 0.4;
    meridians.forEach((m, k) => {
      const th = a + (k / meridians.length) * Math.PI;
      m.setAttribute('rx', (Math.abs(Math.cos(th)) * 300).toFixed(1));
      m.style.opacity = (0.25 + 0.75 * Math.abs(Math.sin(th))).toFixed(2);
    });
  }
  function setOpen(v) {
    open = v;
    about.hidden = !v;
    requestAnimationFrame(() => about.classList.toggle('on', v));
    dock.classList.toggle('about-open', v);
    aboutBtn.innerHTML = v ? 'CLOSE <i>✕</i>' : 'ABOUT';
    aboutBtn.setAttribute('aria-expanded', String(v));
    (v ? onOpen : onClose)?.();
    globe(performance.now() / 1000);
    kick();
  }
  addEventListener(
    'keydown',
    (e) => {
      if (open && e.key === 'Escape') {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    },
    true,
  );
  about.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  setTrackLabel();
  drawWave();
  return {
    get open() {
      return open;
    },
    setOpen,
  };
}
