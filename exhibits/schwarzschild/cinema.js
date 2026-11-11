// 摄影机成像层。输入仍是测地线渲染；光晕只来自已有亮像素，不参与物理分类。
export function createCinema(gl, vertexSource) {
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
