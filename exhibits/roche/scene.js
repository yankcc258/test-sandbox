// 双行星洛希展品的碎屑积分和画面（猫猫）。物理公式在 binary.js；这里决定东西怎么算得快、看起来怎样。
// 碎屑：几十万粒试验粒子，只受两颗行星的引力（圆型限制性三体问题），在显卡上每帧推进；
// 没有浮点渲染目标时改在 CPU 上推进少一些的粒子。
// 画面：背景（星空、恒星、两颗按等势面逐像素求交的行星和它们的大气）→ 碎屑的微光 → 高动态范围辉光、镜头拉丝和胶片曲线。
// 机位在星系里面、贴着行星，所以行星表面的细节按离镜头的远近分层淡入。
import { ROCHE_GLSL, PARTICLE_GLSL, roche, accel, axes } from './binary.js?v=1';

export const STREAM_EVERY = 6; // 每 6 粒里有 1 粒是「从行星尖端被扯出来的」，其余是行星带

const QUAD = `#version 300 es
in vec2 p;
out vec2 v_uv;
void main() { v_uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const HASH = `
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rnd(inout uint state) { state = pcg(state); return float(state) / 4294967296.0; }
`;

// 一步：先踢后漂。pos.w 是种类（0 行星带，1 从烛阴扯出来的，2 从望舒扯出来的，3 待命），vel.w 是出生以来的时间。
export const DUST_STEP = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_pos, u_vel;
uniform ivec2 u_size;
uniform float u_theta, u_dt, u_mu, u_emit;
uniform vec2 u_level, u_reach, u_tip; // 两颗行星的表面等势值、包围半径、朝向对方的尖端位置（x = 烛阴，y = 望舒）
uniform uint u_seed;
layout(location = 0) out vec4 o_pos;
layout(location = 1) out vec4 o_vel;
${ROCHE_GLSL}
${PARTICLE_GLSL}
${HASH}
void main() {
  ivec2 me = ivec2(gl_FragCoord.xy);
  int index = me.y * u_size.x + me.x;
  bool stream = index % ${STREAM_EVERY} == 0;
  vec4 p = texelFetch(u_pos, me, 0), v = texelFetch(u_vel, me, 0);
  uint state = uint(index) * 2654435761u + u_seed * 40503u;
  float theta = u_theta + u_dt;
  vec3 e1 = vec3(cos(theta), 0.0, sin(theta)), e2 = vec3(-sin(theta), 0.0, cos(theta));
  bool respawn = false;
  if (p.w < 2.5) {
    vec3 was = vec3(cos(u_theta), 0.0, sin(u_theta));
    vec3 nv = v.xyz + pull(p.xyz, was, u_mu) * u_dt;
    vec3 np = p.xyz + nv * u_dt;
    vec3 q = vec3(dot(np, e1), np.y, dot(np, e2));
    float value = roche(q, u_mu);
    // 哪一颗：看在两个尖端中间那个面的哪一侧（同一个势值在对面那颗行星里也围着一圈等值面）
    float mid = 0.5 * (u_tip.x + u_tip.y);
    bool hit = (q.x < mid && length(q + vec3(u_mu, 0.0, 0.0)) < u_reach.x && value > u_level.x)
            || (q.x > mid && length(q - vec3(1.0 - u_mu, 0.0, 0.0)) < u_reach.y && value > u_level.y);
    if (hit || dot(np, np) > (stream ? 22.0 : 49.0)) respawn = true; // 落到行星上，或者被甩远了
    else { o_pos = vec4(np, p.w); o_vel = vec4(nv, v.w + u_dt); return; }
  }
  if (stream) {
    // 从尖端扯出来的碎屑：尖端伸得够近（u_emit > 0）才会有新的被扯出来，否则先待命
    if (rnd(state) >= u_emit) { o_pos = vec4(0.0, 0.0, 0.0, 3.0); o_vel = vec4(0.0); return; }
    bool fromB = (index / ${STREAM_EVERY}) % 2 == 1;
    float tip = fromB ? u_tip.y : u_tip.x, toward = fromB ? -1.0 : 1.0, reach = fromB ? u_reach.y : u_reach.x;
    float spread = 0.07 * reach * sqrt(rnd(state)), angle = 6.2831853 * rnd(state);
    vec3 q = vec3(tip + toward * 0.004, spread * cos(angle), spread * sin(angle));
    vec3 at = q.x * e1 + q.y * vec3(0.0, 1.0, 0.0) + q.z * e2;
    // 跟着行星表面一起转，再加向外的速度（示意）：多数很慢，直接落向对方；少数快的会绕着行星甩出一道弧
    float fast = pow(rnd(state), 3.0), sideways = rnd(state) < 0.5 ? -1.0 : 1.0;
    vec3 kick = vec3(toward * (0.02 + 0.10 * rnd(state)), 0.10 * (rnd(state) - 0.5), sideways * (0.03 + 0.42 * fast) + 0.06 * (rnd(state) - 0.5));
    o_pos = vec4(at, fromB ? 2.0 : 1.0);
    o_vel = vec4(vec3(-at.z, 0.0, at.x) + kick.x * e1 + kick.y * vec3(0.0, 1.0, 0.0) + kick.z * e2, 0.0);
  } else {
    // 行星带的内缘不稳定，碎屑不断被扯走；补回来的碎屑放在内缘（示意：当作带子自己在慢慢向内扩散）
    float r = mix(1.85, 2.3, rnd(state)), angle = 6.2831853 * rnd(state);
    vec3 at = vec3(r * cos(angle), 0.006 * r * (rnd(state) + rnd(state) - 1.0), r * sin(angle));
    o_pos = vec4(at, 0.0);
    o_vel = vec4(sqrt(1.0 / r) * vec3(-sin(angle), 0.0, cos(angle)), 0.0);
  }
}`;

// ---------- 画面用的着色器 ----------
const COMMON = `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float sum = 0.0, weight = 0.5;
  for (int i = 0; i < 5; i++) { sum += weight * noise3(p); p = p * 2.03 + 11.7; weight *= 0.5; }
  return sum;
}
// 贴近了看也要有细节：最多 9 层，比一个像素还细的层淡出（fp 是一个像素在 p 这套坐标里有多大）
float fbmG(vec3 p, float fp, int layers, float gain) {
  float sum = 0.0, weight = 1.0 - gain, scale = 1.0;
  for (int i = 0; i < layers; i++) {
    float fade = 1.0 - smoothstep(0.22, 0.6, fp * scale);
    if (fade <= 0.0) break;
    sum += weight * fade * (noise3(p) - 0.5);
    p = p * 2.03 + 11.7; weight *= gain; scale *= 2.03;
  }
  return 0.5 + sum;
}
float fbmL(vec3 p, float fp, int layers) { return fbmG(p, fp, layers, 0.5); }
vec3 filmic(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
uniform float u_direct;
vec3 finish(vec3 c) { return u_direct > 0.5 ? pow(filmic(c), vec3(1.0 / 2.2)) : c; }
`;

