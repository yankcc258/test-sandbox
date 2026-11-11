import { atlasGeometry, ATLAS_MU, ATLAS_L1, potentialHeight } from './gravity-geometry.js?v=1';

for (const section of document.querySelectorAll('[data-atlas]')) initAtlas(section);

function initAtlas(section) {
  const canvas = section.querySelector('canvas'), ctx = canvas.getContext('2d');
  const toggle = section.querySelector('[data-atlas-play]'), reset = section.querySelector('[data-atlas-reset]');
  if (!ctx) { section.dataset.failed = 'true'; toggle.disabled = reset.disabled = true; return; }
  const kind = section.dataset.atlas, blackhole = kind === 'schwarzschild';
  const geometry = atlasGeometry(kind), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const seed = blackhole ? 713 : 319;
  let rng = seed;
  const random = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
  const stars = Array.from({ length: 190 }, () => [random(), random(), random(), random()]);
  const home = { yaw: blackhole ? -.28 : -.24, pitch: .67 };
  let yaw = home.yaw, pitch = home.pitch, clock = 0, last = 0, frame = 0;
  let visible = false, paused = reduced.matches || new URLSearchParams(location.search).get('motion') === '0';
  let w = 0, h = 0, drag = null, renders = 0;

  function readout() {
    toggle.textContent = paused ? '开始巡航' : '暂停巡航';
    toggle.setAttribute('aria-pressed', String(!paused));
    canvas.dataset.yaw = yaw.toFixed(3); canvas.dataset.pitch = pitch.toFixed(3);
    canvas.dataset.time = clock.toFixed(3); canvas.dataset.playing = String(!paused);
  }
  function wake() { if (!frame && !document.hidden) frame = requestAnimationFrame(tick); }
  function halt() { if (frame) cancelAnimationFrame(frame); frame = 0; last = 0; }
  function tick(now) {
    frame = 0;
    if (document.hidden) return;
    if (visible && !paused && last && now - last < 32) { frame = requestAnimationFrame(tick); return; }
    if (visible && !paused) {
      const dt = last ? Math.min((now - last) / 1000, .05) : 0;
      clock += dt; yaw += dt * .026;
    }
    last = now; draw(); readout();
    if (visible && !paused) frame = requestAnimationFrame(tick); else last = 0;
  }
  function resize() {
    w = canvas.clientWidth; h = canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); wake();
  }
  function draw() {
    if (!w || !h) return;
    const narrow = w < 700, cx = w * (narrow ? .5 : .67), cy = h * (narrow ? .59 : .48);
    const scale = Math.min(w * (narrow ? .071 : .056), h * .108);
    const cs = Math.cos(yaw), sn = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const project = ([x, y, z]) => {
      const xx = x * cs - z * sn, zz = x * sn + z * cs;
      const depth = zz * cp + y * sp, ratio = 24 / (24 + depth);
      return [cx + xx * scale * ratio, cy + (zz * sp - y * cp) * scale * ratio, depth];
    };
    ctx.fillStyle = '#050a10'; ctx.fillRect(0, 0, w, h);
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * .5);
    halo.addColorStop(0, blackhole ? '#402c1e44' : '#123b514f'); halo.addColorStop(1, '#050a1000');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);
    for (const [sx, sy, size, tint] of stars) {
      const px = (sx * w + Math.sin(yaw) * size * 12 + w) % w;
      ctx.fillStyle = `rgba(${tint > .7 ? '222,193,151' : '157,191,212'},${.1 + size * .3})`;
      ctx.fillRect(px, sy * h, size > .98 ? 1.7 : .7, size > .98 ? 1.7 : .7);
    }
    const points = geometry.vertices.map(project);
    const sorted = geometry.faces.map(f => ({ ...f, depth: f.ids.reduce((s, i) => s + points[i][2], 0) / 4 })).sort((a, b) => b.depth - a.depth);
    const sweep = (.18 + clock * .035) % 1;
    for (const face of sorted) {
      ctx.beginPath(); face.ids.forEach((id, i) => { const p = points[id]; if(i) ctx.lineTo(p[0],p[1]); else ctx.moveTo(p[0],p[1]); }); ctx.closePath();
      ctx.fillStyle = blackhole ? '#0b1014' : '#09131a'; ctx.fill();
      const bright = Math.exp(-(((face.stripe - sweep) / .048) ** 2));
      const near = Math.max(.2, Math.min(1, .7 - face.depth * .045));
      ctx.strokeStyle = `rgba(${blackhole ? '208,168,108' : '109,191,222'},${near * (.17 + bright * .45)})`;
      ctx.lineWidth = .62 + bright * .3; ctx.stroke();
    }
    // Overlay reference markers; neither the scan nor these markers are particle paths.
    if (blackhole) {
      ctx.beginPath();
      for(let i=0;i<=100;i++){const a=i/100*Math.PI*2,p=project([Math.cos(a),-3.5,Math.sin(a)]);if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);}
      ctx.strokeStyle='#e6b377a0';ctx.lineWidth=1.1;ctx.stroke();
      const p=project([0,-3.5,0]); annotation(p,'r = rₛ','#e6c08e',false);
    } else {
      for (const [x, label, color] of [[-ATLAS_MU,'A','#d7ba88'],[1-ATLAS_MU,'B','#9ccfed']]) {
        annotation(project([x*3.8,-4.8,0]),label,color,false);
      }
      annotation(project([ATLAS_L1*3.8,potentialHeight(ATLAS_L1,0),0]),'L₁ / 鞍点','#d4e6ed',true);
    }
    const fade = ctx.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, '#050a10ef'); fade.addColorStop(narrow ? .12 : .24, '#050a1077'); fade.addColorStop(.5, '#050a1000');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, w, h);
    canvas.dataset.renders = String(++renders); section.dataset.ready = 'true';

    function annotation(p, text, color, raised) {
      const top = p[1] - (raised ? 48 : 28);
      ctx.strokeStyle=color+'66';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[0],top);ctx.lineTo(p[0]+22,top);ctx.stroke();
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(p[0],p[1],2,0,Math.PI*2);ctx.fill();
      ctx.font='10px Consolas, monospace';ctx.fillText(text,p[0]+27,top+3);
    }
  }
  toggle.onclick = () => { paused = !paused; last = 0; readout(); wake(); };
  reset.onclick = () => { yaw = home.yaw; pitch = home.pitch; clock = 0; last = 0; wake(); };
  canvas.addEventListener('pointerdown', e => { if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging'); });
  canvas.addEventListener('pointermove', e => {
    if(!drag||drag.id!==e.pointerId)return;
    yaw += (e.clientX-drag.x)*.006; pitch=Math.max(.24,Math.min(1.2,pitch+(e.clientY-drag.y)*.004));
    drag.x=e.clientX;drag.y=e.clientY;paused=true;readout();wake();
  });
  const release=()=>{drag=null;canvas.classList.remove('dragging');};
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home',' '].includes(e.key))return;
    e.preventDefault();
    if(e.key===' ') {toggle.click();return;} if(e.key==='Home'){reset.click();return;}
    paused=true;yaw+=e.key==='ArrowLeft'?-.1:e.key==='ArrowRight'?.1:0;
    pitch=Math.max(.24,Math.min(1.2,pitch+(e.key==='ArrowUp'?.06:e.key==='ArrowDown'?-.06:0)));readout();wake();
  });
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)wake();else halt();},{threshold:.02}).observe(canvas);
  new ResizeObserver(resize).observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)halt();else if(visible)wake();});
  reduced.addEventListener('change',()=>{if(reduced.matches){paused=true;readout();wake();}});
  readout();resize();
}
