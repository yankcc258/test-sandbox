// 每个像素在自己的轨道平面内求解史瓦西零测地线；颜色最后才做曝光映射。
import { ORBIT_STEP, ORBIT_MAX_STEPS, ORBIT_GLSL, DISK_TIME_SCALE } from './orbit.js?v=2';
export const VERTEX = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p; gl_Position = vec4(p, 0.0, 1.0); }
`;

export const FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform vec3 u_cam, u_right, u_up, u_fwd;
uniform vec2 u_tan, u_res;
uniform float u_time, u_rin, u_rout, u_disk, u_shift, u_stars;
uniform int u_aa, u_debug;
const float PI = 3.141592653589793;
const float ORBIT_STEP = ${ORBIT_STEP};
const int MAX_STEPS = ${ORBIT_MAX_STEPS};
${ORBIT_GLSL}

float hash13(vec3 q) {
  q = fract(q * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}
float hash12(vec2 q) {
  vec3 p = fract(vec3(q.xyx) * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
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
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
        mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
        mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float skyCloud(vec3 d) {
  return 0.55 * noise3(d * 5.0 + 19.0)
       + 0.28 * noise3(d * 10.1 + 7.0)
       + 0.17 * noise3(d * 20.3 + 31.0);
}
// 无经纬接缝：连续三维噪声在单位球面取值，星点核在格子边界前归零。
vec3 stars(vec3 d) {
  vec3 c = vec3(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float k = layer == 0 ? 120.0 : 46.0;
    vec3 q = d * k, id = floor(q), f = fract(q) - 0.5;
    float rnd = hash13(id + float(layer) * 17.0);
    vec3 off = vec3(hash13(id + 1.7), hash13(id + 5.3), hash13(id + 9.1)) - 0.5;
    float dist = length(f - off * 0.6);
    float on = step(layer == 0 ? 0.86 : 0.95, rnd);
    float size = layer == 0 ? 0.10 : 0.15;
    float glow = 1.0 - smoothstep(0.0, size, dist);
    vec3 tint = mix(vec3(0.70, 0.82, 1.0), vec3(1.0, 0.88, 0.72), hash13(id + 3.3));
    c += on * glow * glow * tint * (layer == 0 ? 0.8 : 1.25);
  }
  float lat = dot(d, normalize(vec3(0.35, 0.86, 0.36)));
  float band = exp(-lat * lat * 18.0), cloud = skyCloud(d);
  // 很淡的冷色光雾，让吸积盘占主导；不是额外加出的黑洞光环。
  c += (0.00045 + band * (0.0015 + 0.018 * cloud * cloud)) * vec3(0.58, 0.70, 1.0);
  return c;
}
vec3 blackbody(float T) {
  float t = clamp(T, 1000.0, 40000.0) / 100.0;
  float r = t <= 66.0 ? 1.0 : clamp(1.292936 * pow(t - 60.0, -0.1332047), 0.0, 1.0);
  float g = t <= 66.0 ? clamp(0.390082 * log(t) - 0.631841, 0.0, 1.0)
                      : clamp(1.129891 * pow(t - 60.0, -0.0755148), 0.0, 1.0);
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.543207 * log(t - 10.0) - 1.196254, 0.0, 1.0));
  return vec3(r, g, b);
}
// 无限薄、光学厚的示意盘：首次与盘相交即停止追踪，避免透过盘叠出伪像。
vec3 disk(vec3 pos, float lz, float obs) {
  float r = length(pos.xz);
  float omega = sqrt(0.5 / (r * r * r));
  float g = sqrt(1.0 - 1.5 / r) / (1.0 - omega * lz) / obs;
  g = mix(1.0, g, u_shift);
  float flux = (1.0 - sqrt(u_rin / r)) / (r * r * r);
  float peak = u_rin * 49.0 / 36.0;
  float fmax = (1.0 - sqrt(u_rin / peak)) / (peak * peak * peak);
  float f = max(0.0, flux / fmax);
  float T = 5100.0 * pow(max(f, 1e-4), 0.25) * g;
  float period = 60.0, ph = u_time / period, w = 0.0, tex = 0.0;
  for (int k = 0; k < 2; k++) {
    float t = fract(ph + float(k) * 0.5);
    float a = omega * t * period * ${DISK_TIME_SCALE};
    // +y 的物质速度为 (Ωz,0,-Ωx)，逆向取样是 xz 平面的 +a 旋转。
    vec2 q = vec2(cos(a) * pos.x - sin(a) * pos.z, sin(a) * pos.x + cos(a) * pos.z);
    float weight = 1.0 - abs(2.0 * t - 1.0);
    // 全部用连续的平面坐标，不用有 ±π 接缝的 atan 作为噪声坐标。
    float eddy = fbm(q * 0.65 + float(k) * 11.0);
    float ribbons = fbm(vec2(r * 7.0, eddy * 2.5 + float(k) * 9.0));
    tex += weight * (0.55 * eddy + 0.45 * ribbons);
    w += weight;
  }
  tex = 0.65 + 0.8 * tex / w;
  float edge = smoothstep(u_rin, u_rin + 0.22, r) * (1.0 - smoothstep(u_rout - 2.0, u_rout, r));
  float bright = f * tex * edge * pow(g, 4.0) * 1.8;
  return blackbody(T) * bright;
}
vec3 directionAt(vec3 radial, vec3 tangent, float phi) {
  return cos(phi) * radial + sin(phi) * tangent;
}
// alpha 保存终点类别用于检查：0 视界，1 无穷远，2 盘面，3 未收敛。
vec4 trace(vec2 q) {
  vec3 n = normalize(u_fwd + q.x * u_tan.x * u_right + q.y * u_tan.y * u_up);
  float r0 = length(u_cam), obs = sqrt(1.0 - 1.0 / r0);
  vec3 radial = u_cam / r0;
  float nr = dot(n, radial);
  vec3 transverse = n - nr * radial;
  float nt = length(transverse);
  if (nt < 1e-7) return nr < 0.0 ? vec4(0.0) : vec4(u_stars * stars(n), 1.0);
  vec3 tangent = transverse / nt;
  vec2 s = vec2(1.0 / r0, -nr * obs / (r0 * nt));
  float lz = -cross(u_cam, n).y / obs;
  float phi = 0.0;
  float crossing = atan(-radial.y, tangent.y);
  if (crossing <= 1e-7) crossing += PI;
  // 正侧面共面射线没有离散交点；容忍片元插值的单精度舍入误差。
  if (u_disk < 0.5 || length(vec2(radial.y, tangent.y)) < 1e-6) crossing = 1e6;
  for (int i = 0; i < MAX_STEPS; i++) {
    // 准确走到赤道面，再判断半径是否在盘内；不因接近盘面而无限缩步。
    float h = min(ORBIT_STEP, crossing - phi);
    vec2 next = orbitStep(s, h);
    if (next.x >= 1.0) return vec4(0.0);
    if (next.x <= 0.0) {
      float end = phi + escapeStep(s, h);
      return vec4(u_stars * stars(directionAt(radial, tangent, end)), 1.0);
    }
    phi += h;
    s = next;
    if (phi >= crossing - 1e-6) {
      float r = 1.0 / s.x;
      if (r >= u_rin && r <= u_rout) {
        vec3 hit = r * directionAt(radial, tangent, phi);
        return vec4(disk(hit, lz, obs), 2.0);
      }
      crossing += PI;
    }
  }
  // 只有浮点精度下极接近临界的轨道可能未收敛；保留独立状态供回归检查。
  return vec4(0.0, 0.0, 0.0, 3.0);
}
void main() {
  if (u_debug == 1) {
    float status = trace(uv).a;
    color = vec4(status < 0.5 ? vec3(0,0,1) : status < 1.5 ? vec3(0,1,0) : status < 2.5 ? vec3(1,0,0) : vec3(1,0,1), 1.0);
    return;
  }
  vec3 col = vec3(0.0);
  vec2 px = 2.0 / u_res;
  // 临界曲线附近单独加密到 4×4：空间积分保住细环，不用发光描边改变阴影。
  float r0 = length(u_cam), slope = length(uv * u_tan);
  float impact = r0 * slope / sqrt(1.0 + slope * slope) / sqrt(1.0 - 1.0 / r0);
  int samples = abs(impact - 2.598076211) < 2.0 * max(fwidth(impact), 1e-5) ? 4 : u_aa;
  for (int i = 0; i < samples; i++)
    for (int j = 0; j < samples; j++)
      col += trace(uv + (vec2(float(i), float(j)) + 0.5) / float(samples) * px - 0.5 * px).rgb;
  col /= float(samples * samples);
  // 只按亮度压缩，保留频移带来的色差；不在阴影上叠光晕。
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= (1.0 - exp(-lum * 1.05)) / max(lum, 1e-4);
  color = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}`;
