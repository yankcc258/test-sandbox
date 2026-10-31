// 复习脊柱原型页面（露娜）。参考了一个同人站「中心脊柱 + 玻璃屏幕螺旋下旋」的版式思路，
// 代码、模型、着色器和图片全部自己写，不复制参考站任何内容。
//   总览：镜头对着当前屏幕，脊柱在屏幕后方贯穿上下，DNA 光点链绕着脊柱向下流动，前后几块屏幕斜着露出。
//   切换：滚轮、向上拖动（触屏习惯：往上推就往下走）、↑ ↓ 键，或点左侧列表 / 侧面的屏幕。屏幕从左往右下沉。
//   进入：点当前屏幕或按 ENTER——镜头推近，屏幕放大，换成同样排版、可以操作的内容层；ESC 返回螺旋。
import * as THREE from './vendor/three/three.module.min.js';
import { RoomEnvironment } from './vendor/three/RoomEnvironment.js';
import { PANEL, createSpine, panelPose } from './models/spine.js';
import { createBackdrop, createHeart } from './recall-backdrop.js';

// 示例数据；images 留空。以后在 IMAGES 里登记图片路径，屏幕就会以那张图做底，没有图就只显示复习信息。
const IMAGES = {};
// 进入的过渡动画。以后七个入口可以各自登记一套（例如对应某一节椎骨和它的神经）；没有登记的用 default。
//   nerve：两条神经从屏幕上方那节椎骨长出、接到屏幕上角，光脉冲沿神经流进屏幕所用的时间（秒）
//   push：从点下到镜头开始推近的延迟（秒）
const TRANSITIONS = {
  default: { nerve: 0.55, push: 0.4 },
};
const ENTRIES = [
  {
    id: 'today',
    title: '今日复习',
    en: 'RECALL',
    count: 41,
    unit: '项待复习',
    line: '单词 24 · 笔记 9 · 测验 2 · 错题 6',
    note: '按任务来源排好，可以从任意一类开始。',
  },
  {
    id: 'vocab',
    title: '背单词',
    en: 'LEXICON',
    count: 24,
    unit: '个到期',
    line: '新词 10 · 上次 昨天 22:40',
    note: '下一组：ephemeral · lucid · tenacious · candor',
  },
  {
    id: 'notes',
    title: '笔记复习',
    en: 'ASSOCIATION',
    count: 9,
    unit: '个知识点到期',
    line: '生物 5 · 计算机 4',
    note: '细胞呼吸 · 酶的活性 · 二叉树遍历 · 动态规划',
  },
  {
    id: 'mistakes',
    title: '错题回访',
    en: 'RECONNECTION',
    count: 6,
    unit: '道待回访',
    line: '物理 3 · 计算机 2 · 化学 1',
    note: '牛顿第二定律的受力分析 · 递归的终止条件',
  },
  {
    id: 'quiz',
    title: '综合测验',
    en: 'RETRIEVAL',
    count: 2,
    unit: '份待完成',
    line: '每份 12 题 · 约 15 分钟',
    note: '生物 · 第 3 章 ／ 数据结构 · 树与图',
  },
  {
    id: 'log',
    title: '复习记录',
    en: 'CONSOLIDATION',
    count: 12,
    unit: '天连续',
    line: '本周 5 天 · 共 186 项',
    note: '最近一次：昨天 22:40 · 背单词 30 个',
  },
  {
    id: 'settings',
    title: '复习设置',
    en: 'REGULATION',
    count: 40,
    unit: '每日上限',
    line: '间隔 1 / 3 / 7 / 21 天',
    note: '提醒时间 21:30 · 新词每日 10 个',
  },
];
const N = ENTRIES.length,
  code = (i) => String(i + 1).padStart(2, '0'),
  reduced = matchMedia('(prefers-reduced-motion: reduce)'),
  params = new URLSearchParams(location.search);
let motionPref = params.get('motion') !== '0',
  target = Math.max(0, Math.min(N - 1, Number(params.get('i')) || 0)),
  entered = false;
