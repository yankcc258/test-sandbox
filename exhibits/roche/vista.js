// Cinematic Roche exhibit: a fragmented luminous nebula drawn toward a red stellar beacon above the lower-left horizon.
// Cloud structure, apparent sizes, galactic background and optical glare are art-directed.
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
// 循环的上界故意不写成常量：Windows 上着色器经 ANGLE 交给 D3D 编译，常量次数的循环会被整段展开。
// 这个文件里体积采样 128 层、每层几十次噪声，展开以后场景着色器要编译二十多秒（实测 24.5 秒 → 1 秒）。
// u_loop 由 draw() 传 128，所以 min(layers, u_loop) 就是 layers，结果不变。
uniform int u_loop;
float fbm(vec3 p, int layers) {
  float sum = 0.0, weight = 0.5;
  for (int i = 0; i < min(layers, u_loop); i++) { sum += weight * noise3(p); p = mat3(0.00,0.80,0.60,-0.80,0.36,-0.48,-0.60,-0.48,0.64) * p * 2.03 + 11.7; weight *= 0.5; }
  return sum;
}`;

// 两遍都要用的：星体的尺寸和位置、视线和球面的交点
const GEOMETRY = `
// Fictional scale study: irregular nebular clouds and bright broken filaments feed a low-left red stellar beacon.
// All dimensions, density, lighting and transport are art-directed. This is not a dynamical solution.
const vec2 SINK=vec2(-13.395632,0.494323);
const float GIANT_RADIUS=3.20;
const float SINK_RADIUS=0.27;
float sphere(vec3 rd,vec3 center,float radius) {
  float b=dot(rd,center),h=b*b-dot(center,center)+radius*radius;
  return h<0.0?-1.0:b-sqrt(h);
}
`;

// 破碎的星云和汇向红色光源的三股流在盘面上一点的颜色和密度
const CLOUD = `
vec2 ribbon(vec2 p,vec2 a,vec2 b,vec2 c) {
  // Smooth quadratic stream; nearest-point refinement retains a continuous taper.
  float t=clamp(dot(p-a,c-a)/dot(c-a,c-a),0.0,1.0);
  for(int i=0;i<5;i++) {
    vec2 at=mix(mix(a,b,t),mix(b,c,t),t);
    vec2 d=2.0*mix(b-a,c-b,t),dd=2.0*(c-2.0*b+a);
    t=clamp(t-dot(at-p,d)/max(dot(d,d)+dot(at-p,dd),0.05),0.0,1.0);
  }
  vec2 at=mix(mix(a,b,t),mix(b,c,t),t);
  return vec2(length(p-at),t);
}