const BACK_FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 u_eye, u_right, u_up, u_fwd, u_sun;
uniform vec2 u_tan, u_res, u_level, u_reach, u_tip;
uniform mat4 u_vp;
uniform float u_theta, u_mu, u_heat, u_bridge, u_time, u_steps, u_pixel;
uniform vec2 u_radii;
out vec4 o;
${COMMON}
${ROCHE_GLSL}
vec3 sky(vec3 rd) {
  vec3 col = vec3(0.0);
  const vec3 pole = vec3(0.30, 0.90, -0.32);
  float off = dot(rd, pole), band = exp(-off * off * 12.0);
  for (int layer = 0; layer < 3; layer++) {
    float scale = layer == 0 ? 90.0 : layer == 1 ? 190.0 : 380.0;
    vec3 g = rd * scale, cell = floor(g);
    vec3 at = cell + 0.2 + 0.6 * vec3(hash13(cell), hash13(cell + 17.3), hash13(cell + 41.7));
    float pick = hash13(cell + 7.7), need = mix(0.80, 0.55, band);
    if (pick < need) continue;
    float glow = smoothstep(0.12, 0.0, length(g - at));
    vec3 tint = mix(vec3(0.66, 0.78, 1.0), vec3(1.0, 0.84, 0.62), hash13(cell + 3.1));
    float power = (pick - need) / (1.0 - need);
    col += tint * glow * (layer == 0 ? 1.2 : layer == 1 ? 0.7 : 0.3) * (0.15 + power * power * 1.4);
  }
  float cloud = fbm(rd * 3.1 + 4.0) * fbm(rd * 8.3);
  float lane = smoothstep(0.42, 0.62, fbm(rd * 5.7 + 9.0)) * band;
  col += vec3(0.42, 0.50, 0.68) * band * (0.012 + 0.20 * cloud * cloud);
  col += vec3(0.75, 0.52, 0.36) * band * band * 0.026 * fbm(rd * 2.2);
  // 两片很淡的星云，一片青、一片洋红，给夜空一点颜色
  float veil = fbm(rd * 1.7 + 2.0);
  col += vec3(0.04, 0.24, 0.30) * pow(veil, 3.0) * 0.16;
  col += vec3(0.34, 0.05, 0.22) * pow(fbm(rd * 2.3 - 5.0), 4.0) * 0.30;
  return col * (1.0 - 0.7 * lane);
}
// 沿视线找行星表面。行星是有效势的等值面：用「势差 / 梯度」估计离表面还有多远，按这个距离往前走，越贴近走得越细；
// 越过表面就二分。gap 记下一路上离表面最近时的高度（以两星间距为单位），at 是那一刻沿视线走了多远——给大气用。
float surface(vec3 ro, vec3 rd, vec3 center, float reach, float level, out float gap, out float at) {
  gap = 1e3;
  at = 0.0;
  vec3 oc = ro - center;
  float b = dot(oc, rd), c = dot(oc, oc) - reach * reach * 1.08, h = b * b - c;
  if (h < 0.0) return -1.0;
  h = sqrt(h);
  float t = max(-b - h, 0.0), t1 = -b + h;
  if (t1 <= t) return -1.0;
  // 只在两个尖端中间那个面的这一侧找：同一个势值在对面那颗行星里也围着一圈等值面，不能把它当成这一颗
  float side = center.x < 0.5 * (u_tip.x + u_tip.y) ? 1.0 : -1.0;
  float room = (0.5 * (u_tip.x + u_tip.y) - ro.x) * side, lean = rd.x * side;
  if (lean > 1e-6) t1 = min(t1, room / lean);
  else if (lean < -1e-6) t = max(t, room / lean);
  else if (room < 0.0) return -1.0;
  if (t1 <= t) return -1.0;
  float before = t;
  for (float i = 0.0; i < u_steps; i += 1.0) {
    vec3 q = ro + rd * t;
    float f = level - roche(q, u_mu);
    if (f < 0.0) {
      float lo = before, hi = t;
      for (int k = 0; k < 9; k++) {
        float mid = 0.5 * (lo + hi);
        if (level - roche(ro + rd * mid, u_mu) < 0.0) hi = mid; else lo = mid;
      }
      gap = 0.0;
      at = 0.5 * (lo + hi);
      return at;
    }
    vec3 g = rocheGradient(q, u_mu);
    float height = f / sqrt(dot(g, g) + 12.0 * f);
    if (height < gap) { gap = height; at = t; }
    before = t;
    t += clamp(0.6 * height, 0.0012 + 0.005 * t, 0.05);
    if (t > t1) break;
  }
  if (gap < 0.25) {
    float lo = max(at - 0.06, 0.0), hi = min(at + 0.06, t1);
    for (int k = 0; k < 6; k++) {
      float a = mix(lo, hi, 0.382), b = mix(lo, hi, 0.618);
      vec3 qa = ro + rd * a, qb = ro + rd * b;
      vec3 ga = rocheGradient(qa, u_mu), gb = rocheGradient(qb, u_mu);
      float fa = max(level - roche(qa, u_mu), 0.0), fb = max(level - roche(qb, u_mu), 0.0);
      if (fa / sqrt(dot(ga, ga) + 12.0 * fa) < fb / sqrt(dot(gb, gb) + 12.0 * fb)) hi = b; else lo = a;
    }
    at = 0.5 * (lo + hi);
    vec3 q = ro + rd * at, g = rocheGradient(q, u_mu);
    float f = max(level - roche(q, u_mu), 0.0);
    gap = f / sqrt(dot(g, g) + 12.0 * f + 1e-9);
  }
  return -1.0;
}
// 把空间切成一格格不规则的小块，返回离最近的块缝有多远：用来画裂成一块块的地壳
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float plates(vec3 p) {
  vec3 cell = floor(p), f = fract(p);
  float first = 8.0, second = 8.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z)), r = g + hash33(cell + g) - f;
    float d = dot(r, r);
    if (d < first) { second = first; first = d; } else if (d < second) second = d;
  }
  return sqrt(second) - sqrt(first);
}
// 一道缝：比一个像素还细的时候不让它闪，画成一个像素宽、相应地变淡
float seam(float edge, float width, float pixel) {
  float w = max(width, pixel * 1.5);
  return (1.0 - smoothstep(0.0, w, edge)) * width / w;
}
// 烛阴：干热的岩石行星，潮汐把地壳扯成一块块的板，板缝里是熔岩；越靠近朝着望舒的尖端裂得越宽、越亮。
// glow 是板缝自己发的光（亮度是示意）。
vec3 zhuyin(vec3 d, float tipward, float fp, vec3 slope, out vec3 glow) {
  float plains = fbmL(d * 8.0 + 3.0, fp * 8.0, 6), tone = fbmG(d * 6.0 + 13.0, fp * 6.0, 9, 0.6);
  float rough = fbmL(d * 40.0 + 5.0, fp * 40.0, 7);
  float lifted = fbmL(d * 40.0 + 5.0 + slope * 0.10, fp * 40.0, 5);
  float grit = fbmL(d * 170.0 + 2.0, fp * 170.0, 6), gritLifted = fbmL(d * 170.0 + 2.0 + slope * 0.10, fp * 170.0, 4);
  float fine = fbmL(d * 800.0 + 4.0, fp * 800.0, 5) - fbmL(d * 800.0 + 4.0 + slope * 0.10, fp * 800.0, 4);
  float relief = clamp(1.0 + (rough - lifted) * 8.0 + (grit - gritLifted) * 9.0 + fine * 9.0, 0.3, 1.7);
  vec3 rock = mix(vec3(0.21, 0.155, 0.125), vec3(0.36, 0.275, 0.20), smoothstep(0.15, 0.85, tone));
  rock *= 0.82 + 0.36 * rough;
  vec3 warped = d + 0.05 * (vec3(fbmL(d * 9.0, fp * 9.0, 4), fbmL(d * 9.0 + 31.0, fp * 9.0, 4), fbmL(d * 9.0 + 67.0, fp * 9.0, 4)) - 0.5);
  float near = pow(smoothstep(0.86, 1.0, tipward), 1.5);
  // 三层：大板、小板、贴近才看得见的碎纹。板很小、很多——一块大板也有几百千米宽
  float rift = seam(plates(warped * 44.0), 0.016 + 0.11 * near, fp * 44.0);
  float net = seam(plates(warped * 150.0 + 3.0), 0.024 + 0.08 * near, fp * 150.0);
  float hair = seam(plates(warped * 520.0 + 9.0), 0.06, fp * 520.0) * (1.0 - smoothstep(0.2, 0.6, fp * 520.0));
  float pulse = 0.65 + 0.35 * sin(u_time * 0.7 + plains * 20.0);
  float region = smoothstep(0.42, 0.62, plains + 0.25 * near); // 有的地方裂得厉害，有的地方是整块的旧地壳
  float ember = exp(-plates(warped * 44.0) * 7.0) * (1.0 - smoothstep(0.3, 0.9, fp * 44.0)); // 板缝两边被烤热的一圈
  float molten = (rift * (0.22 + 0.9 * near) + net * (0.07 + 0.6 * near) + hair * (0.03 + 0.35 * near) + ember * (0.05 + 0.35 * near)) * (0.12 + 0.88 * max(region, near));
  glow = (vec3(2.4, 0.50, 0.07) * molten + vec3(1.8, 1.1, 0.45) * rift * rift * near * near) * u_heat * pulse * 1.2;
  return rock * relief * (1.0 - 0.7 * min(molten * 1.5, 1.0));
}
// 望舒：冰和海的行星，云被潮汐沿连线方向拉成长条。clouds 是云量，wet 是露出来的海面（给反光用）。
vec3 wangshu(vec3 d, vec3 n, float tipward, float fp, vec3 slope, out float clouds, out float wet) {
  vec3 stretched = vec3(d.x * mix(1.0, 0.6, tipward), d.y, d.z);
  float warp = fbmL(stretched * 4.0 + 1.7, fp * 4.0, 4);
  vec3 cp = stretched * 9.0 + warp * 2.6 + vec3(0.0, 0.0, u_time * 0.004);
  float puffs = 0.10 * (fbmG(d * 75.0 + 40.0, fp * 75.0, 6, 0.6) - 0.5) + 0.07 * (fbmG(d * 330.0 + 12.0, fp * 330.0, 5, 0.6) - 0.5);
  float cover = fbmG(cp, fp * 9.0, 9, 0.62) + puffs, toward = fbmG(cp + slope * 0.16, fp * 9.0, 7, 0.62) + puffs;
  clouds = smoothstep(0.475, 0.575, cover);
  float shadow = smoothstep(0.475, 0.575, toward);
  float land = smoothstep(0.525, 0.560, fbmG(d * 3.3 + 20.0, fp * 3.3, 9, 0.56));
  float depth = fbmL(d * 9.0, fp * 9.0, 5);
  vec3 sea = mix(vec3(0.008, 0.045, 0.13), vec3(0.03, 0.22, 0.30), smoothstep(0.35, 0.75, depth));
  sea *= 0.85 + 0.3 * fbmL(d * 140.0 + 9.0, fp * 140.0, 5);
  vec3 soil = mix(vec3(0.20, 0.24, 0.22), vec3(0.70, 0.76, 0.80), smoothstep(0.35, 0.65, fbmG(d * 31.0 + 5.0, fp * 31.0, 7, 0.6)));
  vec3 ground = mix(sea, soil, land);
  float ice = smoothstep(0.70, 0.90, abs(n.y) + 0.10 * (depth - 0.5));
  ground = mix(ground, vec3(0.86, 0.92, 0.97), ice);
  wet = (1.0 - land) * (1.0 - ice) * (1.0 - clouds);
  // 云顶：朝着恒星那一侧的云更厚就更暗一点，显出起伏；云把影子投在地面上
  float body = clamp(0.82 + (cover - toward) * 3.2, 0.42, 1.2);
  return mix(ground * (1.0 - 0.6 * shadow * (1.0 - clouds)), vec3(0.94, 0.97, 1.0) * body, clouds * 0.94);
}
// 行星带：轨道面里一圈很薄的碎屑盘。半径方向的疏密和 seedDust 里撒碎屑用的是同一个函数，再叠一层更细的环缝（示意）。
// 斜着看穿过的碎屑多，所以越接近侧视越亮、越不透明。limit 是视线打到行星的距离（没打到就是负的）。
float ringlets(float r) {
  return 0.18 + 0.82 * pow(0.5 + 0.5 * sin(r * 9.0 + 1.3 * sin(r * 3.1)), 2.0) * (0.6 + 0.4 * sin(r * 23.0 + 2.0));
}
float shadeAt(vec3 p, vec3 center, float radius, vec3 sun) {
  vec3 d = p - center;
  float along = dot(d, sun);
  return along < 0.0 ? smoothstep(radius * 0.94, radius * 1.05, length(d - along * sun)) : 1.0;
}
vec4 belt(vec3 ro, vec3 dir, vec3 sun, float facing, float limit) {
  if (abs(dir.y) < 1e-5) return vec4(0.0);
  float s = -ro.y / dir.y;
  if (s <= 0.0 || (limit > 0.0 && s > limit)) return vec4(0.0);
  vec3 p = ro + dir * s;
  float r = length(p.xz);
  float band = smoothstep(1.95, 2.5, r) * (1.0 - smoothstep(4.3, 5.6, r));
  if (band <= 0.0) return vec4(0.0);
  float pixel = s * u_pixel / max(abs(dir.y), 0.03); // 一个像素在半径方向上盖住多宽：比它还细的环缝淡出
  float fine = 1.0 - 0.30 * (0.5 + 0.5 * sin(r * 150.0 + 4.0 * sin(r * 13.0))) * (1.0 - smoothstep(0.004, 0.02, pixel));
  float hair = 1.0 - 0.25 * (0.5 + 0.5 * sin(r * 900.0 + 6.0 * sin(r * 61.0))) * (1.0 - smoothstep(0.0007, 0.0035, pixel));
  float dens = ringlets(r) * fine * hair * band;
  float alpha = 1.0 - exp(-dens * 0.20 / max(abs(dir.y), 0.02));
  float lit = shadeAt(p, vec3(-u_mu, 0.0, 0.0), u_radii.x, sun) * shadeAt(p, vec3(1.0 - u_mu, 0.0, 0.0), u_radii.y, sun);
  float k = 0.42, lobe = (1.0 - k * k) / pow(1.0 + k * k - 2.0 * k * facing, 1.5);
  vec3 tint = mix(vec3(0.86, 0.66, 0.46), vec3(0.66, 0.80, 1.0), 0.5 + 0.5 * sin(r * 5.3 + 1.0));
  return vec4(tint * (0.11 + 0.30 * lobe) * lit * alpha + tint * 0.004 * alpha, alpha);
}
// 贴着行星边缘的那一圈大气。c 是视线离表面最近的那一点，height 是那里的高度。
vec3 limb(vec3 c, float height, float along, bool isB, vec3 sun, float facing) {
  float thick = isB ? 0.013 : 0.007;
  float dens = max(exp(-height / thick) + 0.16 * exp(-height / (3.0 * thick)) - 0.006, 0.0) * smoothstep(0.0, 0.05, along);
  float bound = (isB ? u_reach.y : u_reach.x) * 1.039;
  dens *= smoothstep(0.0, 0.10, 1.0 - length(c - (isB ? vec3(1.0 - u_mu, 0.0, 0.0) : vec3(-u_mu, 0.0, 0.0))) / bound);
  if (dens < 0.004) return vec3(0.0);
  vec3 n = -normalize(rocheGradient(c, u_mu));
  float ndl = dot(n, sun), day = smoothstep(-0.32, 0.22, ndl);
  // 另一颗行星的影子
  float miss, unused;
  float blocked = surface(c, sun, isB ? vec3(-u_mu, 0.0, 0.0) : vec3(1.0 - u_mu, 0.0, 0.0), isB ? u_reach.x : u_reach.y, isB ? u_level.x : u_level.y, miss, unused);
  day *= blocked > 0.0 ? 0.0 : smoothstep(0.0, 0.07, miss);
  vec3 noon = isB ? vec3(0.30, 0.62, 1.0) : vec3(1.0, 0.52, 0.26);
  vec3 dusk = isB ? vec3(1.0, 0.36, 0.46) : vec3(1.0, 0.26, 0.08); // 晨昏线附近：光穿过很厚的大气，剩下的偏红
  vec3 tint = mix(dusk, noon, smoothstep(-0.10, 0.42, ndl));
  float through = 0.38 + 3.4 * pow(max(facing, 0.0), 6.0); // 逆光时向前散射，亮得多
  return tint * dens * day * through * (isB ? 0.95 : 0.42 * (0.5 + u_heat));
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res * 2.0 - 1.0;
  vec3 rd = normalize(u_fwd + uv.x * u_tan.x * u_right + uv.y * u_tan.y * u_up);
  float depth = 0.9999999;
  float facing = dot(rd, u_sun);
  // 换到跟着两星一起转的坐标：q = (沿连线, 垂直轨道面, 轨道面内垂直连线)
  vec3 e1 = vec3(cos(u_theta), 0.0, sin(u_theta)), e2 = vec3(-sin(u_theta), 0.0, cos(u_theta));
  vec3 ro = vec3(dot(u_eye, e1), u_eye.y, dot(u_eye, e2)), dir = vec3(dot(rd, e1), rd.y, dot(rd, e2));
  vec3 sun = vec3(dot(u_sun, e1), u_sun.y, dot(u_sun, e2));
  vec3 ca = vec3(-u_mu, 0.0, 0.0), cb = vec3(1.0 - u_mu, 0.0, 0.0);
  float gapA, gapB, atA, atB;
  float ta = surface(ro, dir, ca, u_reach.x, u_level.x, gapA, atA);
  float tb = surface(ro, dir, cb, u_reach.y, u_level.y, gapB, atB);
  bool isB = tb > 0.0 && (ta < 0.0 || tb < ta);
  float t = isB ? tb : ta;
  vec3 col;
  if (t > 0.0) {
    vec3 q = ro + dir * t;
    vec3 n = -normalize(rocheGradient(q, u_mu));
    vec3 center = isB ? cb : ca;
    vec3 d = q - center;
    float reach = isB ? u_reach.y : u_reach.x;
    // 离朝向对方的尖端有多近（0 = 背面，1 = 尖端）
    float tipward = smoothstep(-0.2, 1.0, (isB ? -d.x : d.x) / reach);
    float view = max(dot(n, -dir), 0.0), fres = pow(1.0 - view, 3.0);
    float fp = t * u_pixel / max(view, 0.45);
    float ndl = dot(n, sun), day = smoothstep(-0.08, 0.22, ndl);
    vec3 slope = normalize(sun - n * ndl + 1e-4); // 恒星在地面上的方向：给云和地形算明暗
    // 互相的影子：从这一点朝恒星看，另一颗行星挡不挡得住；擦边的地方是半影
    float miss, unused;
    float blocked = surface(q + n * 0.003, sun, isB ? ca : cb, isB ? u_reach.x : u_reach.y, isB ? u_level.x : u_level.y, miss, unused);
    float lit = blocked > 0.0 ? 0.0 : smoothstep(0.0, 0.07, miss);
    vec3 glow = vec3(0.0), base;
    float clouds = 0.0, wet = 0.0;
    if (isB) base = wangshu(d, n, tipward, fp, slope, clouds, wet); else base = zhuyin(d, tipward, fp, slope, glow);
    // 晨昏线上的阳光穿过很厚的大气，偏红
    vec3 sunlight = mix(isB ? vec3(1.0, 0.40, 0.24) : vec3(1.0, 0.55, 0.36), vec3(1.0, 0.96, 0.90), smoothstep(0.0, 0.38, ndl));
    vec3 surfaceCol = base * (sunlight * max(ndl, 0.0) * lit * 1.25 + 0.010);
    // 另一颗行星的反照：朝着对方的那一面被对方照亮一点
    vec3 other = normalize((isB ? ca : cb) - q);
    surfaceCol += base * max(dot(n, other), 0.0) * 0.045 * (isB ? vec3(1.0, 0.62, 0.40) : vec3(0.55, 0.78, 1.0));
    // 物质桥的火光照在两颗行星朝着 L1 的那一面上
    vec3 toBridge = vec3(0.5 * (u_tip.x + u_tip.y), 0.0, 0.0) - q;
    float span = length(toBridge);
    surfaceCol += base * vec3(3.0, 1.1, 0.35) * u_bridge * 0.018 * max(dot(n, toBridge / span) + 0.15, 0.0) / (span * span + 0.02);
    if (isB) {
      // 极光：两极附近一圈，只在背光的一面看得见
      float curtain = fbm(d * vec3(40.0, 6.0, 40.0) + vec3(u_time * 0.05, 0.0, 0.0));
      float oval = exp(-pow((abs(n.y) - 0.84 - 0.05 * (curtain - 0.5)) / 0.022, 2.0)) * smoothstep(0.30, 0.62, curtain);
      surfaceCol += vec3(0.10, 0.85, 0.60) * oval * 0.22 * (1.0 - day * lit);
      // 海面上恒星的反光：掠着看时拉成一长条
      vec3 half_ = normalize(sun - dir);
      float glint = pow(max(dot(n, half_), 0.0), 320.0) * 9.0 + pow(max(dot(n, half_), 0.0), 60.0) * 0.22;
      surfaceCol += sunlight * glint * wet * lit * step(0.0, ndl) * (0.25 + 0.75 * fres);
    }
    surfaceCol += glow * (0.35 + 0.65 * (1.0 - day * lit));
    // 大气：掠着看时视线穿过的空气更厚，远处的地面沉进一层雾里
    vec3 noon = isB ? vec3(0.30, 0.60, 1.0) : vec3(1.0, 0.52, 0.26);
    vec3 dusk = isB ? vec3(1.0, 0.36, 0.46) : vec3(1.0, 0.26, 0.08);
    vec3 air = mix(dusk, noon, smoothstep(-0.10, 0.42, ndl)) * smoothstep(-0.32, 0.22, ndl) * lit;
    float haze = 1.0 - exp(-(isB ? 0.105 : 0.05) / (view + 0.085));
    float through = 0.38 + 3.4 * pow(max(facing, 0.0), 6.0);
    surfaceCol = surfaceCol * (1.0 - 0.75 * haze) + air * haze * through * (isB ? 0.62 : 0.34 * (0.5 + u_heat));
    col = surfaceCol;
    vec3 world = q.x * e1 + q.y * vec3(0.0, 1.0, 0.0) + q.z * e2;
    vec4 clip = u_vp * vec4(world, 1.0);
    depth = clip.z / clip.w * 0.5 + 0.5;
  } else {
    col = sky(rd);
    // 恒星：一个很亮的小圆面，光晕交给辉光
    col += vec3(1.0, 0.94, 0.84) * (70.0 * smoothstep(0.99997, 0.999993, facing) + 0.4 * pow(max(facing, 0.0), 1400.0) + 0.03 * pow(max(facing, 0.0), 60.0));
  }
  // 视线擦过的那颗行星（不是打中的那一颗）边上的大气
  if ((t < 0.0 || isB) && gapA > 0.0 && (t < 0.0 || atA < t)) col += limb(ro + dir * atA, gapA, atA, false, sun, facing);
  if ((t < 0.0 || !isB) && gapB > 0.0 && (t < 0.0 || atB < t)) col += limb(ro + dir * atB, gapB, atB, true, sun, facing);
  // 行星带
  vec4 ring = belt(ro, dir, sun, facing, t);
  col = col * (1.0 - ring.a) + ring.rgb;
  // 物质桥的光芯：两个尖端之间一道发光的柱，烛阴这头是火，望舒那头是冰汽（示意；碎屑另外逐粒画在它上面）
  if (u_bridge > 0.0) {
    vec3 w0 = ro - vec3(u_tip.x, 0.0, 0.0);
    float len = u_tip.y - u_tip.x, b = dir.x, e = w0.x, s = (b * e - dot(dir, w0)) / max(1.0 - b * b, 1e-3), x = e + b * s;
    if (s > 0.0 && (t < 0.0 || s < t)) {
      float off = length(w0 + dir * s - vec3(x, 0.0, 0.0)), along = x / len;
      float width = 0.016 + 0.05 * abs(along - 0.5);
      float core = exp(-off * off / (width * width)) * smoothstep(-0.25, 0.05, along) * smoothstep(1.25, 0.95, along);
      col += mix(vec3(3.2, 1.0, 0.25), vec3(0.45, 0.85, 1.5), smoothstep(0.25, 0.85, along)) * core * u_bridge * 0.55;
    }
  }
  o = vec4(finish(col), 1.0);
  gl_FragDepth = depth;
}`;

const DUST_VERTEX = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_pos, u_vel;
uniform ivec2 u_size;
uniform mat4 u_view, u_proj;
uniform vec3 u_sun, u_eye, u_shadowA, u_shadowB; // 行星中心；影子半径放在 u_radii
uniform vec2 u_radii;
uniform float u_px, u_grain, u_stream, u_gain, u_blur;
out vec3 v_tint;
out float v_cover;
out vec2 v_direction; // 足迹的长轴在屏幕上朝哪边
out float v_aspect;   // 长轴是短轴的几倍
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float shade(vec3 p, vec3 center, float radius) {
  vec3 d = p - center;
  float along = dot(d, u_sun);
  return along < 0.0 ? smoothstep(radius * 0.94, radius * 1.05, length(d - along * u_sun)) : 1.0;
}
void main() {
  ivec2 at = ivec2(gl_VertexID % u_size.x, gl_VertexID / u_size.x);
  vec4 p = texelFetch(u_pos, at, 0);
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  v_tint = vec3(0.0);
  v_cover = 0.0;
  v_direction = vec2(1.0, 0.0);
  v_aspect = 1.0;
  if (p.w > 2.5) return;
  vec4 velocity = texelFetch(u_vel, at, 0);
  float age = velocity.w, seed = hash(float(gl_VertexID) + 0.37);
  vec4 view = u_view * vec4(p.xyz, 1.0);
  float size = mix(0.5, 2.2, seed * seed * seed) * u_grain * (p.w > 0.5 ? u_stream : 1.0);
  float px = 2.0 * size * u_px / max(-view.z, 1e-4);
  float spot = clamp(px * 2.2, p.w < 0.5 ? 5.0 : 2.6, 56.0); // 行星带的每一粒画得大而淡，叠起来是一片连续的光
  float lit = shade(p.xyz, u_shadowA, u_radii.x) * shade(p.xyz, u_shadowB, u_radii.y);
  // 冰尘向前散射：正对恒星看过去时最亮
  float facing = dot(normalize(p.xyz - u_eye), u_sun);
  float k = 0.42, lobe = (1.0 - k * k) / pow(1.0 + k * k - 2.0 * k * facing, 1.5);
  float thin = 1.0; // 行星带的每一粒只遮住很少一点，叠起来才显出疏密
  vec3 tint;
  if (p.w < 0.5) {
    tint = mix(vec3(0.80, 0.62, 0.44), vec3(0.66, 0.80, 1.0), hash(seed * 91.0)) * (0.05 + 0.20 * lobe) * lit;
    thin = 0.22;
  } else if (p.w < 1.5) {
    // 从烛阴扯出来的：刚离开时是炽热的，几分之一圈内冷下来变成暗红的尘
    float hot = exp(-age * 1.6);
    tint = vec3(0.50, 0.26, 0.15) * (0.15 + 0.25 * lobe) * lit + vec3(2.4, 0.55, 0.09) * hot * hot + vec3(1.0, 0.7, 0.35) * exp(-age * 5.0);
    thin = 0.3;
  } else {
    // 从望舒扯出来的：水汽和冰晶，受光时很亮
    tint = vec3(0.82, 0.90, 1.0) * (0.16 + 0.4 * lobe) * lit + vec3(0.10, 0.20, 0.34) * exp(-age * 1.6);
    thin = 0.3;
  }
  // 贴到镜头跟前的碎屑淡出，免得一粒糊住半个画面
  float close = smoothstep(0.04, 0.16, -view.z);
  v_tint = tint * u_gain * (p.w > 0.5 ? 1.7 : 1.0) * smoothstep(0.0, 0.25, age + (p.w > 0.5 ? 0.25 : 0.0));
  // 椭圆足迹（特蕾莎的做法）：长轴沿这一粒真实速度在屏幕上的方向，一粒粒的点连成细丝；位置和受力不变，没有另画轨迹。
  // 镜头跟着两颗行星一起转，所以用的是减掉「跟着转」那部分以后的速度。长了多少，透明度就按面积减多少。
  vec3 drift = (u_view * vec4(velocity.xyz - vec3(-p.z, 0.0, p.x), 0.0)).xyz;
  float smear = u_px * length(drift.xy) / max(-view.z, 1e-4) * u_blur;
  float size_ = min(spot * clamp(1.0 + smear / spot, 1.0, 5.0), 64.0);
  v_aspect = size_ / spot;
  if (dot(drift.xy, drift.xy) > 1e-12) v_direction = normalize(vec2(drift.x, -drift.y));
  v_cover = min(4.1 * px * px / (spot * spot), 1.0) * thin * close / v_aspect;
  gl_PointSize = size_;
  gl_Position = u_proj * view;
}`;
const DUST_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_tint;
in float v_cover;
in vec2 v_direction;
in float v_aspect;
out vec4 o;
uniform float u_direct;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  c = vec2(dot(c, v_direction), dot(c, vec2(-v_direction.y, v_direction.x)) * v_aspect);
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  // 颜色是「厚厚一层碎屑」该有的亮度，透明度是这一粒遮住的份额：叠得再多也只趋近这个亮度
  float cover = v_cover * exp(-4.0 * r2);
  vec3 tone = u_direct > 0.5 ? pow(clamp(v_tint / (1.0 + v_tint), 0.0, 1.0), vec3(1.0 / 2.2)) : v_tint;
  o = vec4(tone * cover, cover);
}`;

const BRIGHT_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_texel;
in vec2 v_uv;
out vec4 o;
void main() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 off = vec2(i % 2 == 0 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * u_texel;
    vec3 s = min(texture(u_src, v_uv + off).rgb, vec3(30.0));
    float peak = max(s.r, max(s.g, s.b));
    c += s * max(peak - 0.9, 0.0) / max(peak, 1e-4);
  }
  o = vec4(c * 0.25, 1.0);
}`;
const BLUR_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_texel;
in vec2 v_uv;
out vec4 o;
void main() {
  vec3 c = texture(u_src, v_uv).rgb * 4.0;
  for (int i = 0; i < 4; i++) {
    vec2 d = vec2(i % 2 == 0 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * u_texel;
    c += texture(u_src, v_uv + d).rgb * 2.0;
  }
  c += texture(u_src, v_uv + vec2(2.0, 0.0) * u_texel).rgb + texture(u_src, v_uv - vec2(2.0, 0.0) * u_texel).rgb;
  c += texture(u_src, v_uv + vec2(0.0, 2.0) * u_texel).rgb + texture(u_src, v_uv - vec2(0.0, 2.0) * u_texel).rgb;
  o = vec4(c / 16.0, 1.0);
}`;
// 最后一步：辉光、镜头的拉丝和鬼影（恒星在画面里或画面边上时）、曝光、胶片曲线、一点分色
const FINAL_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_scene, u_bloom;
uniform float u_exposure, u_bloomGain, u_time, u_aspect;
uniform vec3 u_flare; // 恒星在画面上的位置（0–1）和露出来多少
in vec2 v_uv;
out vec4 o;
${COMMON}
void main() {
  vec3 c = texture(u_scene, v_uv).rgb + texture(u_bloom, v_uv).rgb * u_bloomGain;
  if (u_flare.z > 0.0) {
    vec2 p = (v_uv - u_flare.xy) * vec2(u_aspect, 1.0);
    float streak = exp(-abs(p.y) * 80.0) / (1.0 + 9.0 * p.x * p.x);   // 变形镜头的横向拉丝
    float pillar = exp(-abs(p.x) * 70.0) / (1.0 + 26.0 * p.y * p.y);  // 竖着的一道光柱
    float halo = 0.012 / (dot(p, p) + 0.006);
    vec3 flare = vec3(0.36, 0.62, 1.0) * streak * 0.6 + vec3(1.0, 0.82, 0.66) * pillar * 0.22 + vec3(1.0, 0.86, 0.72) * halo;
    // 沿着「恒星—画面中心」连线的几个鬼影
    vec2 axis = vec2(0.5) - u_flare.xy;
    for (int i = 0; i < 3; i++) {
      float along = i == 0 ? 0.55 : i == 1 ? 1.35 : 1.9, size = i == 0 ? 0.035 : i == 1 ? 0.07 : 0.022;
      vec2 g = (v_uv - (u_flare.xy + axis * along)) * vec2(u_aspect, 1.0);
      float ring = smoothstep(size, size * 0.5, length(g));
      flare += (i == 1 ? vec3(0.30, 0.55, 0.9) : vec3(0.9, 0.45, 0.6)) * ring * (i == 1 ? 0.008 : 0.014);
    }
    c += flare * u_flare.z;
  }
  vec2 q = v_uv - 0.5;
  c *= u_exposure * (1.0 - 0.75 * dot(q, q));
  c = pow(filmic(c), vec3(1.0 / 2.2));
  // 分色：暗部偏青，亮部偏暖
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += (1.0 - luma) * (1.0 - luma) * vec3(-0.010, 0.004, 0.020);
  c *= mix(vec3(1.0), vec3(1.035, 0.995, 0.965), luma);
  c += (hash13(vec3(gl_FragCoord.xy, u_time * 60.0 + u_direct)) - 0.5) * 0.02;
  o = vec4(c, 1.0);
}`;

// ---------- 小工具 ----------
function link(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertexSource],
    [gl.FRAGMENT_SHADER, fragmentSource],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.bindAttribLocation(program, 0, 'p');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program));
  const u = {};
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
    const name = gl.getActiveUniform(program, i).name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(program, name);
  }
  return { program, u };
}
function texture(gl, internal, w, h, format, type, filter, data = null) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
    gl.texParameteri(gl.TEXTURE_2D, key, filter);
  for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
    gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
  return t;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 行星带在半径方向上的疏密（示意）：几道亮环、几道暗缝
