// 复习区「脊柱」原型（露娜）：中心是一根有机与无机结合的脊柱，左右两条光点 DNA 双螺旋交替着向下延续，
// 七块磨砂玻璃屏幕沿螺旋从左往右一块接一块往下排。全部程序生成，不使用参考站的任何代码、模型或贴图。
//
// 脊柱（第三稿）：九种楔形椎体、片状骨弓与贴合关节，增加开槽钛支撑片和紧固件。
// 资产在构建时优化、运行时实例化；保留 DNA、扫描环、脊髓和心跳响应。
// DNA（第二稿）：标准的双螺旋——两条骨架链 + 一格一格的碱基对横档（两半两种颜色）+ 大沟小沟，
//   整条缓慢自转。左右各一条，相位错开半圈；跟着镜头转，始终在画面两侧，沿世界的 y 轴一直向下延续。
// 纯几何工厂，不读 DOM。
import * as THREE from '../vendor/three/three.module.min.js';
import { loadSculptedSpine } from './sculpted-spine.js?v=13';

export const SPINE = {
  pitch: 0.78, // 近似平均节距；实际按各节高度与关节形态拟合
  top: 9,
  bottom: -46,
};
// 屏幕沿螺旋排列：从左往右下沉，每块转 40°、下降 1.75
export const PANEL = { step: (40 * Math.PI) / 180, drop: 1.75, radius: 3.6, w: 2.7, h: 1.62 };
export const panelPose = (i) => {
  const a = i * PANEL.step;
  return {
    angle: a,
    pos: new THREE.Vector3(Math.sin(a) * PANEL.radius, -i * PANEL.drop, Math.cos(a) * PANEL.radius),
  };
};