vec4 aurora(vec2 p,float z) {
  float r=length(p),sinkR=length(p-SINK);
  if(r>17.0||r<3.10||sinkR<0.23)return vec4(0.0);
  float a=atan(p.y,p.x);
  // Three overlapping, uneven cloud lobes. No annular envelope and no periodic radial bands.
  vec2 q1=(p-vec2(-4.8,-1.5))/vec2(3.0,3.8);
  vec2 q2=(p-vec2(-2.7,3.5))/vec2(3.1,3.0);
  vec2 q3=(p-vec2(-1.1,-5.4))/vec2(3.2,2.5);
  float envelope=exp(-dot(q1,q1)*1.4)+0.85*exp(-dot(q2,q2)*1.5)+0.80*exp(-dot(q3,q3)*1.4);
  vec2 high=ribbon(p,vec2(-4.0,-3.3),vec2(-8.5,-1.1),SINK+vec2(0.18,-0.04));
  vec2 low=ribbon(p,vec2(-3.6,4.0),vec2(-9.0,4.3),SINK+vec2(0.17,0.09));
  vec2 middle=ribbon(p,vec2(-5.2,0.2),vec2(-9.8,1.7),SINK+vec2(0.15,0.0));
  float widthA=mix(0.78,0.045,pow(high.y,1.22));
  float widthB=mix(0.62,0.040,pow(low.y,1.12));
  float widthC=mix(0.40,0.025,pow(middle.y,1.35));
  float highFlow=exp(-pow(high.x/widthA,2.0))*smoothstep(0.0,0.14,high.y);
  float lowFlow=exp(-pow(low.x/widthB,2.0))*smoothstep(0.0,0.14,low.y)*0.73;
  float midFlow=exp(-pow(middle.x/widthC,2.0))*smoothstep(0.0,0.16,middle.y)*0.40;
  float transfer=highFlow+lowFlow+midFlow;
  float support=envelope+transfer;
  if(support<0.0004)return vec4(0.0);
  // 云在厚度方向上是一个高斯：中面最多偏 0.23（fold 的上限），标准差是 thick。
  // 离中面超过 2.7 个标准差时密度不到千分之一，后面几十次噪声可以不算。细流里（thick 小）能省下约四成的层。
  if(abs(z)>0.23+2.7*mix(0.38,0.13,smoothstep(0.30,1.0,transfer)))return vec4(0.0);

  float turn=a+0.46*log(r+0.3)-u_time*0.0015;
  vec3 flow=vec3(cos(turn)*r,sin(turn)*r,z*2.2);
  // The long streams advect toward the perturber; the broad source turns much more slowly.
  vec3 pulled=vec3(p.x+u_time*0.025,p.y*2.6,z*2.1);
  flow=mix(flow,pulled,smoothstep(0.2,0.9,transfer)*smoothstep(6.0,9.0,r));
  vec3 curl=vec3(fbm(flow*1.8+2.4,3),fbm(flow*1.8+18.1,3),fbm(flow*1.8+43.2,3));
  vec3 turbulent=flow*2.6+(curl-0.5)*3.8;
  float cloud=fbm(turbulent,5),detail=fbm(turbulent*4.7+curl*3.0,4);
  float threads=fbm(flow*vec3(5.0,1.4,3.0)+curl*4.0,4);
  float dark=fbm(turbulent*1.3+7.1,4);
  float wisps=pow(smoothstep(0.30,0.66,cloud*0.68+detail*0.32),1.45);
  float pockets=fbm(flow*0.85+curl*1.8+29.2,4);
  float broken=smoothstep(0.34,0.61,pockets);
  float voids=exp(-5.0*smoothstep(0.42,0.66,fbm(flow*1.7+curl*2.0+8.4,4)));
  // Local luminous strands inside a porous volume; they are broken by the same cloud cavities.
  float threadCore=exp(-pow((threads-0.49)/0.030,2.0));
  float fiber=threadCore*smoothstep(0.37,0.65,detail)*broken;
  float fold=0.28*(pockets-0.5)+0.18*(cloud-0.5);
  float thick=mix(0.38,0.13,smoothstep(0.30,1.0,transfer));
  float vertical=exp(-pow((z-fold)/thick,2.0));
  float nebula=envelope*(0.04+2.9*broken)*voids;
  float density=(nebula*1.5+transfer*2.1)*vertical*wisps*(0.45+detail);
  // Broad extinction shapes the illumination; finer dust stays inside the approved cloud envelope.
  float backCloud=fbm(turbulent+vec3(-0.90,0.35,0.65),4);
  float selfShadow=exp(-4.8*max(backCloud-cloud+0.055,0.0));
  float shadow=exp(-4.2*smoothstep(0.41,0.68,dark))*mix(0.35,1.0,selfShadow);
  float depthLight=mix(0.55,1.24,smoothstep(-0.38,0.32,z-fold));
  float cloudLight=mix(0.38,1.28,smoothstep(0.35,0.65,pockets));
  float heat=exp(-sinkR*0.85);
  vec3 blue=mix(vec3(0.004,0.009,0.024),vec3(0.105,0.255,0.39),smoothstep(0.26,0.68,cloud));
  vec3 pearl=vec3(0.60,0.75,0.83)*pow(max(detail*1.3-0.34,0.0),3.0)*2.25;
  vec3 light=(blue+pearl)*(0.35+broken*0.75)*shadow*depthLight*cloudLight;
  light+=vec3(0.29,0.58,0.73)*fiber*shadow*depthLight*1.30;
  light+=vec3(0.10,0.025,0.16)*pow(wisps,2.0)*smoothstep(-0.1,0.35,z)*0.17;
  // Small luminous folds emerge through the dust instead of lighting every cloud equally.
  float exposed=pow(smoothstep(0.46,0.67,cloud),2.0)*smoothstep(0.45,0.64,pockets);
  light+=vec3(0.28,0.43,0.52)*exposed*vertical*selfShadow*0.40;
  light*=1.0+0.80*smoothstep(0.45,0.95,max(high.y,low.y))*smoothstep(0.25,0.9,transfer);
  light=mix(light,light*vec3(3.2,0.24,0.34)+vec3(0.90,0.018,0.075)*wisps*shadow,heat*0.95);
  light*=smoothstep(0.24,0.39,sinkR);
  density*=smoothstep(0.23,0.34,sinkR);
  return vec4(light,density);
}
`;

// 第一遍：只画体积云。输出 rgb = 云自己的光，a = 后面的东西还透得过来多少。
// 这一遍可以用比画布低的分辨率（见 draw 的 volume 参数）：每帧的时间几乎全花在这里。
const VOLUME = `#version 300 es
precision highp float;
uniform vec2 u_tan;
uniform vec3 u_right,u_up,u_fwd;
uniform float u_time,u_distance;
uniform int u_layers; // 沿视线取多少层：完整画质 128，播放吃力时减少
uniform float u_seed; // 每帧换一个，让各层的取样位置逐帧错开；完整画质时是 0
in vec2 v_uv;
out vec4 o;
${NOISE}
${GEOMETRY}
${CLOUD}
void main() {
  vec2 ndc=v_uv*2.0-1.0;
  vec3 rd=normalize(ndc.x*u_tan.x*u_right+ndc.y*u_tan.y*u_up+u_fwd);
  vec3 host=vec3(8.0,1.8,10.0)*(u_distance/9.2);
  vec3 N=normalize(vec3(-0.20694789,0.8,-0.6));
  vec3 U=normalize(cross(N,vec3(0,0,1))),V=cross(N,U);
  float tg=sphere(rd,host,GIANT_RADIUS),opaque=tg>0.0?tg:1e5;
  vec3 glow=vec3(0.0);
  float through=1.0;
  float denom=dot(rd,N),s=dot(host,N)/denom;
  if(s>0.0&&abs(denom)>0.018) {
    // 完整画质是 128 层，每层的位置和抖动与原来逐层对应。从近到远累加：glow 是云自己的光，through 是后面还透得过来多少。
    // 和「从远到近一层层盖上去」是同一个式子，只是换了求和的顺序；前面的云已经把后面挡严了就不用再算。
    // 层数少的时候把每层的位置抖得开一些：不然层与层之间的缝会显成一圈圈等高线
    float layers=float(u_layers),spread=u_layers>=128?0.18:0.70;
    for(int k=0;k<u_layers;k++) {
      float jitter=(hash13(vec3(gl_FragCoord.xy,float(k)+3.7+u_seed))-0.5)*spread;
      float z=((float(k)+0.5+jitter)/layers*2.0-1.0)*0.90;
      float t=s+z/abs(denom);
      if(t<0.0)continue;
      if(t>opaque)break;                                  // 再往后都在巨行星后面
      vec3 at=rd*t-host;
      vec4 cloud=aurora(vec2(dot(at,U),dot(at,V)),dot(at,N));
      float alpha=1.0-exp(-cloud.a*(1.8/layers)*3.0/abs(denom));
      glow+=through*alpha*cloud.rgb;
      through*=1.0-alpha;
      if(through<0.004)break;                             // 后面的东西最多只剩千分之四，看不出来
    }
  }
  o=vec4(glow,through);
}
`;

// 第二遍：银河背景 → 巨行星 → 叠上第一遍的星云 → 红色致密星体 → 地平线。
const SCENE = `#version 300 es
precision highp float;
uniform vec2 u_res,u_tan;
uniform vec3 u_right,u_up,u_fwd;
uniform float u_time,u_distance;
uniform sampler2D u_volume;
in vec2 v_uv;
out vec4 o;
${NOISE}

