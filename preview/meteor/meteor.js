// 流星组装 · 小样（露娜）。只验证一件事：
//   螺旋展开以后，薄片不再停成一条大带子，而是化成细细的流星，沿着背景的测量环慢慢流动；
//   选一章，它们从环上各处飞出来，组装成这一章的模型，装好就停住，可以拖动、调参数；
//   换一章，模型先散回环里，再重新组装成下一章。
// 五个数学模型直接复用实验室 v33 的 assembly-models.js（只读引用，不改那边的文件），
// 所以每片薄片的目标位置、颜色和参数含义都和 laboratory/ 一致；这里只换「怎么走过去」。
import * as THREE from '../../vendor/three/three.module.min.js';
import { RoomEnvironment } from '../../vendor/three/RoomEnvironment.js';
import {
  ASSEMBLY_COUNT,
  MATH_MODEL_IDS,
  buildModelPoses,
} from '../../laboratory/assembly-models.js?v=34';

const N = ASSEMBLY_COUNT;
const params = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
let motionOn = params.get('motion') !== '0' && !reduce.matches;
let slow = false;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => x * x * (3 - 2 * x);
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const frac = (x) => x - Math.floor(x);
const hash = (i) => frac(Math.sin(i * 127.1 + 311.7) * 43758.5453);
const X = new THREE.Vector3(1, 0, 0);

// ---------- 画面 ----------
const canvas = document.getElementById('scene');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
} catch {
  document.body.classList.add('no-webgl');
}
const scene = new THREE.Scene();
scene.background = new THREE.Color('#121617');
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
}
const key = new THREE.DirectionalLight('#f1efe4', 2.1);
key.position.set(3, 5, 6);
const rim = new THREE.DirectionalLight('#8fb3b6', 1.1);
rim.position.set(-5, 2, -4);
scene.add(new THREE.HemisphereLight('#d3ddd6', '#1d2423', 0.55), key, rim);

// 背景的测量环：薄片在目录状态时就沿着它流动，不再单独立一条大带子
const RING_R = 2.45;
const ring = { r: RING_R, center: new THREE.Vector3(0, -0.05, -1.3) };
const ringRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.16, 0.34, 0.05));
const ringGroup = new THREE.Group();
ringGroup.position.copy(ring.center);
ringGroup.quaternion.copy(ringRot);
scene.add(ringGroup);
{
  const pts = Array.from({ length: 181 }, (_, k) => {
    const a = (k / 180) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * ring.r, Math.sin(a) * ring.r, 0);
  });
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: '#7d8f8a', transparent: true, opacity: 0.12 }),
  );
  const ticks = [];
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * Math.PI * 2,
      long = k % 8 === 0 ? 0.16 : 0.07;
    ticks.push(
      new THREE.Vector3(Math.cos(a) * (ring.r + 0.22), Math.sin(a) * (ring.r + 0.22), 0),
      new THREE.Vector3(
        Math.cos(a) * (ring.r + 0.22 + long),
        Math.sin(a) * (ring.r + 0.22 + long),
        0,
      ),
    );
  }
  const tickLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(ticks),
    new THREE.LineBasicMaterial({ color: '#7d8f8a', transparent: true, opacity: 0.09 }),
  );
  ringGroup.add(line, tickLines);
}

// 薄片和流星尾巴：同一批 288 个实例
const box = new THREE.BoxGeometry(1, 1, 1);
const slats = new THREE.InstancedMesh(
  box,
  new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.4,
    metalness: 0.22,
    clearcoat: 0.15,
  }),
  N,
);
const tails = new THREE.InstancedMesh(
  box,
  new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  N,
);
for (const m of [slats, tails]) {
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  scene.add(m);
}

