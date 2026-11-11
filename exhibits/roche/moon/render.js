// 洛希极限展品的画面（猫猫）。全是示意：这里决定东西「看起来」怎样，位置都来自 sim.js。
// 一帧的顺序：
//   1. 从正上方把碎石和冰尘拍成一张「轨道面密度图」（给环在行星上的影子、环挡住行星用）；
//   2. 背景：星空、银河、太阳、行星（条纹、大气、环的影子）、轨道面上的极限线；
//   3. 碎石和离得近的冰尘：画成不规则的小石块，受太阳光和行星反照；
//   4. 离得远的冰尘：叠加的微光，逆光时最亮（冰尘向前散射）；
//   5. 高动态范围 → 辉光 → 胶片曲线。没有浮点渲染目标时跳过 1 和 5，直接出图。
import { linkProgram, uniformsOf } from './sim.js?v=2';

const QUAD = `#version 300 es
in vec2 p;
out vec2 v_uv;
void main() { v_uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

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
  for (int i = 0; i < 4; i++) { sum += weight * noise3(p); p = p * 2.03 + 11.7; weight *= 0.5; }
  return sum;
}
vec3 filmic(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
uniform float u_direct;
// 有后期时输出线性的高动态范围颜色；没有时在这里直接过胶片曲线
vec3 finish(vec3 c) { return u_direct > 0.5 ? pow(filmic(c), vec3(1.0 / 2.2)) : c; }
`;

const BACK_FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 u_eye, u_right, u_up, u_fwd, u_sun;
uniform vec2 u_tan, u_res;
uniform mat4 u_vp;
uniform float u_fluid, u_rigid, u_orbit, u_lines, u_stars, u_extent, u_shadow;
uniform sampler2D u_density;
out vec4 o;
${COMMON}
// 星星是三维格子里的点，视线方向的球面经过哪颗就画哪颗；没有经纬度，所以没有接缝。
vec3 sky(vec3 rd) {
  vec3 col = vec3(0.0);
  const vec3 pole = vec3(0.36, 0.86, -0.36);
  float off = dot(rd, pole), band = exp(-off * off * 13.0);
  for (int layer = 0; layer < 3; layer++) {
    float scale = layer == 0 ? 70.0 : layer == 1 ? 150.0 : 310.0;
    vec3 g = rd * scale, cell = floor(g);
    vec3 at = cell + 0.2 + 0.6 * vec3(hash13(cell), hash13(cell + 17.3), hash13(cell + 41.7));
    float pick = hash13(cell + 7.7), need = mix(0.80, 0.55, band);
    if (pick < need) continue;
    float glow = smoothstep(0.12, 0.0, length(g - at));
    vec3 tint = mix(vec3(0.66, 0.78, 1.0), vec3(1.0, 0.84, 0.62), hash13(cell + 3.1));
    float power = (pick - need) / (1.0 - need);
    col += tint * glow * (layer == 0 ? 1.25 : layer == 1 ? 0.7 : 0.3) * (0.15 + power * power * 1.4);
  }
  // 银河：一条有疏有密的淡光带，中间压着几道暗的尘埃
  float cloud = fbm(rd * 3.1 + 4.0) * fbm(rd * 8.3);
  float lane = smoothstep(0.42, 0.62, fbm(rd * 5.7 + 9.0)) * band;
  col += vec3(0.42, 0.50, 0.68) * band * (0.010 + 0.16 * cloud * cloud);
  col += vec3(0.75, 0.52, 0.36) * band * band * 0.022 * fbm(rd * 2.2);
  return col * (1.0 - 0.7 * lane);
}
vec2 density(vec2 xz) { return texture(u_density, xz / u_extent * 0.5 + 0.5).rg; }
vec3 albedo(vec3 n) {
  float lat = n.y;
  vec3 q = vec3(n.x * 1.4, n.y * 6.5, n.z * 1.4);
  float turb = fbm(q * 2.1);
  float band = 0.5 + 0.5 * sin(lat * 23.0 + (turb - 0.5) * 3.4 + 0.6 * sin(lat * 61.0));
  vec3 a = mix(vec3(0.84, 0.72, 0.51), vec3(0.55, 0.45, 0.34), band);
  a = mix(a, vec3(0.95, 0.88, 0.72), smoothstep(0.50, 0.80, fbm(q * 4.7 + 7.0)) * 0.30);
  a *= 0.93 + 0.07 * sin(lat * 150.0 + turb * 7.0);
  return mix(a, vec3(0.40, 0.46, 0.52), smoothstep(0.68, 0.98, abs(lat)));
}
float ring(float r, float at, float w) { return 1.0 - smoothstep(0.35 * w, 1.5 * w, abs(r - at)); }

