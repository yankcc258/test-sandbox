import * as THREE from '../../vendor/three/three.module.min.js';
export function surfaceFor(role = 'ivory') {
  if (/hardware-(metal|fastener)|axis|tick/.test(role)) return [0.44, 0.92, 1];
  if (/recess|rubber/.test(role)) return [0.82, 0, 1];
  if (/rectangle|surface|tangent-plane/.test(role)) return [0.46, 0, 0];
  return [0.42, 0, 1];
}
export function createSpecimenGeometry(count) {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3);
  const positions = geometry.attributes.position,
    normals = geometry.attributes.normal;
  const sharp = new Float32Array(positions.array.length),
    sharpNormals = new Float32Array(normals.array);
  const point = new THREE.Vector3(),
    core = new THREE.Vector3(),
    normal = new THREE.Vector3();
  const radius = 0.045,
    inner = 0.5 - radius;
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    for (const key of ['x', 'y', 'z'])
      if (Math.abs(point[key]) < 0.49) point[key] = Math.sign(point[key]) * inner;
    point.toArray(sharp, i * 3);
    core.copy(point).clampScalar(-inner, inner);
    normal.copy(point).sub(core).normalize();
    point.copy(core).addScaledVector(normal, radius);
    positions.setXYZ(i, point.x, point.y, point.z);
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  geometry.setAttribute('labSharpPosition', new THREE.BufferAttribute(sharp, 3));
  geometry.setAttribute('labSharpNormal', new THREE.BufferAttribute(sharpNormals, 3));
  const surface = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  for (let i = 0; i < count; i++) surface.setXYZ(i, ...surfaceFor());
  geometry.setAttribute('labSurface', surface);
  return geometry;
}
export function createSpecimenMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.38,
    clearcoatRoughness: 0.3,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 labSurface;
attribute vec3 labSharpPosition;
attribute vec3 labSharpNormal;
varying vec2 labFinish;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nobjectNormal = normalize(mix(labSharpNormal, objectNormal, labSurface.z));',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed = mix(labSharpPosition, transformed, labSurface.z); labFinish=labSurface.xy;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 labFinish;')
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor=labFinish.x;',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor=labFinish.y;',
      );
  };
  material.customProgramCacheKey = () => 'zhixu-ivory-titanium-v34';
  return material;
}
export function createSpecimenDepthMaterial() {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 labSurface;
attribute vec3 labSharpPosition;`,
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed = mix(labSharpPosition, transformed, labSurface.z);',
      );
  };
  material.customProgramCacheKey = () => 'zhixu-specimen-depth-v34';
  return material;
}
