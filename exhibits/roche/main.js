// 观景舱：艺术化星云流场；下半页：独立的洛希瓣教学模型。
import {lagrange,planetShape,volumeRadius,periodHours,roche} from './binary.js?v=1';
import {createVista,aim,FOCUS} from './vista.js?v=7';
const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const MU=0.35,RADIUS_A_KM=6400,DENSITY_B=3.4,POINTS=lagrange(MU),SPEEDS=[1,4,16];
const model={fill:0.97};
let shapeA,shapeB,sizeA,sizeB;
function reshape(){
  shapeA=planetShape(MU,'A',model.fill,POINTS);
  shapeB=planetShape(MU,'B',model.fill,POINTS);
  sizeA=volumeRadius(MU,shapeA);sizeB=volumeRadius(MU,shapeB);
}
reshape();
const kilometres=()=>RADIUS_A_KM/sizeA;
const SCOPES={
  vista:{tan:0.68,focus:[0,0]},
  nebula:{tan:0.36,focus:FOCUS.nebula},
  beacon:{tan:0.24,focus:FOCUS.beacon},
};
const view={scope:SCOPES[query.get('scope')]?query.get('scope'):'vista',yaw:0,pitch:0};
view.tan=SCOPES[view.scope].tan;view.focus=[...SCOPES[view.scope].focus];
const canvas=$('view');
let gl=null;
try{gl=canvas.getContext('webgl2',{antialias:false,powerPreference:'high-performance'});}catch{}
let status='loading',vista=null,clock=0,paused=reduced.matches||query.get('motion')==='0',speed=1;
let quality=1,frame=0,last=0,slow=0,fast=0,generation=0;
function resize(){
  const dpr=Math.min(devicePixelRatio||1,2)*quality;
  const w=Math.max(2,Math.round(canvas.clientWidth*dpr)),h=Math.max(2,Math.round(canvas.clientHeight*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
}
function settled(){
  const goal=SCOPES[view.scope];
  return Math.abs(Math.log(view.tan/goal.tan))<2e-3&&view.focus.every((n,i)=>Math.abs(n-goal.focus[i])<2e-3);
}
function advance(seconds){clock+=Math.max(0,Number(seconds)||0)*speed;}
function draw(seconds){
  resize();
  const goal=SCOPES[view.scope],ease=seconds&&!reduced.matches?1-Math.exp(-seconds*2.4):1;
  view.tan*=(goal.tan/view.tan)**ease;
  view.focus=view.focus.map((n,i)=>n+(goal.focus[i]-n)*ease);
  // 固定机位；云层缓慢旋转，细流向左下光源汇入。
  vista.draw({time:clock,tan:view.tan,basis:aim(view.focus[0]+view.yaw,view.focus[1]+view.pitch)});
}
function tick(now){
  frame=0;
  if(document.hidden||status!=='ready')return;
  const seconds=last?Math.min(now-last,100)/1000:0;last=now;
  if(!paused&&seconds){
    advance(seconds);
    if(seconds>0.03){slow++;fast=0;}else if(seconds<0.019){fast++;slow=0;}
    if(slow>10){quality=Math.max(0.5,quality-0.1);slow=0;}
    if(fast>120){quality=Math.min(1,quality+0.05);fast=0;}
  }
  draw(seconds);readout();
  if(!paused||!settled())frame=requestAnimationFrame(tick);else last=0;
}
function invalidate(){
  readout();
  if(status==='ready'&&!frame&&!document.hidden)frame=requestAnimationFrame(tick);
}
window.zhixuRocheProbe=()=>status==='ready'?{
  hdr:vista.hdr,model:'cinematic-nebula',time:clock,fill:model.fill,speed,paused,
  scope:view.scope,tan:view.tan,yaw:view.yaw,pitch:view.pitch,quality,
}:null;
window.zhixuRocheAdvance=seconds=>{
  if(status!=='ready')return null;
  advance(seconds);view.tan=SCOPES[view.scope].tan;view.focus=[...SCOPES[view.scope].focus];
  draw(0);readout();return window.zhixuRocheProbe();
};
function readout(){
  const km=kilometres(),pressed=(node,on)=>node.setAttribute('aria-pressed',String(on));
  $('gap-out').textContent=Math.round(km).toLocaleString('en-US');
  $('period-out').textContent=periodHours(MU,sizeB,DENSITY_B).toFixed(1);
  $('tips-out').textContent=Math.round((shapeB.tip-shapeA.tip)*km).toLocaleString('en-US');
  $('fill2-out').textContent=(model.fill*100).toFixed(0);$('fill2').value=String(model.fill);
  $('elapsed-out').textContent=Math.floor(clock/60).toString().padStart(2,'0')+':'+Math.floor(clock%60).toString().padStart(2,'0');
  $('scope-out').textContent='视场 '+((2*Math.atan(view.tan)*180)/Math.PI).toFixed(0)+'°';
  $('clock-out').textContent=paused?'时间 已暂停':'播放速度 ×'+speed;
  for(const b of document.querySelectorAll('[data-scope]'))if(b.tagName==='BUTTON')pressed(b,b.dataset.scope===view.scope);
  $('opt-speed').textContent='×'+speed;
  $('opt-motion').disabled=$('deck-pause').disabled=status!=='ready';
  $('opt-motion').textContent=paused?'继续':'暂停';$('deck-pause').textContent=paused?'继续观测':'暂停时间';
  pressed($('opt-motion'),paused);pressed($('deck-pause'),paused);
  canvas.dataset.telescope=view.scope;$('deck').dataset.scope=view.scope;
}
function setFill(value){model.fill=clamp(value,0.6,1);reshape();drawLobes();readout();}
function setScope(scope){view.scope=scope;view.yaw=view.pitch=0;invalidate();}
function setBare(on){
  $('deck').classList.toggle('bare',on);$('opt-bare').setAttribute('aria-pressed',String(on));
  $('opt-bare').textContent=on?'显示界面':'隐藏界面';
}
function bindControls(){
  let held=null;
  const turn=(dx,dy)=>{
    view.yaw=clamp(view.yaw-dx*view.tan,-0.24*view.tan,0.24*view.tan);
    view.pitch=clamp(view.pitch+dy*view.tan,-0.14*view.tan,0.14*view.tan);invalidate();
  };
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    held={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove',e=>{
    if(!held||held.id!==e.pointerId)return;
    turn((e.clientX-held.x)*2/canvas.clientWidth,(e.clientY-held.y)*2/canvas.clientWidth);
    held.x=e.clientX;held.y=e.clientY;
  });
  const release=e=>{if(!held||held.id!==e.pointerId)return;held=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);canvas.classList.remove('dragging');};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,release);
  canvas.addEventListener('keydown',e=>{
    const action={ArrowLeft:()=>turn(0.08,0),ArrowRight:()=>turn(-0.08,0),ArrowUp:()=>turn(0,0.06),ArrowDown:()=>turn(0,-0.06),Home:()=>setScope('vista')}[e.key];
    if(action){e.preventDefault();action();}
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){setBare(false);return;}
    if(e.key.toLowerCase()!=='h'||e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;
    setBare(!$('deck').classList.contains('bare'));
  });
  $('fill2').oninput=e=>setFill(Number(e.target.value));
  for(const b of document.querySelectorAll('.deck-toolbar [data-scope]'))b.onclick=()=>setScope(b.dataset.scope);
  $('opt-speed').onclick=()=>{speed=SPEEDS[(SPEEDS.indexOf(speed)+1)%SPEEDS.length];invalidate();};
  $('opt-motion').onclick=()=>{paused=!paused;if(paused)quality=1;last=0;invalidate();};
  $('deck-pause').onclick=()=>$('opt-motion').click();
  $('deck-data').onclick=()=>{
    const open=$('deck').classList.toggle('data-open');$('deck-data').setAttribute('aria-expanded',String(open));
    $('deck-data').textContent=open?'收起仪表 −':'观测仪表 ＋';
  };
  $('opt-bare').onclick=()=>setBare(!$('deck').classList.contains('bare'));
  reduced.addEventListener('change',()=>{if(reduced.matches){paused=true;last=0;invalidate();}});
}

