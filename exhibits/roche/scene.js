// 双行星洛希展品的碎屑积分和画面（猫猫）。物理公式在 binary.js；这里决定东西怎么算得快、看起来怎样。
// 碎屑：几十万粒试验粒子，只受两颗行星的引力（圆型限制性三体问题），在显卡上每帧推进；
// 没有浮点渲染目标时改在 CPU 上推进少一些的粒子。
// 画面：背景（星空、恒星、两颗按等势面逐像素求交的行星）→ 碎屑的微光 → 高动态范围辉光和胶片曲线。
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
    bool hit = (length(q + vec3(u_mu, 0.0, 0.0)) < u_reach.x && value > u_level.x)
            || (length(q - vec3(1.0 - u_mu, 0.0, 0.0)) < u_reach.y && value > u_level.y);
    if (hit || dot(np, np) > (stream ? 22.0 : 49.0)) respawn = true; // 落到行星上，或者被甩远了
    else { o_pos = vec4(np, p.w); o_vel = vec4(nv, v.w + u_dt); return; }
  }
  if (stream) {
    // 从尖端扯出来的碎屑：尖端伸得够近（u_emit > 0）才会有新的被扯出来，否则先待命
    if (rnd(state) >= u_emit) { o_pos = vec4(0.0, 0.0, 0.0, 3.0); o_vel = vec4(0.0); return; }
    bool fromB = (index / ${STREAM_EVERY}) % 2 == 1;
    float tip = fromB ? u_tip.y : u_tip.x, toward = fromB ? -1.0 : 1.0, reach = fromB ? u_reach.y : u_reach.x;
    float spread = 0.16 * reach * sqrt(rnd(state)), angle = 6.2831853 * rnd(state);
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
vec3 filmic(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
uniform float u_direct;
vec3 finish(vec3 c) { return u_direct > 0.5 ? pow(filmic(c), vec3(1.0 / 2.2)) : c; }
`;

const BACK_FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 u_eye, u_right, u_up, u_fwd, u_sun;
uniform vec2 u_tan, u_res, u_level, u_reach;
uniform mat4 u_vp;
uniform float u_theta, u_mu, u_heat, u_time, u_steps, u_l1;
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
  col += vec3(0.42, 0.50, 0.68) * band * (0.010 + 0.16 * cloud * cloud);
  col += vec3(0.75, 0.52, 0.36) * band * band * 0.022 * fbm(rd * 2.2);
  return col * (1.0 - 0.7 * lane);
}
// 沿视线找行星表面：行星是有效势的等值面，在它的包围球里等步长走，过了面就二分。
// gap 记下一路上离表面最近时的势差，给大气的辉边用。
float surface(vec3 ro, vec3 rd, vec3 center, float reach, float level, out float gap) {
  gap = 1e3;
  vec3 oc = ro - center;
  float b = dot(oc, rd), c = dot(oc, oc) - reach * reach * 1.03, h = b * b - c;
  if (h < 0.0) return -1.0;
  h = sqrt(h);
  float t0 = max(-b - h, 0.0), t1 = -b + h;
  if (t1 <= t0) return -1.0;
  float stride = (t1 - t0) / u_steps, before = t0;
  for (float i = 1.0; i <= u_steps; i += 1.0) {
    float t = t0 + stride * i, f = level - roche(ro + rd * t, u_mu);
    if (f < 0.0) {
      float lo = before, hi = t;
      for (int k = 0; k < 7; k++) {
        float mid = 0.5 * (lo + hi);
        if (level - roche(ro + rd * mid, u_mu) < 0.0) hi = mid; else lo = mid;
      }
      gap = 0.0;
      return 0.5 * (lo + hi);
    }
    gap = min(gap, f);
    before = t;
  }
  return -1.0;
}
// 烛阴：干热的岩石行星，潮汐把地壳扯开，裂缝里是熔岩；越靠近朝着望舒的尖端裂得越厉害
vec3 zhuyin(vec3 d, vec3 n, float tipward, out vec3 glow) {
  float plains = fbm(d * 5.0 + 3.0), ridged = abs(fbm(d * 11.0 + plains * 2.0) - 0.5) * 2.0;
  vec3 rock = mix(vec3(0.17, 0.12, 0.09), vec3(0.52, 0.36, 0.22), smoothstep(0.25, 0.75, plains));
  rock = mix(rock, vec3(0.70, 0.55, 0.38), smoothstep(0.62, 0.9, fbm(d * 19.0)) * 0.5);
  float cracks = 1.0 - smoothstep(0.0, 0.085 + 0.10 * tipward, ridged);
  float fine = 1.0 - smoothstep(0.0, 0.05, abs(fbm(d * 31.0 + 7.0) - 0.5) * 2.0);
  float heat = u_heat * (0.10 + 1.6 * pow(tipward, 2.2)) * (0.6 + 0.4 * sin(u_time * 0.7 + plains * 20.0));
  glow = vec3(3.2, 0.95, 0.22) * (cracks + 0.5 * fine * tipward) * heat;
  return rock * (1.0 - 0.6 * cracks);
}
// 望舒：冰和海的行星，云被潮汐沿连线方向拉成长条
vec3 wangshu(vec3 d, vec3 n, float tipward, out float clouds) {
  vec3 stretched = vec3(d.x * mix(1.0, 0.35, tipward), d.y, d.z);
  float warp = fbm(stretched * 4.0 + 1.7);
  float land = smoothstep(0.52, 0.60, fbm(d * 3.3 + 20.0));
  vec3 sea = mix(vec3(0.02, 0.09, 0.20), vec3(0.05, 0.26, 0.36), fbm(d * 9.0));
  vec3 ground = mix(sea, vec3(0.50, 0.58, 0.62), land * 0.75);
  ground = mix(ground, vec3(0.86, 0.92, 0.97), smoothstep(0.70, 0.92, abs(n.y)));
  clouds = smoothstep(0.46, 0.74, fbm(stretched * 8.0 + warp * 2.6 + vec3(0.0, 0.0, u_time * 0.01)));
  return mix(ground, vec3(0.93, 0.96, 1.0), clouds * 0.9);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res * 2.0 - 1.0;
  vec3 rd = normalize(u_fwd + uv.x * u_tan.x * u_right + uv.y * u_tan.y * u_up);
  vec3 col = sky(rd);
  float depth = 0.9999999;
  float facing = dot(rd, u_sun);
  // 换到跟着两星一起转的坐标：q = (沿连线, 垂直轨道面, 轨道面内垂直连线)
  vec3 e1 = vec3(cos(u_theta), 0.0, sin(u_theta)), e2 = vec3(-sin(u_theta), 0.0, cos(u_theta));
  vec3 ro = vec3(dot(u_eye, e1), u_eye.y, dot(u_eye, e2)), dir = vec3(dot(rd, e1), rd.y, dot(rd, e2));
  vec3 sun = vec3(dot(u_sun, e1), u_sun.y, dot(u_sun, e2));
  vec3 ca = vec3(-u_mu, 0.0, 0.0), cb = vec3(1.0 - u_mu, 0.0, 0.0);
  float gapA, gapB;
  float ta = surface(ro, dir, ca, u_reach.x, u_level.x, gapA);
  float tb = surface(ro, dir, cb, u_reach.y, u_level.y, gapB);
  bool isB = tb > 0.0 && (ta < 0.0 || tb < ta);
  float t = isB ? tb : ta;
  if (t > 0.0) {
    vec3 q = ro + dir * t;
    vec3 n = -normalize(rocheGradient(q, u_mu));
    vec3 center = isB ? cb : ca;
    vec3 d = q - center;
    float reach = isB ? u_reach.y : u_reach.x;
    // 离朝向对方的尖端有多近（0 = 背面，1 = 尖端）
    float tipward = smoothstep(-0.2, 1.0, (isB ? -d.x : d.x) / reach);
    float ndl = dot(n, sun), day = smoothstep(-0.08, 0.22, ndl);
    // 互相的影子：从这一点朝恒星看，另一颗行星挡不挡得住
    float unused;
    float blocked = surface(q + n * 0.004, sun, isB ? ca : cb, isB ? u_reach.x : u_reach.y, isB ? u_level.x : u_level.y, unused);
    float lit = blocked > 0.0 ? 0.0 : 1.0;
    vec3 glow = vec3(0.0), base;
    float clouds = 0.0;
    if (isB) base = wangshu(d, n, tipward, clouds); else base = zhuyin(d, n, tipward, glow);
    float view = max(dot(n, -dir), 0.0), fres = pow(1.0 - view, 3.0);
    vec3 surfaceCol = base * (max(ndl, 0.0) * lit * 1.15 + 0.012);
    // 另一颗行星的反照：朝着对方的那一面被对方照亮一点
    vec3 other = normalize((isB ? ca : cb) - q);
    surfaceCol += base * max(dot(n, other), 0.0) * 0.05 * (isB ? vec3(1.0, 0.7, 0.45) : vec3(0.6, 0.8, 1.0));
    // 物质桥的火光照在两颗行星朝着 L1 的那一面上
    vec3 toBridge = vec3(u_l1, 0.0, 0.0) - q;
    float span = length(toBridge);
    surfaceCol += base * vec3(3.0, 1.1, 0.35) * u_heat * 0.035 * max(dot(n, toBridge / span), 0.0) / (span * span + 0.012);
    if (isB) {
      // 极光：两极附近一圈，只在背光的一面看得见
      float oval = exp(-pow((abs(n.y) - 0.80) / 0.06, 2.0)) * (0.35 + 0.65 * fbm(d * 13.0 + vec3(u_time * 0.04, 0.0, 0.0)));
      surfaceCol += vec3(0.10, 0.85, 0.60) * oval * 0.38 * (1.0 - day * lit);
    }
    vec3 air = isB ? vec3(0.35, 0.62, 1.0) : vec3(1.0, 0.55, 0.30);
    surfaceCol += air * fres * (0.55 * day * lit + (isB ? 0.02 : 0.05));
    if (isB) surfaceCol += vec3(1.0) * pow(max(dot(reflect(-sun, n), -dir), 0.0), 60.0) * (1.0 - clouds) * lit * 0.5;
    col = surfaceCol + glow * (0.35 + 0.65 * (1.0 - day * lit));
    vec3 world = q.x * e1 + q.y * vec3(0.0, 1.0, 0.0) + q.z * e2;
    vec4 clip = u_vp * vec4(world, 1.0);
    depth = clip.z / clip.w * 0.5 + 0.5;
  } else {
    // 恒星：一个很亮的小圆面，光晕交给辉光
    col += vec3(1.0, 0.94, 0.84) * (60.0 * smoothstep(0.99997, 0.999993, facing) + 0.4 * pow(max(facing, 0.0), 1400.0) + 0.03 * pow(max(facing, 0.0), 60.0));
    // 贴着行星边缘的一圈大气：势差换成高度，越贴近越亮；逆光时更亮
    float back = 0.25 + 2.4 * pow(max(facing, 0.0), 4.0);
    col += vec3(1.0, 0.52, 0.28) * exp(-gapA * 22.0) * 0.20 * back * (0.4 + u_heat);
    col += vec3(0.35, 0.62, 1.0) * exp(-gapB * 26.0) * 0.30 * back;
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
uniform float u_px, u_grain, u_gain;
out vec3 v_tint;
out float v_cover;
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
  if (p.w > 2.5) return;
  float age = texelFetch(u_vel, at, 0).w, seed = hash(float(gl_VertexID) + 0.37);
  vec4 view = u_view * vec4(p.xyz, 1.0);
  float size = mix(0.5, 2.2, seed * seed * seed) * u_grain * (p.w > 0.5 ? 2.4 : 1.0);
  float px = 2.0 * size * u_px / max(-view.z, 1e-4);
  float spot = max(px * 2.2, 2.6);
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
    float hot = exp(-age * 0.6);
    tint = vec3(0.55, 0.30, 0.18) * (0.20 + 0.30 * lobe) * lit + vec3(4.2, 1.25, 0.28) * hot * hot + vec3(1.6, 1.3, 0.9) * exp(-age * 5.0);
  } else {
    // 从望舒扯出来的：水汽和冰晶，受光时很亮
    tint = vec3(0.72, 0.88, 1.0) * (0.35 + 0.8 * lobe) * lit + vec3(0.16, 0.34, 0.60) * exp(-age * 0.9);
  }
  v_tint = tint * u_gain * smoothstep(0.0, 0.25, age + (p.w > 0.5 ? 0.25 : 0.0));
  v_cover = min(4.1 * px * px / (spot * spot), 1.0) * thin;
  gl_PointSize = spot;
  gl_Position = u_proj * view;
}`;
const DUST_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_tint;
in float v_cover;
out vec4 o;
uniform float u_direct;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
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
const FINAL_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_scene, u_bloom;
uniform float u_exposure, u_bloomGain, u_time;
in vec2 v_uv;
out vec4 o;
${COMMON}
void main() {
  vec3 c = texture(u_scene, v_uv).rgb + texture(u_bloom, v_uv).rgb * u_bloomGain;
  vec2 q = v_uv - 0.5;
  c *= u_exposure * (1.0 - 0.7 * dot(q, q));
  c = pow(filmic(c), vec3(1.0 / 2.2));
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
            (Math.hypot(u + mu, s, x[at + 1]) < frame.reach[0] && value > frame.level[0]) ||
            (Math.hypot(u - 1 + mu, s, x[at + 1]) < frame.reach[1] && value > frame.level[1]) ||
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
            spread = 0.16 * reach * Math.sqrt(rand()),
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
export function cameraBasis(eye, target, roll = 0) {
  const fwd = unit(sub(target, eye));
  let right = unit(cross(fwd, [0, 1, 0])),
    up = cross(right, fwd);
  if (roll) {
    const c = Math.cos(roll),
      s = Math.sin(roll);
    [right, up] = [
      right.map((value, i) => value * c + up[i] * s),
      up.map((value, i) => value * c - right[i] * s),
    ];
  }
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

export const SUN = unit([-0.42, 0.13, 0.90]); // 恒星只比轨道面高一点：两颗行星每一圈都会互相遮住

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
    for (let i = 1; i <= 5; i++) levels.push(target(Math.max(2, w >> i), Math.max(2, h >> i)));
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
    // scene：eye、target、fov、roll；frame（theta、mu、level、reach、centers、radii、heat）；dust = { pos, vel, size, count }；
    // grain（碎屑大小）、steps（行星求交的步数）、exposure、bloom、time。
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
        basis = cameraBasis(scene.eye, scene.target, scene.roll),
        { fwd, right, up } = basis,
        // prettier-ignore
        view = new Float32Array([
          right[0], up[0], -fwd[0], 0,
          right[1], up[1], -fwd[1], 0,
          right[2], up[2], -fwd[2], 0,
          -dot(right, scene.eye), -dot(up, scene.eye), dot(fwd, scene.eye), 1,
        ]),
        span = Math.hypot(...sub(scene.eye, scene.target)),
        near = Math.max(0.05, span - 12),
        far = span + 40,
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
      gl.uniform1f(back.u.u_heat, frame.heat);
      gl.uniform1f(back.u.u_l1, frame.l1);
      gl.uniform1f(back.u.u_time, scene.time || 0);
      gl.uniform1f(back.u.u_steps, scene.steps || 30);
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
        gl.uniform1f(final.u.u_bloomGain, scene.bloom ?? 0.45);
        gl.uniform1f(final.u.u_time, scene.time || 0);
        gl.uniform1f(final.u.u_direct, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(null);
      return vp;
    },
  };
}