// testLive：自动截图用，按「动效开」的规则画，但不跑自动循环
let testLive = false;
const motion = () => testLive || (motionPref && !reduced.matches && !document.hidden);

// ---------- 左侧列表、计数、时钟 ----------
const list = document.getElementById('list');
list.innerHTML = ENTRIES.map(
  (e, i) =>
    `<li><button type="button" data-i="${i}"><small>${code(i)}</small>${e.title}<em>${e.en}</em></button></li>`,
).join('');
const listButtons = [...list.querySelectorAll('button')];
listButtons.forEach((b, i) => b.addEventListener('click', () => go(i)));
function markList(i) {
  listButtons.forEach((b, k) => b.toggleAttribute('aria-current', k === i));
  document.getElementById('count').textContent = code(i);
  document.getElementById('rail-mark').style.top = `${(i / (N - 1)) * (180 - 26)}px`;
}
const clock = () =>
  (document.getElementById('clock').textContent = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date()));
clock();
setInterval(clock, 1000);

// ---------- 屏幕上的排版（画在画布上，贴在玻璃里面） ----------
const CW = 1200,
  CH = 720;
// anim：{ t, bpm, tail }——当前屏幕每帧重画：扫描线、迷你心电图、心率；有图片时图片缓慢平移
function drawPanel(ctx, e, i, img, anim) {
  ctx.clearRect(0, 0, CW, CH);
  if (img) {
    ctx.globalAlpha = 0.55;
    const s = Math.max(CW / img.width, CH / img.height) * 1.08,
      pan = anim ? Math.sin(anim.t * 0.08) * 0.035 : 0;
    ctx.drawImage(
      img,
      (CW - img.width * s) / 2 + pan * CW,
      (CH - img.height * s) / 2,
      img.width * s,
      img.height * s,
    );
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 0, CW, 0);
    g.addColorStop(0, 'rgba(10,13,14,0.7)');
    g.addColorStop(0.6, 'rgba(10,13,14,0.15)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
  }
  const ink = '#eef0ea',
    muted = 'rgba(238,240,234,0.55)',
    sans = '"Inter","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif',
    mono = '"SFMono-Regular",Consolas,"Liberation Mono",monospace';
  const L = 88;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = muted;
  ctx.font = `600 26px ${mono}`;
  ctx.fillText(`${code(i)}  ·  ${e.en}`, L, 112);
  ctx.textAlign = 'right';
  ctx.fillText(`MEMORY / ${code(i)}—07`, CW - L, 112);
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  const hv = anim?.hover || 0;
  ctx.font = `700 ${Math.round(104 * (1 + 0.16 * hv))}px ${sans}`;
  ctx.fillText(e.title, L, 290 + 6 * hv);
  if (hv > 0.01) {
    // 选中感：标题下方一小段黄绿
    ctx.fillStyle = `rgba(201,231,85,${hv})`;
    ctx.fillRect(L, 330, 12 + 140 * hv, 14);
    ctx.fillStyle = ink;
  }
  // 细线 + 小方块（和学习区读出的细线同一种做法）
  ctx.fillRect(L, 336, CW - 2 * L, 2);
  ctx.fillRect(L, 330, 12, 14);
  ctx.font = `500 34px ${sans}`;
  ctx.fillStyle = ink;
  ctx.fillText(e.line, L, 410);
  ctx.fillStyle = muted;
  ctx.font = `400 28px ${sans}`;
  ctx.fillText(e.note, L, 462);
  // 右下：大数字
  ctx.textAlign = 'right';
  ctx.fillStyle = ink;
  ctx.font = `200 170px ${sans}`;
  ctx.fillText(String(e.count), CW - L, CH - 92);
  ctx.font = `500 28px ${sans}`;
  ctx.fillStyle = muted;
  ctx.fillText(e.unit, CW - L, CH - 52);
  // 左下：进入
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  ctx.font = `600 26px ${mono}`;
  ctx.fillText('ENTER  ↗', L, CH - 60);
  ctx.fillStyle = '#c9e755';
  ctx.beginPath();
  ctx.arc(L + 200, CH - 69, 7, 0, Math.PI * 2);
  ctx.fill();
  if (!anim || !anim.live) return;
  // 扫描线：一道很淡的亮带缓慢向下扫过
  const sy = ((anim.t * 0.22) % 1.2) * CH - 0.1 * CH,
    band = ctx.createLinearGradient(0, sy - 60, 0, sy + 6);
  band.addColorStop(0, 'rgba(220,240,234,0)');
  band.addColorStop(1, 'rgba(220,240,234,0.07)');
  ctx.fillStyle = band;
  ctx.fillRect(0, sy - 60, CW, 66);
  ctx.fillStyle = 'rgba(220,240,234,0.22)';
  ctx.fillRect(0, sy + 6, CW, 1.5);
  // 迷你心电图 + 心率
  const x0 = L + 250,
    x1 = CW - L - 300,
    y0 = CH - 72;
  ctx.strokeStyle = 'rgba(165,228,214,0.85)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  anim.tail.forEach((v, k) => {
    const x = x0 + ((x1 - x0) * k) / (anim.tail.length - 1),
      y = y0 - v * 34;
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.font = `600 24px ${mono}`;
  ctx.fillStyle = 'rgba(238,240,234,0.7)';
  ctx.textAlign = 'left';
  ctx.fillText(`${String(Math.round(anim.bpm)).padStart(3, '0')} BPM`, x1 + 24, y0 + 8);
}
function roundedRect(w, h, r) {
  const s = new THREE.Shape(),
    x = -w / 2,
    y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// ---------- 场景 ----------
let scene = null;
function createScene() {
  const canvas = document.getElementById('canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const three = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  const pmrem = new THREE.PMREMGenerator(renderer);
  three.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  three.environmentIntensity = 0.55;
  three.fog = new THREE.Fog(0x15191b, 11, 30);
  const hemi = new THREE.HemisphereLight(0xdfe8ec, 0x0d1011, 0.35),
    key = new THREE.DirectionalLight(0xf2f4f0, 2.4),
    rim = new THREE.DirectionalLight(0xa9c4c8, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 6, bottom: -6, near: 1, far: 30 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.01;
  three.add(hemi, key, key.target, rim, rim.target);

  const spine = createSpine();
  three.add(spine.group);
  const heart = createHeart(),
    bgCanvas = document.getElementById('bg'),
    backdrop = createBackdrop(bgCanvas, heart),
    stageEl = document.getElementById('spine'),
    ovEl = document.getElementById('overload'),
    bpmEl = document.getElementById('bpm'),
    pulseEl = bpmEl.parentElement,
    dotEl = document.getElementById('pulse-dot');
  // 页面上任何地方的点击都算进心率
  stageEl.addEventListener('pointerdown', () => motion() && heart.click(time));
  const OV = {
    overload: ['ERR 0x7F · NODE 7', 'MEMORY OVERLOAD', '记忆过载 · 连接数超出阈值'],
    lost: ['SIGNAL 0x00', 'SIGNAL LOST', '信号中断'],
    recal: ['SYNC · NODE 7', 'RECALIBRATING', '重新校准 · 连接恢复中'],
  };
  let lastStage = '',
    panelClock = 0;

  // 屏幕：有厚度、圆角的磨砂玻璃，里面贴一层排版
  const glassGeo = new THREE.ExtrudeGeometry(roundedRect(PANEL.w, PANEL.h, 0.14), {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 3,
    curveSegments: 10,
  });
  glassGeo.translate(0, 0, -0.025);
  // 深色磨砂玻璃：透出后面模糊的脊柱和光点，文字是浅色
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x6f7b7e,
    roughness: 0.55,
    metalness: 0,
    transmission: 1,
    thickness: 0.5,
    ior: 1.35,
    attenuationColor: new THREE.Color(0x30393b),
    attenuationDistance: 0.6,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
    specularIntensity: 0.35,
    envMapIntensity: 0.35,
  });
  const panels = ENTRIES.map((e, i) => {
    const { pos, angle } = panelPose(i),
      g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = angle;
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.userData.i = i;
    g.add(glass);
    const cv = document.createElement('canvas');
    cv.width = CW;
    cv.height = CH;
    const ctx = cv.getContext('2d');
    drawPanel(ctx, e, i, null);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(PANEL.w * 0.98, PANEL.h * 0.98),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    face.position.z = 0.05;
    face.renderOrder = 2;
    g.add(face);
    three.add(g);
    // 边缘发光 + 悬停时的一道斜向光：同一张平面，着色器里用圆角矩形的距离场画
    const rimMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uSize: { value: new THREE.Vector2(PANEL.w + 0.6, PANEL.h + 0.6) },
        uBox: { value: new THREE.Vector2(PANEL.w / 2, PANEL.h / 2) },
        uGlow: { value: 0.3 },
        uSweep: { value: -1 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec2 uSize, uBox; uniform float uGlow, uSweep; varying vec2 vUv;
        float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
        void main() {
          vec2 p = (vUv - 0.5) * uSize;
          float d = sdRound(p, uBox, 0.16);
          float line = exp(-pow(d / 0.012, 2.0));
          float halo = exp(-max(d, 0.0) / 0.09) * step(0.0, d) * 0.45;
          float inside = 1.0 - smoothstep(-0.02, 0.0, d);
          float x = (p.x / uBox.x) * 0.5 + 0.5 + (p.y / uBox.y) * 0.22;
          float band = exp(-pow((x - uSweep) / 0.07, 2.0)) * inside * 0.5;
          float a = (line + halo) * uGlow + band;
          gl_FragColor = vec4(vec3(0.78, 0.96, 0.9) * a, a);
        }`,
    });
    const rimPlane = new THREE.Mesh(new THREE.PlaneGeometry(PANEL.w + 0.6, PANEL.h + 0.6), rimMat);
    rimPlane.position.z = 0.07;
    rimPlane.renderOrder = 3;
    g.add(rimPlane);
    const panel = {
      g,
      glass,
      face,
      ctx,
      tex,
      img: null,
      e,
      i,
      rim: rimMat,
      hov: 0,
      want: 0,
      drawnHov: 0,
      sweepAt: -9,
    };
    if (IMAGES[e.id]) {
      const img = new Image();
      img.onload = () => {
        panel.img = img;
        drawPanel(ctx, e, i, img);
        tex.needsUpdate = true;
        if (!motion()) draw(0);
      };
      img.src = IMAGES[e.id];
    }
    return panel;
  });

  // ---------- 神经：每块屏幕上方那节椎骨左右各伸出一条，接到屏幕的两个上角 ----------
  const nerveVS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    nerveFS = `
      uniform float uReveal, uPulse, uAlpha; varying vec2 vUv;
      void main() {
        float on = 1.0 - smoothstep(uReveal - 0.02, uReveal, vUv.x);
        float pl = exp(-pow((vUv.x - uPulse) / 0.05, 2.0));
        vec3 c = mix(vec3(0.75, 0.95, 0.9), vec3(0.79, 0.91, 0.33), pl);
        float a = on * uAlpha * (0.45 + 1.4 * pl);
        gl_FragColor = vec4(c * a, a);
      }`;
  const nerves = ENTRIES.map((e, i) => {
    const { pos } = panelPose(i),
      a = i * PANEL.step,
      dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
      perp = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)),
      y = pos.y,
      mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uReveal: { value: 0 }, uPulse: { value: -1 }, uAlpha: { value: 0 } },
        vertexShader: nerveVS,
        fragmentShader: nerveFS,
      }),
      group = new THREE.Group();
    [-1, 1].forEach((sg) => {
      const at = (px, d, dy) =>
        perp
          .clone()
          .multiplyScalar(sg * px)
          .addScaledVector(dir, d)
          .setY(y + dy);
      const curve = new THREE.CatmullRomCurve3([
        at(0.42, 0.15, 1.25),
        at(1.45, 0.9, 1.5),
        at(1.85, 2.3, 1.2),
        at(PANEL.w / 2 - 0.18, PANEL.radius - 0.03, PANEL.h / 2 - 0.03),
      ]);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.011, 6, false), mat));
    });
    // 那节椎骨上的一圈光环
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.56, 0.012, 8, 64),
      new THREE.MeshBasicMaterial({
        color: 0xc9eee3,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, y + 1.25, 0.1);
    group.add(ring);
    three.add(group);
    return { mat, ring };
  });

  // ---------- 镜头：沿螺旋下降 ----------
  let s = target,
    enterK = 0,
    size = [1, 1],
    time = 0;
  const look = new THREE.Vector3(),
    camPos = new THREE.Vector3();
  function frameCamera() {
    const [w, h] = size,
      narrow = w < 760,
      a = s * PANEL.step,
      y = -s * PANEL.drop,
      dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
      // 总览：离屏幕 6.4；进入：推近到屏幕几乎占满画面
      far = narrow ? 9.6 : 6.8,
      near = narrow ? 7.4 : 3.5,
      dist = far + (near - far) * ease(enterK),
      sway = motion() ? Math.sin(time * 0.25) * 0.05 : 0;
    camPos
      .copy(dir)
      .multiplyScalar(PANEL.radius + dist)
      .setY(y + 0.42 * (1 - enterK) + sway);
    look
      .copy(dir)
      .multiplyScalar(PANEL.radius - 1.4 * (1 - enterK))
      .setY(y + 0.05 * (1 - enterK));
    camera.position.copy(camPos);
    camera.lookAt(look);
    camera.fov = narrow ? 46 : 32;
    camera.setViewOffset(w, h, narrow ? 0 : -w * 0.05 * (1 - enterK), 0, w, h);
    camera.updateProjectionMatrix();
    // DNA 跟着镜头绕脊柱转，始终在画面两侧
    spine.dna.rotation.y = a;
    // 主光和轮廓光跟着镜头的高度走
    key.position.set(dir.x * 6 - dir.z * 4, y + 7, dir.z * 6 + dir.x * 4);
    key.target.position.set(0, y, 0);
    rim.position.set(-dir.x * 6 + dir.z * 3, y + 3, -dir.z * 6 - dir.x * 3);
    rim.target.position.set(0, y, 0);
  }
  const ease = (t) => t * t * (3 - 2 * t);
  // 屏幕：不跟心跳；各自极慢地、若有若无地摆动；悬停时立刻摆正、放大一点、扫过一道光；边缘发光缓慢呼吸
  let hoverIdx = -1,
    enterAt = -9,
    wasEntered = false;
  function shadePanels(dt) {
    const cur = Math.round(s),
      live = motion(),
      tr = TRANSITIONS[ENTRIES[cur].transition || 'default'],
      since = time - enterAt;
    panels.forEach((p, i) => {
      const want = (!entered && i === hoverIdx) || (entered && i === cur) ? 1 : 0;
      if (want && !p.want) p.sweepAt = time;
      p.want = want;
      p.hov += (want - p.hov) * (live ? 1 - Math.exp(-dt * 16) : 1);
      if (Math.abs(want - p.hov) < 0.002) p.hov = want;
      const calm = 1 - p.hov,
        t = live ? time : 0,
        base = panelPose(i),
        j = heart.glitch ? 0.06 : 0;
      p.g.position
        .copy(base.pos)
        .add(new THREE.Vector3((Math.random() - 0.5) * j, (Math.random() - 0.5) * j, 0));
      p.g.rotation.set(
        calm * 0.045 * Math.sin(t * 0.23 + i * 1.7),
        base.angle + calm * 0.075 * Math.sin(t * 0.19 + i * 2.3),
        calm * 0.022 * Math.sin(t * 0.16 + i * 0.9) +
          (heart.glitch ? (Math.random() - 0.5) * 0.04 : 0),
      );
      p.g.scale.setScalar(1 + 0.06 * p.hov * (entered ? 0 : 1));
      const sw = live ? (time - p.sweepAt) / 0.75 : 2;
      p.rim.uniforms.uSweep.value = sw < 1.3 ? sw * 1.6 - 0.3 : -1;
      p.rim.uniforms.uGlow.value =
        (0.32 + 0.1 * Math.sin(t * 0.7 + i * 1.3) + 0.6 * p.hov) *
        Math.max(0.25, 1 - Math.abs(i - s) * 0.45);
      const d = Math.abs(i - s);
      p.face.material.opacity = Math.max(0.12, 1 - d * 0.7) * (i === cur ? 1 - 0.9 * enterK : 1);
    });
    // 神经：悬停时淡淡地连上；进入时从椎骨长出，光脉冲流进屏幕
    nerves.forEach((n, i) => {
      const u = n.mat.uniforms;
      if (entered && i === cur) {
        const k = live ? Math.min(1, since / tr.nerve) : 1;
        u.uReveal.value = k * 1.05;
        u.uPulse.value = live ? Math.min(1.2, since / tr.nerve) * 1.15 - 0.08 : -1;
        u.uAlpha.value = 1 - 0.7 * enterK * (live && since > tr.nerve + 0.6 ? 1 : 0);
        n.ring.material.opacity = 0.9;
      } else {
        const h = panels[i].hov * (entered ? 0 : 1);
        u.uReveal.value = h > 0 ? 1.05 : u.uReveal.value;
        u.uPulse.value = -1;
        u.uAlpha.value = 0.35 * h;
        n.ring.material.opacity = 0.4 * h;
      }
    });
  }
  // 进入后：把内容层摆到屏幕在画面上的位置
  const contentEl = document.getElementById('content'),
    corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([x, y]) => new THREE.Vector3((x * PANEL.w) / 2, (y * PANEL.h) / 2, 0.05));
  function placeContent() {
    const i = Math.round(s),
      p = panels[i].g,
      r = canvas.getBoundingClientRect(),
      xs = [],
      ys = [];
    p.updateMatrixWorld();
    corners.forEach((c) => {
      const v = c.clone().applyMatrix4(p.matrixWorld).project(camera);
      xs.push((v.x * 0.5 + 0.5) * r.width);
      ys.push((-v.y * 0.5 + 0.5) * r.height);
    });
    Object.assign(contentEl.style, {
      left: `${Math.min(...xs)}px`,
      top: `${Math.min(...ys)}px`,
      width: `${Math.max(...xs) - Math.min(...xs)}px`,
      height: `${Math.max(...ys) - Math.min(...ys)}px`,
    });
    contentEl.classList.toggle('on', enterK > 0.96);
  }
  function draw(dt, render = true) {
    const live = motion(),
      k = live ? 1 - Math.exp(-dt * 5.5) : 1;
    if (!drag) s += (target - s) * k;
    if (Math.abs(target - s) < 0.0005 && !drag) s = target;
    if (entered && !wasEntered) enterAt = time;
    wasEntered = entered;
    const tr = TRANSITIONS[ENTRIES[Math.round(s)].transition || 'default'],
      pushGoal = entered && (!live || time - enterAt > tr.push) ? 1 : 0;
    enterK += (pushGoal - enterK) * (live ? 1 - Math.exp(-dt * 5) : 1);
    if (Math.abs(pushGoal - enterK) < 0.002) enterK = pushGoal;
    document
      .getElementById('spine')
      .classList.toggle(
        'warp',
        entered && live && time - enterAt > tr.push && time - enterAt < tr.push + 0.6,
      );
    time += dt;
    const phaseDelta = live ? heart.step(dt, time) : 0;
    if (!live) {
      heart.beat = 0;
      heart.burst = 0;
    }
    spine.update(live ? time : 0, heart.beat, heart.burst);
    frameCamera();
    shadePanels(dt);
    backdrop.frame(dt, phaseDelta, time, s * PANEL.drop, live);
    // 当前屏幕的画面一直是活的（约 20 帧每秒重画一次）
    panelClock += dt;
    if (live && panelClock > 0.05) {
      panelClock = 0;
      const cur = Math.round(s),
        tail = backdrop.traceTail(120);
      panels.forEach((p) => {
        if (p.i !== cur && Math.abs(p.hov - p.drawnHov) < 0.01) return;
        drawPanel(p.ctx, p.e, p.i, p.img, {
          t: time,
          bpm: heart.bpm,
          tail,
          hover: p.hov,
          live: p.i === cur,
        });
        p.drawnHov = p.hov;
        p.tex.needsUpdate = true;
      });
    }
    // 心率读数和过载状态
    bpmEl.textContent = String(Math.round(heart.bpm)).padStart(3, '0');
    pulseEl.classList.toggle('high', heart.bpm > 120);
    dotEl.style.transform = `scale(${1 + 0.8 * heart.beat})`;
    if (heart.stage !== lastStage) {
      if (heart.stage === 'overload') {
        const f = document.getElementById('flash');
        f.classList.remove('on');
        void f.offsetWidth;
        f.classList.add('on');
      }
      ovEl.hidden = !heart.stage;
      if (heart.stage) {
        const [c, t, sub] = OV[heart.stage];
        document.getElementById('ov-code').textContent = c;
        document.getElementById('ov-title').textContent = t;
        document.getElementById('ov-sub').textContent = sub;
      }
      lastStage = heart.stage;
    }
    stageEl.classList.toggle('glitch', heart.glitch);
    stageEl.classList.toggle('flatline', heart.flat);
    if (!render) return;
    renderer.render(three, camera);
    if (entered || enterK > 0) placeContent();
    if (!entered && enterK === 0) contentEl.hidden = true;
    markList(Math.round(s));
  }
  let frame = 0,
    last = 0;
  function tick(now) {
    frame = 0;
    if (!motion() || testLive) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    draw(dt);
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (motion()) {
      if (!frame) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      backdrop.prefill();
      draw(0);
    }
  }

  // ---------- 输入 ----------
  let wheelAcc = 0,
    wheelLock = 0,
    drag = null;
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (entered) return;
      wheelAcc += e.deltaY;
      const now = performance.now();
      if (Math.abs(wheelAcc) > 40 && now > wheelLock) {
        go(target + Math.sign(wheelAcc));
        wheelAcc = 0;
        wheelLock = now + 420;
      }
    },
    { passive: false },
  );
  const ray = new THREE.Raycaster(),
    ndc = new THREE.Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, (-(e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(
      panels.map((p) => p.glass),
      false,
    )[0];
    return hit ? hit.object.userData.i : -1;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (entered) return;
    drag = { y: e.clientY, s0: s, moved: false, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag && drag.id === e.pointerId) {
      const dy = e.clientY - drag.y;
      if (Math.abs(dy) > 6) {
        drag.moved = true;
        canvas.classList.add('dragging');
        // 往上推 = 往下走（和触屏滚动的手感一致）
        s = Math.max(-0.3, Math.min(N - 0.7, drag.s0 - dy / 260));
        if (!motion()) draw(0);
      }
      return;
    }
    if (e.pointerType === 'mouse' && !entered) {
      const i = pick(e);
      canvas.classList.toggle('over', i >= 0);
      if (i !== hoverIdx) {
        hoverIdx = i;
        if (!motion()) {
          panels.forEach((p) => {
            const h = p.i === hoverIdx ? 1 : 0;
            drawPanel(p.ctx, p.e, p.i, p.img, h ? { t: 0, hover: 1, live: false } : null);
            p.tex.needsUpdate = true;
          });
          draw(0);
        }
      }
    }
  });
  const release = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    canvas.classList.remove('dragging');
    if (d.moved) {
      go(Math.round(s));
      return;
    }
    const i = pick(e);
    if (i < 0) return;
    if (i === Math.round(s)) enter();
    else go(i);
  };
  canvas.addEventListener('pointerleave', () => {
    hoverIdx = -1;
    canvas.classList.remove('over');
    if (!motion()) draw(0);
  });
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    size = [Math.max(1, r.width), Math.max(1, r.height)];
    renderer.setSize(size[0], size[1], false);
    camera.aspect = size[0] / size[1];
    spine.uniforms.uScale.value = size[1] * 0.085;
    backdrop.resize();
    if (!motion()) backdrop.prefill();
    draw(0);
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  sync();
  return {
    sync,
    redraw: () => draw(0),
    // 测试用：跳到某个状态并画一帧
    settle(i, inside) {
      target = s = i;
      entered = !!inside;
      enterK = entered ? 1 : 0;
      if (entered) fillContent(i);
      contentEl.hidden = !entered;
      draw(0);
    },
    advance: (t) => {
      time = t;
      draw(0);
    },
    // 测试用：模拟一段时间（按固定步长推进心跳和心电图），可选在开始时连点 n 次
    simulate(seconds, clicks = 0) {
      testLive = true;
      cancelAnimationFrame(frame);
      frame = 0;
      for (let k = 0; k < clicks; k++) heart.click(time);
      const steps = Math.round(seconds / 0.033);
      for (let k = 0; k < steps; k++) {
        time += 0.033;
        const pd = heart.step(0.033, time);
        backdrop.frame(0.033, pd, time, s * PANEL.drop, true);
      }
      panelClock = 1;
      draw(0.001);
    },
    heart,
    // 测试用：悬停某块屏幕，或在进入后的第 t 秒停住
    hoverTest(i, t = 0.3) {
      testLive = true;
      hoverIdx = i;
      for (let k = 0; k < Math.round(t / 0.033); k++) {
        draw(0.033, false);
      }
      panelClock = 1;
      draw(0.001);
    },
    enterTest(t) {
      testLive = true;
      enter();
      for (let k = 0; k < Math.round(t / 0.033); k++) {
        draw(0.033, false);
      }
      panelClock = 1;
      draw(0.001);
    },
  };
}

// ---------- 切换、进入、返回 ----------
function go(i) {
  if (entered) return;
  target = Math.max(0, Math.min(N - 1, i));
  document.getElementById('hint').style.opacity = 0;
  if (!motion()) scene?.redraw();
}
function fillContent(i) {
  const e = ENTRIES[i];
  document.getElementById('c-code').textContent = `${code(i)} · ${e.en}`;
  document.getElementById('c-title').textContent = e.title;
  document.getElementById('c-meta').textContent = `${e.count} ${e.unit} · ${e.line}`;
  const body = document.getElementById('c-body');
  if (e.id === 'vocab' || e.id === 'today')
    body.innerHTML = `<div class="card"><strong>ephemeral</strong><span>/ɪˈfem(ə)rəl/ · adj.</span>
      <button type="button" class="reveal">翻面 · 看释义</button>
      <div class="grades"><button type="button">忘了</button><button type="button">模糊</button><button type="button">记得</button></div></div>`;
  else
    body.innerHTML = `<div class="card"><strong>${e.count}</strong><span>${e.note}</span>
      <button type="button" class="reveal">开始 · START</button></div>`;
}
function enter() {
  if (entered) return;
  const i = Math.round(target);
  target = i;
  fillContent(i);
  entered = true;
  document.getElementById('content').hidden = false;
  document.getElementById('spine').classList.add('entered');
  if (!motion()) scene?.redraw();
}
function leave() {
  if (!entered) return;
  entered = false;
  document.getElementById('content').classList.remove('on');
  document.getElementById('spine').classList.remove('entered');
  if (!motion()) scene?.redraw();
}
document.getElementById('back').onclick = leave;
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'PageDown') go(target + 1);
  else if (e.key === 'ArrowUp' || e.key === 'PageUp') go(target - 1);
  else if (e.key === 'Enter' && !e.target.closest?.('button')) enter();
  else if (e.key === 'Escape') leave();
  else return;
  e.preventDefault();
});
const motionBtn = document.getElementById('motion');
function syncMotion() {
  motionBtn.setAttribute('aria-pressed', String(motionPref));
  motionBtn.textContent = `动效 · ${motionPref ? '开' : '关'}`;
  document.body.classList.toggle('still', !motion());
  scene?.sync();
}
motionBtn.onclick = () => {
  motionPref = !motionPref;
  syncMotion();
};
scene = createScene();
if (!scene) document.getElementById('fallback').hidden = false;
syncMotion();
window.zhixuSpine = { ready: !!scene, go, enter, leave, scene };