export function createSpine() {
  const group = new THREE.Group(),
    stats = { vertebrae: 0 };
  const ready = loadSculptedSpine().then((model) => {
    group.add(model.group);
    Object.assign(stats, model.stats);
    // 脊柱是 S 形排列的，脊髓改成沿每节椎孔中心穿过去的曲线，不再是一根直圆柱（否则会从骨弓前面穿出来）
    if (model.canal.length > 3) {
      const pts = model.canal.slice().sort((a, b) => b.y - a.y),
        top = pts[0].clone().setY(pts[0].y + 1.5),
        bottom = pts[pts.length - 1].clone().setY(pts[pts.length - 1].y - 1.5);
      const curve = new THREE.CatmullRomCurve3([top, ...pts, bottom], false, 'centripetal');
      cord.geometry.dispose();
      cord.geometry = new THREE.TubeGeometry(curve, pts.length * 6, 0.035, 10, false);
      cord.position.set(0, 0, 0);
      signalMesh.geometry = cord.geometry;
      signalMesh.position.copy(cord.position);
    }
  });
  // 脊髓：穿过椎孔的一根发光细线
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, SPINE.top - SPINE.bottom + 2, 12),
    new THREE.MeshBasicMaterial({ color: 0x9cc2b9, toneMapped: false }),
  );
  const cordBase = new THREE.Color(0x9cc2b9),
    cordBeat = new THREE.Color(0xc9e755);
  cord.position.set(0, (SPINE.top + SPINE.bottom) / 2, -0.2);
  group.add(cord);
  const signalMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { uY: { value: 0 }, uStrength: { value: 0 } },
    vertexShader: `varying float vY; void main() { vec4 p=modelMatrix*vec4(position,1.0); vY=p.y; gl_Position=projectionMatrix*viewMatrix*p; }`,
    fragmentShader: `uniform float uY,uStrength; varying float vY; void main() { float a=exp(-pow((vY-uY)/.75,2.0))*uStrength; gl_FragColor=vec4(vec3(.7,.92,.83)*1.7,a); }`,
  });
  const signalMesh = new THREE.Mesh(cord.geometry, signalMaterial);
  signalMesh.position.copy(cord.position);
  signalMesh.visible = false;
  group.add(signalMesh);

  // ---------- DNA：标准双螺旋，左右各一条 ----------
  const dna = new THREE.Group(); // 页面会让它跟着镜头绕脊柱转，始终在画面两侧
  group.add(dna);
  const R = 0.82,
    turn = 3.4, // 一圈 10 个碱基对
    groove = Math.PI * 0.72; // 两条骨架的相位差：大沟、小沟
  function helix(phase) {
    const pos = [],
      kind = [],
      seed = [];
    const push = (x, y, z, k) => {
      pos.push(x, y, z);
      kind.push(k);
      seed.push(Math.random());
    };
    // 骨架链：密集的光点
    for (let y = SPINE.top; y > SPINE.bottom; y -= 0.016) {
      const a = (y / turn) * Math.PI * 2 + phase;
      push(Math.cos(a) * R, y, Math.sin(a) * R, 0);
      push(Math.cos(a + groove) * R, y, Math.sin(a + groove) * R, 0);
    }
    // 碱基对：每 0.34 一格，从一条骨架连到另一条，两半两种颜色
    for (let y = SPINE.top; y > SPINE.bottom; y -= 0.34) {
      const a = (y / turn) * Math.PI * 2 + phase,
        A = new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R),
        B = new THREE.Vector3(Math.cos(a + groove) * R, y, Math.sin(a + groove) * R);
      for (let k = 1; k < 20; k++) {
        const t = k / 20,
          v = A.clone().lerp(B, t);
        push(v.x, v.y, v.z, t < 0.5 ? 1 : 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    return geo;
  }
  const uniforms = {
    uTime: { value: 0 },
    uScale: { value: 600 },
    uBack: { value: new THREE.Color(0xe6efe9) },
    uBaseA: { value: new THREE.Color(0x8fd3cf) },
    uBaseB: { value: new THREE.Color(0xe7e1cf) },
    uAccent: { value: new THREE.Color(0xc9e755) },
    uFogRange: { value: new THREE.Vector2(10.5, 24) },
    uBeat: { value: 0 }, // 心跳包络 0～1
    uBurst: { value: 0 }, // 过载时光点炸散 0～1
    uBottom: { value: SPINE.bottom },
    uRange: { value: SPINE.top - SPINE.bottom },
  };
  const pointMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aKind; attribute float aSeed;
      uniform float uTime, uScale, uBeat, uBurst, uBottom, uRange; uniform vec2 uFogRange;
      varying float vA; varying float vKind; varying float vAccent;
      void main() {
        vec3 p = position;
        if (aKind > 2.5) {
          // 微尘：缓慢上浮、绕脊柱轻轻漂移，到顶后从底部循环
          p.y = uBottom + mod(p.y - uBottom + uTime * (0.12 + aSeed * 0.2), uRange);
          float a = uTime * 0.02 * (aSeed - 0.5);
          p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
        }
        // 过载：每个光点沿自己的方向炸散出去
        vec3 dir = normalize(vec3(sin(aSeed * 91.0), cos(aSeed * 37.0) * 0.6, cos(aSeed * 53.0)));
        p += dir * uBurst * (1.5 + aSeed * 4.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float depth = -mv.z;
        float size = aKind < 0.5 ? 1.15 : aKind < 2.5 ? 0.85 : 0.5;
        float tw = 0.8 + 0.2 * sin(uTime * 1.4 + aSeed * 50.0);
        gl_PointSize = size * uScale / depth * tw * (1.0 + 0.12 * uBeat * step(aKind, 2.5));
        float fog = 1.0 - smoothstep(uFogRange.x, uFogRange.y, depth);
        vA = fog * (aKind < 0.5 ? 0.85 : aKind < 2.5 ? 0.75 : 0.3) * (0.85 + 0.2 * uBeat);
        vKind = aKind;
        vAccent = step(0.985, aSeed) * step(aKind, 2.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uBack, uBaseA, uBaseB, uAccent;
      varying float vA; varying float vKind; varying float vAccent;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a *= a;
        vec3 c = vKind < 0.5 ? uBack : vKind < 1.5 ? uBaseA : vKind < 2.5 ? uBaseB : uBack;
        c = mix(c, uAccent, vAccent);
        gl_FragColor = vec4(c * a * vA, a * vA);
      }`,
  });
  const helices = [
    // 一近一远：左边这条离镜头近、细节清楚；右边那条更靠后、更淡，镜头转动时会从脊柱后面经过
    { x: -2.55, z: 0.9, phase: 0 },
    { x: 3.05, z: -1.9, phase: Math.PI }, // 相位错开半圈：左右交替
  ].map((h) => {
    const pts = new THREE.Points(helix(h.phase), pointMat);
    pts.position.set(h.x, 0, h.z);
    pts.frustumCulled = false;
    dna.add(pts);
    return pts;
  });
  // 环境微尘
  const DUST = 3200,
    dust = [];
  for (let k = 0; k < DUST; k++) {
    const a = Math.random() * Math.PI * 2,
      r = 2.5 + Math.random() * 9;
    dust.push(
      Math.cos(a) * r,
      SPINE.bottom + Math.random() * (SPINE.top - SPINE.bottom),
      Math.sin(a) * r,
    );
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dust, 3));
  dustGeo.setAttribute(
    'aKind',
    new THREE.Float32BufferAttribute(new Float32Array(DUST).fill(3), 1),
  );
  dustGeo.setAttribute(
    'aSeed',
    new THREE.Float32BufferAttribute(Float32Array.from({ length: DUST }, Math.random), 1),
  );
  const dustPts = new THREE.Points(dustGeo, pointMat);
  dustPts.frustumCulled = false;
  group.add(dustPts);

  // ---------- 扫描环：每块屏幕的高度上一圈带刻度的细环，绕着脊柱 ----------
  const rings = new THREE.Group();
  group.add(rings);
  const ringMat = new THREE.LineBasicMaterial({
      color: 0xcfe3df,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    tickMat = ringMat.clone();
  for (let i = -2; i < 10; i++) {
    const y = -i * 1.75 - 0.95,
      level = new THREE.Group();
    level.position.y = y;
    // 内环（虚线）和外环（实线，缺一段）
    const inner = [],
      outer = [],
      ticks = [];
    for (let k = 0; k < 96; k++) {
      const a0 = (k / 96) * Math.PI * 2,
        a1 = ((k + 0.55) / 96) * Math.PI * 2;
      inner.push(
        Math.cos(a0) * 1.45,
        0,
        Math.sin(a0) * 1.45,
        Math.cos(a1) * 1.45,
        0,
        Math.sin(a1) * 1.45,
      );
    }
    for (let k = 0; k <= 200; k++) {
      const a = (k / 200) * Math.PI * 1.7;
      outer.push(Math.cos(a) * 2.25, 0, Math.sin(a) * 2.25);
    }
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2,
        l = k % 9 === 0 ? 0.16 : 0.06;
      ticks.push(
        Math.cos(a) * 2.25,
        0,
        Math.sin(a) * 2.25,
        Math.cos(a) * (2.25 + l),
        0,
        Math.sin(a) * (2.25 + l),
      );
    }
    const g1 = new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(inner, 3),
      ),
      g2 = new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(outer, 3),
      ),
      g3 = new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(ticks, 3),
      );
    level.add(
      new THREE.LineSegments(g1, ringMat),
      new THREE.Line(g2, ringMat),
      new THREE.LineSegments(g3, tickMat),
    );
    level.rotation.y = i * 0.9;
    level.userData.spin = i % 2 ? 1 : -1;
    rings.add(level);
  }

  return {
    group,
    dna,
    uniforms,
    signal(y, strength) {
      signalMesh.visible = strength > 0.001;
      signalMaterial.uniforms.uY.value = y;
      signalMaterial.uniforms.uStrength.value = strength;
    },
    // t：时间；beat：心跳包络 0～1；burst：过载炸散 0～1
    update(t, beat = 0, burst = 0) {
      uniforms.uTime.value = t % 1000;
      uniforms.uBeat.value = beat;
      uniforms.uBurst.value = burst;
      // 双螺旋绕自己的轴缓慢自转（过载时转得飞快）
      helices.forEach((h, i) => (h.rotation.y = (i ? -1 : 1) * (t * 0.18 + burst * 6)));
      rings.children.forEach((r, i) => (r.rotation.y = i * 0.9 + r.userData.spin * t * 0.05));
      ringMat.opacity = 0.1 + 0.1 * beat;
      tickMat.opacity = 0.2 + 0.2 * beat;
      cord.material.color.copy(cordBase).lerp(cordBeat, beat * 0.6);
    },
    ready,
    stats,
  };
}