const ringlets = (r) =>
  0.18 +
  0.82 *
    (0.5 + 0.5 * Math.sin(r * 9.0 + 1.3 * Math.sin(r * 3.1))) ** 2 *
    (0.6 + 0.4 * Math.sin(r * 23.0 + 2.0));

// 开始时的碎屑：行星带铺在 1.85–3.95 倍间距之间（内缘密一些），尖端的碎屑先待命
export function seedDust(count, seed = 3) {
  const rand = mulberry(seed),
    x = new Float32Array(4 * count),
    v = new Float32Array(4 * count);
  for (let i = 0; i < count; i++) {
    const at = 4 * i;
    if (i % STREAM_EVERY === 0) {
      x[at + 3] = 3;
      continue;
    }
    // 有疏有密的一圈圈：按半径上的密度函数取舍
    let r;
    do r = 1.85 + 2.1 * rand() ** 1.25;
    while (rand() > ringlets(r));
    const angle = 2 * Math.PI * rand(),
      speed = Math.sqrt(1 / r);
    x[at] = r * Math.cos(angle);
    x[at + 1] = 0.006 * r * (rand() + rand() - 1);
    x[at + 2] = r * Math.sin(angle);
    v[at] = -speed * Math.sin(angle);
    v[at + 2] = speed * Math.cos(angle);
    v[at + 3] = 1; // 已经存在一阵子了，不用淡入
  }
  return { x, v };
}

