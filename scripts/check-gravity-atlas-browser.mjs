import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { localPreview } from './roche-browser-utils.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_PATH||'playwright');
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:8772',shots=process.env.SHOTS;
if(shots)await mkdir(shots,{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||undefined});
try{
 for(const [tag,viewport] of [['desktop',{width:1440,height:1080}],['ipad-wide',{width:1194,height:834}],['ipad-tall',{width:834,height:1194}]]){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:tag!=='desktop',reducedMotion:'reduce'});
  await localPreview(context,origin);
  for(const kind of ['schwarzschild','roche']){
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.goto(`${origin}/exhibits/${kind}/?motion=0`,{waitUntil:'commit'});
   const atlas=page.locator('.gravity-atlas'),canvas=atlas.locator('canvas');
   await page.waitForFunction(()=>document.querySelector('.gravity-atlas')?.dataset.ready==='true',null,{timeout:120000});
   await atlas.scrollIntoViewIfNeeded();
   assert.equal(await canvas.getAttribute('data-playing'),'false','reduced motion starts still');
   if(shots)await atlas.screenshot({path:`${shots}/${kind}-${tag}-atlas.png`});
   const yaw=await canvas.getAttribute('data-yaw');await canvas.focus();await page.keyboard.press('ArrowRight');
   await page.waitForFunction(old=>document.querySelector('.gravity-atlas canvas').dataset.yaw!==old,yaw);
   await page.keyboard.press('ArrowUp');
   await atlas.locator('[data-atlas-reset]').click();
   await page.waitForFunction(old=>document.querySelector('.gravity-atlas canvas').dataset.yaw===old,yaw);
   await atlas.locator('[data-atlas-play]').click();
   await page.waitForFunction(()=>Number(document.querySelector('.gravity-atlas canvas').dataset.time)>.1);
   await canvas.focus();await page.keyboard.press(' ');
   await page.waitForTimeout(100);const held=await canvas.getAttribute('data-time');
   await page.waitForTimeout(150);assert.equal(await canvas.getAttribute('data-time'),held,'pause freezes time');
   await atlas.locator('[data-atlas-play]').click();
   await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(150);
   const count=await canvas.getAttribute('data-renders');await page.waitForTimeout(200);
   assert.equal(await canvas.getAttribute('data-renders'),count,'no offscreen redraws');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page overflow');
   assert.deepEqual(errors,[],kind);
   console.log(`PASS: ${kind} ${tag}: mesh render, keyboard/reset/play/pause, reduced motion, offscreen sleep, layout.`);
   await page.close();
  }
  await context.close();
 }
 const ctx=await browser.newContext({viewport:{width:1000,height:800}});await localPreview(ctx,origin);
 await ctx.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:get.call(this,kind,...args);};});
 const p=await ctx.newPage();await p.goto(origin+'/exhibits/schwarzschild/?motion=0');
 await p.waitForFunction(()=>document.querySelector('.gravity-atlas')?.dataset.ready==='true');
 await p.locator('.gravity-atlas').scrollIntoViewIfNeeded();assert.ok(await p.locator('.gravity-atlas canvas').isVisible());
 console.log('PASS: report atlas still works without WebGL2.');await ctx.close();
}finally{await browser.close();}
