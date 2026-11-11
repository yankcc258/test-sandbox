import assert from 'node:assert/strict';
import {embeddingHeight,potentialHeight,ATLAS_MU,ATLAS_L1,atlasGeometry} from '../exhibits/shared/gravity-geometry.js';
import {roche,rocheGradient} from '../exhibits/roche/binary.js';

// The embedded meridian must reproduce Schwarzschild's exterior radial metric.
assert.equal(embeddingHeight(1),0);
assert.ok(Number.isNaN(embeddingHeight(.9)));
for(const r of [1.01,1.1,1.5,2,4,6]){
  const h=1e-6,dz=(embeddingHeight(r+h)-embeddingHeight(r-h))/(2*h);
  assert.ok(Math.abs((1+dz*dz)-(1/(1-1/r)))<2e-6,`radial metric at ${r}`);
}
assert.ok(Math.abs(rocheGradient(ATLAS_L1,0,0,ATLAS_MU)[0])<1e-10,'L1 stationary');
const center=potentialHeight(ATLAS_L1,0),eps=.01;
assert.ok(potentialHeight(ATLAS_L1+eps,0)<center && potentialHeight(ATLAS_L1,eps)>center,'L1 is a saddle of the displayed potential');
for(const [u,w] of [[.2,.2],[-1,.4],[1.3,-.5]])assert.equal(potentialHeight(u,w),Math.max(-4.8,-(roche(u,w,0,ATLAS_MU)-1.5)*1.8));
for(const kind of ['roche','schwarzschild']){
  const {vertices,faces}=atlasGeometry(kind);
  assert.ok(vertices.every(v=>v.every(Number.isFinite)));
  assert.ok(faces.every(f=>f.ids.length===4 && f.ids.every(i=>i>=0 && i<vertices.length)));
}
console.log('PASS: gravity atlas — Schwarzschild radial metric, exterior domain, shared Roche effective potential and L1 saddle, finite mesh.');
