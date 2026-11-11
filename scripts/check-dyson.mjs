import assert from 'node:assert/strict';
import {energyBudget,SOLAR_LUMINOSITY,SIGMA} from '../exhibits/dyson/energy.js';
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