// ---------- 三种「家」：螺旋、流动的环、模型 ----------
class Trefoil extends THREE.Curve {
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    return target
      .set(Math.sin(a) + 2 * Math.sin(2 * a), Math.cos(a) - 2 * Math.cos(2 * a), -Math.sin(3 * a))
      .multiplyScalar(0.43);
  }
}
const knot = (() => {
  const curve = new Trefoil(),
    frames = curve.computeFrenetFrames(N, true),
    rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0.3, -0.18)),
    basis = new THREE.Matrix4(),
    n = new THREE.Vector3(),
    b = new THREE.Vector3();
  return Array.from({ length: N }, (_, i) => {
    const t = i / N,
      a = t * Math.PI * 7;
    n.copy(frames.normals[i])
      .multiplyScalar(Math.cos(a))
      .addScaledVector(frames.binormals[i], Math.sin(a));
    b.copy(frames.normals[i])
      .multiplyScalar(-Math.sin(a))
      .addScaledVector(frames.binormals[i], Math.cos(a));
    return {
      p: curve.getPointAt(t).applyQuaternion(rest),
      q: new THREE.Quaternion()
        .setFromRotationMatrix(basis.makeBasis(n, b, frames.tangents[i]))
        .premultiply(rest),
      s: new THREE.Vector3(0.44, 0.028, 0.011),
      c: new THREE.Color('#dfded3'),
    };
  });
})();

// 流动：三股，同一个方向、快慢不同；每 11 片里有一片是亮一点、长一点的「流星」
const STREAM_COLOR = new THREE.Color('#4d5f5e'),
  STREAM_BRIGHT = new THREE.Color('#c3d3cc');
function streamPose(i, T, out) {
  const lane = i % 3,
    j = hash(i),
    bright = i % 11 === 0,
    u = frac(i * 0.6180339887 + lane * 0.11),
    speed = 0.011 + lane * 0.0035,
    a = (u + speed * T) * Math.PI * 2,
    r = ring.r + (lane - 1) * 0.07 + (j - 0.5) * 0.05;
  out.p
    .set(Math.cos(a) * r, Math.sin(a) * r, (lane - 1) * 0.06 + (j - 0.5) * 0.04)
    .applyQuaternion(ringRot)
    .add(ring.center);
  out.v.set(-Math.sin(a), Math.cos(a), 0).applyQuaternion(ringRot);
  out.q.setFromUnitVectors(X, out.v);
  out.s.set(bright ? 0.2 : 0.08 + j * 0.05, 0.005, 0.005);
  out.c.copy(bright ? STREAM_BRIGHT : STREAM_COLOR);
  out.glow = bright ? 0.45 : 0.1;
  out.speed = speed * r * Math.PI * 2;
  return out;
}

// 模型：拖动只转模型，不转背景的环
const modelCenter = new THREE.Vector3(0, 0.05, 0.2);
const modelRot = new THREE.Quaternion();
let yaw = -0.28,
  pitch = 0.12,
  goalYaw = -0.28,
  goalPitch = 0.12;
let model = null; // { id, poses, metadata, probe }
function loadModel(id, probe) {
  const r = buildModelPoses(id, probe);
  return {
    id,
    probe: probe ?? r.metadata.probeDefault,
    metadata: r.metadata,
    poses: r.poses.map((p) => ({
      active: p.scale.every((v) => v > 0),
      p: new THREE.Vector3(...p.position),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation)),
      s: new THREE.Vector3(...p.scale),
      c: new THREE.Color(p.color ?? '#deddd0'),
    })),
  };
}
function modelPose(m, i, out) {
  const p = m.poses[i];
  out.p.copy(p.p).applyQuaternion(modelRot).add(modelCenter);
  out.q.copy(modelRot).multiply(p.q);
  out.s.copy(p.s);
  out.c.copy(p.c);
  out.v.set(0, 0, 0);
  out.glow = 0;
  out.speed = 0;
  return out;
}

// ---------- 每片薄片的行程 ----------
// 一片薄片在任一时刻有一个「家」：螺旋（knot）、环（stream），或者模型里的第几个构件（model + pose）。
// 换家时排几段路（legs）。每段路从出发那一刻它实际所在的位置起飞，目标是新家「此刻」的位置
// （环一直在流动），所以中途改主意不会瞬移，只是改了目标。
const pose = () => ({
  p: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  s: new THREE.Vector3(),
  c: new THREE.Color(),
  v: new THREE.Vector3(),
  glow: 0,
  speed: 0,
});
const cur = Array.from({ length: N }, pose);
const home = Array.from({ length: N }, () => ({ kind: 'knot', model: null, pose: -1 }));
const legs = Array.from({ length: N }, () => []);
const goalScratch = pose();
let T = 0; // 虚拟时钟（秒）：慢放、暂停和测试定格都改它
let mode = 'knot',
  commandAt = 0;