void main() {
  vec2 uv = gl_FragCoord.xy / u_res * 2.0 - 1.0;
  vec3 rd = normalize(u_fwd + uv.x * u_tan.x * u_right + uv.y * u_tan.y * u_up);
  vec3 col = u_stars > 0.5 ? sky(rd) : vec3(0.0);
  float depth = 0.9999999;

  float b = dot(u_eye, rd), c = dot(u_eye, u_eye) - 1.0, h = b * b - c;
  float tPlanet = h > 0.0 && b < 0.0 ? -b - sqrt(h) : -1.0;
  float facing = dot(rd, u_sun);
  if (tPlanet < 0.0) {
    // 太阳：一个很亮的小圆面，其余的光晕交给辉光
    col += vec3(1.0, 0.93, 0.80) * (48.0 * smoothstep(0.99997, 0.999993, facing) + 0.35 * pow(max(facing, 0.0), 1400.0) + 0.03 * pow(max(facing, 0.0), 60.0));
    if (b < 0.0) {
      // 行星边缘外面一圈很薄的大气：白天一侧微亮，逆光时被照得发金
      vec3 nearest = u_eye - b * rd;
      float gap = length(nearest) - 1.0, day = smoothstep(-0.25, 0.35, dot(normalize(nearest), u_sun));
      col += vec3(1.0, 0.80, 0.52) * exp(-gap * 48.0) * (0.10 * day + 2.6 * pow(max(facing, 0.0), 5.0));
    }
  } else {
    vec3 hit = u_eye + rd * tPlanet, n = normalize(hit);
    float ndl = dot(n, u_sun), day = smoothstep(-0.10, 0.20, ndl);
    // 环的影子：从这一点朝太阳走，穿过轨道面的地方有多少碎屑
    float shade = 1.0;
    if (abs(u_sun.y) > 1e-4) {
      float t = -hit.y / u_sun.y;
      if (t > 0.0) shade = exp(-u_shadow * density((hit + u_sun * t).xz).r);
    }
    float limb = pow(max(dot(n, -rd), 0.0), 0.42);
    col = albedo(n) * (max(ndl, 0.0) * 0.95 + 0.05 * day) * shade * limb * 1.05;
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    col += vec3(1.0, 0.78, 0.50) * fres * (0.42 * day + 2.2 * fres * pow(max(facing, 0.0), 6.0) * smoothstep(-0.4, 0.0, ndl));
    col += vec3(0.0025, 0.0030, 0.0042);
    vec4 clip = u_vp * vec4(hit, 1.0);
    depth = clip.z / clip.w * 0.5 + 0.5;
  }
  float tPlane = abs(rd.y) > 1e-5 ? -u_eye.y / rd.y : -1.0;
  if (tPlane > 0.0 && (tPlanet < 0.0 || tPlane < tPlanet)) {
    vec3 at = u_eye + rd * tPlane;
    // 碎屑挡在行星前面：斜着看穿过的碎屑更多
    if (tPlanet > 0.0) col *= exp(-min(0.7 * u_shadow * density(at.xz).g / max(abs(rd.y), 0.2), 1.6));
    // 轨道面上的线：流体极限（暖色点线）、刚体极限（冷色虚线）、卫星现在的轨道（细灰线）
    if (u_lines > 0.001) {
      float r = length(at.xz), w = fwidth(r), angle = atan(at.z, at.x);
      float fade = clamp(1.6 - w * 28.0, 0.0, 1.0) * u_lines;
      float dots = step(0.42, fract(angle * 150.0 / 6.2831853));
      float dash = step(0.5, fract(angle * 60.0 / 6.2831853));
      col += vec3(1.0, 0.86, 0.62) * 0.0018 * step(u_rigid, r) * step(r, u_fluid) * fade;
      col = mix(col, vec3(1.0, 0.82, 0.52) * 0.85, ring(r, u_fluid, w) * dots * 0.9 * fade);
      col = mix(col, vec3(0.42, 0.72, 1.0) * 0.7, ring(r, u_rigid, w) * dash * 0.75 * fade);
      col = mix(col, vec3(0.6, 0.64, 0.68) * 0.3, ring(r, u_orbit, w) * 0.5 * fade);
    }
  }
  o = vec4(finish(col), 1.0);
  gl_FragDepth = depth;
}`;

// 碎石和冰尘共用的顶点着色器。u_dust 时从冰尘纹理取位置，所属碎石是 index / u_per。
const GRAIN_VERTEX = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_pos, u_meta;
uniform ivec2 u_size, u_msize;
uniform int u_per;
uniform bool u_dust, u_glow;
uniform mat4 u_view, u_proj;
uniform vec3 u_sun, u_eye;
uniform float u_radius, u_px, u_minPx, u_gain;
out vec3 v_view, v_tint;
out float v_layer, v_lit, v_size, v_seed, v_radius;
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
void main() {
  ivec2 at = ivec2(gl_VertexID % u_size.x, gl_VertexID / u_size.x);
  vec4 p = texelFetch(u_pos, at, 0);
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  v_view = vec3(0.0);
  v_tint = vec3(0.0);
  v_layer = v_lit = v_size = v_seed = v_radius = 0.0;
  if (u_dust ? p.w > 1.5 : p.w < 0.5) return;
  float seed = hash(float(gl_VertexID) + 0.37);
  // 碎石大小略有参差；冰尘有大有小，多数很细
  float radius = u_radius * (u_dust ? mix(0.5, 1.7, seed * seed) : mix(0.84, 1.2, seed));
  vec4 view = u_view * vec4(p.xyz, 1.0);
  float px = 2.0 * radius * u_px / max(-view.z, 1e-4);
  // 冰尘：看得清的画成小石块，小到不足两个像素的交给微光那一遍，中间平滑过渡
  float resolved = clamp((px - 1.2) / 1.2, 0.0, 1.0);
  int parent = gl_VertexID / u_per;
  v_layer = texelFetch(u_meta, ivec2(parent % u_msize.x, parent / u_msize.x), 0).r;
  // 行星的影子：背着太阳、又落在行星的影柱里
  float along = dot(p.xyz, u_sun);
  v_lit = along < 0.0 ? smoothstep(0.985, 1.04, length(p.xyz - along * u_sun)) : 1.0;
  v_seed = seed;
  v_view = view.xyz;
  v_radius = radius;
  if (u_glow) {
    // 微光只给已经散开的冰尘；还贴在碎石上的，远看时由碎石本身代表
    if (resolved >= 1.0 || p.w < 0.5) return;
    float size = max(px * 2.2, 3.0);
    // 冰尘的散射：正对太阳看过去时最亮
    float facing = dot(normalize(p.xyz - u_eye), u_sun);
    float k = 0.55, lobe = (1.0 - k * k) / pow(1.0 + k * k - 2.0 * k * facing, 1.5);
    vec3 ice = mix(vec3(0.92, 0.88, 0.80), vec3(0.78, 0.86, 1.0), hash(seed * 91.0));
    // 颜色是「厚厚一层冰尘」该有的亮度；透明度是这一粒遮住的面积摊到整个光斑上的份额。
    // 叠得再多也只会趋近这个亮度，不会无限变亮。
    v_tint = ice * (0.22 + 0.36 * lobe) * v_lit * u_gain;
    v_radius = min(4.1 * px * px / (size * size), 1.0) * (1.0 - resolved);
    gl_PointSize = size;
    v_size = size;
  } else {
    if (u_dust && resolved <= 0.0) return;
    float size = max(px, u_minPx);
    gl_PointSize = size;
    v_size = size;
    v_tint = vec3(u_dust ? resolved : 1.0);
  }
  gl_Position = u_proj * view;
}`;

