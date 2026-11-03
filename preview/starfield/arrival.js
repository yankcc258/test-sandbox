// 从工作台的纸飞机飞来（露娜，workstation/flight.js）：这一页先接着飞行动画的最后一帧——
// 太空、星星和齐奥尔科夫斯基的那句话——等星空载入后再慢慢淡出。直接打开本页时什么都不做。
(() => {
  let came = null;
  try {
    came = JSON.parse(sessionStorage.getItem('zhixu-flight') || 'null');
    if (!came || Date.now() - came.at > 30000) came = null;
    else sessionStorage.removeItem('zhixu-flight');
  } catch {
    came = null;
  }
  if (!came) return;
  const still =
    came.still ||
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    new URLSearchParams(location.search).get('motion') === '0';
  const style = document.createElement('style');
  style.textContent = `
    .flight-arrive{position:fixed;inset:0;z-index:5000;background:#04060c;color:#e8ebe4;transition:opacity 1s ease;will-change:opacity;font-family:Inter,'PingFang SC','Noto Sans SC',sans-serif}
    .flight-arrive canvas,.flight-arrive img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
    .flight-arrive p{position:absolute;left:50%;top:30%;translate:-50% 0;display:grid;gap:10px;justify-items:center;width:min(90vw,640px);margin:0;text-align:center;font-size:clamp(18px,2.2vw,26px);font-weight:300;letter-spacing:.12em;transition:opacity .9s ease}
    .flight-arrive small{margin-top:6px;font-size:12px;letter-spacing:.14em;color:#9fb0b8}
    @media(max-width:760px){.flight-arrive p{top:24%}}
    .flight-arrive.out{opacity:0}.flight-arrive.out p{opacity:0}`;
  document.head.append(style);
  const el = document.createElement('div');
  el.className = 'flight-arrive';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<canvas></canvas><p><span>地球是人类的摇篮，</span><span>但人不能永远生活在摇篮里。</span><small>— 康斯坦丁 · 齐奥尔科夫斯基</small></p>';
  // Preserve the departing canvas exactly; rebuilding different stars caused a
  // visible cut at navigation. The snapshot contains only this generated scene.
  const picture =
    typeof came.picture === 'string' &&
    came.picture.length < 2000000 &&
    /^data:image\/jpeg;base64,/.test(came.picture)
      ? came.picture
      : null;
  function mount() {
    document.body.append(el);
    if (picture) {
      const image = new Image();
      image.alt = '';
      image.src = picture;
      el.querySelector('canvas').replaceWith(image);
      return;
    }
    const c = el.querySelector('canvas'),
      dpr = Math.min(2, devicePixelRatio || 1);
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    let s = 7 * 9301 + 49297;
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 220; i++) {
      g.globalAlpha = 0.3 + r() * 0.7;
      g.fillStyle = '#eef3ff';
      const z = 0.4 + r() * 1.3;
      g.fillRect(r() * innerWidth, r() * innerHeight, z, z);
    }
  }
  function leave() {
    if (still) return el.remove();
    el.classList.add('out');
    setTimeout(() => el.remove(), 1100);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
  // A navigation load event does not mean that textures are on the GPU yet.
  // Reveal only after the scene has rendered; still retain an escape for a
  // failed script so the static content / return link can always be reached.
  let done = false;
  const watchdog = setTimeout(go, 12000);
  function go() {
    if (done) return;
    done = true;
    clearTimeout(watchdog);
    removeEventListener('zhixu:starfield-ready', go);
    if (document.body) requestAnimationFrame(leave);
    else document.addEventListener('DOMContentLoaded', leave, { once: true });
  }
  addEventListener('zhixu:starfield-ready', go, { once: true });
  if (document.documentElement.dataset.starfieldReady) go();
})();