// 每一步需要的行星信息：frame = { theta, mu, level: [A, B], reach: [A, B], tip: [A, B], emit }
export function gpuDustAvailable(gl) {
  return Boolean(gl && gl.getExtension('EXT_color_buffer_float'));
}
export function createGpuDust(gl, w, h) {
  const step = link(gl, QUAD, DUST_STEP),
    quad = gl.createVertexArray(),
    buffer = gl.createBuffer(),
    { x, v } = seedDust(w * h);
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const sides = [0, 1].map((i) => {
    const pos = texture(gl, gl.RGBA32F, w, h, gl.RGBA, gl.FLOAT, gl.NEAREST, i ? null : x),
      vel = texture(gl, gl.RGBA32F, w, h, gl.RGBA, gl.FLOAT, gl.NEAREST, i ? null : v),
      frame = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pos, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, vel, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('float framebuffer is not complete');
    return { pos, vel, frame };
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let current = 0,
    seed = 1;
  return {
    backend: 'gpu',
    count: w * h,
    size: [w, h],
    step(frame, dt) {
      gl.useProgram(step.program);
      gl.bindVertexArray(quad);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(false);
      gl.viewport(0, 0, w, h);
      gl.uniform1i(step.u.u_pos, 0);
      gl.uniform1i(step.u.u_vel, 1);
      gl.uniform2i(step.u.u_size, w, h);
      gl.uniform1f(step.u.u_theta, frame.theta);
      gl.uniform1f(step.u.u_dt, dt);
      gl.uniform1f(step.u.u_mu, frame.mu);
      gl.uniform1f(step.u.u_emit, frame.emit);
      gl.uniform2fv(step.u.u_level, frame.level);
      gl.uniform2fv(step.u.u_reach, frame.reach);
      gl.uniform2fv(step.u.u_tip, frame.tip);
      gl.uniform1ui(step.u.u_seed, seed++);
      const from = sides[current],
        to = sides[1 - current];
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.frame);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, from.vel);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, from.pos);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      current = 1 - current;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindVertexArray(null);
      gl.depthMask(true);
    },
    textures: () => sides[current],
    // 检查用：数一数各类碎屑各有多少
    census() {
      const data = new Float32Array(4 * w * h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sides[current].frame);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, data);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return countKinds(data);
    },
  };
}
function countKinds(data) {
  const out = { belt: 0, fromA: 0, fromB: 0, waiting: 0 };
  for (let i = 3; i < data.length; i += 4)
    out[data[i] < 0.5 ? 'belt' : data[i] < 1.5 ? 'fromA' : data[i] < 2.5 ? 'fromB' : 'waiting']++;
  return out;
}