const ROCK_FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform mat4 u_proj;
uniform vec3 u_sunView, u_shineView, u_eye, u_right, u_up, u_fwd, u_center, u_sr, u_su, u_sun;
uniform float u_layers, u_shine, u_ext, u_range, u_shadowOn, u_map, u_pebble;
uniform sampler2D u_shadowMap;
in vec3 v_view, v_tint;
in float v_layer, v_lit, v_size, v_seed, v_radius;
out vec4 o;
${COMMON}
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  c.y = -c.y;
  // 不规则的轮廓：不是圆球，是有棱角的石块
  float angle = atan(c.y, c.x);
  float rim = 0.82 + 0.11 * sin(angle * 3.0 + v_seed * 40.0) + 0.07 * sin(angle * 7.0 + v_seed * 97.0);
  float r = length(c) / rim;
  if (r > 1.0) discard;
  vec3 n = vec3(c / rim, sqrt(1.0 - r * r));
  // 几块朝向不同的小平面；点太小时看不出来，就不加
  float detail = smoothstep(7.0, 18.0, v_size);
  vec3 cell = vec3(floor(c * 2.3 + v_seed * 17.0), v_seed * 53.0);
  vec3 tilt = vec3(hash13(cell), hash13(cell + 5.1), hash13(cell + 9.7)) - 0.5;
  vec3 smoothN = n;
  n = normalize(n + tilt * 0.5 * detail);
  // 太阳方向的影子图：前面的石块挡住后面的，碎石堆才有明暗面
  float sunlit = 1.0;
  if (u_shadowOn > 0.5) {
    vec3 surface = v_view + smoothN * v_radius;
    vec3 rel = u_eye + u_right * surface.x + u_up * surface.y - u_fwd * surface.z - u_center;
    vec2 uv = vec2(dot(rel, u_sr), dot(rel, u_su)) / u_ext * 0.5 + 0.5;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      float mine = 0.5 - dot(rel, u_sun) / (2.0 * u_range) - 0.0022, open = 0.0;
      for (int i = 0; i < 5; i++) {
        vec2 off = i == 4 ? vec2(0.0) : vec2(i % 2 == 0 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * 1.3 / u_map;
        open += step(mine, texture(u_shadowMap, uv + off).r);
      }
      sunlit = open / 5.0;
    }
  }
  // 外壳是脏的冰，中间是灰褐的岩石，核心是暗红的铁质
  float dirt = hash13(vec3(v_seed * 71.0, 3.0, 1.0));
  vec3 crust = mix(vec3(0.60, 0.66, 0.74), vec3(0.38, 0.35, 0.32), dirt * dirt);
  vec3 mantle = mix(vec3(0.26, 0.24, 0.22), vec3(0.38, 0.32, 0.26), dirt);
  vec3 core = mix(vec3(0.30, 0.16, 0.10), vec3(0.50, 0.27, 0.14), dirt);
  vec3 base = mix(core, mantle, smoothstep(0.40, 0.55, v_layer));
  base = mix(base, crust, smoothstep(0.74, 0.88, v_layer));
  base = mix(vec3(0.46, 0.46, 0.45) * (0.8 + 0.4 * dirt), base, u_layers);
  // 细碎的冰尘比大块暗、偏土色：远看是一层底色，大块的冰石在上面显出来
  base = mix(base, (0.35 * base + vec3(0.11, 0.095, 0.08)) * (0.7 + 0.6 * dirt), u_pebble);
  // 小到只有几个像素的石块不再各自分明暗，用整颗的平均受光，免得画面变成雪花点
  float whole = 0.30 + 0.45 * max(u_sunView.z, 0.0) + 0.25 * max(dot(smoothN, u_sunView), 0.0);
  float diffuse = mix(whole, max(dot(n, u_sunView), 0.0), smoothstep(3.0, 9.0, v_size)) * v_lit * sunlit;
  float shine = max(dot(n, u_shineView), 0.0) * u_shine; // 行星反照
  float glint = pow(max(reflect(-u_sunView, n).z, 0.0), 28.0) * v_lit * sunlit * smoothstep(0.74, 0.9, v_layer) * detail;
  float tuck = mix(1.0, 0.55 + 0.45 * smoothN.z, smoothstep(3.0, 9.0, v_size)); // 石块边缘压暗一点，堆在一起时有缝的感觉
  vec3 col = base * (1.1 * diffuse + shine * vec3(1.0, 0.84, 0.60) + 0.006) * tuck + vec3(0.9, 0.95, 1.0) * glint * 1.2;
  float edge = (1.0 - smoothstep(1.0 - 2.5 / v_size, 1.0, r)) * v_tint.x;
  o = vec4(finish(col), edge);
  vec4 clip = u_proj * vec4(v_view + n * v_radius, 1.0);
  gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
}`;

const GLOW_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_view, v_tint;
in float v_layer, v_lit, v_size, v_seed, v_radius;
out vec4 o;
uniform float u_direct;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float cover = v_radius * exp(-4.0 * r2);
  vec3 tone = u_direct > 0.5 ? pow(clamp(v_tint / (1.0 + v_tint), 0.0, 1.0), vec3(1.0 / 2.2)) : v_tint;
  o = vec4(tone * cover, cover);
}`;

