// 洛希极限展品的 N 体积分（猫猫）。两种后端，用的是 physics.js 的同一套公式：
// gpu：位置和速度放在两张浮点纹理里，每一步一个全屏片元把所有碎石两两算一遍（需要 EXT_color_buffer_float）；
// cpu：碎石少一些，直接跑 physics.js 的双精度参考积分，再把位置传给显卡画。
// 两个后端都带一层冰尘（示意）：贴着碎石，碎石离群后散开，只受行星引力。
import {
  PAIR_GLSL,
  NEAR_RANGE,
  FREE_BELOW,
  createState,
  advance,
  createDust,
  advanceDust,
} from './physics.js?v=2';

const QUAD = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

// 先踢后漂，和 physics.js 的 advance 一致。pos.w = 1 表示还在飞，0 表示已经落到行星上；vel.w 是挨着的邻居数。
export const STEP_FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_pos, u_vel;
uniform ivec2 u_size;
uniform float u_dt, u_s2, u_mp, u_kn, u_cn, u_planet, u_keep, u_drag, u_near2;
layout(location = 0) out vec4 o_pos;
layout(location = 1) out vec4 o_vel;
${PAIR_GLSL}
void main() {
  ivec2 me = ivec2(gl_FragCoord.xy);
  vec4 p = texelFetch(u_pos, me, 0);
  vec4 v = texelFetch(u_vel, me, 0);
  if (p.w < 0.5) { o_pos = p; o_vel = v; return; }
  vec3 a = vec3(0.0);
  if (u_planet > 0.5) {
    float r2 = dot(p.xyz, p.xyz);
    a -= p.xyz / (r2 * sqrt(r2));
  }
  a -= u_drag * v.xyz;
  float contact = u_s2 * u_s2, near = 0.0;
  for (int j = 0; j < u_size.y; j++) {
    for (int i = 0; i < u_size.x; i++) {
      ivec2 other = ivec2(i, j);
      if (other == me) continue;
      vec4 q = texelFetch(u_pos, other, 0);
      if (q.w < 0.5) continue;
      vec3 d = p.xyz - q.xyz;
      float d2 = dot(d, d);
      near += step(d2, u_near2);
      // 只有压在一起的那几对才需要相对速度
      vec3 dv = d2 < contact ? v.xyz - texelFetch(u_vel, other, 0).xyz : vec3(0.0);
      a += pairAccel(d, dv, u_s2, u_mp, u_kn, u_cn);
    }
  }
  vec3 nv = (v.xyz + a * u_dt) * u_keep;
  vec3 np = p.xyz + nv * u_dt;
  float alive = 1.0;
  if (u_planet > 0.5 && dot(np, np) < 1.0) { alive = 0.0; nv = vec3(0.0); }
  o_pos = vec4(np, alive);
  o_vel = vec4(nv, near);
}`;

// 冰尘的一步。贴着的跟着所属碎石；碎石离群就散开；散开以后只受行星引力。
export const DUST_FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_dpos, u_dvel, u_pos, u_vel;
uniform ivec2 u_size, u_dsize;
uniform int u_per;
uniform float u_dt, u_spread, u_kick, u_free;
layout(location = 0) out vec4 o_pos;
layout(location = 1) out vec4 o_vel;
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
vec3 inSphere(uint seed) {
  uint a = pcg(seed), b = pcg(a), c = pcg(b);
  vec3 h = vec3(a, b, c) / 4294967296.0;
  float z = 2.0 * h.x - 1.0, angle = 6.2831853 * h.y, ring = sqrt(max(0.0, 1.0 - z * z));
  return vec3(ring * cos(angle), z, ring * sin(angle)) * pow(h.z, 1.0 / 3.0);
}
void main() {
  ivec2 me = ivec2(gl_FragCoord.xy);
  int index = me.y * u_dsize.x + me.x, parent = index / u_per;
  vec4 d = texelFetch(u_dpos, me, 0), dv = texelFetch(u_dvel, me, 0);
  if (d.w > 1.5) { o_pos = d; o_vel = dv; return; }
  if (d.w < 0.5) {
    ivec2 at = ivec2(parent % u_size.x, parent / u_size.x);
    vec4 pp = texelFetch(u_pos, at, 0), pv = texelFetch(u_vel, at, 0);
    vec3 here = pp.xyz + inSphere(uint(index)) * u_spread;
    if (pp.w < 0.5) { o_pos = vec4(here, 2.0); o_vel = vec4(0.0); return; }
    bool release = pv.w < u_free;
    o_pos = vec4(here, release ? 1.0 : 0.0);
    o_vel = vec4(pv.xyz + (release ? inSphere(uint(index) + 7919u) * u_kick : vec3(0.0)), 0.0);
    return;
  }
  float r2 = dot(d.xyz, d.xyz);
  vec3 nv = dv.xyz - d.xyz / (r2 * sqrt(r2)) * u_dt;
  vec3 np = d.xyz + nv * u_dt;
  o_pos = vec4(np, dot(np, np) < 1.0 ? 2.0 : 1.0);
  o_vel = vec4(nv, 0.0);
}`;

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
  return program;
}
export { link as linkProgram };
export const uniformsOf = (gl, program) => {
  const out = {};
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
    const name = gl.getActiveUniform(program, i).name.replace(/\[0\]$/, '');
    out[name] = gl.getUniformLocation(program, name);
  }
  return out;
};

