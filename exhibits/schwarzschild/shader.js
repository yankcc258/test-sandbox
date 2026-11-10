// 史瓦西黑洞的片元着色器（露娜）：每个像素从相机射出一条光线，按 geodesic.js 里同一个方程一步步积分。
//   d²x/dλ² = -(3/2) r_s h² x / r⁵ ，r_s = 1
// 光线穿过赤道面（y = 0）且半径在吸积盘范围内 → 画盘（带多普勒和引力红移）；掉进视界 → 黑；飞远 → 按最后的方向画星空。
// 相机是静止在 r0 的观察者：本地方向换成坐标方向时径向分量乘 √(1 - 1/r0)（见 geodesic.js 的 radialStretch）。
export const VERTEX = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
  uv = p;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform vec3 u_cam;      // 相机位置（r_s 为单位），盘的轴是 +y
uniform vec3 u_right, u_up, u_fwd;
uniform vec2 u_tan;      // 水平、垂直视场半角的正切
uniform float u_time;
uniform float u_rin, u_rout;
uniform float u_disk, u_shift, u_stars;
uniform int u_steps, u_aa;
uniform vec2 u_res;
const int MAX_STEPS = 520;

float hash13(vec3 q) {
  q = fract(q * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}
float hash12(vec2 q) {
  vec3 q3 = fract(vec3(q.xyx) * 0.1031);
  q3 += dot(q3, q3.yzx + 33.33);
  return fract((q3.x + q3.y) * q3.z);
}
float noise(vec2 q) {
  vec2 i = floor(q), f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 q) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(q); q = q * 2.03 + 7.1; a *= 0.5; }
  return v;
}
// 黑体的颜色（只取色调，亮度另算），T 单位 K
vec3 blackbody(float T) {
  float t = clamp(T, 1000.0, 40000.0) / 100.0;
  float r = t <= 66.0 ? 1.0 : clamp(1.292936 * pow(t - 60.0, -0.1332047), 0.0, 1.0);
  float g = t <= 66.0 ? clamp(0.390082 * log(t) - 0.631841, 0.0, 1.0)
                      : clamp(1.129891 * pow(t - 60.0, -0.0755148), 0.0, 1.0);
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.543207 * log(t - 10.0) - 1.196254, 0.0, 1.0));
  return vec3(r, g, b);
}
// 星空：按方向在三维格子里撒星，再加一条银河的光雾
vec3 stars(vec3 d) {
  vec3 c = vec3(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float k = layer == 0 ? 120.0 : 46.0;
    vec3 q = d * k, id = floor(q), f = fract(q) - 0.5;
    float rnd = hash13(id + float(layer) * 17.0);
    vec3 off = vec3(hash13(id + 1.7), hash13(id + 5.3), hash13(id + 9.1)) - 0.5;
    float dist = length(f - off * 0.7);
    float on = step(layer == 0 ? 0.86 : 0.95, rnd);
    float size = layer == 0 ? 0.09 : 0.14;
    float glow = smoothstep(size, 0.0, dist);
    vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.86, 0.66), hash13(id + 3.3));
    c += on * glow * glow * tint * (layer == 0 ? 0.9 : 1.6);
  }
  // 银河：绕一个倾斜的大圆的一条光雾。用方向在两个垂直轴上的投影取噪声，没有接缝
  vec3 axis = normalize(vec3(0.35, 0.86, 0.36));
  vec3 e1 = normalize(cross(axis, vec3(0.0, 0.0, 1.0))), e2 = cross(axis, e1);
  float lat = dot(d, axis);
  float band = exp(-lat * lat * 14.0);
  vec2 gq = vec2(dot(d, e1), dot(d, e2)) * 5.0 + sign(dot(d, e1 + e2)) * 13.0;
  float cloud = fbm(gq + vec2(lat * 6.0, 0.0));
  c += band * (0.012 + 0.07 * cloud * cloud) * vec3(0.66, 0.72, 0.95);
  return c;
}
// 吸积盘上一点的颜色和不透明度。pos 在 y≈0 的平面上；lz 是这条光子绕 +y 轴的角动量 L_z/E；obs 是相机处的引力红移修正
vec4 disk(vec3 pos, float lz, float obs) {
  float r = length(pos.xz);
  if (r < u_rin || r > u_rout) return vec4(0.0);
  float omega = sqrt(0.5 / (r * r * r));              // 开普勒角速度，M = r_s/2
  float g = sqrt(1.0 - 1.5 / r) / (1.0 - omega * lz) / obs;
  g = mix(1.0, g, u_shift);
  // 薄盘的发光强度 ∝ r⁻³ (1 - √(r_in/r))，在 r = (49/36) r_in 处最亮
  float flux = (1.0 - sqrt(u_rin / r)) / (r * r * r);
  float peak = u_rin * 49.0 / 36.0;
  float fmax = (1.0 - sqrt(u_rin / peak)) / (peak * peak * peak);
  float f = flux / fmax;
  float T = 4700.0 * pow(max(f, 1e-4), 0.25) * g;      // 最亮处约 4700 K（示意），外圈更冷更红
  // 纹理跟着各自的角速度转（内圈快、外圈慢）；两个相位交替淡入，避免越缠越细
  float period = 60.0, ph = u_time / period;
  float w = 0.0, tex = 0.0;
  for (int k = 0; k < 2; k++) {
    float t = fract(ph + float(k) * 0.5);
    float a = omega * t * period * 2.2;
    vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * pos.xz;
    float weight = 1.0 - abs(2.0 * t - 1.0);
    tex += weight * fbm(vec2(length(q) * 3.1, atan(q.y, q.x) * 2.0) + float(k) * 11.0 + q * 0.35);
    w += weight;
  }
  tex = 0.35 + 1.3 * tex / w;
  float edge = smoothstep(u_rin, u_rin + 0.35, r) * (1.0 - smoothstep(u_rout - 2.5, u_rout, r));
  float bright = pow(f, 0.8) * tex * pow(g, 4.0) * 1.6; // 观测到的亮度 ∝ g⁴
  return vec4(blackbody(T) * bright, edge * clamp(0.45 + 1.4 * f * tex, 0.0, 0.97));
}