${GEOMETRY}
vec3 sky(vec3 rd) {
  vec3 col=vec3(0.0004,0.0007,0.0018);
  vec3 w=vec3(fbm(rd*5.0+2.3,3),fbm(rd*5.0+13.1,3),fbm(rd*5.0+33.4,3));
  float clouds=fbm(rd*10.0+w*3.4,5),lace=fbm(rd*75.0+w*8.0,4);
  // A stationary galactic band behind the moving nebula. Irregular dust lanes break its light.
  float latitude=dot(rd,normalize(vec3(0.42,1.0,-0.08)));
  float longitude=dot(rd,normalize(vec3(1.0,-0.42,0.0)));
  float warp=(fbm(rd*24.0+w*2.0,4)-0.48)*0.045;
  float band=exp(-pow((latitude+warp)/0.060,2.0));
  float halo=exp(-pow(latitude/0.135,2.0));
  float dustLane=exp(-pow((latitude+warp*1.7+0.009)/0.018,2.0));
  float extinction=exp(-3.4*dustLane*(0.45+lace));
  float clumps=smoothstep(0.25,0.70,clouds)*(0.35+lace);
  float bulge=exp(-pow((longitude+0.26)/0.29,2.0));
  col+=vec3(0.009,0.009,0.017)*halo*clumps;
  col+=mix(vec3(0.048,0.050,0.070),vec3(0.105,0.081,0.069),bulge)*band*clumps*extinction;
  col+=vec3(0.037,0.044,0.064)*pow(smoothstep(0.38,0.72,lace),2.0)*band*extinction;
  for(int layer=0;layer<4;layer++) {
    float scale=layer==0?77.0:layer==1?171.0:layer==2?337.0:601.0;
    vec3 g=rd*scale,cell=floor(g);
    float pick=hash13(cell+7.7);
    float threshold=layer==3?0.97-0.28*band:0.86-0.09*band;
    if(pick<threshold)continue;
    vec3 at=cell+0.25+0.5*vec3(hash13(cell),hash13(cell+17.3),hash13(cell+41.7));
    float power=(pick-threshold)/(1.0-threshold),point=1.0-smoothstep(0.0,0.075,length(g-at));
    col+=mix(vec3(0.42,0.57,0.78),vec3(0.88,0.74,0.61),hash13(cell+3.1))*point*(0.09+power*power*0.65)*(layer==3?0.35:1.0);
  }
  return col;
}