function drawLobes() {
  const node = $('lobes'),
    dpr = Math.min(devicePixelRatio || 1, 2),
    w = node.clientWidth,
    h = node.clientHeight;
  if (!w || !h) return;
  node.width = Math.round(w * dpr);
  node.height = Math.round(h * dpr);
  const c = node.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const span = 3.7, // 横向能看到多少个间距
    k = Math.min(w / span, h / 2.5),
    X = (u) => w / 2 + (u - 0.12) * k,
    Y = (s) => h / 2 - s * k,
    cell = 4,
    cols = Math.ceil(w / cell) + 1,
    rows = Math.ceil(h / cell) + 1,
    field = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      field[j * cols + i] = roche((i * cell - w / 2) / k + 0.12, (h / 2 - j * cell) / k, 0, MU);
  // 两颗行星：各自等势面以内的部分
  for (const [shape, color] of [
    [shapeA, '#b9683a'],
    [shapeB, '#3f86b5'],
  ]) {
    c.fillStyle = color;
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        const u = (i * cell - w / 2) / k + 0.12,
          s = (h / 2 - j * cell) / k;
        if (
          field[j * cols + i] > shape.level &&
          Math.hypot(u - shape.center, s) < shape.reach * 1.02
        )
          c.fillRect(i * cell - cell / 2, j * cell - cell / 2, cell, cell);
      }
  }
  // 等值线：逐格看四个角，线性插值出线段
  const contour = (level, style, width, dash = [], within = Infinity) => {
    c.beginPath();
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        if (Math.hypot((i * cell - w / 2) / k + 0.12, (h / 2 - j * cell) / k) > within) continue;
        const a = field[j * cols + i] - level,
          b = field[j * cols + i + 1] - level,
          d = field[(j + 1) * cols + i] - level,
          e = field[(j + 1) * cols + i + 1] - level,
          cuts = [];
        if (a * b < 0) cuts.push([i + a / (a - b), j]);
        if (b * e < 0) cuts.push([i + 1, j + b / (b - e)]);
        if (d * e < 0) cuts.push([i + d / (d - e), j + 1]);
        if (a * d < 0) cuts.push([i, j + a / (a - d)]);
        for (let n = 0; n + 1 < cuts.length; n += 2) {
          c.moveTo(cuts[n][0] * cell, cuts[n][1] * cell);
          c.lineTo(cuts[n + 1][0] * cell, cuts[n + 1][1] * cell);
        }
      }
    c.strokeStyle = style;
    c.lineWidth = width;
    c.setLineDash(dash);
    c.stroke();
    c.setLineDash([]);
  };
  for (const level of [1.45, 1.56, 2.3, 2.9]) contour(level, '#cfd6dc22', 1);
  contour(POINTS.C3, '#cfd6dc66', 1);
  contour(POINTS.C2, '#cfd6dc66', 1);
  contour(POINTS.C1, '#ffe2a8', 1.6, [2, 4], 1.3);
  c.font = '11px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
  c.fillStyle = '#ffe2a8';
  for (const [name, u, s] of [
    ['L₁', POINTS.L1, 0],
    ['L₂', POINTS.L2, 0],
    ['L₃', POINTS.L3, 0],
    ['L₄', ...POINTS.L4],
    ['L₅', ...POINTS.L5],
  ]) {
    c.fillRect(X(u) - 1.5, Y(s) - 1.5, 3, 3);
    c.fillText(name, X(u) + 5, Y(s) - 5);
  }
  c.fillStyle = '#ece8de';
  c.fillText('烛阴', X(shapeA.center) - 12, Y(0) + 4);
  c.fillText('望舒', X(shapeB.center) - 12, Y(0) + 4);
  c.fillStyle = '#929da7';
  c.fillText('跟着两颗行星一起转的视角 · 从轨道面正上方看', 10, h - 10);
  node.dataset.fill = model.fill.toFixed(3);
  $('lobes-result').textContent =
    model.fill >= 0.995
      ? '两颗行星的尖端在 L₁ 碰在一起：它们各自充满了自己的洛希瓣。再近一点，就不再是两颗分开的行星了。'
      : model.fill >= 0.88
        ? '尖端快要碰到 L₁。那里的东西几乎不受任何一方约束，稍微一动就会越过去落向对方。'
        : model.fill >= 0.72
          ? '两颗行星已经明显被拉成泪滴形，但都还稳稳地待在自己的地盘里。'
          : '离得还远：两颗行星只是略微被拉长，各自的地盘绰绰有余。';
}