// 一条光线：返回还没做色调映射的颜色
vec3 trace(vec2 q) {
  vec3 n = normalize(u_fwd + q.x * u_tan.x * u_right + q.y * u_tan.y * u_up);
  float r0 = length(u_cam);
  vec3 rhat = u_cam / r0;
  float obs = sqrt(1.0 - 1.0 / r0);                   // 静止观察者的 √(1 - r_s/r0)
  float nr = dot(n, rhat);
  vec3 v = normalize(nr * obs * rhat + (n - nr * rhat)); // 本地方向 → 坐标方向
  vec3 x = u_cam;
  vec3 L = cross(x, v);
  float h2 = dot(L, L);
  // 真实的光子是沿这条线反着飞过来的：L_z/E = -(x × n)·ŷ / √(1 - 1/r0)
  float lz = -cross(u_cam, n).y / obs;
  float far = max(60.0, 2.0 * r0);
  vec3 col = vec3(0.0);
  float trans = 1.0;
  bool fell = false, out_ = false;
  for (int i = 0; i < MAX_STEPS; i++) {
    if (i >= u_steps) break;
    float r = length(x);
    if (r < 1.0) { fell = true; break; }
    if (r > far && dot(x, v) > 0.0) { out_ = true; break; }
    float dt = clamp(0.1 * (r - 0.6), 0.012, 0.6);
    // 快到赤道面时别一步跨太远（盘很薄，跨过去会漏掉）
    if (u_disk > 0.5 && r < u_rout + 2.0) dt = min(dt, max(0.012, abs(x.y) * 0.5 + 0.02));
    vec3 a = -1.5 * h2 * x / pow(r, 5.0);
    vec3 vh = v + a * dt * 0.5;
    vec3 xn = x + vh * dt;
    float rn = length(xn);
    vec3 an = -1.5 * h2 * xn / pow(rn, 5.0);
    vec3 vn = vh + an * dt * 0.5;
    if (u_disk > 0.5 && x.y * xn.y < 0.0) {
      vec3 hit = mix(x, xn, x.y / (x.y - xn.y));
      vec4 d = disk(hit, lz, obs);
      col += trans * d.rgb * d.a;
      trans *= 1.0 - d.a;
      if (trans < 0.02) break;
    }
    x = xn;
    v = vn;
  }
  // 没掉进去、也没走完（步数用完，多半是在光子球附近绕圈）的按掉进去算
  if (out_ && u_stars > 0.5) col += trans * stars(normalize(v));
  return col;
}
void main() {
  // 每个像素取 u_aa × u_aa 条光线（画面静止或机器够快时 2 × 2，贴着黑影的细环不会断成一截一截）
  vec3 col = vec3(0.0);
  vec2 px = 2.0 / u_res;
  for (int i = 0; i < u_aa; i++)
    for (int j = 0; j < u_aa; j++)
      col += trace(uv + (vec2(float(i), float(j)) + 0.5) / float(u_aa) * px - 0.5 * px);
  col /= float(u_aa * u_aa);
  // 按亮度压缩，保住颜色（直接对每个通道压缩会把亮处洗成白色）
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= (1.0 - exp(-lum * 1.05)) / max(lum, 1e-4);
  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 1.15);
  color = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}`;
