// Actual GPU frames and user interactions, through the same local-file route as Roche.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {localPreview} from './roche-browser-utils.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_PATH||'playwright');
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:8080';
const out=process.env.DYSON_OUTPUT||'outputs/dyson';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||undefined});
const results=[];
async function open(options={},setup){
 const ctx=await browser.newContext(options);await localPreview(ctx,origin);if(setup)await setup(ctx);
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(origin+'/exhibits/dyson/',{waitUntil:'commit'});
 await page.waitForFunction(()=>document.querySelector('#observatory').dataset.ready==='true');
 return {ctx,page,errors};
}
const state=p=>p.evaluate(()=>window.dysonObservation());
const settled=p=>p.waitForFunction(()=>{let s=window.dysonObservation();return Object.keys(s.camera).every(k=>s.camera[k]===s.target[k]);});
try{
 for(const [name,width,height,touch] of [['desktop',1600,1000,false],['ipad-landscape',1194,834,true],['ipad-portrait',834,1194,true]]){
  const {ctx,page:p,errors}=await open({viewport:{width,height},isMobile:touch,hasTouch:touch,deviceScaleFactor:touch?2:1});
  const click=s=>touch?p.tap(s):p.click(s);
  await p.waitForTimeout(1400);
  assert.equal((await state(p)).renderer,'webgl');
  await p.screenshot({path:path.join(out,name+'.png')});
  for(const s of ['.station','.deck','.scene-title']){const b=await p.locator(s).boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1,`${name} ${s} visible`);}
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok((await state(p)).pixels<=2504000,'bounded drawing area');
  await click('#enter');await click('#pause');await p.waitForTimeout(900);
  const paused=await state(p);assert.ok(paused.paused);
  const frame1=await p.locator('#scene').screenshot();
  await p.waitForTimeout(220);assert.equal((await state(p)).time,paused.time);
  assert.ok(frame1.equals(await p.locator('#scene').screenshot()),'paused GPU pixels are stable');
  await click('#pause');await p.waitForTimeout(1800);await click('#pause');
  const moving=await state(p);assert.ok(moving.time>paused.time+1);
  assert.ok(!frame1.equals(await p.locator('#scene').screenshot()),'animation changes the actual picture');
  await click('[data-view="star"]');await settled(p);assert.equal((await state(p)).view,'star');assert.equal((await state(p)).time,moving.time);
  await p.screenshot({path:path.join(out,name+'-star.png')});
  await click('[data-view="shell"]');await settled(p);await p.screenshot({path:path.join(out,name+'-shell.png')});
  await click('[data-view="wide"]');await settled(p);
  await click('#hide');assert.ok(await p.locator('#restore').isVisible());await click('#restore');
  await p.locator('#scene').focus();await p.keyboard.press('ArrowRight');await settled(p);assert.ok((await state(p)).camera.x>.5);
  await p.keyboard.press('Home');await settled(p);assert.equal((await state(p)).camera.zoom,1);
  if(!touch){await p.keyboard.press('h');assert.ok(await p.locator('#restore').isVisible());await p.keyboard.press('Escape');assert.ok(await p.locator('#restore').isHidden());}
  await click('#pause');
  await p.locator('#energy').scrollIntoViewIfNeeded();await p.waitForTimeout(700);
  const off=await state(p);await p.waitForTimeout(180);assert.equal((await state(p)).time,off.time);assert.equal((await state(p)).frames,off.frames);
  await p.locator('#radius').press('End');assert.equal(await p.locator('#radius-value').textContent(),'2.00 AU');assert.equal(await p.locator('#flux').textContent(),'340 W/m²');
  await p.locator('#coverage').press('Home');assert.equal(await p.locator('#power').textContent(),'0.766 × 10²⁶ W');
  await p.screenshot({path:path.join(out,name+'-energy.png')});
  await p.evaluate(()=>{scrollTo({top:0,behavior:'instant'});});await p.waitForTimeout(350);
  assert.ok((await state(p)).time>off.time,'resume on return to the observatory');
  await click('#pause');assert.equal(await p.evaluate(()=>document.querySelector('#scene').getContext('webgl2').getError()),0);
  if(name==='desktop'){
   const pixelsBeforeLoss=(await state(p)).pixels;
   await p.evaluate(()=>{window.lossExtension=document.querySelector('#scene').getContext('webgl2').getExtension('WEBGL_lose_context');window.lossExtension.loseContext();});
   await p.waitForFunction(()=>window.dysonObservation().lost);
   assert.equal((await state(p)).renderer,'static');
   await p.evaluate(()=>{window.lossExtension.restoreContext();});
   await p.waitForFunction(()=>!window.dysonObservation().lost&&window.dysonObservation().renderer==='webgl');
   assert.equal((await state(p)).pixels,pixelsBeforeLoss,'restored canvas keeps the full viewport resolution');
   await click('#hide');await p.locator('#restore').evaluate(e=>e.blur());await p.waitForTimeout(1000);
   await p.locator('#scene').screenshot({path:path.join(out,'dyson-still.png')});
   // Thumbnail is a captured browser frame, not relabeled concept art.
   await p.locator('#scene').screenshot({path:path.join(out,'dyson.jpg'),type:'jpeg',quality:88});
   await p.keyboard.press('Escape');await click('#pause');
   const video=await p.evaluate(async()=>{
    const stream=document.querySelector('#scene').captureStream(30);
    const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000}),chunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
    await new Promise(r=>setTimeout(r,9000));recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
    const data=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(binary);
   });
   await writeFile(path.join(out,'dyson-motion.webm'),Buffer.from(video,'base64'));
  }
  assert.deepEqual(errors,[]);results.push({name,state:await state(p),errors});await ctx.close();
  console.log(`PASS: ${name} / actual pixel motion / freeze / camera / controls / energy / offscreen / GL`);
 }
 for(const mode of ['reduced','fallback']){
  const {ctx,page:p,errors}=await open({viewport:{width:1194,height:834},reducedMotion:'reduce'},mode==='fallback'?async ctx=>ctx.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};}):null);
  await p.waitForTimeout(300);
  if(mode==='reduced'){assert.ok((await state(p)).paused);assert.equal((await state(p)).time,0);assert.equal((await state(p)).pending,false);await p.click('[data-view="shell"]');await settled(p);assert.equal((await state(p)).time,0);}
  else{assert.equal((await state(p)).renderer,'static');assert.ok(await p.locator('#pause').isDisabled());assert.ok(await p.locator('#plate').isVisible());await p.locator('#radius').press('Home');assert.equal(await p.locator('#flux').textContent(),'136,117 W/m²');}
  assert.deepEqual(errors,[]);results.push({mode,state:await state(p)});await ctx.close();console.log('PASS: '+mode);
 }
 await writeFile(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));
}finally{await browser.close();}