function homePose(i, h, t, out) {
  if (h.kind === 'knot') {
    const k = knot[i];
    out.p.copy(k.p);
    out.q.copy(k.q);
    out.s.copy(k.s);
    out.c.copy(k.c);
    out.v.set(0, 0, 1).applyQuaternion(k.q); // 螺旋的切线：松开时顺着它剥离
    out.glow = 0;
    out.speed = 0;
    return out;
  }
  if (h.kind === 'model' && h.pose >= 0) return modelPose(h.model, h.pose, out);
  return streamPose(i, t, out);
}
const copyPose = (a, b) => {
  a.p.copy(b.p);
  a.q.copy(b.q);
  a.s.copy(b.s);
  a.c.copy(b.c);
  a.v.copy(b.v);
  a.glow = b.glow;
  a.speed = b.speed;
  return a;
};
const inModel = (h) => h.kind === 'model' && h.pose >= 0;

// 环上的「入口」：右上方。要去组装的薄片先顺着环加速流到这里，再一股一股拐进来，
// 而不是从环上四面八方同时往中间扎（那样像一场乱糟糟的流星雨）。
const GATE = Math.PI * 0.22;
const ringInv = ringRot.clone().invert();
const local = new THREE.Vector3();
function ringCoords(p) {
  local.copy(p).sub(ring.center).applyQuaternion(ringInv);
  return { a: Math.atan2(local.y, local.x), r: Math.hypot(local.x, local.y), z: local.z };
}
const TAU = Math.PI * 2;
const toGate = (a) => (((GATE - a) % TAU) + TAU) % TAU; // 顺着流动方向（角度增大）到入口还要走多远
function ringAt(a, r, z, out, v) {
  out
    .set(Math.cos(a) * r, Math.sin(a) * r, z)
    .applyQuaternion(ringRot)
    .add(ring.center);
  v?.set(-Math.sin(a), Math.cos(a), 0).applyQuaternion(ringRot);
  return out;
}

// needle：飞行途中缩成细针的程度；glow：尾巴亮度；reach：出发时顺着原方向走多远
const LEG = {
  release: { dur: 1.3, needle: 0.45, glow: 0.18, lift: 0.12, reach: 0.35 },
  furl: { dur: 0.85, needle: 0.6, glow: 0.12, lift: 0.08, reach: 0.25 },
  meteor: { dur: 0.95, needle: 0.92, glow: 0.6, lift: 0.3, reach: 0.7 },
  scatter: { dur: 0.65, needle: 0.9, glow: 0.2, lift: 0.15, reach: 0.25 },
  quick: { dur: 0.24, needle: 0, glow: 0, lift: 0, reach: 0 },
};
const FLY = 0.7; // 从入口拐进模型的那一段