vec3 giantSurface(vec3 rd,vec3 center,float t) {
  vec3 n=normalize(rd*t-center);
  float rim=pow(1.0-max(dot(n,-rd),0.0),4.0);
  float cloud=fbm(n*19.0+fbm(n*5.0,3)*4.0,5);
  float day=max(dot(n,normalize(vec3(-0.85,0.3,-0.1))),0.0);
  vec3 body=vec3(0.002,0.004,0.009)*(0.55+cloud)*(0.3+day*0.45);
  body+=vec3(0.035,0.17,0.27)*rim*(0.25+day)*0.44;
  return body;
}
vec3 compactSurface(vec3 rd,vec3 center,float t) {
  vec3 n=normalize(rd*t-center);
  float cloud=fbm(n*36.0+u_time*0.004,4);
  float face=max(dot(n,-rd),0.0);
  vec3 body=vec3(1.3,0.008,0.022)*(0.15+0.30*cloud)*pow(face,2.0);
  // Preserve an unmistakable light point rather than placing an opaque dark sphere over the source.
  body+=vec3(6.0,1.8,2.4)*pow(face,46.0);
  return body;
}

void main() {
  vec2 ndc=v_uv*2.0-1.0;
  vec3 rd=normalize(ndc.x*u_tan.x*u_right+ndc.y*u_tan.y*u_up+u_fwd);
  vec3 host=vec3(8.0,1.8,10.0)*(u_distance/9.2);
  vec3 N=normalize(vec3(-0.20694789,0.8,-0.6));
  vec3 U=normalize(cross(N,vec3(0,0,1))),V=cross(N,U);
  vec3 sink=host+U*SINK.x+V*SINK.y;
  vec3 col=sky(rd);
  float tg=sphere(rd,host,GIANT_RADIUS),ts=sphere(rd,sink,SINK_RADIUS);
  float opaque=tg>0.0?tg:1e5;
  if(opaque<1e4)col=giantSurface(rd,host,tg);
  float impact=length(cross(rd,host));
  if(tg<0.0)col+=vec3(0.045,0.18,0.30)*exp(-max(impact-GIANT_RADIUS,0.0)/0.045)*0.12;
  float miss=length(cross(rd,sink));
  // A continuous corona crosses the limb smoothly, preserving the white-pink light point.
  col+=vec3(0.28,0.006,0.017)*exp(-miss*miss/0.095);
  col+=vec3(0.009,0.0004,0.0016)*exp(-miss*miss/0.65);
  // 体积云在 VOLUME 那一遍里已经画好：rgb 是云自己的光，a 是后面还透得过来多少
  vec4 volume=texture(u_volume,v_uv);
  col=col*volume.a+volume.rgb;
  // A tapered emissive limb keeps the compact source crisp without a hard red disc.
  // Composite at the front of the incoming cloud, retaining its geometric centre and radius.
  if(ts>0.0&&ts<opaque) {
    float face=max(dot(normalize(rd*ts-sink),-rd),0.0);
    col=mix(col,compactSurface(rd,sink,ts),smoothstep(0.05,0.78,face));
  }
  // Foreground world and observation window remain small against the celestial scale.
  vec3 sun=normalize(vec3(-0.5100,-0.19125,1.0));
  float facing=dot(rd,sun);
  float R=0.6,dip=radians(9.0),lift=R*(1.0/cos(dip)-1.0),pitch=radians(-4.0),lean=radians(2.6);
  vec3 up=normalize(vec3(sin(lean)*cos(pitch),cos(lean)*cos(pitch),-sin(pitch)));
  vec3 oc=up*(R+lift);
  float b=dot(oc,rd),far=sqrt(max(dot(oc,oc)-b*b,0.0)),disc=b*b-dot(oc,oc)+R*R;
  float toward=pow(max(facing,0.0),30.0);
  vec3 warm=vec3(1.0,0.025,0.10),cool=vec3(0.09,0.40,0.65);
  if(disc>0.0&&b<0.0) {
    vec3 at=oc+rd*(-b-sqrt(disc)),n=normalize(at);
    float graze=pow(1.0-max(dot(n,-rd),0.0),7.0);
    vec3 shine=normalize(host);
    vec3 w=n*540.0+8.0*vec3(fbm(n*113.0+2.0,4),fbm(n*113.0+9.0,4),fbm(n*113.0+17.0,4));
    float cloud=smoothstep(0.37,0.68,fbm(w,6));
    float fine=smoothstep(0.41,0.69,fbm(w*3.5+5.0,5));
    col=vec3(0.0005,0.0011,0.0021)+vec3(0.027,0.047,0.064)*(cloud*0.65+fine*0.32)*(0.3+0.7*max(dot(n,shine),0.0));
    col+=warm*0.035*max(dot(n,sun),0.0)*(0.3+0.7*cloud);
    col=mix(col,mix(vec3(0.02,0.05,0.085),warm*0.045,toward),graze*0.30);
  } else {
    float height=max(far-R,0.0);
    float air=(exp(-height/0.0005)+0.22*exp(-height/0.0028))*(1.0-smoothstep(0.35*lift,0.95*lift,height));
    col+=mix(cool*0.11,warm*0.18,toward)*air*(b<0.0?1.0:0.0);
  }
  o=vec4(col,1.0);
}
`;

// 原样拷一张图：把这一帧的体积云按比例混进前几帧的平均里
const COPY = `#version 300 es
precision highp float;
uniform sampler2D u_src; in vec2 v_uv; out vec4 o;
void main() { o = texture(u_src, v_uv); }`;
const BRIGHT = `#version 300 es
precision highp float;
uniform sampler2D u_src; uniform vec2 u_texel; in vec2 v_uv; out vec4 o;
void main() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 s = min(texture(u_src, v_uv + vec2(i % 2 == 0 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * u_texel).rgb, vec3(24.0));
    float peak = max(s.r, max(s.g, s.b));
    // Soft-knee extraction lets only the brighter nebular folds contribute to bloom.
    float knee=clamp(peak-0.17,0.0,0.36);
    float contribution=max(peak-0.35,knee*knee/0.72);
    c += s * contribution / max(peak, 1e-4);
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
float capsule(vec3 p,vec3 a,vec3 b,float r){vec3 ab=b-a,ap=p-a;return length(ap-ab*clamp(dot(ap,ab)/dot(ab,ab),0.0,1.0))-r;}
float ellipsoid(vec3 p,vec3 size){float k0=length(p/size),k1=length(p/(size*size));return k0*(k0-1.0)/max(k1,1e-5);}
float mergeShape(float a,float b,float k){float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0);return mix(b,a,h)-k*h*(1.0-h);}
// 静帧里的观测者由有厚度的距离场构成：重心、肩肘、衣服和鞋分别建形，替换 SVG 人形图标。
float observer(vec3 p){
  float d=ellipsoid(p-vec3(-0.015,1.62,0.0),vec3(0.102,0.132,0.108));
  d=mergeShape(d,capsule(p,vec3(0,1.47,0),vec3(0,1.39,0),0.057),0.035);
  float coat=ellipsoid(p-vec3(0,1.18,0),vec3(0.19,0.31,0.117));
  coat+=0.0035*sin(p.y*72.0+p.x*20.0)*sin(p.x*39.0+p.z*13.0);
  d=mergeShape(d,coat,0.05);
  d=mergeShape(d,ellipsoid(p-vec3(0,1.38,0),vec3(0.235,0.10,0.10)),0.045);
  d=mergeShape(d,ellipsoid(p-vec3(0,0.91,0),vec3(0.164,0.15,0.10)),0.05);
  d=mergeShape(d,capsule(p,vec3(-0.20,1.34,0),vec3(-0.26,1.07,0.01),0.066),0.04);
  d=mergeShape(d,capsule(p,vec3(-0.26,1.07,0.01),vec3(-0.22,0.85,0.04),0.049),0.025);
  d=min(d,ellipsoid(p-vec3(-0.22,0.80,0.04),vec3(0.035,0.07,0.033)));
  d=mergeShape(d,capsule(p,vec3(0.20,1.34,0),vec3(0.255,1.12,-0.015),0.066),0.04);
  d=mergeShape(d,capsule(p,vec3(0.255,1.12,-0.015),vec3(0.34,1.08,-0.07),0.048),0.03);
  d=min(d,ellipsoid(p-vec3(0.35,1.08,-0.08),vec3(0.047,0.031,0.043)));
  d=mergeShape(d,capsule(p,vec3(-0.085,0.91,0),vec3(-0.10,0.50,0.02),0.087),0.045);
  d=mergeShape(d,capsule(p,vec3(-0.10,0.50,0.02),vec3(-0.12,0.12,0.045),0.061),0.03);
  d=mergeShape(d,capsule(p,vec3(0.08,0.9,0),vec3(0.105,0.49,-0.04),0.081),0.04);
  d=mergeShape(d,capsule(p,vec3(0.105,0.49,-0.04),vec3(0.17,0.12,-0.06),0.056),0.03);
  d=min(d,ellipsoid(p-vec3(-0.12,0.055,-0.005),vec3(0.069,0.052,0.13)));
  return min(d,ellipsoid(p-vec3(0.17,0.052,-0.11),vec3(0.066,0.05,0.13)));
}
vec4 shadeObserver(vec2 pixel){
  vec2 screen=(pixel-vec2(0.832,0.049)*u_res)/(u_res.y*0.058);
  if(screen.x< -0.4||screen.x>0.45||screen.y< -0.02||screen.y>1.8)return vec4(0.0);
  vec3 ro=vec3(screen,3.0),rd=vec3(0,0,-1);
  float t=0.0;
  for(int i=0;i<60;i++){
    float d=observer(ro+rd*t);
    if(d<0.0015)break;
    t+=max(d*0.8,0.001);
    if(t>3.4)return vec4(0.0);
  }
  vec3 p=ro+rd*t;
  if(observer(p)>0.003)return vec4(0.0);
  vec2 e=vec2(0.002,0.0);
  vec3 n=normalize(vec3(observer(p+e.xyy)-observer(p-e.xyy),observer(p+e.yxy)-observer(p-e.yxy),observer(p+e.yyx)-observer(p-e.yyx)));
  vec3 key=normalize(vec3(-0.6,0.9,-0.7)),rim=normalize(vec3(0.7,0.4,-0.6));
  float diffuse=max(dot(n,key),0.0),edge=max(dot(n,rim),0.0);
  vec3 albedo=p.y>1.49?vec3(0.10,0.07,0.057):vec3(0.018,0.025,0.031);
  vec3 c=albedo*(0.03+diffuse*0.7)+vec3(0.055,0.12,0.17)*pow(edge,4.0)*0.50;
  c+=vec3(0.19,0.075,0.085)*pow(diffuse,6.0)*0.035;
  return vec4(c,1.0);
}
vec3 reconstructedScene(vec2 uv) {
  // Subpixel reconstruction of the volume, before glare and the filmic response.
  vec2 e=0.65/u_res;
  vec3 c=texture(u_scene,uv).rgb*0.40;
  c+=texture(u_scene,uv+vec2(e.x,0)).rgb*0.15;
  c+=texture(u_scene,uv-vec2(e.x,0)).rgb*0.15;
  c+=texture(u_scene,uv+vec2(0,e.y)).rgb*0.15;
  c+=texture(u_scene,uv-vec2(0,e.y)).rgb*0.15;
  return c;
}
vec3 outside(vec2 uv) {
  vec3 c = reconstructedScene(uv) + texture(u_bloom, uv).rgb * 0.075;
  vec2 p = (uv - u_star) * vec2(u_res.x / u_res.y, 1.0);
  // Three optical scales: a narrow bright core, red body, then a very soft light veil.
  float axial=1.0/(1.0+9.0*p.y*p.y);
  float pillar=exp(-pow(abs(p.x)*780.0,1.35))*axial;
  float beamBody=exp(-abs(p.x)*145.0)/(1.0+8.0*p.y*p.y);
  float beamVeil=exp(-pow(p.x*28.0,2.0))/(1.0+15.0*p.y*p.y);
  float streak = exp(-abs(p.y) * 430.0) / (1.0 + 180.0 * p.x * p.x);
  c += (vec3(2.8,0.12,0.20)*pillar*0.47
       + vec3(0.18,0.004,0.012)*beamBody
       + vec3(0.006,0.0003,0.0008)*beamVeil
       + vec3(1.1,0.23,0.28)*streak*0.07)*u_flare;
  return c;
}
void main() {
  vec2 px = v_uv * u_res;
  float floorTop = 0.118 * u_res.y, right = 0.925 * u_res.x, top = 0.972 * u_res.y;
  // 窗：左边一直开到画面外，右边和上面是舱壁
  vec2 lo = vec2(-0.2 * u_res.x, floorTop), hi = vec2(right, top);
  float rounded=box(px-0.5*(lo+hi),0.5*(hi-lo),0.014*u_res.y);
  // 上部斜切的承力角与双层内框；保持窗外的取景参数不变。
  float diagonal=(1.25*v_uv.x+v_uv.y-1.997)/length(vec2(1.25/u_res.x,1.0/u_res.y));
  float d=max(rounded,diagonal);
  vec3 c;
  if (d < 0.0) {
    c = outside(v_uv);
    c *= 1.0 - 0.55 * smoothstep(-0.022 * u_res.y, 0.0, d);
    // 玻璃上两道很淡的反光
    float beam = (1.0 - smoothstep(0.0,0.035,abs(v_uv.x * 0.62 + v_uv.y - 1.34))) + 0.7 * (1.0-smoothstep(0.0,0.022,abs(v_uv.x * 0.62 + v_uv.y - 1.47)));
    c += vec3(0.10,0.18,0.23) * beam * 0.006 * smoothstep(0.35,1.0,v_uv.y);
    c += vec3(0.10,0.16,0.20) * exp(-pow((d+2.2)/1.2,2.0)) * (0.20+0.80*pow(max(v_uv.y,0.0),2.0));
  } else if (px.y < floorTop && px.x < right + 0.03 * u_res.x) {
    // 地板：映着窗外，越靠近人越暗
    float depth = (floorTop - px.y) / floorTop;
    vec2 mirror = vec2(v_uv.x, (2.0 * floorTop - px.y + depth * 0.10 * u_res.y) / u_res.y);
    c = texture(u_soft,mirror).rgb * (0.085-0.065*depth) + texture(u_bloom,mirror).rgb * 0.009 * (1.0-depth);
    c += vec3(0.0022,0.0033,0.0045);
    // 哑光面板的透视接缝、细纹和窗根阴影，使前景有材料与结构。
    float tiles = (v_uv.x - 0.62) / (0.13 + depth * 0.31);
    float joint = 1.0 - smoothstep(0.002,0.010,abs(fract(tiles+0.5)-0.5));
    float row = exp(-pow((depth - 0.38)/0.012,2.0));
    c *= 1.0-0.65*max(joint,row);
    c *= 0.90+0.1*noise3(vec3(px.x*0.45,px.y*3.0,4.0));
    c *= smoothstep(0.0,0.08,depth)*0.5+0.5;
    c += vec3(0.10,0.18,0.23) * 0.12 * exp(-pow((floorTop-px.y-4.0)/1.4,2.0));
    // Recessed threshold, brushed deck panels and a quiet blue guide light.
    float threshold=(floorTop-px.y)/u_res.y;
    c*=1.0-0.48*exp(-pow((threshold-0.013)/0.003,2.0));
    c+=vec3(0.013,0.026,0.034)*exp(-pow((threshold-0.021)/0.0015,2.0));
    float lightSegments=smoothstep(0.06,0.11,abs(fract(v_uv.x*7.0)-0.5));
    c+=vec3(0.012,0.030,0.044)*exp(-pow((threshold-0.0235)/0.00065,2.0))*lightSegments;
  } else {
    float mm=d/u_res.y;
    // 密封条、斜切的金属内框、退后的外壳；高光随面朝向改变。
    float bevel=smoothstep(0.002,0.005,mm)*(1.0-smoothstep(0.013,0.018,mm));
    float facet=0.35+0.65*smoothstep(0.70,0.96,v_uv.x);
    c=vec3(0.0020,0.0030,0.0043)+vec3(0.036,0.049,0.061)*bevel*facet;
    c+=vec3(0.07,0.10,0.13)*exp(-pow((mm-0.004)/0.0011,2.0))*facet;
    c+=vec3(0.004,0.007,0.010)*smoothstep(0.02,0.035,mm);
    c*=0.92+0.08*noise3(vec3(px.x*0.9,px.y*0.12,6.3));
    float seam=exp(-pow((mm-0.026)/0.0009,2.0));
    c*=1.0-0.80*seam;
    // A second recessed shoulder gives the frame thickness without narrowing the view.
    float shoulder=smoothstep(0.029,0.034,mm)*(1.0-smoothstep(0.050,0.056,mm));
    c+=vec3(0.010,0.016,0.022)*shoulder*facet;
    c+=vec3(0.031,0.045,0.056)*exp(-pow((mm-0.034)/0.0012,2.0))*facet;
    c*=0.96+0.04*noise3(vec3(px.x*0.04,px.y*1.8,7.0));
    // 克制的固定螺钉：沉孔和小面受光。
    if(v_uv.x>0.93 && v_uv.y>0.15 && v_uv.y<0.93){
      vec2 bolt=vec2((v_uv.x-0.952)*u_res.x,(fract(v_uv.y*4.0+0.12)-0.5)*u_res.y/4.0);
      float rr=length(bolt);
      c=mix(c,vec3(0.0006),1.0-smoothstep(2.6,3.6,rr));
      c+=vec3(0.022,0.032,0.039)*exp(-pow((rr-3.6)/0.8,2.0))*smoothstep(-3.0,3.0,bolt.y);
    }
  }
  // 鞋底接触阴影与身体投影在同一个地面上。
  vec2 contact=(v_uv-vec2(0.832,0.049))*vec2(u_res.x/u_res.y,1.0);
  c*=1.0-0.72*exp(-pow(contact.x/0.021,2.0)-pow(contact.y/0.0028,2.0));
  vec4 person=shadeObserver(px);
  c=mix(c,person.rgb,person.a);
  vec2 q = v_uv - 0.5;
  // Slightly cooler shadow response with a restrained highlight shoulder.
  float sceneLuma=dot(c,vec3(0.2126,0.7152,0.0722));
  c*=mix(vec3(0.94,0.98,1.025),vec3(1.025,1.01,0.985),smoothstep(0.03,0.75,sceneLuma));
  c *= 1.12 * (1.0 - 0.40 * dot(q, q));
  c = pow(filmic(c), vec3(1.0 / 2.2));
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, 0.91);
  c *= 1.0+(hash13(vec3(gl_FragCoord.xy,3.0))-0.5)*0.006;
  o = vec4(c, 1.0);
}`;


async function link(gl, vs, fs) {
  const program = gl.createProgram();
  const shaders=[];
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    shaders.push(shader);
  }
  gl.bindAttribLocation(program, 0, 'p');
  gl.linkProgram(program);
  const parallel=gl.getExtension('KHR_parallel_shader_compile');
  if(parallel)while(!gl.isContextLost()&&!gl.getProgramParameter(program,parallel.COMPLETION_STATUS_KHR))
    await new Promise(resolve=>setTimeout(resolve,16));
  if(gl.isContextLost())throw new Error('WebGL context lost during setup');
  const valid=gl.getProgramParameter(program,gl.LINK_STATUS);
  const message=valid?'':[gl.getProgramInfoLog(program),...shaders.map(shader=>gl.getShaderInfoLog(shader))].filter(Boolean).join('\n');
  for(const shader of shaders)gl.deleteShader(shader);
  if(!valid){gl.deleteProgram(program);throw new Error(message);}
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
// 两个近景的方向（正切值）。全景的星体位置保持不变。
export const FOCUS = {nebula:[0.25,0.02],beacon:[-0.5100,-0.19125]};
const SUN = (() => {
  const v = [-0.5100, -0.19125, 1],
    l = Math.hypot(...v);
  return v.map((x) => x / l);
})();

export async function createVista(gl) {
  const distance=9.2;
  // 有浮点渲染目标就走高动态范围；没有就用普通的 8 位目标，辉光会弱一些
  const float = Boolean(
    gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'),
  );
  const [volume,copy,scene,bright,blur,final]=await Promise.all(
    [VOLUME,COPY,SCENE,BRIGHT,BLUR,FINAL].map(source=>link(gl,QUAD,source)),
  );
  const quad = gl.createVertexArray(),
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
  function ensure(w, h, vw, vh) {
    if (stage && stage.w === w && stage.h === h && stage.volume.w === vw && stage.volume.h === vh) return;
    if (stage)
      for (const level of [stage.volume, stage.history, stage.full, ...stage.soft, ...stage.levels]) {
        gl.deleteFramebuffer(level.frame);
        gl.deleteTexture(level.texture);
      }
    const levels = [];
    for (let i = 1; i <= 7; i++) levels.push(target(w >> i, h >> i));
    stage = {
      w,
      h,
      volume: target(vw, vh), // 这一帧的体积云，可以比画布小
      history: target(vw, vh), // 最近几帧体积云的平均；场景用的是这一张
      fresh: true, // 刚建好，里面还没有东西
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
    // s：time（秒，云的转动和细流按它走）、tan（横向半视场的正切）、basis（aim() 给的镜头三根轴）、
    // volume（体积云按画布分辨率的几成来画，0.25–1，默认 1；小于 1 时云会软一些，别的东西不受影响）、
    // layers（体积云沿视线取多少层，16–128，默认 128；少了会多一点颗粒）、
    // seed（取样位置的种子，默认 0）和 blend（这一帧占多大比例，默认 1 即不和前几帧平均）：
    // 播放时每帧换种子、取 0.2 左右，几帧平均下来颗粒就没了；镜头在动时要取大一些，不然会拖影
    draw(s) {
      const { width: w, height: h } = gl.canvas,
        aspect = w / h,
        tanH = s.tan, // 保住横向构图；iPad 竖屏也能看到左下红色光源。
        tanV = tanH / aspect,
        { right, up, fwd } = s.basis;
      const share = Math.max(0.25, Math.min(1, s.volume ?? 1));
      ensure(w, h, Math.max(2, Math.round(w * share)), Math.max(2, Math.round(h * share)));
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(quad);
      // 第一遍：体积云
      gl.bindFramebuffer(gl.FRAMEBUFFER, stage.volume.frame);
      gl.viewport(0, 0, stage.volume.w, stage.volume.h);
      gl.useProgram(volume.program);
      gl.uniform2f(volume.u.u_tan, tanH, tanV);
      gl.uniform3fv(volume.u.u_right, right);
      gl.uniform3fv(volume.u.u_up, up);
      gl.uniform3fv(volume.u.u_fwd, fwd);
      gl.uniform1f(volume.u.u_time, s.time);
      gl.uniform1f(volume.u.u_distance, distance);
      gl.uniform1i(volume.u.u_loop, 128);
      gl.uniform1i(volume.u.u_layers, Math.max(16, Math.min(128, Math.round(s.layers ?? 128))));
      gl.uniform1f(volume.u.u_seed, s.seed ?? 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 混进前几帧的平均。8 位渲染目标精度不够做这种平均（小的变化会被舍掉、画面卡住不更新），直接用这一帧
      const weight = stage.fresh || !float ? 1 : Math.max(0.05, Math.min(1, s.blend ?? 1));
      stage.fresh = false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, stage.history.frame);
      gl.useProgram(copy.program);
      bind(0, stage.volume.texture);
      gl.uniform1i(copy.u.u_src, 0);
      if (weight < 1) {
        gl.enable(gl.BLEND);
        gl.blendColor(0, 0, 0, weight);
        gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
      // 第二遍：其余的场景，把云叠进去
      gl.bindFramebuffer(gl.FRAMEBUFFER, stage.full.frame);
      gl.viewport(0, 0, w, h);
      gl.useProgram(scene.program);
      bind(0, stage.history.texture);
      gl.uniform1i(scene.u.u_volume, 0);
      gl.uniform2f(scene.u.u_res, w, h);
      gl.uniform2f(scene.u.u_tan, tanH, tanV);
      gl.uniform3fv(scene.u.u_right, right);
      gl.uniform3fv(scene.u.u_up, up);
      gl.uniform3fv(scene.u.u_fwd, fwd);
      gl.uniform1f(scene.u.u_time, s.time);
      gl.uniform1f(scene.u.u_distance,distance);
      gl.uniform1i(scene.u.u_loop,128);
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

