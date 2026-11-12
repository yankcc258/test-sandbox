import {makeSurface,IMAGE_ASPECT} from './depth.js?v=2';

// Perspective-projected relief + separate near collector/deck surfaces.
// Original plate supplies visible detail; clean plate fills newly exposed regions.
const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec2 aUV;
uniform vec2 uSpan;
uniform vec2 uCenter;
uniform vec3 uShift;
out vec3 vProjection;
void main(){
  vec3 p=aPosition-vec3(uShift.xy,uShift.z);
  vec2 screen=vec2(.5+p.x/(2.*1.77683316*p.z),.5-p.y/(2.*p.z));
  vec2 ndc=(screen-uCenter)/uSpan*vec2(2.,-2.);
  gl_Position=vec4(ndc*p.z,1.002002*p.z-.2002002,p.z);
  vProjection=vec3(aUV*aPosition.z,aPosition.z);
}`;
const fragment=`#version 300 es
precision highp float;
uniform sampler2D uPlate;
uniform sampler2D uClean;
uniform float uTime;
uniform int uLayer;
uniform bool uDepth;
in vec3 vProjection;
out vec4 fragColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float turbulence(vec2 p){return noise(p)*.55+noise(p*2.01)*.28+noise(p*4.03)*.17;}
vec2 masks(vec2 uv,vec3 original,vec3 clean){
  float edge=.450-.377*uv.y;
  float silhouette=smoothstep(.045,.15,dot(clean-original,vec3(.2126,.7152,.0722)));
  float collector=1.-smoothstep(edge-.0006,edge+.0006,uv.x);
  float floorLine=.918+.086*uv.x;
  float floorMask=smoothstep(floorLine-.003,floorLine+.002,uv.y);
  float railBand=smoothstep(.850+.108*uv.x,.856+.108*uv.x,uv.y)*(1.-floorMask);
  float person=(1.-smoothstep(.009,.014,abs(uv.x-.258)))*smoothstep(.866,.872,uv.y);
  float darkness=1.-smoothstep(.25,.45,dot(original,vec3(.2126,.7152,.0722)));
  float deck=max(floorMask,max(railBand,person)*silhouette*darkness);
  return vec2(collector,deck);
}
vec3 background(vec2 uv){
  vec3 original=texture(uPlate,uv).rgb,clean=texture(uClean,uv).rgb;
  float collector=1.-smoothstep(.464-.377*uv.y,.471-.377*uv.y,uv.x);
  float deck=smoothstep(.850+.115*uv.x,.860+.115*uv.x,uv.y);
  float person=(1.-smoothstep(.018,.025,abs(uv.x-.258)))*smoothstep(.852,.858,uv.y);
  float repair=max(collector,max(deck,person));
  return mix(original,clean,repair);
}
void main(){
  vec2 uv=vProjection.xy/vProjection.z;
  vec3 original=texture(uPlate,uv).rgb,clean=texture(uClean,uv).rgb;
  vec2 matte=masks(uv,original,clean);
  float alpha=1.;vec3 col=original;
  if(uLayer==1)alpha=matte.x;
  if(uLayer==2)alpha=matte.y*(1.-matte.x);
  if(alpha<.005)discard;
  if(uLayer==0){
    vec2 solar=(uv-vec2(.18,.66))*vec2(1.77683316,1.);
    float r=length(solar),a=atan(solar.y,solar.x),t=uTime;
    vec3 base=uDepth?background(uv):original;
    float solarRegion=1.-smoothstep(.50,.575,r);
    if(!uDepth)solarRegion*=smoothstep(.009,.030,uv.x-(.429-.365*uv.y))*(1.-smoothstep(.858,.892,uv.y));
    float warm=smoothstep(.10,.30,base.r-base.b)*smoothstep(.30,.72,base.r);
    float surface=solarRegion*warm;
    vec2 flow=vec2(sin(uv.y*31.+t*.18)+.45*sin(uv.x*59.-t*.27),cos(uv.x*27.-t*.16)+.4*sin(uv.y*71.+t*.24));
    vec2 advect=flow*.0027*surface;
    float fringe=smoothstep(.46,.52,r)*solarRegion;
    advect+=normalize(solar+vec2(.001))*.0022*sin(a*19.-t*.42)*fringe;
    col=uDepth?background(uv+advect):texture(uPlate,uv+advect).rgb;
    col*=1.+surface*.075*(turbulence(uv*vec2(44.,27.)+vec2(t*.035,-t*.045))-.5);
    float prominence=fringe*warm*(.5+.5*sin(a*17.-t*.5+noise(uv*19.)*3.));
    col+=vec3(1.,.32,.045)*prominence*.052;
    float wall=smoothstep(.46,.62,uv.x);
    col*=1.-wall*smoothstep(.33,.9,r)*pow(.5+.5*sin(a*3.2+t*.09+r*1.7),10.)*.12;
    col+=vec3(.035,.018,.005)*wall*warm*(.5+.5*sin(t*.19-r*8.));
  }
  col*=1.-.075*dot(uv-.5,uv-.5);
  fragColor=vec4(clamp(col,0.,1.),alpha);
}`;
function shader(gl,type,source){
  const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(message);}
  return s;
}
export class ObservatoryRenderer{
  constructor(canvas,image,cleanImage){
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,depth:true,stencil:false,powerPreference:'low-power'});
    if(!gl)throw new Error('WebGL2 unavailable');
    this.gl=gl;this.canvas=canvas;this.aspect=IMAGE_ASPECT;this.hasDepth=!!cleanImage;
    const vs=shader(gl,gl.VERTEX_SHADER,vertex),fs=shader(gl,gl.FRAGMENT_SHADER,fragment);
    const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);throw new Error('Unable to link depth renderer');}
    this.program=program;
    this.textures=[image,cleanImage||image].map(img=>{
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);return texture;
    });
    this.meshes=[0,1,2].map(layer=>{
      const data=makeSurface(layer,layer===0?112:32,layer===0?72:24),vao=gl.createVertexArray(),vbo=gl.createBuffer(),ebo=gl.createBuffer();
      gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,data.vertices,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,20,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,20,12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ebo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
      return {vao,vbo,ebo,count:data.indices.length};
    });
    this.uniforms=Object.fromEntries(['uPlate','uClean','uTime','uSpan','uCenter','uShift','uLayer','uDepth'].map(n=>[n,gl.getUniformLocation(program,n)]));
  }
  resize(){
    const {width,height}=this.canvas.parentElement.getBoundingClientRect();
    const scale=Math.min(devicePixelRatio||1,1.6,Math.sqrt(2500000/Math.max(1,width*height)));
    const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    this.viewAspect=width/Math.max(1,height);
  }
  draw(time,camera,shift=[0,0,0],depth=true){
    const gl=this.gl,a=this.viewAspect||this.aspect;
    const span=a>this.aspect?[1,this.aspect/a]:[a/this.aspect,1];
    const zoom=camera.zoom*1.035;span[0]/=zoom;span[1]/=zoom;
    const center=[Math.min(1-span[0]/2,Math.max(span[0]/2,camera.x)),Math.min(1-span[1]/2,Math.max(span[1]/2,camera.y))];
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.035,.029,.022,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    this.textures.forEach((t,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);});
    gl.uniform1i(this.uniforms.uPlate,0);gl.uniform1i(this.uniforms.uClean,1);
    gl.uniform1f(this.uniforms.uTime,time);gl.uniform2fv(this.uniforms.uSpan,span);gl.uniform2fv(this.uniforms.uCenter,center);
    const enabled=depth&&this.hasDepth;
    gl.uniform3fv(this.uniforms.uShift,enabled?shift:[0,0,0]);gl.uniform1i(this.uniforms.uDepth,enabled?1:0);
    for(let i=0;i<(enabled?3:1);i++){const mesh=this.meshes[i];gl.uniform1i(this.uniforms.uLayer,i);gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0);}
    gl.bindVertexArray(null);
  }
  dispose(){const gl=this.gl;for(const texture of this.textures)gl.deleteTexture(texture);for(const mesh of this.meshes){gl.deleteBuffer(mesh.vbo);gl.deleteBuffer(mesh.ebo);gl.deleteVertexArray(mesh.vao);}gl.deleteProgram(this.program);}
}