// CPU 上的同一套规则（随机数不同）。也给检查脚本用，所以 gl 可以是 null。
export function createCpuDust(gl, w, h) {
  const count = w * h,
    { x, v } = seedDust(count),
    rand = mulberry(17),
    pos = gl ? texture(gl, gl.RGBA32F, w, h, gl.RGBA, gl.FLOAT, gl.NEAREST, x) : null,
    vel = gl ? texture(gl, gl.RGBA32F, w, h, gl.RGBA, gl.FLOAT, gl.NEAREST, v) : null;
  return {
    backend: 'cpu',
    count,
    size: [w, h],
    data: { x, v },
    step(frame, dt) {
      const { mu } = frame,
        mid = 0.5 * (frame.tip[0] + frame.tip[1]), // 两个尖端中间：这一侧归烛阴，那一侧归望舒
        theta = frame.theta + dt,
        { e1, e2 } = axes(theta);
      for (let i = 0; i < count; i++) {
        const at = 4 * i,
          stream = i % STREAM_EVERY === 0;
        let respawn = x[at + 3] > 2.5;
        if (!respawn) {
          const p = [x[at], x[at + 1], x[at + 2]],
            a = accel(p, frame.theta, mu);
          for (let k = 0; k < 3; k++) {
            v[at + k] += a[k] * dt;
            x[at + k] += v[at + k] * dt;
          }
          v[at + 3] += dt;
          const u = x[at] * e1[0] + x[at + 2] * e1[2],
            s = x[at] * e2[0] + x[at + 2] * e2[2],
            value = roche(u, s, x[at + 1], mu);
          respawn =
            (u < mid && Math.hypot(u + mu, s, x[at + 1]) < frame.reach[0] && value > frame.level[0]) ||
            (u > mid && Math.hypot(u - 1 + mu, s, x[at + 1]) < frame.reach[1] && value > frame.level[1]) ||
            x[at] ** 2 + x[at + 1] ** 2 + x[at + 2] ** 2 > (stream ? 22 : 49);
          if (!respawn) continue;
        }
        if (stream) {
          if (rand() >= frame.emit) {
            x[at + 3] = 3;
            continue;
          }
          const fromB = Math.floor(i / STREAM_EVERY) % 2 === 1,
            toward = fromB ? -1 : 1,
            reach = frame.reach[fromB ? 1 : 0],
            spread = 0.07 * reach * Math.sqrt(rand()),
            angle = 2 * Math.PI * rand(),
            q = [
              frame.tip[fromB ? 1 : 0] + toward * 0.004,
              spread * Math.cos(angle),
              spread * Math.sin(angle),
            ],
            kick = [
              toward * (0.02 + 0.1 * rand()),
              0.1 * (rand() - 0.5),
              (rand() < 0.5 ? -1 : 1) * (0.03 + 0.42 * rand() ** 3) + 0.06 * (rand() - 0.5),
            ];
          x[at] = q[0] * e1[0] + q[2] * e2[0];
          x[at + 1] = q[1];
          x[at + 2] = q[0] * e1[2] + q[2] * e2[2];
          x[at + 3] = fromB ? 2 : 1;
          v[at] = -x[at + 2] + kick[0] * e1[0] + kick[2] * e2[0];
          v[at + 1] = kick[1];
          v[at + 2] = x[at] + kick[0] * e1[2] + kick[2] * e2[2];
          v[at + 3] = 0;
        } else {
          const r = 1.85 + 0.45 * rand(),
            angle = 2 * Math.PI * rand(),
            speed = Math.sqrt(1 / r);
          x[at] = r * Math.cos(angle);
          x[at + 1] = 0.006 * r * (rand() + rand() - 1);
          x[at + 2] = r * Math.sin(angle);
          x[at + 3] = 0;
          v[at] = -speed * Math.sin(angle);
          v[at + 1] = 0;
          v[at + 2] = speed * Math.cos(angle);
          v[at + 3] = 0;
        }
      }
    },
    textures() {
      gl.bindTexture(gl.TEXTURE_2D, pos);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.FLOAT, x);
      gl.bindTexture(gl.TEXTURE_2D, vel);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.FLOAT, v);
      return { pos, vel };
    },
    census: () => countKinds(x),
  };
}

