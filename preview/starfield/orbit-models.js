// 观星台星体。贴图来自 NASA（见 NASA-imagery.md），随本预览一起托管；
// 贴图载入前先用程序生成的颜色，载入后替换。水星、太阳和 Luna 没有找到可用的 NASA 全球贴图，是程序生成的。
import * as THREE from '../../vendor/three/three.module.min.js';
export const BRASS = new THREE.Color('#d3b36f');
const loader = new THREE.TextureLoader();
function texture(name, done) {
  return loader.load(new URL(`./textures/${name}.jpg`, import.meta.url).href, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    done?.(t);
  });
}
function random(seed) {
  let n = seed;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 陨坑表面：水星偏暖灰，Luna 偏冷灰并在正面画出月海。
function cratered(seed, base, rim, maria) {
  return canvasTexture(1024, 512, (g, w, h) => {
    const r = random(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (const [x, y, rx, ry] of maria || []) {
      g.fillStyle = '#5f5e5b';
      g.globalAlpha = 0.55;
      g.beginPath();
      g.ellipse(x * w, y * h, rx * w, ry * h, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 1400; i++) {
      const x = r() * w,
        y = h * (0.06 + r() * 0.88),
        d = Math.pow(r(), 3) * 18 + 1;
      g.globalAlpha = 0.25 + r() * 0.3;
      g.fillStyle = rim;
      g.beginPath();
      g.arc(x, y, d, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha *= 0.8;
      g.fillStyle = '#d9d6cf';
      g.beginPath();
      g.arc(x - d * 0.25, y - d * 0.25, d * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 0.06;
    for (let i = 0; i < 30000; i++) {
      g.fillStyle = r() > 0.5 ? '#fff' : '#000';
      g.fillRect(r() * w, r() * h, 1, 1);
    }
  });
}
function glowTexture(inner, outer) {
  return canvasTexture(256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.25, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  });
}
// 星体骨架：group 放位置，axis 带转轴倾角，surface 自转。
function frame(b, surface) {
  const group = new THREE.Group(),
    axis = new THREE.Group();
  axis.rotation.x = -b.tilt * (Math.PI / 180);
  axis.add(surface);
  group.add(axis);
  surface.userData.planet = b.id;
  return { group, axis, surface };
}
const ENDING = `#include <tonemapping_fragment>
#include <colorspace_fragment>`;
// 地球：白天用 Blue Marble，背着太阳的一面换成夜间灯光，边上一圈大气。
function makeEarth(b) {
  const uniforms = {
    day: { value: null },
    night: { value: null },
    ready: { value: 0 },
    sun: { value: new THREE.Vector3(1, 0, 0) },
    dim: { value: 1 },
  };
  texture('earth', (t) => {
    uniforms.day.value = t;
    uniforms.ready.value = uniforms.night.value ? 1 : uniforms.ready.value;
  });
  texture('earth-night', (t) => {
    uniforms.night.value = t;
    uniforms.ready.value = uniforms.day.value ? 1 : uniforms.ready.value;
  });
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(b.radius, 96, 64),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader:
        'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: `uniform sampler2D day; uniform sampler2D night; uniform float ready; uniform vec3 sun; uniform float dim;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vec3 n=normalize(vN); float l=dot(n,normalize(sun)); float lit=smoothstep(-0.15,0.3,l);
  vec3 d=ready>0.5?texture2D(day,vUv).rgb:vec3(0.05,0.12,0.2);
  vec3 c=d*(0.05+1.15*max(l,0.0));
  if(ready>0.5){vec3 nl=texture2D(night,vUv).rgb; c+=nl*nl*(1.0-lit)*1.6;}
  float f=pow(1.0-max(dot(n,normalize(vV)),0.0),3.0);
  c+=vec3(0.35,0.55,0.85)*f*(0.15+0.85*lit)*0.6;
  gl_FragColor=vec4(c*dim,1.0);
  ${ENDING}
}`,
    }),
  );
  const parts = frame(b, surface),
    halo = new THREE.Mesh(
      new THREE.SphereGeometry(b.radius * 1.045, 48, 32),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { dim: { value: 1 } },
        vertexShader:
          'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p;}',
        fragmentShader:
          'varying vec3 n; varying vec3 v; uniform float dim; void main(){float a=pow(1.-abs(dot(n,v)),3.);gl_FragColor=vec4(.45,.65,.95,a*.45*dim);}',
      }),
    );
  parts.group.add(halo);
  return {
    ...parts,
    sunDirection: uniforms.sun.value,
    dim: (k) => {
      uniforms.dim.value = k;
      halo.material.uniforms.dim.value = k;
    },
  };
}
// 太阳：程序生成的米粒组织和临边昏暗，外加一圈加色光晕；本身也是场景的点光源。
function makeSun(b) {
  const uniforms = { time: { value: 0 }, dim: { value: 1 } };
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(b.radius, 64, 48),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader:
        'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){vP=position; vec4 p=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-p.xyz); gl_Position=projectionMatrix*p;}',
      fragmentShader: `uniform float time; uniform float dim; varying vec3 vP; varying vec3 vN; varying vec3 vV;
float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){
  vec3 p=normalize(vP)*6.0; float g=noise(p+time*0.05)*0.55+noise(p*2.3-time*0.08)*0.3+noise(p*5.1)*0.15;
  float limb=pow(max(dot(normalize(vN),normalize(vV)),0.0),0.45);
  vec3 c=mix(vec3(1.0,0.38,0.06),vec3(1.0,0.8,0.45),g)*(0.45+0.75*limb)*1.15;
  gl_FragColor=vec4(c*dim,1.0);
  ${ENDING}
}`,
    }),
  );
  const parts = frame(b, surface),
    glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture('rgba(255,226,170,0.8)', 'rgba(255,150,60,0.2)'),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
  glow.scale.setScalar(b.radius * 6);
  parts.group.add(glow);
  const light = new THREE.PointLight('#fff4e2', 3, 0, 0);
  parts.group.add(light);
  return {
    ...parts,
    uniforms,
    light,
    dim: (k) => {
      uniforms.dim.value = k;
      glow.material.opacity = k;
    },
  };
}
const FALLBACK = {
  venus: '#d9c49a',
  mars: '#b5643c',
  jupiter: '#c8a882',
  saturn: '#d8c28e',
};
function makePlanet(b) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  if (b.id === 'mercury') material.map = cratered(23, '#8f8781', '#5a534f');
  else if (b.id === 'luna')
    material.map = cratered(57, '#aaa8a3', '#6f6d69', [
      [0.47, 0.32, 0.07, 0.08],
      [0.56, 0.4, 0.06, 0.05],
      [0.43, 0.5, 0.09, 0.06],
      [0.53, 0.58, 0.05, 0.04],
      [0.38, 0.38, 0.04, 0.07],
    ]);
  else {
    material.color.set(FALLBACK[b.id]);
    texture(b.id, (t) => {
      material.map = t;
      material.color.set('#ffffff');
      material.userData.base = material.color.clone();
      material.needsUpdate = true;
    });
  }
  material.userData.base = material.color.clone();
  const surface = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 64, 40), material),
    parts = frame(b, surface),
    extras = [];
  if (b.id === 'saturn') {
    const inner = b.radius * 1.24,
      outer = b.radius * 2.3,
      geo = new THREE.RingGeometry(inner, outer, 160, 1),
      pos = geo.attributes.position,
      uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++)
      uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - inner) / (outer - inner), 0.5);
    const bands = canvasTexture(512, 4, (g) => {
      const r = random(5);
      for (let x = 0; x < 512; x++) {
        const t = x / 512,
          gap = t > 0.56 && t < 0.62 ? 0.08 : 1,
          a = (0.35 + 0.45 * Math.sin(t * 40) ** 2 + r() * 0.15) * gap * (t < 0.04 ? 0.3 : 1);
        g.fillStyle = `rgba(${210 + r() * 20},${196 + r() * 20},${165 + r() * 20},${a})`;
        g.fillRect(x, 0, 1, 4);
      }
    });
    const ring = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: bands,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        roughness: 1,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.material.userData.base = ring.material.color.clone();
    parts.axis.add(ring);
    extras.push(ring.material);
  }
  const mats = [material, ...extras];
  return {
    ...parts,
    dim: (k) => mats.forEach((m) => m.color.copy(m.userData.base).multiplyScalar(0.12 + 0.88 * k)),
  };
}
export function makeBody(b) {
  return b.id === 'earth' ? makeEarth(b) : b.id === 'sun' ? makeSun(b) : makePlanet(b);
}
// 背景：NASA Tycho 全天星图模糊后只当银河的光雾（赤道坐标，绕春分点方向倾斜黄赤交角），
// 清晰的星点另外画三层，远近亮度不一。都先于轨道线绘制，不会盖住半透明的线。
export function makeSky() {
  const group = new THREE.Group(),
    sphere = new THREE.Mesh(
      new THREE.SphereGeometry(150, 64, 32),
      new THREE.MeshBasicMaterial({
        color: '#c3ccd8',
        side: THREE.BackSide,
        depthWrite: false,
        transparent: true,
        opacity: 0,
      }),
    );
  sphere.rotation.x = 23.44 * (Math.PI / 180);
  sphere.renderOrder = -11;
  texture('stars', (t) => {
    sphere.material.map = t;
    sphere.material.opacity = 1;
    sphere.material.needsUpdate = true;
  });
  group.add(sphere);
  const r = random(81);
  [
    [2600, 1.1, 0.5],
    [700, 1.7, 0.75],
    [140, 2.6, 0.95],
  ].forEach(([count, size, opacity], k) => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < p.length; i += 3) {
      const a = r() * Math.PI * 2,
        z = r() * 2 - 1,
        d = 120;
      p[i] = Math.cos(a) * Math.sqrt(1 - z * z) * d;
      p[i + 1] = z * d;
      p[i + 2] = Math.sin(a) * Math.sqrt(1 - z * z) * d;
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(p, 3)),
      new THREE.PointsMaterial({
        color: ['#c9d3de', '#e8eef5', '#fff6e4'][k],
        size,
        sizeAttenuation: false,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
    stars.renderOrder = -9;
    group.add(stars);
  });
  // 一条斜穿画面的银河光带：沿一个大圆密集分布的细小星点，加几团极淡的星云光。
  const n = new THREE.Vector3(0.66, -0.33, 0.67).normalize(),
    u = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize(),
    w = new THREE.Vector3().crossVectors(n, u),
    gauss = () => (r() + r() + r() + r() - 2) / 2,
    band = new Float32Array(14000 * 3),
    v = new THREE.Vector3();
  for (let i = 0; i < band.length; i += 3) {
    const t = r() * Math.PI * 2,
      lat = gauss() * 0.2;
    v.copy(u)
      .multiplyScalar(Math.cos(t))
      .addScaledVector(w, Math.sin(t))
      .multiplyScalar(Math.cos(lat))
      .addScaledVector(n, Math.sin(lat))
      .multiplyScalar(118);
    band.set([v.x, v.y, v.z], i);
  }
  const milky = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(band, 3)),
    new THREE.PointsMaterial({
      color: '#d4dbe6',
      size: 1.1,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  milky.renderOrder = -9;
  group.add(milky);
  const haze = [
    glowTexture('rgba(150,170,205,0.5)', 'rgba(90,110,150,0.12)'),
    glowTexture('rgba(211,179,111,0.35)', 'rgba(140,110,70,0.08)'),
  ];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2 + r() * 0.3,
      sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: haze[i % 5 === 0 ? 1 : 0],
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.55 + r() * 0.35,
        }),
      );
    sprite.position
      .copy(u)
      .multiplyScalar(Math.cos(t))
      .addScaledVector(w, Math.sin(t))
      .addScaledVector(n, gauss() * 0.1)
      .multiplyScalar(110);
    sprite.scale.setScalar(30 + r() * 34);
    sprite.renderOrder = -10;
    group.add(sprite);
  }
  return { group };
}