function floatTexture(gl, w, h, data = null) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
    gl.texParameteri(gl.TEXTURE_2D, key, gl.NEAREST);
  for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
    gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
  return texture;
}

// 颗粒数 n 排成 w × h 的纹理（碎石是正方形，冰尘取 2 的幂的宽）。
export const textureSize = (n) => {
  const w = Math.ceil(Math.sqrt(n));
  return [w, Math.ceil(n / w)];
};
export const dustSize = (total) => {
  const w = 2 ** Math.ceil(Math.log2(Math.sqrt(total)));
  return [w, Math.ceil(total / w)];
};

export function gpuSimAvailable(gl) {
  return Boolean(gl && gl.getExtension('EXT_color_buffer_float'));
}

function pingPong(gl, w, h) {
  const sides = [0, 1].map(() => {
    const pos = floatTexture(gl, w, h),
      vel = floatTexture(gl, w, h),
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
  return sides;
}

// 两个后端的接口相同：
//   load(x4, v4)      步长 4 的 Float32Array：位置 + alive，速度 + 邻居数；同时把冰尘重新贴回碎石
//   step(count, params, { planet, settle, drag })
//   read()            → { x, v }，同样是步长 4
//   texture()         当前碎石位置纹理；dust.texture() 是冰尘的
export function createGpuSim(gl, n, per = 32) {
  const [w, h] = textureSize(n);
  if (w * h !== n) throw new Error('particle count must fill the texture');
  const total = n * per,
    [dw, dh] = dustSize(total);
  if (dw * dh !== total) throw new Error('dust count must fill the texture');
  const program = link(gl, QUAD, STEP_FRAGMENT),
    uniforms = uniformsOf(gl, program),
    dustProgram = link(gl, QUAD, DUST_FRAGMENT),
    dustUniforms = uniformsOf(gl, dustProgram);
  const quad = gl.createVertexArray(),
    buffer = gl.createBuffer();
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const sides = pingPong(gl, w, h),
    dustSides = pingPong(gl, dw, dh);
  let current = 0,
    dustCurrent = 0;
  const upload = (texture, tw, th, data) => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, tw, th, gl.RGBA, gl.FLOAT, data);
  };
  const begin = () => {
    gl.bindVertexArray(quad);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.depthMask(false);
  };
  const end = () => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.depthMask(true);
  };
  const bind = (unit, texture) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  };
  function stepDust(count, params) {
    gl.useProgram(dustProgram);
    gl.viewport(0, 0, dw, dh);
    gl.uniform1i(dustUniforms.u_dpos, 0);
    gl.uniform1i(dustUniforms.u_dvel, 1);
    gl.uniform1i(dustUniforms.u_pos, 2);
    gl.uniform1i(dustUniforms.u_vel, 3);
    gl.uniform2i(dustUniforms.u_size, w, h);
    gl.uniform2i(dustUniforms.u_dsize, dw, dh);
    gl.uniform1i(dustUniforms.u_per, per);
    gl.uniform1f(dustUniforms.u_dt, count ? params.dt : 0);
    gl.uniform1f(dustUniforms.u_spread, params.spread);
    gl.uniform1f(dustUniforms.u_kick, params.kick);
    gl.uniform1f(dustUniforms.u_free, FREE_BELOW - 0.5);
    bind(2, sides[current].pos);
    bind(3, sides[current].vel);
    for (let i = 0; i < Math.max(1, count); i++) {
      const from = dustSides[dustCurrent],
        to = dustSides[1 - dustCurrent];
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.frame);
      bind(0, from.pos);
      bind(1, from.vel);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      dustCurrent = 1 - dustCurrent;
    }
  }
  return {
    backend: 'gpu',
    n,
    size: [w, h],
    dust: { total, per, size: [dw, dh], texture: () => dustSides[dustCurrent].pos },
    load(x, v, params) {
      upload(sides[current].pos, w, h, x);
      upload(sides[current].vel, w, h, v);
      const blank = new Float32Array(4 * total);
      upload(dustSides[dustCurrent].pos, dw, dh, blank);
      upload(dustSides[dustCurrent].vel, dw, dh, blank);
      begin();
      stepDust(0, params);
      end();
    },
    step(count, params, { planet = true, settle = 0, drag = 0 } = {}) {
      begin();
      gl.useProgram(program);
      gl.viewport(0, 0, w, h);
      gl.uniform1i(uniforms.u_pos, 0);
      gl.uniform1i(uniforms.u_vel, 1);
      gl.uniform2i(uniforms.u_size, w, h);
      gl.uniform1f(uniforms.u_dt, params.dt);
      gl.uniform1f(uniforms.u_s2, 2 * params.s);
      gl.uniform1f(uniforms.u_mp, params.mp);
      gl.uniform1f(uniforms.u_kn, params.kn);
      gl.uniform1f(uniforms.u_cn, params.cn);
      gl.uniform1f(uniforms.u_planet, planet ? 1 : 0);
      gl.uniform1f(uniforms.u_keep, 1 - settle);
      gl.uniform1f(uniforms.u_drag, drag);
      gl.uniform1f(uniforms.u_near2, (NEAR_RANGE * params.s) ** 2);
      for (let i = 0; i < count; i++) {
        const from = sides[current],
          to = sides[1 - current];
        gl.bindFramebuffer(gl.FRAMEBUFFER, to.frame);
        bind(0, from.pos);
        bind(1, from.vel);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        current = 1 - current;
      }
      stepDust(count, params);
      end();
    },
    read() {
      const x = new Float32Array(4 * n),
        v = new Float32Array(4 * n);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sides[current].frame);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, x);
      gl.readBuffer(gl.COLOR_ATTACHMENT1);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, v);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { x, v };
    },
    texture: () => sides[current].pos,
  };
}