// ---------- 矩阵 ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
// 镜头的三根轴。above 是「哪边算上」：机位贴着一颗行星时，它是离开地面的方向，地平线才是平的。
export function cameraBasis(eye, target, above = [0, 1, 0]) {
  const fwd = unit(sub(target, eye)),
    right = unit(cross(fwd, above)),
    up = cross(right, fwd);
  return { fwd, right, up };
}
// 世界坐标 → 画布上的比例坐标（左上角为 0,0）；在相机后面时返回 null。
export function project(matrix, [x, y, z]) {
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (w <= 1e-6) return null;
  return [
    0.5 + (0.5 * (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12])) / w,
    0.5 - (0.5 * (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13])) / w,
  ];
}

export const SUN = unit([-0.42, 0.13, 0.9]); // 恒星只比轨道面高一点：两颗行星每一圈都会互相遮住

export function createRenderer(gl, { allowHdr = true } = {}) {
  const back = link(gl, QUAD, BACK_FRAGMENT),
    dust = link(gl, DUST_VERTEX, DUST_FRAGMENT),
    bright = link(gl, QUAD, BRIGHT_FRAGMENT),
    blur = link(gl, QUAD, BLUR_FRAGMENT),
    final = link(gl, QUAD, FINAL_FRAGMENT);
  const quad = gl.createVertexArray(),
    buffer = gl.createBuffer(),
    empty = gl.createVertexArray();
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const target = (w, h) => {
    const tex = texture(gl, gl.RGBA16F, w, h, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR),
      frame = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('half-float target is not complete');
    return { texture: tex, frame, w, h };
  };
  let hdr =
    allowHdr &&
    Boolean(
      gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'),
    );
  let stage = null;
  function ensureStage(w, h) {
    if (stage && stage.w === w && stage.h === h) return;
    if (stage) {
      gl.deleteRenderbuffer(stage.depth);
      for (const level of [stage.scene, ...stage.levels]) {
        gl.deleteFramebuffer(level.frame);
        gl.deleteTexture(level.texture);
      }
      stage = null;
    }
    const scene = target(w, h),
      depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.frame);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('scene target is not complete');
    const levels = [];
    for (let i = 1; i <= 6; i++) levels.push(target(Math.max(2, w >> i), Math.max(2, h >> i)));
    stage = { w, h, scene, depth, levels };
  }
  const bind = (unit_, tex) => {
    gl.activeTexture(gl.TEXTURE0 + unit_);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  };
  return {
    get hdr() {
      return hdr;
    },
    // scene：eye、basis（镜头的三根轴）、fov（竖直方向）；frame（theta、mu、level、reach、tip、centers、radii、heat、bridge）；
    // dust = { pos, vel, size, count }；grain / stream（碎屑大小）、steps（行星求交最多走多少步）、sunlight（恒星露出来多少，0–1）、
    // exposure、bloom、time。返回投影矩阵，给页面上的标注用。
    draw(scene) {
      const { width, height } = gl.canvas;
      if (hdr) {
        try {
          ensureStage(width, height);
        } catch (error) {
          console.warn('Roche binary: no HDR target, drawing directly.', error);
          hdr = false;
          stage = null;
        }
      }
      const aspect = width / height,
        { fwd, right, up } = scene.basis,
        // prettier-ignore
        view = new Float32Array([
          right[0], up[0], -fwd[0], 0,
          right[1], up[1], -fwd[1], 0,
          right[2], up[2], -fwd[2], 0,
          -dot(right, scene.eye), -dot(up, scene.eye), dot(fwd, scene.eye), 1,
        ]),
        near = 0.008,
        far = 60,
        f = 1 / Math.tan(scene.fov / 2),
        // prettier-ignore
        proj = new Float32Array([
          f / aspect, 0, 0, 0,
          0, f, 0, 0,
          0, 0, (far + near) / (near - far), -1,
          0, 0, (2 * far * near) / (near - far), 0,
        ]),
        vp = new Float32Array(16),
        tanV = Math.tan(scene.fov / 2),
        direct = hdr ? 0 : 1,
        frame = scene.frame;
      for (let col = 0; col < 4; col++)
        for (let row = 0; row < 4; row++) {
          let sum = 0;
          for (let k = 0; k < 4; k++) sum += proj[k * 4 + row] * view[col * 4 + k];
          vp[col * 4 + row] = sum;
        }
      gl.bindFramebuffer(gl.FRAMEBUFFER, hdr ? stage.scene.frame : null);
      gl.viewport(0, 0, width, height);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // 背景和两颗行星
      gl.depthFunc(gl.ALWAYS);
      gl.useProgram(back.program);
      gl.bindVertexArray(quad);
      gl.uniform1f(back.u.u_direct, direct);
      gl.uniform3fv(back.u.u_eye, scene.eye);
      gl.uniform3fv(back.u.u_right, right);
      gl.uniform3fv(back.u.u_up, up);
      gl.uniform3fv(back.u.u_fwd, fwd);
      gl.uniform3fv(back.u.u_sun, SUN);
      gl.uniform2f(back.u.u_tan, tanV * aspect, tanV);
      gl.uniform2f(back.u.u_res, width, height);
      gl.uniformMatrix4fv(back.u.u_vp, false, vp);
      gl.uniform1f(back.u.u_theta, frame.theta);
      gl.uniform1f(back.u.u_mu, frame.mu);
      gl.uniform2fv(back.u.u_level, frame.level);
      gl.uniform2fv(back.u.u_reach, frame.reach);
      gl.uniform2fv(back.u.u_tip, frame.tip);
      gl.uniform2fv(back.u.u_radii, frame.radii);
      gl.uniform1f(back.u.u_heat, frame.heat);
      gl.uniform1f(back.u.u_bridge, frame.bridge);
      gl.uniform1f(back.u.u_time, scene.time || 0);
      gl.uniform1f(back.u.u_steps, scene.steps || 72);
      gl.uniform1f(back.u.u_pixel, (2 * tanV) / height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 碎屑：只叠加，不写深度
      if (scene.dust) {
        gl.depthFunc(gl.LESS);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(dust.program);
        gl.bindVertexArray(empty);
        bind(1, scene.dust.vel);
        bind(0, scene.dust.pos);
        gl.uniform1i(dust.u.u_pos, 0);
        gl.uniform1i(dust.u.u_vel, 1);
        gl.uniform2i(dust.u.u_size, scene.dust.size[0], scene.dust.size[1]);
        gl.uniformMatrix4fv(dust.u.u_view, false, view);
        gl.uniformMatrix4fv(dust.u.u_proj, false, proj);
        gl.uniform3fv(dust.u.u_sun, SUN);
        gl.uniform3fv(dust.u.u_eye, scene.eye);
        gl.uniform3fv(dust.u.u_shadowA, frame.centers[0]);
        gl.uniform3fv(dust.u.u_shadowB, frame.centers[1]);
        gl.uniform2fv(dust.u.u_radii, frame.radii);
        gl.uniform1f(dust.u.u_px, height / (2 * tanV));
        gl.uniform1f(dust.u.u_grain, scene.grain);
        gl.uniform1f(dust.u.u_stream, scene.stream ?? 1);
        gl.uniform1f(dust.u.u_blur, scene.blur ?? 0.012);
        gl.uniform1f(dust.u.u_gain, scene.gain ?? 1);
        gl.uniform1f(dust.u.u_direct, direct);
        gl.drawArrays(gl.POINTS, 0, scene.dust.count);
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      }
      if (hdr) {
        gl.disable(gl.DEPTH_TEST);
        gl.bindVertexArray(quad);
        const run = (shader, to, from) => {
          gl.bindFramebuffer(gl.FRAMEBUFFER, to.frame);
          gl.viewport(0, 0, to.w, to.h);
          gl.useProgram(shader.program);
          bind(0, from.texture);
          gl.uniform1i(shader.u.u_src, 0);
          gl.uniform2f(shader.u.u_texel, 1 / from.w, 1 / from.h);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
        const levels = stage.levels;
        let from = stage.scene;
        levels.forEach((level, i) => {
          run(i ? blur : bright, level, from);
          from = level;
        });
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        for (let i = levels.length - 1; i > 0; i--) run(blur, levels[i - 1], levels[i]);
        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.useProgram(final.program);
        bind(1, levels[0].texture);
        bind(0, stage.scene.texture);
        gl.uniform1i(final.u.u_scene, 0);
        gl.uniform1i(final.u.u_bloom, 1);
        gl.uniform1f(final.u.u_exposure, scene.exposure ?? 1);
        gl.uniform1f(final.u.u_bloomGain, scene.bloom ?? 0.5);
        gl.uniform1f(final.u.u_time, scene.time || 0);
        gl.uniform1f(final.u.u_direct, 0);
        gl.uniform1f(final.u.u_aspect, aspect);
        // 恒星在画面上的位置：在镜头前面才有拉丝；离画面越远越淡
        const ahead = dot(SUN, fwd);
        let flare = [0, 0, 0];
        if (ahead > 0.05 && scene.sunlight > 0) {
          const x = dot(SUN, right) / ahead / (tanV * aspect),
            y = dot(SUN, up) / ahead / tanV,
            outside = Math.max(Math.abs(x), Math.abs(y)) - 1;
          flare = [0.5 + 0.5 * x, 0.5 + 0.5 * y, scene.sunlight * Math.max(0, 1 - Math.max(outside, 0) / 0.5)];
        }
        gl.uniform3fv(final.u.u_flare, flare);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(null);
      return vp;
    },
  };
}