function command(next, probe) {
  const was = home.map((h) => ({ ...h })),
    nextModel =
      next === 'knot' || next === 'stream'
        ? null
        : loadModel(next, probe ?? (model?.id === next ? model.probe : undefined));
  const sameModel = !!nextModel && model?.id === nextModel.id && mode === next,
    switching = !!nextModel && !!model && !sameModel;
  commandAt = T;
  const travelling = legs.map((l) => l.length > 0 && T >= l[0].at);

  // 谁去当哪一个构件：模型按构件顺序搭（底座、坐标轴在前），离入口越近的薄片领越靠前的构件，
  // 先到先搭。调参数时还留着的构件不换人；多出来的构件从环上补。
  const assign = new Int16Array(N).fill(-1);
  const order = [];
  let need = 0;
  if (nextModel) {
    const kept = new Set();
    if (sameModel)
      was.forEach((h, i) => {
        if (inModel(h) && nextModel.poses[h.pose].active) {
          assign[i] = h.pose;
          kept.add(h.pose);
        }
      });
    const poses = [];
    nextModel.poses.forEach((p, k) => p.active && !kept.has(k) && poses.push(k));
    const free = [];
    for (let i = 0; i < N; i++) {
      if (assign[i] >= 0) continue;
      const h = was[i],
        onRing = h.kind === 'stream' || (h.kind === 'model' && h.pose < 0);
      const key = onRing && !travelling[i] ? toGate(ringCoords(cur[i].p).a) / TAU : 2 + hash(i);
      free.push([key, i]);
    }
    free.sort((x, y) => x[0] - y[0]);
    poses.forEach((k, r) => {
      const i = free[r][1];
      assign[i] = k;
      order[i] = r;
    });
    need = poses.length || 1;
  }

  for (let i = 0; i < N; i++) {
    const before = was[i],
      after = {
        kind: next === 'knot' ? 'knot' : nextModel ? 'model' : 'stream',
        model: nextModel,
        pose: assign[i],
      };
    home[i] = after;
    const fromModel = inModel(before),
      toModel = inModel(after),
      j = hash(i + 7),
      stay = travelling[i] ? null : before,
      plan = (list) =>
        (legs[i] = list.map((leg, k) => ({ ...leg, from: null, stay: k === 0 ? stay : null })));
    if (!motionOn) {
      plan([]);
      continue;
    }
    const rank = order[i] / need;
    if (after.kind === 'knot') {
      plan([{ type: 'furl', at: T + (i / N) * 1.3 }]); // 收拢：按螺旋的顺序一片接一片织回去
    } else if (before.kind === 'knot') {
      // 展开：沿着螺旋的顺序一片片松开，汇进环里；如果直接选了章，再从环里飞去组装
      const release = { type: 'release', at: T + (i / N) * 1.1 };
      plan(toModel ? [release, { type: 'meteor', at: T + 2.5 + rank * 0.3 }] : [release]);
    } else if (sameModel && fromModel && toModel && before.pose === after.pose) {
      plan([{ type: 'quick', at: T }]); // 只是调参数：原地挪一点，不再飞一遍
    } else if (fromModel && toModel) {
      // 环上的人手不够时，旧模型的构件也会被叫来：先散回环里，再从入口飞进来
      plan([
        { type: 'scatter', at: T + j * 0.22 },
        { type: 'meteor', at: T + 0.75 + rank * 0.3 },
      ]);
    } else if (fromModel) {
      plan([{ type: 'scatter', at: T + j * 0.22 }]); // 换章：旧模型先散回环里
    } else if (toModel) {
      plan([{ type: 'meteor', at: T + (switching ? 0.45 : 0) + rank * 0.3 }]);
    } else plan([]);
  }
  mode = next;
  model = nextModel;
  ui();
  kick();
}

// 一段路：三次贝塞尔。起点先顺着原来的运动方向走一点，终点从上方落下。
const c1 = new THREE.Vector3(),
  c2 = new THREE.Vector3(),
  g0 = new THREE.Vector3(),
  gv = new THREE.Vector3(),
  prevP = new THREE.Vector3(),
  vel = new THREE.Vector3(),
  qVel = new THREE.Quaternion(),
  bright = new THREE.Color('#f1f3ea'),
  needle = new THREE.Vector3();
