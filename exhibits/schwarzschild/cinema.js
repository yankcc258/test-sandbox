// 摄影机成像层。输入仍是测地线渲染；光晕只来自已有亮像素，不参与物理分类。
// 能往半浮点纹理里画的设备用高动态范围那一套（猫猫，2026-11-11）；不能的用原来的 RGBA8 这一套。
export function createCinema(gl, vertexSource, { allowHdr = true } = {}) {
  if (
    allowHdr &&
    (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))
  ) {
    try {
      return createHdrCinema(gl, vertexSource);
    } catch (error) {
      console.warn('HDR lens unavailable, using the 8-bit lens:', error);
    }
  }
  return createLdrCinema(gl, vertexSource);
}

// 高动态范围成像层：着色器交出线性光（最亮处远大于 1），这里取出超过白点的部分，逐级缩小再逐级放大叠回，
// 最后才过胶片曲线。所以辉光的能量来自画面里真正亮的地方：盘的内沿、迎面转来的一侧、高阶像和光子环。
// 它仍然只是镜头效果，不改变光线落在哪里；光路诊断和外部观察都不经过这里。
const LENS_EXPOSURE = 0.3, // 线性光进胶片曲线之前的增益，按原来的中间调亮度校的
  LENS_LEVELS = 5;
function createHdrCinema(gl, vertexSource) {
  const programs = [],
    targets = [];
  function program(fragment) {
    const p = gl.createProgram();
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vertexSource],
      [gl.FRAGMENT_SHADER, fragment],
    ]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
      gl.deleteShader(s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    programs.push(p);
    return p;
  }
  const head = `#version 300 es
precision highp float;
in vec2 uv;out vec4 color;
uniform sampler2D source;uniform vec2 stepSize;
`;
  // 取亮部：四点取样缩到一半，只留超过白点的那一截；先压住个别极亮的像素，免得辉光闪烁
  const extract = program(
    head +
      `uniform float exposure;
  void main(){
    vec2 q=uv*.5+.5;vec3 sum=vec3(0);
    for(int i=0;i<4;i++){
      vec2 d=vec2(i%2==0?-1.0:1.0,i<2?-1.0:1.0)*stepSize;
      vec3 c=min(texture(source,q+d).rgb*exposure,vec3(10.0));
      float peak=max(c.r,max(c.g,c.b));
      sum+=c*max(peak-0.95,0.0)/max(peak,1e-4);
    }
    color=vec4(sum*.25,1);
  }`,
  );
  // 缩小和放大用同一个九点帐篷核
  const tent = program(
    head +
      `void main(){
    vec2 q=uv*.5+.5;vec3 c=texture(source,q).rgb*4.0;
    c+=(texture(source,q+vec2(stepSize.x,0)).rgb+texture(source,q-vec2(stepSize.x,0)).rgb
      +texture(source,q+vec2(0,stepSize.y)).rgb+texture(source,q-vec2(0,stepSize.y)).rgb)*2.0;
    c+=texture(source,q+stepSize).rgb+texture(source,q-stepSize).rgb
      +texture(source,q+vec2(stepSize.x,-stepSize.y)).rgb+texture(source,q+vec2(-stepSize.x,stepSize.y)).rgb;
    color=vec4(c/16.0,1);
  }`,
  );
  const combine = program(
    head +
      `uniform sampler2D glow;uniform float phase,exposure;
  vec3 filmic(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0);}
  void main(){vec2 q=uv*.5+.5;
    vec3 c=texture(source,q).rgb*exposure+texture(glow,q).rgb*.3;
    float vignette=1.0-.13*dot(uv*.72,uv*.72);
    c=filmic(c*vignette);
    // 极轻的确定性胶片颗粒；暂停 / 拖动到同一时刻时可复现，纯黑不被抬亮。
    float grain=fract(sin(dot(gl_FragCoord.xy+floor(phase*1728.0),vec2(12.9898,78.233)))*43758.5453)-.5;
    c*=1.0+grain*.014;
    color=vec4(pow(clamp(c,0.0,1.0),vec3(1.0/2.2)),1);
  }`,
  );
  function target() {
    const t = { texture: gl.createTexture(), fbo: gl.createFramebuffer(), w: 0, h: 0 };
    gl.bindTexture(gl.TEXTURE_2D, t.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.texture, 0);
    targets.push(t);
    return t;
  }
  function allocate(t, w, h) {
    t.w = w;
    t.h = h;
    gl.bindTexture(gl.TEXTURE_2D, t.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error('HDR framebuffer unavailable');
  }
  const scene = target(),
    levels = Array.from({ length: LENS_LEVELS }, target);
  // 先试一次，确认这台设备真的能往半浮点纹理里画；不能就让调用方退回 8 位那一套
  allocate(scene, 4, 4);
  let width = 0,
    height = 0;
  function texture(p, name, t, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(gl.getUniformLocation(p, name), unit);
  }
  function pass(p, from, to, x, y) {
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
    gl.viewport(0, 0, to.w, to.h);
    texture(p, 'source', from.texture, 0);
    gl.uniform2f(gl.getUniformLocation(p, 'stepSize'), x, y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return {
    hdr: true,
    begin(w, h) {
      if (width !== w || height !== h) {
        width = w;
        height = h;
        allocate(scene, w, h);
        levels.forEach((level, i) =>
          allocate(level, Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1))),
        );
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
      gl.viewport(0, 0, w, h);
    },
    finish(phase) {
      gl.disable(gl.BLEND);
      gl.useProgram(extract);
      gl.uniform1f(gl.getUniformLocation(extract, 'exposure'), LENS_EXPOSURE);
      pass(extract, scene, levels[0], 0.5 / levels[0].w, 0.5 / levels[0].h);
      for (let i = 1; i < levels.length; i++)
        pass(tent, levels[i - 1], levels[i], 1 / levels[i - 1].w, 1 / levels[i - 1].h);
      // 从最小的一级往回，每一级把更模糊的那一份叠到自己身上
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = levels.length - 1; i > 0; i--)
        pass(tent, levels[i], levels[i - 1], 1 / levels[i].w, 1 / levels[i].h);
      gl.disable(gl.BLEND);
      gl.useProgram(combine);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      texture(combine, 'source', scene.texture, 0);
      texture(combine, 'glow', levels[0].texture, 1);
      gl.uniform1f(gl.getUniformLocation(combine, 'phase'), phase);
      gl.uniform1f(gl.getUniformLocation(combine, 'exposure'), LENS_EXPOSURE);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    },
    dispose() {
      for (const p of programs) gl.deleteProgram(p);
      for (const t of targets) {
        gl.deleteTexture(t.texture);
        gl.deleteFramebuffer(t.fbo);
      }
    },
  };
}

