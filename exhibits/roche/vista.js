// 洛希极限展品 · 主画面的渲染器（猫猫）。画面是照着 Yank 确认过的方向静帧做的：
// 主角是行星带——两颗行星在带子里搅出的两条旋臂，横过整个天空；两颗行星是旋涡中心的暗剪影；
// 脚下是带外一颗小卫星的地平线，左边地平线上是恒星；外面一圈是观景舱的落地窗和映着窗外的地板。
// 算出来的：两颗行星的形状（有效势的等值面，和 binary.js 同一个势）、它们的位置和转动。
// 画出来的（示意）：行星带的亮度、颜色和花纹，落向行星的两股流，小卫星、恒星的光柱、窗和地板。
const QUAD = `#version 300 es
in vec2 p; out vec2 v_uv;
void main() { v_uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const NOISE = `
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float fbm(vec3 p, int layers) {
  float sum = 0.0, weight = 0.5;
  for (int i = 0; i < layers; i++) { sum += weight * noise3(p); p = p * 2.03 + 11.7; weight *= 0.5; }
  return sum;
}`;

// 画面：星空 → 行星带（主角）→ 中心的两颗行星 → 脚下的小世界和它的大气
const SCENE = `#version 300 es
precision highp float;
uniform vec2 u_res, u_level, u_reach, u_tip, u_tan;
uniform vec3 u_right, u_up, u_fwd;
uniform float u_theta, u_l1, u_time, u_bridge;
in vec2 v_uv;
out vec4 o;
${NOISE}
const float MU = 0.35;
float roche(vec3 q) {
  float ra = length(q + vec3(MU, 0.0, 0.0)), rb = length(q - vec3(1.0 - MU, 0.0, 0.0));
  return 0.5 * (q.x * q.x + q.z * q.z) + (1.0 - MU) / ra + MU / rb;
}
vec3 rocheGradient(vec3 q) {
  vec3 da = q + vec3(MU, 0.0, 0.0), db = q - vec3(1.0 - MU, 0.0, 0.0);
  float ra = length(da), rb = length(db);
  return vec3(q.x, 0.0, q.z) - (1.0 - MU) * da / (ra * ra * ra) - MU * db / (rb * rb * rb);
}
// 行星表面：有效势的等值面
float surface(vec3 ro, vec3 rd, vec3 center, float reach, float level) {
  vec3 oc = ro - center;
  float b = dot(oc, rd), h = b * b - dot(oc, oc) + reach * reach * 1.04;
  if (h < 0.0) return -1.0;
  h = sqrt(h);
  float t = max(-b - h, 0.0), t1 = -b + h, mid = 0.5 * (u_tip.x + u_tip.y);
  float side = center.x < mid ? 1.0 : -1.0, room = (mid - ro.x) * side, lean = rd.x * side;
  if (lean > 1e-6) t1 = min(t1, room / lean); else if (lean < -1e-6) t = max(t, room / lean); else if (room < 0.0) return -1.0;
  float before = t;
  for (int i = 0; i < 56; i++) {
    if (t > t1) break;
    vec3 q = ro + rd * t;
    float f = level - roche(q);
    if (f < 0.0) {
float lo = before, hi = t;
for (int k = 0; k < 8; k++) { float m = 0.5 * (lo + hi); if (level - roche(ro + rd * m) < 0.0) hi = m; else lo = m; }
return 0.5 * (lo + hi);
    }
    vec3 g = rocheGradient(q);
    before = t;
    t += clamp(0.6 * f / sqrt(dot(g, g) + 12.0 * f), 0.002, 0.06);
  }
  return -1.0;
}
// 行星带在盘面上一点的亮度：两颗行星搅出的两条旋臂，沿旋臂的细丝，内缘一圈亮边，再往里是落向两颗行星的两股流
float along(vec2 p, float wind) { return atan(p.y, p.x) - wind * log(length(p)); }
float stream(vec2 p, vec2 planet, float wind) {
  float r = length(p), rp = length(planet);
  if (r > 2.3) return 0.0;
  float off = atan(p.y, p.x) - (atan(planet.y, planet.x) + wind * log(max(r, 0.05) / rp));
  float d = atan(sin(off), cos(off)) * r, width = 0.03 + 0.085 * smoothstep(rp, 2.1, r);
  return exp(-d * d / (width * width)) * smoothstep(2.3, 1.85, r) * (0.55 + 0.9 * (1.0 - smoothstep(rp, 2.0, r)));
}
vec3 belt(vec2 p, vec2 a, vec2 b) {
  float r = length(p), lr = log(max(r, 1e-3));
  float q = along(p, 2.5) - u_theta;
  float warp = fbm(vec3(cos(q) * 1.3, sin(q) * 1.3, lr * 1.1), 3);
  float arms = pow(0.5 + 0.5 * cos(2.0 * q + 2.6 * (warp - 0.5)), 3.2);
  float fil = fbm(vec3(cos(q) * 6.0, sin(q) * 6.0, lr * 1.6 + 3.0 - u_time * 0.030), 4);
  float hair = noise3(vec3(cos(q) * 26.0, sin(q) * 26.0, lr * 4.0 - u_time * 0.055));
  float thread = noise3(vec3(cos(q) * 60.0, sin(q) * 60.0, lr * 7.0 - u_time * 0.08));
  float streak = smoothstep(0.30, 0.72, fil) * (0.50 + 0.30 * hair + 0.20 * thread);
  float env = smoothstep(1.72, 2.08, r) * exp(-(r - 1.9) / 3.0) * (1.0 - smoothstep(5.2, 7.6, r));
  float dens = env * (0.035 + 0.965 * arms) * (0.14 + 0.86 * streak);
  dens += exp(-pow((r - 2.0) / 0.13, 2.0)) * (0.15 + 0.85 * arms) * (0.35 + 0.65 * streak) * 0.75;        // 内缘
  float flows = (stream(p, a, 1.9) + stream(p, b, 1.9)) * (0.35 + 0.65 * u_bridge);
  vec3 cold = vec3(0.05, 0.13, 0.46), mid = vec3(0.07, 0.58, 0.86), hot = vec3(0.78, 0.96, 1.0);
  vec3 tone = mix(mid, cold, smoothstep(2.0, 6.2, r));
  tone = mix(tone, hot, smoothstep(0.38, 1.05, dens));
  return tone * dens * 1.5 + mix(vec3(0.25, 0.80, 1.0), vec3(0.92, 0.98, 1.0), flows) * flows * 1.15;
}
void main() {
  vec2 ndc = v_uv * 2.0 - 1.0;
  vec3 rd = normalize(ndc.x * u_tan.x * u_right + ndc.y * u_tan.y * u_up + u_fwd);
  // 恒星：贴着地平线，在左边
  vec3 sun = normalize(vec3(-0.4619, -0.0698, 1.0));
  float facing = dot(rd, sun);
  // 行星带的盘面：中心在画面右上，朝镜头倾 20°，再侧过来一点
  vec3 middle = normalize(vec3(0.0693, 0.1494, 1.0)) * 10.2;
  float tilt = radians(21.0), roll = radians(-13.0);
  vec3 N = normalize(vec3(sin(roll) * cos(tilt), cos(roll) * cos(tilt), -sin(tilt)));
  vec3 U = normalize(cross(N, vec3(0.0, 0.0, 1.0))), V = cross(N, U);
  vec3 e1 = cos(u_theta) * U + sin(u_theta) * V, e2 = -sin(u_theta) * U + cos(u_theta) * V;
  // 天空
  vec3 col = mix(vec3(0.004, 0.010, 0.030), vec3(0.003, 0.006, 0.020), smoothstep(-0.16, 0.30, rd.y));
  float glowAt = dot(rd, normalize(middle));
  col += vec3(0.004, 0.030, 0.055) * pow(max(glowAt, 0.0), 14.0) + vec3(0.008, 0.05, 0.08) * pow(max(glowAt, 0.0), 90.0);
  for (int layer = 0; layer < 2; layer++) {
    float scale = layer == 0 ? 70.0 : 150.0;
    vec3 g = rd * scale, cell = floor(g);
    vec3 at = cell + 0.25 + 0.5 * vec3(hash13(cell), hash13(cell + 17.3), hash13(cell + 41.7));
    float pick = hash13(cell + 7.7);
    if (pick < 0.86) continue;
    float power = (pick - 0.86) / 0.14;
    col += mix(vec3(0.55, 0.80, 1.0), vec3(1.0, 0.90, 0.95), hash13(cell + 3.1)) * (1.0 - smoothstep(0.0, 0.09, length(g - at))) * (0.10 + 1.6 * power * power * power) * (layer == 0 ? 1.0 : 0.5);
  }
  // 中心的两颗行星
  vec3 ro = -middle;
  vec3 qo = vec3(dot(ro, e1), dot(ro, N), dot(ro, e2)), qd = vec3(dot(rd, e1), dot(rd, N), dot(rd, e2));
  vec3 qsun = vec3(dot(sun, e1), dot(sun, N), dot(sun, e2));
  vec3 ca = vec3(-MU, 0.0, 0.0), cb = vec3(1.0 - MU, 0.0, 0.0);
  float ta = surface(qo, qd, ca, u_reach.x, u_level.x), tb = surface(qo, qd, cb, u_reach.y, u_level.y);
  bool isB = tb > 0.0 && (ta < 0.0 || tb < ta);
  float tp = isB ? tb : ta;
  // 行星带
  float s = dot(middle, N) / dot(rd, N);
  vec3 ring = vec3(0.0);
  if (s > 0.0) {
    vec3 at = rd * s - middle;
    ring = belt(vec2(dot(at, U), dot(at, V)), -MU * vec2(cos(u_theta), sin(u_theta)), (1.0 - MU) * vec2(cos(u_theta), sin(u_theta)));
  }
  if (tp > 0.0) {
    vec3 q = qo + qd * tp, n = -normalize(rocheGradient(q));
    float reach = isB ? u_reach.y : u_reach.x, tipward = smoothstep(0.55, 1.0, (isB ? -(q.x - cb.x) : (q.x - ca.x)) / reach);
    float rim = pow(1.0 - max(dot(n, -qd), 0.0), 3.6);
    vec3 local = q - (isB ? cb : ca);
    float veil = fbm(local * vec3(2.2, 7.0, 2.2) + (isB ? 3.0 : 9.0), 3);                             // 很淡的云带 / 地貌
    vec3 body = (isB ? vec3(0.004, 0.012, 0.028) : vec3(0.020, 0.007, 0.010)) * (0.5 + 1.2 * veil);
    body += (isB ? vec3(0.30, 0.66, 1.0) : vec3(1.0, 0.36, 0.40)) * max(dot(n, qsun), 0.0) * (0.35 + 0.5 * veil);   // 恒星照亮的一弯
    body += (isB ? vec3(0.20, 0.75, 1.0) : vec3(1.0, 0.30, 0.42)) * rim * 0.9;                       // 一圈辉边
    body += vec3(1.3, 0.8, 1.0) * pow(tipward, 9.0) * u_bridge;                                                 // 尖端被对方扯亮
    col = (s > 0.0 && s < tp) ? body + ring * 0.6 : body;
  } else col += ring;
  // 两个尖端之间那一点
  vec3 l1 = middle + e1 * u_l1;
  float miss = length(cross(rd, l1));
  col += vec3(1.0, 0.92, 0.97) * u_bridge * (5.0 * exp(-miss * miss / 0.0012) + 0.22 * exp(-miss * miss / 0.02)) * ((tp > 0.0 && tp < dot(l1, rd) - 0.05) ? 0.0 : 1.0);
  // 恒星
  col += vec3(1.0, 0.86, 0.84) * 80.0 * smoothstep(0.999955, 0.99999, facing);
  col += vec3(1.0, 0.20, 0.26) * (0.9 * pow(max(facing, 0.0), 900.0) + 0.05 * pow(max(facing, 0.0), 80.0) + 0.004 * pow(max(facing, 0.0), 9.0));
  // 脚下的小世界：一颗带外的冰卫星。暗的、安静的，只有边缘一圈光
  float R = 0.6, dip = radians(9.0), lift = R * (1.0 / cos(dip) - 1.0), pitch = radians(5.6), lean = radians(2.6);
  vec3 up = normalize(vec3(sin(lean) * cos(pitch), cos(lean) * cos(pitch), -sin(pitch)));
  vec3 oc = up * (R + lift);
  float b = dot(oc, rd), far = sqrt(max(dot(oc, oc) - b * b, 0.0)), disc = b * b - dot(oc, oc) + R * R;
  float toward = pow(max(facing, 0.0), 40.0);                       // 离恒星那一侧多近
  vec3 warm = vec3(1.0, 0.16, 0.30), cool = vec3(0.10, 0.62, 1.0);
  if (disc > 0.0 && b < 0.0) {
    vec3 at = oc + rd * (-b - sqrt(disc)), n = normalize(at);
    float view = max(dot(n, -rd), 0.0), graze = pow(1.0 - view, 3.0);
    vec3 shine = normalize(middle);                                  // 行星带的光从那边来
    vec3 w = n * 46.0 + vec3(u_time * 0.012, 0.0, u_time * 0.004) + 2.2 * vec3(fbm(n * 21.0 + 2.0, 3), fbm(n * 21.0 + 9.0, 3), fbm(n * 21.0 + 17.0, 3));
    float cloud = smoothstep(0.40, 0.70, fbm(w, 4));
    graze = pow(1.0 - view, 7.0);
    vec3 sea = vec3(0.003, 0.010, 0.028);
    float wisp = smoothstep(0.45, 0.80, fbm(w * 2.7 + 5.0, 3));
    vec3 ground = sea + vec3(0.030, 0.19, 0.29) * (cloud * 0.8 + wisp * 0.35) * (0.6 + 0.4 * max(dot(n, shine), 0.0));
    ground += vec3(0.05, 0.24, 0.36) * pow(max(dot(reflect(rd, n), shine), 0.0), 22.0) * 0.42 * (1.0 - 0.75 * cloud);  // 海面映着带子的光
    ground += warm * 0.35 * max(dot(n, sun), 0.0) * (0.3 + 0.7 * cloud);
    ground = mix(ground, mix(cool * 0.20, warm * 0.9, toward), graze * 0.8);                                           // 远处沉进大气里
    col = ground;
  } else {
    float height = max(far - R, 0.0);
    float air = (exp(-height / 0.0005) + 0.22 * exp(-height / 0.0028)) * (1.0 - smoothstep(0.35 * lift, 0.95 * lift, height));
    col += mix(cool * 0.34, warm * 1.5 + vec3(0.9, 0.7, 0.7) * toward, toward) * air * (b < 0.0 ? 1.0 : 0.0);
  }
  o = vec4(col, 1.0);
}`;

const BRIGHT = `#version 300 es
precision highp float;
uniform sampler2D u_src; uniform vec2 u_texel; in vec2 v_uv; out vec4 o;
void main() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 s = min(texture(u_src, v_uv + vec2(i % 2 == 0 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * u_texel).rgb, vec3(24.0));
    float peak = max(s.r, max(s.g, s.b));
    c += s * max(peak - 0.7, 0.0) / max(peak, 1e-4);
  }
  o = vec4(c * 0.25, 1.0);
}`;
const BLUR = `#version 300 es
precision highp float;
uniform sampler2D u_src; uniform vec2 u_texel; in vec2 v_uv; out vec4 o;
void main() {
  vec3 c = texture(u_src, v_uv).rgb * 4.0;
  for (int i = 0; i < 4; i++) c += texture(u_src, v_uv + vec2(i % 2 == 0 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * u_texel).rgb * 2.0;
  c += texture(u_src, v_uv + vec2(2.0, 0.0) * u_texel).rgb + texture(u_src, v_uv - vec2(2.0, 0.0) * u_texel).rgb;
  c += texture(u_src, v_uv + vec2(0.0, 2.0) * u_texel).rgb + texture(u_src, v_uv - vec2(0.0, 2.0) * u_texel).rgb;
  o = vec4(c / 16.0, 1.0);
}`;
// 最后一步：辉光、恒星的光柱、落地窗的窗框和映着外面的地板、胶片曲线
const FINAL = `#version 300 es
precision highp float;
uniform sampler2D u_scene, u_bloom, u_soft;
uniform vec2 u_res, u_star;
uniform float u_flare;
in vec2 v_uv; out vec4 o;
${NOISE}
vec3 filmic(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float box(vec2 p, vec2 half_, float radius) { vec2 d = abs(p) - half_ + radius; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius; }
vec3 outside(vec2 uv) {
  vec3 c = texture(u_scene, uv).rgb + texture(u_bloom, uv).rgb * 0.42;
  vec2 p = (uv - u_star) * vec2(u_res.x / u_res.y, 1.0);
  float pillar = exp(-abs(p.x) * 150.0) / (1.0 + 22.0 * p.y * p.y) + 0.35 * exp(-abs(p.x) * 34.0) / (1.0 + 60.0 * p.y * p.y);
  float streak = exp(-abs(p.y) * 190.0) / (1.0 + 40.0 * p.x * p.x);
  c += (vec3(1.0, 0.30, 0.34) * pillar * 0.9 + vec3(1.0, 0.75, 0.78) * streak * 0.35) * u_flare;
  return c;
}
void main() {
  vec2 px = v_uv * u_res;
  float floorTop = 0.118 * u_res.y, right = 0.925 * u_res.x, top = 0.972 * u_res.y;
  // 窗：左边一直开到画面外，右边和上面是舱壁
  vec2 lo = vec2(-0.2 * u_res.x, floorTop), hi = vec2(right, top);
  float d = box(px - 0.5 * (lo + hi), 0.5 * (hi - lo), 0.062 * u_res.y);
  vec3 c;
  if (d < 0.0) {
    c = outside(v_uv);
    c *= 1.0 - 0.35 * smoothstep(-0.10 * u_res.y, 0.0, d);                 // 玻璃边上暗一点
    // 玻璃上两道很淡的反光
    float beam = smoothstep(0.035, 0.0, abs(v_uv.x * 0.62 + v_uv.y - 1.34)) + 0.7 * smoothstep(0.022, 0.0, abs(v_uv.x * 0.62 + v_uv.y - 1.47));
    c += vec3(0.10, 0.30, 0.42) * beam * 0.05 * smoothstep(0.35, 1.0, v_uv.y);
  } else if (px.y < floorTop && px.x < right + 0.03 * u_res.x) {
    // 地板：映着窗外，越靠近人越暗
    float depth = (floorTop - px.y) / floorTop;
    vec2 mirror = vec2(v_uv.x, (2.0 * floorTop - px.y + depth * 0.10 * u_res.y) / u_res.y);
    c = texture(u_soft, mirror).rgb * 1.1 * (0.5 - 0.4 * depth) + texture(u_bloom, mirror).rgb * 0.25 * (1.0 - depth);
    c += vec3(0.004, 0.008, 0.016);
    c += vec3(1.0, 0.30, 0.34) * 0.10 * exp(-abs(v_uv.x - u_star.x) * u_res.x / u_res.y * 60.0) * (1.0 - depth) * u_flare;
    c += vec3(0.25, 0.75, 1.0) * 0.10 * exp(-(floorTop - px.y) / 1.6);     // 窗和地板交界的一条亮线
  } else {
    c = vec3(0.0035, 0.006, 0.012) + vec3(0.01, 0.03, 0.045) * exp(-d / (0.012 * u_res.y));
  }
  c += vec3(0.30, 0.80, 1.0) * 0.22 * exp(-d * d / 3.0) * step(floorTop + 2.0, px.y);   // 窗框内沿被外面照亮的一条边
  vec2 q = v_uv - 0.5;
  c *= 0.95 * (1.0 - 0.75 * dot(q, q));
  c = pow(filmic(c), vec3(1.0 / 2.2));
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, 1.12);                                             // 颜色再饱和一点
  c += (1.0 - luma) * (1.0 - luma) * vec3(-0.004, 0.004, 0.022);
  c += (hash13(vec3(gl_FragCoord.xy, 3.0)) - 0.5) * 0.012;
  o = vec4(c, 1.0);
}`;


function link(gl, vs, fs) {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
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
    const name = gl.getActiveUniform(program, i).name;
    u[name] = gl.getUniformLocation(program, name);
  }
  return { program, u };
}

// 镜头的三根轴：朝着 (x, y, 1) 这个方向看（x、y 是正切值）
export function aim(x, y) {
  const length = Math.hypot(x, y, 1),
    fwd = [x / length, y / length, 1 / length],
    flat = Math.hypot(fwd[2], fwd[0]),
    right = [fwd[2] / flat, 0, -fwd[0] / flat],
    up = [
      fwd[1] * right[2] - fwd[2] * right[1],
      fwd[2] * right[0] - fwd[0] * right[2],
      fwd[0] * right[1] - fwd[1] * right[0],
    ];
  return { right, up, fwd };
}
// 双星中心在场景里的方向（正切值），望远镜对准它用
export const BINARY = [0.0693, 0.1494];
const SUN = (() => {
  const v = [-0.4619, -0.0698, 1],
    l = Math.hypot(...v);
  return v.map((x) => x / l);
})();

export function createVista(gl) {
  // 有浮点渲染目标就走高动态范围；没有就用普通的 8 位目标，辉光会弱一些
  const float = Boolean(
    gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'),
  );
  const scene = link(gl, QUAD, SCENE),
    bright = link(gl, QUAD, BRIGHT),
    blur = link(gl, QUAD, BLUR),
    final = link(gl, QUAD, FINAL),
    quad = gl.createVertexArray(),
    buffer = gl.createBuffer();
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const target = (w, h) => {
    w = Math.max(2, w);
    h = Math.max(2, h);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
      gl.texParameteri(gl.TEXTURE_2D, key, gl.LINEAR);
    for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
      gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
    const frame = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('render target is not complete');
    return { texture, frame, w, h };
  };
  let stage = null;
  function ensure(w, h) {
    if (stage && stage.w === w && stage.h === h) return;
    if (stage)
      for (const level of [stage.full, ...stage.soft, ...stage.levels]) {
        gl.deleteFramebuffer(level.frame);
        gl.deleteTexture(level.texture);
      }
    const levels = [];
    for (let i = 1; i <= 7; i++) levels.push(target(w >> i, h >> i));
    stage = {
      w,
      h,
      full: target(w, h),
      soft: [target(w >> 1, h >> 1), target(w >> 2, h >> 2), target(w >> 3, h >> 3)], // 地板的倒影用
      levels,
    };
  }
  const bind = (unit, texture) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  };
  return {
    hdr: float,
    // s：theta（两星连线的相位）、time（秒，细丝和云按它动）、level / reach / tip / l1（两颗行星的形状）、
    // bridge（尖端伸得够近时的亮点和两股流，0–1）、tan（16:9 时横向半视场的正切）、basis（aim() 给的三根轴）
    draw(s) {
      const { width: w, height: h } = gl.canvas,
        aspect = w / h,
        tanH = aspect >= 1.5 ? s.tan : s.tan * Math.sqrt(aspect / 1.5), // 画幅窄的时候少收一点，带子别被切太多
        tanV = tanH / aspect,
        { right, up, fwd } = s.basis;
      ensure(w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(quad);
      gl.bindFramebuffer(gl.FRAMEBUFFER, stage.full.frame);
      gl.viewport(0, 0, w, h);
      gl.useProgram(scene.program);
      gl.uniform2f(scene.u.u_res, w, h);
      gl.uniform2f(scene.u.u_tan, tanH, tanV);
      gl.uniform3fv(scene.u.u_right, right);
      gl.uniform3fv(scene.u.u_up, up);
      gl.uniform3fv(scene.u.u_fwd, fwd);
      gl.uniform2fv(scene.u.u_level, s.level);
      gl.uniform2fv(scene.u.u_reach, s.reach);
      gl.uniform2fv(scene.u.u_tip, s.tip);
      gl.uniform1f(scene.u.u_l1, s.l1);
      gl.uniform1f(scene.u.u_theta, s.theta);
      gl.uniform1f(scene.u.u_time, s.time);
      gl.uniform1f(scene.u.u_bridge, s.bridge);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const run = (shader, to, from) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, to.frame);
        gl.viewport(0, 0, to.w, to.h);
        gl.useProgram(shader.program);
        bind(0, from.texture);
        gl.uniform1i(shader.u.u_src, 0);
        gl.uniform2f(shader.u.u_texel, 1 / from.w, 1 / from.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      run(blur, stage.soft[0], stage.full);
      run(blur, stage.soft[1], stage.soft[0]);
      run(blur, stage.soft[2], stage.soft[1]);
      let from = stage.full;
      stage.levels.forEach((level, i) => {
        run(i ? blur : bright, level, from);
        from = level;
      });
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = stage.levels.length - 1; i > 0; i--) run(blur, stage.levels[i - 1], stage.levels[i]);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(final.program);
      bind(2, stage.soft[2].texture);
      bind(1, stage.levels[0].texture);
      bind(0, stage.full.texture);
      gl.uniform1i(final.u.u_scene, 0);
      gl.uniform1i(final.u.u_bloom, 1);
      gl.uniform1i(final.u.u_soft, 2);
      gl.uniform2f(final.u.u_res, w, h);
      // 恒星在画面上的位置：光柱是镜头里的东西，跟着它走；恒星转到镜头后面就没有
      const ahead = SUN[0] * fwd[0] + SUN[1] * fwd[1] + SUN[2] * fwd[2],
        x = (SUN[0] * right[0] + SUN[1] * right[1] + SUN[2] * right[2]) / ahead / tanH,
        y = (SUN[0] * up[0] + SUN[1] * up[1] + SUN[2] * up[2]) / ahead / tanV;
      gl.uniform2f(final.u.u_star, 0.5 + 0.5 * x, 0.5 + 0.5 * y);
      gl.uniform1f(final.u.u_flare, ahead > 0.1 ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(null);
    },
  };
}