// ---------- 启动 / 上下文丢失 / 降级 ----------
const FALLBACK = '下面「两颗行星各自的地盘」的示意图仍然可以使用。';
function fallback(message, next = 'unavailable') {
  generation++;
  status = next;
  cancelAnimationFrame(frame);
  frame = 0;
  last = 0;
  $('fallback').hidden = false;
  $('loading').hidden = true;
  $('fallback').textContent = message;
  document.documentElement.dataset.ready = 'fallback';
  readout();
}
async function restore() {
  const token=++generation;
  status='loading';
  $('loading').hidden=false;
  $('fallback').hidden=true;
  document.documentElement.dataset.ready='loading';
  // Let the loading state paint even on browsers without parallel shader compilation.
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  try {
    const renderer = await createVista(gl);
    if(token!==generation)return;
    vista=renderer;
    status = 'ready';
    $('loading').hidden = true;
    $('fallback').hidden = true;
    document.documentElement.dataset.ready = 'true';
    invalidate();
  } catch (error) {
    if(token!==generation)return;
    console.warn('Roche nebula:', error);
    fallback('三维画面暂时无法启动。' + FALLBACK);
  }
}
function start() {
  bindControls();
  readout();
  drawLobes();
  new ResizeObserver(() => { drawLobes(); invalidate(); }).observe(document.body);
  if (!gl) {
    fallback('这台设备画不了三维画面（需要 WebGL2）。' + FALLBACK);
    return;
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    fallback('三维画面暂时中断，正在等待恢复。' + FALLBACK, 'lost');
  });
  canvas.addEventListener('webglcontextrestored', restore);
  document.addEventListener('visibilitychange', () => {
    last = 0;
    if (!document.hidden) invalidate();
  });
  restore();
}
try {
  start();
} catch (error) {
  console.warn('Roche binary:', error);
  fallback('三维画面暂时无法启动。' + FALLBACK);
}