// 原来的 8 位成像层：着色器先把颜色压进 0–1，这里再做一级模糊的光晕。
function createLdrCinema(gl, vertexSource) {
  const programs = [],
    targets = [];
  function program(fragment) {
    const p = gl.createProgram();
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vertexSource],
      [gl.FRAGMENT_SHADER, fragment],
    ]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
      gl.deleteShader(s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    programs.push(p);
    return p;
  }
  const head = `#version 300 es
precision highp float;
in vec2 uv;out vec4 color;
uniform sampler2D source;uniform vec2 stepSize;
vec3 linearAt(vec2 q){return pow(texture(source,q).rgb,vec3(2.2));}
`;
  const extract = program(
    head +
      `void main(){
    vec2 q=uv*.5+.5;
    vec3 c=(linearAt(q+stepSize)+linearAt(q-stepSize)+linearAt(q+vec2(stepSize.x,-stepSize.y))+linearAt(q+vec2(-stepSize.x,stepSize.y)))*.25;
    float peak=max(c.r,max(c.g,c.b));color=vec4(pow(c*smoothstep(.24,.72,peak),vec3(1.0/2.2)),1);
  }`,
  );
  const blur = program(
    head +
      `void main(){
    vec2 q=uv*.5+.5;vec3 c=linearAt(q)*.227027;
    c+=(linearAt(q+stepSize*1.384615)+linearAt(q-stepSize*1.384615))*.316216;
    c+=(linearAt(q+stepSize*3.230769)+linearAt(q-stepSize*3.230769))*.070270;
    color=vec4(pow(c,vec3(1.0/2.2)),1);
  }`,
  );
  const combine = program(
    head +
      `uniform sampler2D glow;uniform float phase;
  void main(){vec2 q=uv*.5+.5;vec3 c=linearAt(q);
    c+=pow(texture(glow,q).rgb,vec3(2.2))*.22;
    float vignette=1.0-.13*dot(uv*.72,uv*.72);
    c*=vignette;
    // 极轻的确定性胶片颗粒；暂停 / 拖动到同一时刻时可复现，纯黑不被抬亮。
    float grain=fract(sin(dot(gl_FragCoord.xy+floor(phase*1728.0),vec2(12.9898,78.233)))*43758.5453)-.5;
    c*=1.0+grain*.014;
    color=vec4(pow(clamp(c,0.0,1.0),vec3(1.0/2.2)),1);
  }`,
  );
  function target() {
    const t = { texture: gl.createTexture(), fbo: gl.createFramebuffer() };
    gl.bindTexture(gl.TEXTURE_2D, t.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.texture, 0);
    targets.push(t);
    return t;
  }
  const scene = target(),
    a = target(),
    b = target();
  let width = 0,
    height = 0;
  function allocate(t, w, h) {
    gl.bindTexture(gl.TEXTURE_2D, t.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error('Cinema framebuffer unavailable');
  }
  function texture(p, name, t, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(gl.getUniformLocation(p, name), unit);
  }
  function pass(p, from, to, w, h, x = 0, y = 0) {
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, to?.fbo || null);
    gl.viewport(0, 0, w, h);
    texture(p, 'source', from.texture, 0);
    gl.uniform2f(gl.getUniformLocation(p, 'stepSize'), x, y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return {
    hdr: false,
    begin(w, h) {
      if (width !== w || height !== h) {
        width = w;
        height = h;
        allocate(scene, w, h);
        allocate(a, Math.max(1, w >> 2), Math.max(1, h >> 2));
        allocate(b, Math.max(1, w >> 2), Math.max(1, h >> 2));
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
      gl.viewport(0, 0, w, h);
    },
    finish(phase) {
      const w = Math.max(1, width >> 2),
        h = Math.max(1, height >> 2);
      pass(extract, scene, a, w, h, 1 / width, 1 / height);
      pass(blur, a, b, w, h, 3 / w, 0);
      pass(blur, b, a, w, h, 0, 1.2 / h);
      gl.useProgram(combine);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      texture(combine, 'source', scene.texture, 0);
      texture(combine, 'glow', a.texture, 1);
      gl.uniform1f(gl.getUniformLocation(combine, 'phase'), phase);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    },
    dispose() {
      for (const p of programs) gl.deleteProgram(p);
      for (const t of targets) {
        gl.deleteTexture(t.texture);
        gl.deleteFramebuffer(t.fbo);
      }
    },
  };
}

// 原创合成氛围配乐，默认关闭；无外部音频，也不把它描述成太空中的真实声音。
export function createScore() {
  let context,
    master,
    filter,
    enabled = false,
    lastPlaying = false,
    lastUpdate = -1;
  function init() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    context = new Audio();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    for (const [hz, level] of [
      [38, 0.15],
      [57.06, 0.055],
      [113.8, 0.018],
    ]) {
      const osc = context.createOscillator(),
        g = context.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      g.gain.value = level;
      osc.connect(g).connect(master);
      osc.start();
    }
    const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate),
      data = buffer.getChannelData(0);
    let seed = 613;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = ((seed / 2147483647) * 2 - 1) * 0.06;
    }
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 160;
    noise.connect(filter).connect(master);
    noise.start();
    return true;
  }
  return {
    async toggle() {
      if (!context && !init()) return false;
      enabled = !enabled;
      if (enabled) await context.resume();
      else {
        master.gain.setTargetAtTime(0, context.currentTime, 0.08);
        await context.suspend();
      }
      lastPlaying = null;
      lastUpdate = -1;
      return enabled;
    },
    update(progress, playing) {
      if (!context || !enabled) return;
      if (playing !== lastPlaying) {
        lastPlaying = playing;
        lastUpdate = -1;
        if (playing) void context.resume().catch(() => {});
        else {
          master.gain.setTargetAtTime(0, context.currentTime, 0.04);
          void context.suspend().catch(() => {});
        }
      }
      const tick = Math.floor(progress * 720);
      if (tick === lastUpdate && playing) return;
      lastUpdate = tick;
      if (playing) {
        master.gain.setTargetAtTime(
          0.18 + 0.12 * Math.sin(Math.PI * progress),
          context.currentTime,
          0.3,
        );
        filter.frequency.setTargetAtTime(140 + 220 * progress, context.currentTime, 0.5);
      }
    },
    get enabled() {
      return enabled;
    },
  };
}