function bezier(a, b, c, d, t, out) {
  const s = 1 - t;
  return out
    .copy(a)
    .multiplyScalar(s * s * s)
    .addScaledVector(b, 3 * s * s * t)
    .addScaledVector(c, 3 * s * t * t)
    .addScaledVector(d, t * t * t);
}
// 出发那一刻记下这段路的形状：从环上出发的流星，先算它要沿环走多远才到入口
function prepare(leg, from) {
  leg.from = copyPose(pose(), from);
  leg.dur = LEG[leg.type].dur;
  if (leg.type !== 'meteor') return;
  const onRing = leg.stay?.kind === 'stream' || (leg.stay?.kind === 'model' && leg.stay.pose < 0);
  const c = ringCoords(from.p);
  if (!onRing && Math.abs(c.r - ring.r) > 0.3) return; // 不在环上（从螺旋、旧模型过来）：直接飞
  leg.ring = { a: c.a, r: c.r, z: c.z, d: toGate(c.a) };
  leg.ringDur = 0.15 + (leg.ring.d / TAU) * 0.8;
  leg.dur = leg.ringDur + FLY;
}
function shape(out, F, goal, w, cfg, e) {
  out.s.copy(F.s).lerp(goal.s, e);
  needle.set(0.12 + 0.24 * w, 0.007, 0.007);
  out.s.lerp(needle, cfg.needle * w ** 0.6);
  out.c
    .copy(F.c)
    .lerp(goal.c, e)
    .lerp(bright, 0.55 * w * cfg.needle);
}
function align(out, F, goal, e, w) {
  out.q.copy(F.q).slerp(goal.q, e);
  if (vel.lengthSq() > 1e-9) {
    qVel.setFromUnitVectors(X, vel.clone().normalize());
    out.q.slerp(qVel, w * 0.92);
  }
  out.v.copy(vel).normalize();
}
function travel(leg, goal, t, out) {
  const cfg = LEG[leg.type],
    F = leg.from;
  if (leg.type === 'quick') {
    const e = smooth(clamp01(t / leg.dur));
    out.p.copy(F.p).lerp(goal.p, e);
    out.q.copy(F.q).slerp(goal.q, e);
    out.s.copy(F.s).lerp(goal.s, e);
    out.c.copy(F.c).lerp(goal.c, e);
    out.glow = 0;
    return out;
  }
  if (leg.ring) {
    const R = leg.ring;
    if (t < leg.ringDur) {
      // 沿着环加速流向入口，越流越亮、越长
      const u = clamp01(t / leg.ringDur),
        a = R.a + R.d * u ** 1.7;
      ringAt(a, R.r, R.z, out.p, out.v);
      ringAt(R.a + R.d * Math.max(0, u - 0.03) ** 1.7, R.r, R.z, prevP);
      vel.copy(out.p).sub(prevP);
      out.q.setFromUnitVectors(X, out.v);
      needle.set(0.1 + 0.26 * u, 0.006, 0.006);
      out.s.copy(F.s).lerp(needle, smooth(u));
      out.c.copy(F.c).lerp(bright, 0.6 * u);
      out.glow = 0.1 + 0.55 * u;
      out.speed = vel.length() * 30;
      return out;
    }
    // 从入口拐进来：先顺着环的方向冲出去一小段，再弯向自己的位置
    const u = clamp01((t - leg.ringDur) / FLY),
      e = 1 - (1 - u) ** 2.4;
    ringAt(GATE, R.r, R.z, g0, gv);
    c1.copy(g0).addScaledVector(gv, 0.9);
    c2.copy(goal.p).add(vel.set(0.35, cfg.lift, 0.2));
    bezier(g0, c1, c2, goal.p, e, out.p);
    bezier(g0, c1, c2, goal.p, Math.max(0, e - 0.04), prevP);
    vel.copy(out.p).sub(prevP);
    const w = (1 - u) ** 0.7;
    align(out, { q: new THREE.Quaternion().setFromUnitVectors(X, gv) }, goal, e, w);
    out.s.copy(goal.s);
    needle.set(0.36, 0.007, 0.007);
    out.s.lerp(needle, (1 - smooth(clamp01((u - 0.8) / 0.2))) * 0.97); // 落到位置上才绽开
    out.c.copy(bright).lerp(goal.c, smooth(u));
    out.glow = 0.65 * w;
    out.speed = vel.length() * 25;
    return out;
  }
  const k = clamp01(t / leg.dur),
    e = leg.type === 'meteor' ? inOut(k) : smooth(k),
    dir = F.v.lengthSq() > 1e-6 ? F.v : vel.set(0, 1, 0),
    span = F.p.distanceTo(goal.p);
  c1.copy(F.p)
    .addScaledVector(dir, Math.min(1.1, cfg.reach + span * 0.25))
    .add(vel.set(0, cfg.lift, cfg.lift * 0.5));
  // 散开、松开：先往外让一点，再汇进环里
  if (leg.type === 'scatter' || leg.type === 'release')
    c1.addScaledVector(vel.copy(F.p).sub(modelCenter).normalize(), 0.45);
  c2.copy(goal.p)
    .addScaledVector(vel.copy(F.p).sub(goal.p), 0.22)
    .add(vel.set(0, cfg.lift * 0.8, cfg.lift * 0.4));
  bezier(F.p, c1, c2, goal.p, e, out.p);
  bezier(F.p, c1, c2, goal.p, Math.max(0, e - 0.04), prevP);
  vel.copy(out.p).sub(prevP);
  const w = Math.sin(Math.PI * k) ** 0.8;
  align(out, F, goal, e, w);
  // 途中先缩成一根细针（不管原来是长坐标轴还是大方块），到了再绽开成自己的形状
  shape(out, F, goal, w, cfg, e);
  out.glow = Math.max(goal.glow * e, w * cfg.glow);
  out.speed = vel.length() * 25;
  return out;
}

