import assert from 'node:assert/strict';
import {energyBudget,SOLAR_LUMINOSITY,SIGMA} from '../exhibits/dyson/energy.js';
import {surfaceDepth,projectedPoint,makeSurface,cameraRail,IMAGE_ASPECT,MAX_SHIFT} from '../exhibits/dyson/depth.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<=Math.max(1,Math.abs(b))*1e-12,`${a} ≈ ${b}`);
const one=energyBudget(1,.8),two=energyBudget(2,.8),half=energyBudget(1,.4);
near(one.power,one.flux*one.area);
near(one.temperature**4*SIGMA*one.area,one.power);
near(two.flux,one.flux/4);near(two.area,one.area*4);near(two.temperature,one.temperature/Math.sqrt(2));
near(two.power,one.power);near(half.temperature,one.temperature);near(half.area,one.area/2);near(half.power,one.power/2);
near(energyBudget(1,1).power,SOLAR_LUMINOSITY);
assert.ok(one.flux>1360&&one.flux<1362);assert.ok(one.temperature>393&&one.temperature<394);
for(const r of [.1,.7,1,2])for(const f of [.2,.5,1]){const x=energyBudget(r,f);near(x.flux*x.area,x.power);assert.ok(Object.values(x).every(v=>Number.isFinite(v)&&v>0));}
for(const [r,f] of [[0,.5],[-1,1],[NaN,1],[Infinity,1],[1,0],[1,-.2],[1,1.01],[1,NaN]])assert.throws(()=>energyBudget(r,f),RangeError);
console.log('PASS: Dyson energy conservation, inverse square law, temperature scaling, coverage independence and invalid inputs.');
// Independent pinhole-camera invariants, not sampled visual time or CSS position.
for(const d of [2,3.15,9,15,20])for(const u of [.05,.3,.8])for(const v of [.1,.55,.9]){
  const rest=projectedPoint(u,v,d);near(rest[0],u);near(rest[1],v);
  const p=projectedPoint(u,v,d,[.2,.1,0]);near((u-p[0])*d,.2/(2*IMAGE_ASPECT));near((p[1]-v)*d,.05);
}
const nearMove=.5-projectedPoint(.5,.5,3,[.2,0,0])[0],farMove=.5-projectedPoint(.5,.5,15,[.2,0,0])[0];near(nearMove/farMove,5);
for(let t=0;t<100;t+=.1){const shift=cameraRail(t);assert.ok(shift.every(Number.isFinite));assert.ok(Math.abs(shift[0])<=MAX_SHIFT);assert.ok(shift[2]>=0&&shift[2]<=.11);}
for(const layer of [0,1,2]){const mesh=makeSurface(layer);assert.ok(mesh.vertices.every(Number.isFinite));assert.ok(Math.max(...mesh.indices)<mesh.vertices.length/5);for(let i=2;i<mesh.vertices.length;i+=5)assert.ok(mesh.vertices[i]>.11);}
assert.ok(surfaceDepth(.2,.5,1)<surfaceDepth(.2,.5,0));
console.log('PASS: projective identity, inverse-depth parallax, finite indexed relief geometry and bounded camera rail.');
