// 每个像素在自己的轨道平面内求解史瓦西零测地线；颜色最后才做曝光映射。
import { ORBIT_STEP, ORBIT_MAX_STEPS, ORBIT_GLSL, DISK_TIME_SCALE } from './orbit.js?v=2';
export const VERTEX = `#version 300 es
layout(location=0) in vec2 p;
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
uniform int u_aa, u_debug, u_probe, u_hdr;
uniform vec3 u_beta;
uniform float u_gamma;
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
  if (u_probe == 1) {
    // 固定在天球上的合成银河与尘埃带；同样经由测地线采样，重复像不是屏幕叠图。
    vec3 axis = normalize(vec3(0.12, 0.75, 0.65));
    float latitude = dot(d, axis);
    float mist = skyCloud(d * 1.7);
    float ridge = latitude + 0.025 * (noise3(d * 18.0 + 8.0) - 0.5);
    float halo = exp(-latitude * latitude * 25.0);
    float core = exp(-ridge * ridge * 180.0);
    float dust = noise3(d * 34.0 + 51.0) * noise3(d * 71.0 + 9.0);
    float lanes = smoothstep(0.08, 0.42, dust);
    vec3 haze = mix(vec3(0.38, 0.46, 0.64), vec3(1.0, 0.80, 0.57), mist);
    c += haze * (halo * 0.018 + core * (0.045 + 0.26 * mist * mist) * lanes);
    float grains = pow(noise3(d * 260.0 + 23.0), 12.0);
    c += vec3(0.76, 0.82, 1.0) * core * grains * 0.7;
    // 两团遥远星云为旋转 / 透镜提供辨认参照，不对应真实星图。
    float a = max(0.0, dot(d, normalize(vec3(-0.82, 0.20, -0.54))));
    float b = max(0.0, dot(d, normalize(vec3(-0.72, -0.02, -0.69))));
    c += vec3(0.43, 0.57, 0.82) * (pow(a, 450.0) + 0.6 * pow(b, 800.0)) * (0.08 + 0.22 * mist);
  }
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
// 外部观察：无限薄、光学厚的示意盘，首次与盘相交即停止追踪（cover = 1）。
// 影像模式（猫猫，2026-11-11）：同一张无限薄的盘面，但当成半透明的发光气体——
// cover 是光线这一次穿过盘面被挡住的比例，稀薄处能透出后面的光；光线继续追踪，后面的像按透过率叠加。
vec3 disk(vec3 pos, float ly, float energy, out float cover) {
  float r = length(pos.xz);
  float omega = sqrt(0.5 / (r * r * r));
  float g = sqrt(1.0 - 1.5 / r) / (energy - omega * ly);
  g = mix(1.0, g, u_shift);
  float flux = (1.0 - sqrt(u_rin / r)) / (r * r * r);
  float peak = u_rin * 49.0 / 36.0;
  float fmax = (1.0 - sqrt(u_rin / peak)) / (peak * peak * peak);
  float f = max(0.0, flux / fmax);
  // 探测器影像采用暖色示意色温；保留频移和辐射强度的独立计算。
  // 影像模式把色温的层次拉开（示意）：内沿黄白、外沿暗红，频移照常乘上去。
  float T = (u_probe == 1 ? 4300.0 * pow(max(f, 1e-4), 0.42) : 5100.0 * pow(max(f, 1e-4), 0.25)) * g;
  // 镜头离盘面这一点有多近：贴着掠过时再加两层细丝
  float nearby = u_probe == 1 ? 1.0 - smoothstep(1.2, 8.0, length(pos - u_cam)) : 0.0;
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
    float detail = 0.55 * eddy + 0.45 * ribbons;
    if (u_probe == 1) {
      float warp = fbm(q * 1.3 + float(k) * 17.0);
      float fibers = pow(0.5 + 0.5 * sin(r * 24.0 + 9.0 * warp + 3.0 * eddy), 3.0);
      float knots = smoothstep(0.50, 0.82, fbm(q * 3.7 + float(k) * 13.0));
      vec2 unit = q / r;
      float streams = noise3(vec3(unit * 6.0, r * 9.0 + warp * 2.0));
      detail = 0.08 + 0.85 * eddy * eddy + 0.20 * fibers + 0.65 * streams * streams + 0.6 * knots;
      if (nearby > 0.0) {
        // 沿着转动方向拉长的细丝；unit 是连续的平面方向，没有角度接缝
        float threads = noise3(vec3(unit * 15.0, r * 52.0 + warp * 4.0));
        float grain = noise3(vec3(unit * 37.0 + 5.0, r * 140.0 + eddy * 6.0));
        detail *= 1.0 + nearby * (1.5 * threads * threads + 0.9 * grain * threads - 0.55);
      }
    }
    tex += weight * detail;
    w += weight;
  }
  tex = u_probe == 1 ? 0.12 + 1.25 * tex / w : 0.65 + 0.8 * tex / w;
  float edge = smoothstep(u_rin, u_rin + 0.22, r) * (1.0 - smoothstep(u_rout - 2.0, u_rout, r));
  cover = 1.0;
  if (u_probe == 1) {
    // 外沿不再一刀切：从 6 r_s 起越来越稀，边界跟着纹理起伏成絮状；内沿也带一点起伏
    float ragged = tex - 0.75;
    float thin = smoothstep(u_rin, u_rin + 0.45, r - 0.2 * ragged)
               * (1.0 - smoothstep(u_rout - 6.5, u_rout, r + 2.4 * ragged));
    // 气体多的地方不透明，少的地方透光；里面比外面厚
    float amount = thin * (0.22 + tex * tex) * mix(2.6, 0.7, smoothstep(3.5, 10.5, r));
    cover = (1.0 - exp(-2.6 * amount)) * edge;
    edge = 1.0;
  }
  float bright = f * tex * edge * pow(g, 4.0) * 1.8;
  vec3 tint = blackbody(T);
  // 经验色温近似返回显示 RGB；影像模式先转回线性光，避免最后伽马映射把橙色洗成黄白。
  if (u_probe == 1) tint = pow(tint, vec3(2.2));
  return tint * bright;
}
vec3 directionAt(vec3 radial, vec3 tangent, float phi) {
  return cos(phi) * radial + sin(phi) * tangent;
}
// 以相机接收频率为 1。运动相机先转到视界规则的 PG 自由落体正交标架。
void photon(vec3 n, out vec3 transverse, out float kr, out float energy, out float ly) {
  float r0 = length(u_cam);
  vec3 radial = u_cam / r0;
  if (u_probe == 1) {
    float bn = dot(u_beta, n), b2 = dot(u_beta, u_beta);
    float kt = u_gamma * (-1.0 + bn);
    float factor = b2 > 1e-12 ? (u_gamma - 1.0) * bn / b2 - u_gamma : 0.0;
    vec3 spatial = n + factor * u_beta;
    float sr = dot(spatial, radial), flow = sqrt(1.0 / r0);
    transverse = spatial - sr * radial;
    kr = sr - flow * kt;
    energy = -kt + flow * sr;
    ly = -cross(u_cam, spatial).y;
  } else {
    float obs = sqrt(1.0 - 1.0 / r0), nr = dot(n, radial);
    transverse = n - nr * radial;
    kr = nr * obs;
    energy = obs;
    ly = -cross(u_cam, n).y;
  }
}
vec3 sky(vec3 direction, float energy) {
  float g = u_probe == 1 && u_shift > 0.5 ? 1.0 / max(energy, 1e-6) : 1.0;
  // 合成星空的色温是示意；光行差、频率比及 g⁴ 能量变化来自相机标架。
  return u_stars * stars(direction) * blackbody(6500.0 * g) * pow(g, 4.0);
}
// alpha 保存终点类别用于检查：0 视界，1 无穷远，2 盘面，3 未收敛。
vec4 trace(vec2 q) {
  vec3 n = normalize(u_fwd + q.x * u_tan.x * u_right + q.y * u_tan.y * u_up);
  float r0 = length(u_cam);
  vec3 radial = u_cam / r0;
  vec3 transverse;
  float kr, energy, ly;
  photon(n, transverse, kr, energy, ly);
  // 非正 Killing 能量不可能连接到本模型的外部恒星 / 盘面光源。
  if (energy <= 0.0) return vec4(0.0);
  float nt = length(transverse);
  // 光子球内，超过临界冲量的轨道无法连接到 r≥3 的盘或无穷远。
  // 用有效势的解析障碍判定，避免极小 Killing 能量的轨道在视界附近数值往返。
  if (r0 <= 1.5 && r0 * nt > 2.598076211 * energy) return vec4(0.0);
  if (nt < 1e-7) return kr < 0.0 ? vec4(0.0) : vec4(sky(radial, energy), 1.0);
  vec3 tangent = transverse / nt;
  vec2 s = vec2(1.0 / r0, -kr / (r0 * nt));
  bool exterior = r0 >= 1.0;
  // 影像模式的半透明盘：light 是已经收集到的光，through 是还能透过去的比例
  vec3 light = vec3(0.0);
  float through = 1.0;
  bool touched = false;
  float phi = 0.0;
  float crossing = atan(-radial.y, tangent.y);
  if (crossing <= 1e-7) crossing += PI;
  // 正侧面共面射线没有离散交点；容忍片元插值的单精度舍入误差。
  if (u_disk < 0.5 || length(vec2(radial.y, tangent.y)) < 1e-6) crossing = 1e6;
  for (int i = 0; i < MAX_STEPS; i++) {
    // 准确走到赤道面，再判断半径是否在盘内；不因接近盘面而无限缩步。
    float h = min(ORBIT_STEP / max(1.0, s.x), crossing - phi);
    vec2 next = orbitStep(s, h);
    if (exterior && next.x >= 1.0) return vec4(light, touched ? 2.0 : 0.0);
    if (next.x < 1.0) exterior = true;
    if (next.x <= 0.0) {
      float end = phi + escapeStep(s, h);
      return vec4(light + through * sky(directionAt(radial, tangent, end), energy), touched ? 2.0 : 1.0);
    }
    phi += h;
    s = next;
    if (phi >= crossing - 1e-6) {
      float r = 1.0 / s.x;
      if (r >= u_rin && r <= u_rout) {
        vec3 hit = r * directionAt(radial, tangent, phi);
        float cover;
        vec3 glow = disk(hit, ly, energy, cover);
        // 外部观察和光路诊断照旧：第一次碰到盘就停
        if (u_probe != 1 || u_debug == 1) return vec4(glow, 2.0);
        light += through * cover * glow;
        through *= 1.0 - cover;
        touched = true;
        if (through < 0.03) return vec4(light, 2.0);
      }
      crossing += PI;
    }
  }
  // 只有浮点精度下极接近临界的轨道可能未收敛；保留独立状态供回归检查。
  return vec4(light, touched ? 2.0 : 3.0);
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
  vec3 transverse;
  float kr, energy, ly;
  photon(normalize(u_fwd + uv.x * u_tan.x * u_right + uv.y * u_tan.y * u_up), transverse, kr, energy, ly);
  float impact = length(u_cam) * length(transverse) / max(energy, 1e-5);
  int samples = abs(impact - 2.598076211) < 2.0 * max(fwidth(impact), 1e-5) ? 4 : u_aa;
  for (int i = 0; i < samples; i++)
    for (int j = 0; j < samples; j++)
      col += trace(uv + (vec2(float(i), float(j)) + 0.5) / float(samples) * px - 0.5 * px).rgb;
  col /= float(samples * samples);
  // 只按亮度压缩，保留频移带来的色差；不在阴影上叠光晕。
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  if (u_probe == 1) {
    // 对数肩部保留高亮中的纹理。仅显示映射，不改 g 或轨道；暗区保持零。
    float exposure = 1.6 / (1.0 + 3.0 / dot(u_cam, u_cam));
    if (u_hdr == 1) {
      // 成像层（cinema.js）支持高动态范围：这里只做曝光，交出线性光；辉光和胶片曲线在那边做，
      // 最亮的地方才有超出 1 的能量可以溢出来。
      // 迎面而来的光被频移放大几十上百倍（g⁴）。亮度超过白点以后按平方根继续涨：
      // 颜色不变，最亮的地方仍然比白点亮很多倍、能溢出辉光，但不至于整片烧成白色。
      float lit = max(col.r, max(col.g, col.b)) * exposure;
      color = vec4(col * exposure / pow(1.0 + lit * lit, 0.25), 1.0);
      return;
    }
    float peak = max(col.r, max(col.g, col.b));
    float shoulder = log2(1.0 + peak * exposure);
    col *= shoulder / (1.7 + shoulder) / max(peak, 1e-6);
  } else {
    col *= (1.0 - exp(-lum * 1.05)) / max(lum, 1e-4);
  }
  color = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}`;