// ---------- 每帧 ----------
const m4 = new THREE.Object3D(),
  tailColor = new THREE.Color(),
  zero = new THREE.Vector3();
function step() {
  let busy = false;
  for (let i = 0; i < N; i++) {
    const out = cur[i],
      list = legs[i];
    // 下一段到了出发时间：上一段不管走没走完，从当前位置接着走
    while (list.length > 1 && T >= list[1].at) list.shift();
    const leg = list[0];
    if (leg && T >= leg.at) {
      if (!leg.from) prepare(leg, out);
      const t = T - leg.at;
      // 两段路时，第一段的目标是环（换章时先散回去）
      homePose(i, list.length > 1 ? { kind: 'stream' } : home[i], T, goalScratch);
      // 到站的这一帧直接用家里的姿态，尾巴不会沿着最后一段飞行方向斜出去
      if (t >= leg.dur && list.length === 1) {
        list.shift();
        copyPose(out, goalScratch);
      } else travel(leg, goalScratch, Math.min(t, leg.dur), out);
      busy = true;
    } else if (leg) {
      // 还没轮到出发：留在原来的家里（在环上就继续跟着流）；半路被改了主意的，先停在原处
      if (leg.stay) homePose(i, leg.stay, T, out);
      busy = true;
    } else homePose(i, home[i], T, out);
    m4.position.copy(out.p);
    m4.quaternion.copy(out.q);
    m4.scale.copy(out.s);
    m4.updateMatrix();
    slats.setMatrixAt(i, m4.matrix);
    slats.setColorAt(i, out.c);
    // 尾巴：沿运动方向拖在后面，亮度随这一段的状态
    const glow = motionOn ? out.glow : 0;
    if (glow > 0.02 && out.v.lengthSq() > 1e-6) {
      const len = 0.12 + Math.min(0.5, out.speed * 0.07);
      m4.position.copy(out.p).addScaledVector(out.v, -len / 2);
      m4.quaternion.setFromUnitVectors(X, out.v);
      m4.scale.set(len, 0.009, 0.009);
      m4.updateMatrix();
      tails.setMatrixAt(i, m4.matrix);
      tails.setColorAt(i, tailColor.set('#8fb0ab').multiplyScalar(glow));
    } else {
      m4.scale.copy(zero);
      m4.updateMatrix();
      tails.setMatrixAt(i, m4.matrix);
      tails.setColorAt(i, tailColor.setRGB(0, 0, 0));
    }
  }
  slats.instanceMatrix.needsUpdate = true;
  tails.instanceMatrix.needsUpdate = true;
  if (slats.instanceColor) slats.instanceColor.needsUpdate = true;
  if (tails.instanceColor) tails.instanceColor.needsUpdate = true;
  return busy;
}

// ---------- 循环 ----------
let raf = 0,
  last = 0,
  frozen = false;
function frame(now) {
  raf = 0;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
  last = now;
  if (!frozen && motionOn) T += dt * (slow ? 0.25 : 1);
  yaw += (goalYaw - yaw) * (motionOn ? 1 - Math.exp(-dt * 10) : 1);
  pitch += (goalPitch - pitch) * (motionOn ? 1 - Math.exp(-dt * 10) : 1);
  modelRot.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  const busy = step();
  renderer?.render(scene, camera);
  // 环上一直有薄片在流动：动效开着就一直画；关着就停在这一帧
  if (motionOn && !frozen && (busy || mode !== 'knot')) raf = requestAnimationFrame(frame);
  else last = 0;
}
function kick() {
  if (!raf) raf = requestAnimationFrame(frame);
}
function resize() {
  const w = innerWidth,
    h = innerHeight;
  renderer?.setSize(w, h, false);
  camera.aspect = w / h;
  const narrow = w / h < 0.9;
  camera.fov = narrow ? 40 : 32;
  // 手机：画面往上让出底部的章节条；电脑：模型在中间，左右是目录和读数
  camera.position.set(0, narrow ? -0.9 : 0.25, narrow ? 10.8 : 8.4);
  camera.lookAt(0, narrow ? -0.85 : -0.05, 0);
  camera.updateProjectionMatrix();
  // 手机上环小一圈，整圈都留在屏幕里（在模型后面，不挡模型）
  ring.r = RING_R * (narrow ? 0.78 : 1);
  ringGroup.scale.setScalar(ring.r / RING_R);
  kick();
}
addEventListener('resize', resize);