// 从太阳看过去的深度图：只记离太阳最近的那一层
const SHADOW_VERTEX = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_pos;
uniform ivec2 u_size;
uniform bool u_dust;
uniform vec3 u_center, u_sr, u_su, u_sun;
uniform float u_radius, u_ext, u_map;
out float v_depth, v_radius;
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
void main() {
  vec4 p = texelFetch(u_pos, ivec2(gl_VertexID % u_size.x, gl_VertexID / u_size.x), 0);
  bool gone = u_dust ? p.w > 1.5 : p.w < 0.5;
  float seed = hash(float(gl_VertexID) + 0.37);
  float radius = 0.85 * u_radius * (u_dust ? mix(0.5, 1.7, seed * seed) : mix(0.84, 1.2, seed));
  vec3 rel = p.xyz - u_center;
  v_depth = dot(rel, u_sun);
  v_radius = radius;
  gl_Position = gone ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(dot(rel, u_sr) / u_ext, dot(rel, u_su) / u_ext, 0.0, 1.0);
  gl_PointSize = max(1.0, radius * u_map / u_ext);
}`;
const SHADOW_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_range;
in float v_depth, v_radius;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  gl_FragDepth = clamp(0.5 - (v_depth + v_radius * sqrt(1.0 - r2)) / (2.0 * u_range), 0.0, 1.0);
}`;

