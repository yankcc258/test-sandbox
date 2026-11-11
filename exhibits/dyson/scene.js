// Approved matte projection with local solar advection and moving illumination.
// This is a fixed-observatory cinematic plate, not a 3-D shell reconstruction.
const vertex = `#version 300 es
precision highp float;
out vec2 vUV;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2),float(gl_VertexID & 2));
  vUV=vec2(p.x,1.-p.y); gl_Position=vec4(p*2.-1.,0.,1.);
}`;
const fragment = `#version 300 es
precision highp float;
uniform sampler2D uPlate;
uniform float uTime;
uniform vec2 uSpan;
uniform vec2 uCenter;
in vec2 vUV;
out vec4 fragColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float turbulence(vec2 p){return noise(p)*.55+noise(p*2.01)*.28+noise(p*4.03)*.17;}
void main(){
  vec2 uv=(vUV-.5)*uSpan+uCenter;
  vec3 original=texture(uPlate,uv).rgb;
  vec2 solar=(uv-vec2(.18,.66))*vec2(1.7779,1.);
  float r=length(solar), a=atan(solar.y,solar.x);
  // Hand-defined occluder and railing mattes keep architecture rigid.
  float exposed=smoothstep(.009,.030,uv.x-(.429-.365*uv.y));
  float platform=1.-smoothstep(.858,.892,uv.y);
  float solarRegion=(1.-smoothstep(.50,.575,r))*exposed*platform;
  float warm=smoothstep(.10,.30,original.r-original.b)*smoothstep(.30,.72,original.r);
  float surface=solarRegion*warm;
  float t=uTime;
  vec2 flow=vec2(
    sin(uv.y*31.+t*.18)+.45*sin(uv.x*59.-t*.27),
    cos(uv.x*27.-t*.16)+.4*sin(uv.y*71.+t*.24));
  // Bound displacements to a few pixels; no global rubber-sheet deformation.
  vec2 advect=flow*.0027*surface;
  float fringe=smoothstep(.46,.52,r)*solarRegion;
  advect+=normalize(solar+vec2(.001))*.0022*sin(a*19.-t*.42)*fringe;
  vec3 col=texture(uPlate,uv+advect).rgb;
  float convection=turbulence(uv*vec2(44.,27.)+vec2(t*.035,-t*.045));
  col*=1.+surface*.075*(convection-.5);
  // Local prominence travel; retain the original fine filament detail.
  float prominence=fringe*warm*(.5+.5*sin(a*17.-t*.5+noise(uv*19.)*3.));
  col+=vec3(1.,.32,.045)*prominence*.052;
  // Very broad penumbra passes over the far wall, leaving near buttresses fixed.
  float wall=smoothstep(.46,.62,uv.x)*platform;
  float penumbra=pow(.5+.5*sin(a*3.2+t*.09+r*1.7),10.);
  float wallDepth=smoothstep(.33,.9,r);
  col*=1.-wall*wallDepth*penumbra*.12;
  float reflection=sin(t*.19-r*8.)*.5+.5;
  col+=vec3(.035,.018,.005)*wall*warm*reflection;
  // Blue maintenance lights vary minimally; dark metal never turns into neon.
  float cool=smoothstep(.035,.17,original.b-original.r)*smoothstep(.25,.65,original.b);
  col+=vec3(.003,.012,.018)*cool*(.5+.5*sin(t*.3+uv.x*67.));
  // Restrained lens falloff. Source highlight texture is already film graded.
  vec2 lens=vUV-.5;
  col*=1.-.075*dot(lens,lens);
  fragColor=vec4(clamp(col,0.,1.),1.);
}`;

function shader(gl, type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(error);
  }
  return s;
}

export class ObservatoryRenderer {
  constructor(canvas, image) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl; this.canvas = canvas; this.aspect = image.naturalWidth / image.naturalHeight;
    const vs = shader(gl, gl.VERTEX_SHADER, vertex), fs = shader(gl, gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); throw new Error('Unable to link observatory renderer'); }
    this.program = program;
    this.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.uniforms = Object.fromEntries(['uPlate','uTime','uSpan','uCenter'].map(n=>[n,gl.getUniformLocation(program,n)]));
  }
  resize() {
    // The canvas is hidden during context loss; measure its persistent viewport.
    const {width,height} = this.canvas.parentElement.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 1.6, Math.sqrt(2500000 / Math.max(1,width*height)));
    const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    this.viewAspect=width/Math.max(1,height);
  }
  draw(time, camera) {
    const gl=this.gl, a=this.viewAspect || this.aspect;
    const span=a>this.aspect ? [1,this.aspect/a] : [a/this.aspect,1];
    span[0]/=camera.zoom;span[1]/=camera.zoom;
    const center=[Math.min(1-span[0]/2,Math.max(span[0]/2,camera.x)),Math.min(1-span[1]/2,Math.max(span[1]/2,camera.y))];
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.uniform1i(this.uniforms.uPlate,0);gl.uniform1f(this.uniforms.uTime,time);
    gl.uniform2fv(this.uniforms.uSpan,span);gl.uniform2fv(this.uniforms.uCenter,center);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  dispose(){this.gl.deleteTexture(this.texture);this.gl.deleteProgram(this.program);}
}
