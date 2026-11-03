import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.min.js';
import {
  surfaceFor,
  createSpecimenGeometry,
  createSpecimenMaterial,
  createSpecimenDepthMaterial,
} from '../laboratory/specimen-materials.js';

// Scientific construction surfaces must retain their exact box silhouettes.
// Hardware can have a metal response without making the ivory body metallic.
for (const role of ['midpoint-rectangle', 'rectangle-top', 'partial-surface', 'tangent-plane']) {
  const [roughness, metalness, bevel] = surfaceFor(role);
  assert.equal(bevel, 0, `${role} keeps its exact mathematical boundary`);
  assert.equal(metalness, 0);
  assert.ok(roughness > 0 && roughness <= 1);
}
assert.equal(surfaceFor('ivory')[1], 0);
for (const role of ['hardware-metal', 'hardware-fastener', 'axis', 'tick']) {
  assert.ok(surfaceFor(role)[1] > 0.8, `${role} has a metal response`);
}
assert.ok(surfaceFor('rubber')[0] > surfaceFor('ivory')[0]);

for (const count of [85, 288]) {
  const geometry = createSpecimenGeometry(count);
  const rounded = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const sharp = geometry.getAttribute('labSharpPosition');
  const sharpNormal = geometry.getAttribute('labSharpNormal');
  const finish = geometry.getAttribute('labSurface');
  assert.equal(sharp.count, rounded.count);
  assert.equal(sharpNormal.count, normal.count);
  assert.equal(finish.count, count);
  assert.ok(finish.isInstancedBufferAttribute);
  assert.equal(finish.meshPerAttribute, 1);
  assert.ok(geometry.index.count / 3 <= 128, 'the 288-instance geometry stays lightweight');
  let roundedCorners = 0;
  for (let i = 0; i < rounded.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(rounded, i);
    const n = new THREE.Vector3().fromBufferAttribute(normal, i);
    const s = new THREE.Vector3().fromBufferAttribute(sharp, i);
    const sn = new THREE.Vector3().fromBufferAttribute(sharpNormal, i);
    assert.ok([...p, ...n, ...s, ...sn].every(Number.isFinite));
    assert.ok(Math.abs(n.length() - 1) < 1e-6, 'bevel normals remain normalized');
    assert.ok(Math.abs(sn.length() - 1) < 1e-6);
    assert.ok(Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) <= 0.500001);
    assert.ok(Math.abs(s.dot(sn) - 0.5) < 1e-6, 'sharp face remains exactly on its box plane');
    if (s.distanceTo(p) > 0.001) roundedCorners++;
  }
  assert.ok(roundedCorners > 0, 'the rounded branch actually changes corners');
  geometry.dispose();
}

// Use the bundled Three shader templates, so renamed/removed injection points
// fail here. Actual GPU shader compilation remains part of browser validation.
const material = createSpecimenMaterial();
const shader = {
  vertexShader: THREE.ShaderLib.physical.vertexShader,
  fragmentShader: THREE.ShaderLib.physical.fragmentShader,
};
material.onBeforeCompile(shader);
for (const pattern of [
  /attribute vec3 labSurface;/,
  /attribute vec3 labSharpPosition;/,
  /attribute vec3 labSharpNormal;/,
  /objectNormal\s*=\s*normalize\(mix\(labSharpNormal,\s*objectNormal,\s*labSurface\.z\)\)/,
  /transformed\s*=\s*mix\(labSharpPosition,\s*transformed,\s*labSurface\.z\)/,
  /labFinish\s*=\s*labSurface\.xy/,
])
  assert.match(shader.vertexShader, pattern);
assert.match(shader.fragmentShader, /roughnessFactor\s*=\s*labFinish\.x/);
assert.match(shader.fragmentShader, /metalnessFactor\s*=\s*labFinish\.y/);
assert.equal((shader.vertexShader.match(/varying vec2 labFinish;/g) || []).length, 1);
assert.equal((shader.fragmentShader.match(/varying vec2 labFinish;/g) || []).length, 1);
assert.ok(material.isMeshPhysicalMaterial);
assert.ok(material.customProgramCacheKey().length > 0);
material.dispose();

// The shadow pass must use the same sharp/rounded positions as the visible
// surface. Otherwise exact-area rectangles would cast rounded, smaller corners.
const depthMaterial = createSpecimenDepthMaterial();
const depthShader = {
  vertexShader: THREE.ShaderLib.depth.vertexShader,
  fragmentShader: THREE.ShaderLib.depth.fragmentShader,
};
depthMaterial.onBeforeCompile(depthShader);
assert.ok(depthMaterial.isMeshDepthMaterial);
assert.equal(depthMaterial.depthPacking, THREE.RGBADepthPacking);
assert.match(depthShader.vertexShader, /attribute vec3 labSurface;/);
assert.match(depthShader.vertexShader, /attribute vec3 labSharpPosition;/);
const positionExpression =
  /transformed\s*=\s*mix\(labSharpPosition,\s*transformed,\s*labSurface\.z\)/;
assert.match(depthShader.vertexShader, positionExpression);
assert.equal(
  shader.vertexShader.match(positionExpression)[0],
  depthShader.vertexShader.match(positionExpression)[0],
);
assert.notEqual(depthMaterial.customProgramCacheKey(), material.customProgramCacheKey());
depthMaterial.dispose();

console.log(
  'PASS: per-role finish, exact mathematical silhouettes, normalized bevel normals, bounded instance geometry and matching visible/shadow shader positions.',
);