export function createCpuSim(gl, n, per = 0) {
  const [w, h] = textureSize(n),
    state = createState(n),
    packed = new Float32Array(4 * w * h),
    texture = gl ? floatTexture(gl, w, h) : null,
    dust = per ? createDust(n, per) : null,
    [dw, dh] = dust ? dustSize(dust.total) : [0, 0],
    dustPacked = dust ? new Float32Array(4 * dw * dh).fill(2) : null,
    dustTexture = gl && dust ? floatTexture(gl, dw, dh) : null;
  let stale = true;
  const pack = () => {
    for (let i = 0; i < n; i++) {
      packed[4 * i] = state.x[3 * i];
      packed[4 * i + 1] = state.x[3 * i + 1];
      packed[4 * i + 2] = state.x[3 * i + 2];
      packed[4 * i + 3] = state.alive[i];
    }
  };
  return {
    backend: 'cpu',
    n,
    size: [w, h],
    dust: dust && {
      total: dust.total,
      per,
      size: [dw, dh],
      texture() {
        if (dustTexture) {
          dustPacked.set(dust.x);
          gl.bindTexture(gl.TEXTURE_2D, dustTexture);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, dw, dh, gl.RGBA, gl.FLOAT, dustPacked);
        }
        return dustTexture;
      },
    },
    load(x, v, params) {
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) {
          state.x[3 * i + k] = x[4 * i + k];
          state.v[3 * i + k] = v[4 * i + k];
        }
        state.alive[i] = x[4 * i + 3] > 0.5 ? 1 : 0;
        state.near[i] = 12;
      }
      if (dust) {
        dust.x.fill(0);
        dust.v.fill(0);
        advanceDust(dust, state, params, 0);
      }
      stale = true;
    },
    step(count, params, options) {
      advance(state, params, count, options);
      if (dust) advanceDust(dust, state, params, count);
      stale = true;
    },
    read() {
      pack();
      const v = new Float32Array(4 * n);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) v[4 * i + k] = state.v[3 * i + k];
        v[4 * i + 3] = state.near[i];
      }
      return { x: packed.slice(0, 4 * n), v };
    },
    texture() {
      if (stale && texture) {
        pack();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.FLOAT, packed);
        stale = false;
      }
      return texture;
    },
  };
}