// ---------- 拖动旋转模型 ----------
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (!model) return;
  drag = { x: e.clientX, y: e.clientY, yaw: goalYaw, pitch: goalPitch };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  goalYaw = drag.yaw + (e.clientX - drag.x) * 0.008;
  goalPitch = Math.max(-0.6, Math.min(0.7, drag.pitch + (e.clientY - drag.y) * 0.006));
  kick();
});
const endDrag = () => (drag = null);
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ---------- 界面 ----------
const $ = (s) => document.querySelector(s);
const list = $('#chapter-list'),
  readout = $('#readout'),
  probe = $('#probe');
const TITLES = MATH_MODEL_IDS.map((id) => [id, buildModelPoses(id).metadata.title]);
list.innerHTML = TITLES.map(
  ([id, title], k) =>
    `<li><button type="button" data-go="${id}"><small>0${k + 1}</small><span>${title}</span></button></li>`,
).join('');
function ui() {
  document.body.dataset.mode = model ? 'model' : mode;
  document.querySelectorAll('[data-go]').forEach((b) => {
    const on = b.dataset.go === mode;
    b.setAttribute('aria-pressed', String(on));
  });
  readout.hidden = !model;
  if (!model) return;
  const m = model.metadata;
  $('#readout-title').textContent = m.title;
  $('#readout-desc').textContent = m.description;
  $('#probe-label').textContent = m.probeLabel;
  Object.assign(probe, { min: m.probeMin, max: m.probeMax, step: m.probeStep });
  probe.value = model.probe;
  $('#probe-value').textContent = m.readout;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) command(b.dataset.go);
});
probe.addEventListener('input', () => {
  if (model) command(model.id, Number(probe.value));
});
const motionBtn = $('#motion'),
  slowBtn = $('#slow');
function tools() {
  motionBtn.setAttribute('aria-pressed', String(motionOn));
  motionBtn.textContent = '动效 · ' + (motionOn ? '开' : '关');
  slowBtn.setAttribute('aria-pressed', String(slow));
  slowBtn.disabled = !motionOn;
}
motionBtn.onclick = () => {
  motionOn = !motionOn;
  if (!motionOn) legs.forEach((l) => (l.length = 0));
  tools();
  kick();
};
slowBtn.onclick = () => {
  slow = !slow;
  tools();
};
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input')) return;
  const order = ['stream', ...MATH_MODEL_IDS],
    k = order.indexOf(mode);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = Math.max(1, (k < 0 ? 0 : k) + (e.key === 'ArrowDown' ? 1 : -1));
    command(order[Math.min(order.length - 1, n)]);
  } else if (e.key === 'Escape') command(mode === 'stream' ? 'knot' : 'stream');
  else if (e.key.toLowerCase() === 'k') command('knot');
});

// 测试用：定格在最近一次操作后的第 s 秒（不传就恢复播放）
window.zxMeteor = {
  go: (id, value) => command(id, value),
  seek(s) {
    if (s === undefined) {
      frozen = false;
      kick();
      return;
    }
    frozen = true;
    T = commandAt + s;
    cancelAnimationFrame(raf);
    raf = 0;
    frame(performance.now());
  },
  get state() {
    return {
      mode,
      model: model?.id || null,
      moving: legs.filter((l) => l.length).length,
      t: +(T - commandAt).toFixed(2),
    };
  },
};

tools();
resize();
for (let i = 0; i < N; i++) homePose(i, home[i], T, cur[i]);
ui();
const start = params.get('start');
if (start === 'stream' || MATH_MODEL_IDS.includes(start)) command(start);
kick();