// 俯视的密度图：每个点把自己遮住的面积摊到一小块纹素上
const SPLAT_VERTEX = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_pos;
uniform ivec2 u_size;
uniform bool u_dust;
uniform float u_extent, u_value;
out float v_value, v_loose;
void main() {
  vec4 p = texelFetch(u_pos, ivec2(gl_VertexID % u_size.x, gl_VertexID / u_size.x), 0);
  bool gone = u_dust ? p.w > 1.5 : p.w < 0.5;
  v_loose = u_dust && p.w > 0.5 ? 1.0 : 0.0;
  gl_Position = gone ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(p.x / u_extent, p.z / u_extent, 0.0, 1.0);
  gl_PointSize = 7.0;
  v_value = u_value;
}`;
const SPLAT_FRAGMENT = `#version 300 es
precision highp float;
in float v_value, v_loose;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  // 高斯光斑，总量归一到一个纹素的面积上
  float amount = v_value * exp(-5.0 * dot(c, c)) * 0.13;
  o = vec4(amount, amount * v_loose, 0.0, 1.0);
}`;

// 后期：取出亮部 → 逐级缩小 → 逐级放大叠回 → 胶片曲线、暗角、一点颗粒
const BRIGHT_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_threshold;
in vec2 v_uv;
out vec4 o;
void main() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 off = vec2(i % 2 == 0 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * u_texel;
    vec3 s = min(texture(u_src, v_uv + off).rgb, vec3(40.0));
    float peak = max(s.r, max(s.g, s.b));
    c += s * max(peak - u_threshold, 0.0) / max(peak, 1e-4);
  }
  o = vec4(c * 0.25, 1.0);
}`;
const BLUR_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_spread;
in vec2 v_uv;
out vec4 o;
void main() {
  vec3 c = texture(u_src, v_uv).rgb * 4.0;
  for (int i = 0; i < 4; i++) {
    vec2 d = vec2(i % 2 == 0 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * u_texel * u_spread;
    c += texture(u_src, v_uv + d).rgb * 2.0;
  }
  c += texture(u_src, v_uv + vec2(2.0, 0.0) * u_texel * u_spread).rgb;
  c += texture(u_src, v_uv - vec2(2.0, 0.0) * u_texel * u_spread).rgb;
  c += texture(u_src, v_uv + vec2(0.0, 2.0) * u_texel * u_spread).rgb;
  c += texture(u_src, v_uv - vec2(0.0, 2.0) * u_texel * u_spread).rgb;
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
  c *= u_exposure * (1.0 - 0.67 * dot(q, q));
  c = pow(filmic(c), vec3(1.0 / 2.2));
  c += (hash13(vec3(gl_FragCoord.xy, u_time * 60.0 + u_direct)) - 0.5) * 0.018;
  o = vec4(c, 1.0);
}`;

// ---------- 很小的一组矩阵工具（列主序） ----------
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
export function cameraBasis(eye, target) {
  const fwd = unit(sub(target, eye)),
    right = unit(cross(fwd, [0, 1, 0])),
    up = cross(right, fwd);
  return { fwd, right, up };
}
function viewMatrix(eye, { fwd, right, up }) {
  // prettier-ignore
  return new Float32Array([
    right[0], up[0], -fwd[0], 0,
    right[1], up[1], -fwd[1], 0,
    right[2], up[2], -fwd[2], 0,
    -dot(right, eye), -dot(up, eye), dot(fwd, eye), 1,
  ]);
}
function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  // prettier-ignore
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}
function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  return out;
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

export const FOV = (36 * Math.PI) / 180;
export const SUN = unit([0.62, 0.42, 0.66]); // 太阳比轨道面高约 25°，行星的影子只扫到环的内侧
const EXTENT = 4.8, // 密度图覆盖 ±4.8 R
  MAP = 384,
  LEVELS = 5,
  SHADOW_MAP = 1536, // 影子图的边长（像素）
  SHADOW_EXT = 0.62, // 影子图覆盖卫星周围 ±0.62 R
  SHADOW_RANGE = 0.9;
const SUN_RIGHT = unit(cross(SUN, [0, 1, 0])),
  SUN_UP = cross(SUN_RIGHT, SUN);

export function createRenderer(gl, { allowHdr = true } = {}) {
  const make = (vertex, fragment) => {
    const program = linkProgram(gl, vertex, fragment);
    return { program, u: uniformsOf(gl, program) };
  };
  const back = make(QUAD, BACK_FRAGMENT),
    rock = make(GRAIN_VERTEX, ROCK_FRAGMENT),
    glow = make(GRAIN_VERTEX, GLOW_FRAGMENT),
    splat = make(SPLAT_VERTEX, SPLAT_FRAGMENT),
    shadow = make(SHADOW_VERTEX, SHADOW_FRAGMENT),
    bright = make(QUAD, BRIGHT_FRAGMENT),
    blur = make(QUAD, BLUR_FRAGMENT),
    final = make(QUAD, FINAL_FRAGMENT);
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
    const texture = gl.createTexture(),
      frame = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
      gl.texParameteri(gl.TEXTURE_2D, key, gl.LINEAR);
    for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
      gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('half-float target is not complete');
    return { texture, frame, w, h };
  };
  // 高动态范围需要能往半浮点纹理里画
  let hdr = allowHdr && Boolean(
    gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'),
  );
  let densityMap = null,
    stage = null;
  try {
    if (hdr) densityMap = target(MAP, MAP);
  } catch {
    hdr = false;
  }
  function ensureStage(w, h) {
    if (stage && stage.w === w && stage.h === h) return;
    if (stage) {
      gl.deleteFramebuffer(stage.msaa);
      gl.deleteRenderbuffer(stage.color);
      gl.deleteRenderbuffer(stage.depth);
      for (const level of [stage.resolve, ...stage.levels]) {
        gl.deleteFramebuffer(level.frame);
        gl.deleteTexture(level.texture);
      }
      stage = null;
    }
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES)),
      msaa = gl.createFramebuffer(),
      color = gl.createRenderbuffer(),
      depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA16F, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('multisampled target is not complete');
    const levels = [];
    for (let i = 1; i <= LEVELS; i++) levels.push(target(Math.max(2, w >> i), Math.max(2, h >> i)));
    stage = { w, h, msaa, color, depth, resolve: target(w, h), levels };
  }

  // 影子图：只有深度的一张纹理
  const shadowMap = gl.createTexture(),
    shadowFrame = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, shadowMap);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.DEPTH_COMPONENT24,
    SHADOW_MAP,
    SHADOW_MAP,
    0,
    gl.DEPTH_COMPONENT,
    gl.UNSIGNED_INT,
    null,
  );
  for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
    gl.texParameteri(gl.TEXTURE_2D, key, gl.NEAREST);
  for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
    gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFrame);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowMap, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  const shadows = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const meta = gl.createTexture();
  let metaSize = [0, 0];
  const bind = (unit, texture) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  };
  const pass = (shader, to, w, h) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, to);
    gl.viewport(0, 0, w, h);
    gl.useProgram(shader.program);
  };

  return {
    get hdr() {
      return hdr;
    },
    // 每颗碎石在碎石堆里原来的相对深度（0 = 中心，1 = 表面）
    setLayers(depth, [w, h]) {
      const data = new Float32Array(4 * w * h);
      for (let i = 0; i < depth.length; i++) data[4 * i] = depth[i];
      gl.bindTexture(gl.TEXTURE_2D, meta);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      metaSize = [w, h];
    },
    // scene：eye、target、fov；rocks / dust = { texture, size, count, per }；radius（碎石）、grain（冰尘）；
    // fluid、rigid、orbit、lines（0–1）；stars、layers；shine = { direction, strength }；exposure、bloom、glow、shadow；time。
    draw(scene) {
      const { width, height } = gl.canvas;
      if (hdr) {
        try {
          ensureStage(width, height);
        } catch (error) {
          console.warn('Roche exhibit: no HDR target, drawing directly.', error);
          hdr = false;
          stage = null;
        }
      }
      const aspect = width / height,
        fov = scene.fov || FOV,
        basis = cameraBasis(scene.eye, scene.target),
        view = viewMatrix(scene.eye, basis),
        span = Math.hypot(...sub(scene.eye, scene.target)),
        proj = perspective(fov, aspect, Math.max(0.004, span * 0.02), span + 400),
        vp = multiply(proj, view),
        tanV = Math.tan(fov / 2),
        direct = hdr ? 0 : 1,
        ready = scene.rocks && metaSize[0],
        texel = (2 * EXTENT) / MAP;
      const points = (shader, source, dust) => {
        bind(0, source.texture);
        gl.uniform1i(shader.u.u_pos, 0);
        gl.uniform2i(shader.u.u_size, source.size[0], source.size[1]);
        gl.uniform1i(shader.u.u_dust, dust ? 1 : 0);
        gl.drawArrays(gl.POINTS, 0, source.count);
      };

      gl.disable(gl.BLEND);
      gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      // 1) 密度图
      if (hdr && ready) {
        pass(splat, densityMap.frame, MAP, MAP);
        gl.disable(gl.DEPTH_TEST);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindVertexArray(empty);
        gl.uniform1f(splat.u.u_extent, EXTENT);
        gl.uniform1f(splat.u.u_value, (Math.PI * scene.radius ** 2) / (texel * texel));
        points(splat, scene.rocks, false);
        if (scene.dust) {
          gl.uniform1f(splat.u.u_value, (Math.PI * (scene.grain * 1.1) ** 2) / (texel * texel));
          points(splat, scene.dust, true);
        }
        gl.disable(gl.BLEND);
      }

      // 1b) 影子图：从太阳方向看卫星附近的石块
      const focus = scene.focus || [0, 0, 0];
      if (shadows && ready) {
        pass(shadow, shadowFrame, SHADOW_MAP, SHADOW_MAP);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.depthFunc(gl.LESS);
        gl.clearDepth(1);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.bindVertexArray(empty);
        gl.uniform3fv(shadow.u.u_center, focus);
        gl.uniform3fv(shadow.u.u_sr, SUN_RIGHT);
        gl.uniform3fv(shadow.u.u_su, SUN_UP);
        gl.uniform3fv(shadow.u.u_sun, SUN);
        gl.uniform1f(shadow.u.u_ext, SHADOW_EXT);
        gl.uniform1f(shadow.u.u_map, SHADOW_MAP);
        gl.uniform1f(shadow.u.u_range, SHADOW_RANGE);
        gl.uniform1f(shadow.u.u_radius, scene.radius);
        points(shadow, scene.rocks, false);
        if (scene.dust) {
          gl.uniform1f(shadow.u.u_radius, scene.grain);
          points(shadow, scene.dust, true);
        }
      }

      // 2) 背景
      gl.bindFramebuffer(gl.FRAMEBUFFER, hdr ? stage.msaa : null);
      gl.viewport(0, 0, width, height);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.depthFunc(gl.ALWAYS);
      gl.useProgram(back.program);
      gl.bindVertexArray(quad);
      bind(0, hdr ? densityMap.texture : meta);
      gl.uniform1i(back.u.u_density, 0);
      gl.uniform1f(back.u.u_extent, EXTENT);
      gl.uniform1f(back.u.u_shadow, hdr ? (scene.shadow ?? 5) : 0);
      gl.uniform1f(back.u.u_direct, direct);
      gl.uniform3fv(back.u.u_eye, scene.eye);
      gl.uniform3fv(back.u.u_right, basis.right);
      gl.uniform3fv(back.u.u_up, basis.up);
      gl.uniform3fv(back.u.u_fwd, basis.fwd);
      gl.uniform3fv(back.u.u_sun, SUN);
      gl.uniform2f(back.u.u_tan, tanV * aspect, tanV);
      gl.uniform2f(back.u.u_res, width, height);
      gl.uniformMatrix4fv(back.u.u_vp, false, vp);
      gl.uniform1f(back.u.u_fluid, scene.fluid);
      gl.uniform1f(back.u.u_rigid, scene.rigid);
      gl.uniform1f(back.u.u_orbit, scene.orbit);
      gl.uniform1f(back.u.u_lines, scene.lines);
      gl.uniform1f(back.u.u_stars, scene.stars ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (ready) {
        const common = (shader, source, dust, radius) => {
          gl.useProgram(shader.program);
          bind(1, meta);
          gl.uniform1i(shader.u.u_meta, 1);
          gl.uniform2i(shader.u.u_msize, metaSize[0], metaSize[1]);
          gl.uniform1i(shader.u.u_per, dust ? source.per : 1);
          gl.uniformMatrix4fv(shader.u.u_view, false, view);
          gl.uniformMatrix4fv(shader.u.u_proj, false, proj);
          gl.uniform3fv(shader.u.u_sun, SUN);
          gl.uniform3fv(shader.u.u_eye, scene.eye);
          gl.uniform1f(shader.u.u_radius, radius);
          gl.uniform1f(shader.u.u_px, height / (2 * tanV));
          gl.uniform1f(shader.u.u_minPx, 1.7 * (scene.pixelRatio || 1));
          gl.uniform1f(shader.u.u_direct, direct);
        };
        const toView = (v) => [dot(basis.right, v), dot(basis.up, v), -dot(basis.fwd, v)];
        // 3) 石块
        gl.depthFunc(gl.LESS);
        if (hdr) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        gl.bindVertexArray(empty);
        for (const [source, dust, radius] of [
          [scene.rocks, false, scene.radius],
          [scene.dust, true, scene.grain],
        ]) {
          if (!source) continue;
          common(rock, source, dust, radius);
          gl.uniform1i(rock.u.u_glow, 0);
          gl.uniform3fv(rock.u.u_sunView, toView(SUN));
          gl.uniform3fv(rock.u.u_shineView, toView(scene.shine.direction));
          gl.uniform1f(rock.u.u_shine, scene.shine.strength);
          gl.uniform1f(rock.u.u_layers, scene.layers ? 1 : 0);
          gl.uniform1f(rock.u.u_pebble, dust ? 1 : 0);
          gl.uniform3fv(rock.u.u_right, basis.right);
          gl.uniform3fv(rock.u.u_up, basis.up);
          gl.uniform3fv(rock.u.u_fwd, basis.fwd);
          gl.uniform3fv(rock.u.u_center, focus);
          gl.uniform3fv(rock.u.u_sr, SUN_RIGHT);
          gl.uniform3fv(rock.u.u_su, SUN_UP);
          gl.uniform1f(rock.u.u_ext, SHADOW_EXT);
          gl.uniform1f(rock.u.u_range, SHADOW_RANGE);
          gl.uniform1f(rock.u.u_map, SHADOW_MAP);
          gl.uniform1f(rock.u.u_shadowOn, shadows ? 1 : 0);
          bind(2, shadowMap);
          gl.uniform1i(rock.u.u_shadowMap, 2);
          points(rock, source, dust);
        }
        gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        // 4) 远处冰尘的微光：只叠加，不写深度
        if (scene.dust) {
          gl.depthMask(false);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          common(glow, scene.dust, true, scene.grain);
          gl.uniform1i(glow.u.u_glow, 1);
          gl.uniform1f(glow.u.u_gain, scene.glow ?? 1);
          points(glow, scene.dust, true);
          gl.disable(gl.BLEND);
          gl.depthMask(true);
        }
      }

      // 5) 后期
      if (hdr) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, stage.msaa);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, stage.resolve.frame);
        gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.disable(gl.DEPTH_TEST);
        gl.bindVertexArray(quad);
        const levels = stage.levels;
        // 取亮部并逐级缩小
        let from = stage.resolve;
        for (let i = 0; i < levels.length; i++) {
          const to = levels[i],
            shader = i ? blur : bright;
          pass(shader, to.frame, to.w, to.h);
          bind(0, from.texture);
          gl.uniform1i(shader.u.u_src, 0);
          gl.uniform2f(shader.u.u_texel, 1 / from.w, 1 / from.h);
          if (i) gl.uniform1f(blur.u.u_spread, 1);
          else gl.uniform1f(bright.u.u_threshold, 0.85);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          from = to;
        }
        // 从最小的一级往回放大，叠到上一级自己的那一份上
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        for (let i = levels.length - 1; i > 0; i--) {
          const to = levels[i - 1];
          pass(blur, to.frame, to.w, to.h);
          bind(0, from.texture);
          gl.uniform1i(blur.u.u_src, 0);
          gl.uniform2f(blur.u.u_texel, 1 / from.w, 1 / from.h);
          gl.uniform1f(blur.u.u_spread, 0.75);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          from = to;
        }
        gl.disable(gl.BLEND);
        pass(final, null, width, height);
        bind(0, stage.resolve.texture);
        bind(1, levels[0].texture);
        gl.uniform1i(final.u.u_scene, 0);
        gl.uniform1i(final.u.u_bloom, 1);
        gl.uniform1f(final.u.u_exposure, scene.exposure ?? 1);
        gl.uniform1f(final.u.u_bloomGain, scene.bloom ?? 0.5);
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
