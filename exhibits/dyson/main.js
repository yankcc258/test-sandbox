import { ObservatoryRenderer } from './scene.js?v=1';
import { energyBudget } from './energy.js?v=1';

const $ = (s) => document.querySelector(s);
const stage=$('#observatory'),canvas=$('#scene'),plate=$('#plate'),status=$('#status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const query=new URLSearchParams(location.search);
let paused=reduced.matches||query.get('motion')==='0',ready=false,renderer=null,visible=true,lost=false;
let time=0,raf=0,last=0,frames=0,view='wide';
let camera={x:.5,y:.5,zoom:1},target={...camera};
let dragging=null;
const presets={wide:{x:.5,y:.5,zoom:1},star:{x:.33,y:.58,zoom:1.32},shell:{x:.69,y:.44,zoom:1.38}};

function announce(text){status.textContent=text;}
function updatePause(){
  $('#pause').textContent=paused?'▶ 播放':'Ⅱ 暂停';
  $('#pause').setAttribute('aria-label',paused?'播放动态影像':'暂停动态影像');
  $('#pause').setAttribute('aria-pressed',String(paused));
}
function active(){return ready&&renderer&&!lost&&visible&&!document.hidden;}
function unsettled(){return Object.keys(camera).some(k=>Math.abs(camera[k]-target[k])>.00001);}
function frame(now){
  raf=0;
  if(!active()){last=0;return;}
  const dt=last?Math.min((now-last)/1000,.08):0;last=now;
  if(!paused)time+=dt;
  const easing=reduced.matches?1:1-Math.exp(-dt*4.5);
  for(const k of Object.keys(camera)){
    camera[k]+=(target[k]-camera[k])*easing;
    if(Math.abs(target[k]-camera[k])<.00001)camera[k]=target[k];
  }
  renderer.draw(time,camera);frames++;
  if(!paused||unsettled())raf=requestAnimationFrame(frame);else last=0;
}
function invalidate(){if(active()&&!raf)raf=requestAnimationFrame(frame);}
function suspend(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;}
function setPaused(value){paused=value;updatePause();suspend();invalidate();}
function setView(name){
  view=name;target={...presets[name]};
  if(reduced.matches)camera={...target};
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
  if(name!=='wide')stage.classList.add('entered');
  invalidate();
}
function setClean(clean){
  stage.classList.toggle('clean',clean);$('#restore').hidden=!clean;
  if(clean)$('#restore').focus({preventScroll:true});else $('#hide').focus({preventScroll:true});
}
function fallback(message){
  ready=false;suspend();renderer?.dispose();renderer=null;
  stage.dataset.renderer='static';stage.dataset.ready='true';
  $('#pause').disabled=true;document.querySelectorAll('[data-view]').forEach(b=>b.disabled=true);
  announce(message);
}
function initRenderer(){
  try{
    renderer=new ObservatoryRenderer(canvas,plate);renderer.resize();ready=true;lost=false;
    stage.dataset.renderer='webgl';stage.dataset.ready='true';
    $('#pause').disabled=false;document.querySelectorAll('[data-view]').forEach(b=>b.disabled=false);
    announce('');invalidate();
  }catch(error){console.info('Dyson static fallback:',error.message);fallback('当前设备显示静帧；下方工程报告与能量估算仍可使用。');}
}
plate.addEventListener('error',()=>fallback('影像未能载入，请刷新页面重试。下方工程报告仍可阅读。'));
if(plate.complete&&plate.naturalWidth)initRenderer();else plate.addEventListener('load',initRenderer,{once:true});
canvas.addEventListener('webglcontextlost',event=>{
  event.preventDefault();lost=true;suspend();stage.dataset.renderer='static';
  announce('画面暂时切换为静帧，正在等待图形环境恢复…');
});
canvas.addEventListener('webglcontextrestored',()=>{renderer=null;initRenderer();});
new ResizeObserver(()=>{renderer?.resize();invalidate();}).observe($('#viewport'));
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)invalidate();else suspend();},{threshold:0}).observe(stage);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else invalidate();});
window.addEventListener('pagehide',suspend);
window.addEventListener('pageshow',invalidate);
reduced.addEventListener('change',event=>{if(event.matches){setPaused(true);camera={...target};invalidate();}});
$('#pause').addEventListener('click',()=>setPaused(!paused));
$('#enter').addEventListener('click',()=>{stage.classList.add('entered');canvas.focus({preventScroll:true});});
$('#hide').addEventListener('click',()=>setClean(true));$('#restore').addEventListener('click',()=>setClean(false));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
if(!document.fullscreenEnabled)$('#fullscreen').hidden=true;
$('#fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}
  catch{announce('浏览器暂未允许全屏；可使用纯净画面继续观测。');}
});
document.addEventListener('fullscreenchange',()=>{$('#fullscreen').textContent=document.fullscreenElement?'退出全屏':'全屏';renderer?.resize();invalidate();});
function move(dx,dy){
  target.zoom=Math.max(1.1,target.zoom);target.x=Math.max(.1,Math.min(.9,target.x+dx));target.y=Math.max(.1,Math.min(.9,target.y+dy));
  if(reduced.matches)camera={...target};invalidate();
}
canvas.addEventListener('pointerdown',event=>{
  if(!ready||event.button!==0)return;
  dragging={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>{
  if(!dragging||event.pointerId!==dragging.id)return;
  move((dragging.x-event.clientX)/canvas.clientWidth*.55,(dragging.y-event.clientY)/canvas.clientHeight*.45);
  dragging.x=event.clientX;dragging.y=event.clientY;
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{dragging=null;});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&stage.classList.contains('clean')){setClean(false);return;}
  if(event.ctrlKey||event.metaKey||event.altKey||!visible||['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(event.target.tagName))return;
  if(event.key.toLowerCase()==='h'){setClean(!stage.classList.contains('clean'));return;}
  if(event.target!==canvas)return;
  if(event.key===' '){event.preventDefault();if(ready)setPaused(!paused);}
  const direction={ArrowLeft:[-.025,0],ArrowRight:[.025,0],ArrowUp:[0,-.025],ArrowDown:[0,.025]}[event.key];
  if(direction){event.preventDefault();move(...direction);}
  if(event.key==='Home'){event.preventDefault();setView('wide');}
});
updatePause();

function updateEnergy(){
  const radius=Number($('#radius').value),coverage=Number($('#coverage').value)/100;
  const data=energyBudget(radius,coverage);
  $('#radius-value').textContent=radius.toFixed(2)+' AU';$('#coverage-value').textContent=Math.round(coverage*100)+'%';
  $('#flux').textContent=Math.round(data.flux).toLocaleString('en-US')+' W/m²';
  $('#power').textContent=(data.power/1e26).toFixed(3)+' × 10²⁶ W';
  $('#area').textContent=(data.area/1e23).toFixed(3)+' × 10²³ m²';
  $('#temperature').textContent=Math.round(data.temperature)+' K';
  $('#energy-shell').style.setProperty('--diameter',(140+100*Math.sqrt(radius))+'px');
  $('#energy-shell').style.setProperty('--coverage',(coverage*100)+'%');
}
$('#radius').addEventListener('input',updateEnergy);$('#coverage').addEventListener('input',updateEnergy);updateEnergy();
// Read-only probe for regression checks; no test-only clock or scene controls.
window.dysonObservation=()=>({time,paused,view,camera:{...camera},target:{...target},frames,visible,ready,lost,renderer:stage.dataset.renderer,pixels:canvas.width*canvas.height,pending:!!raf});
