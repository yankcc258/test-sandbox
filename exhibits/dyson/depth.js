// Camera-projected relief, in artistic scene units (not astronomical metres).
export const IMAGE_ASPECT = 1672 / 941;
export const MAX_SHIFT = .22;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function surfaceDepth(u,v,layer=0) {
  if(layer===1)return 3.15;
  if(layer===2)return 2.8; // rigid balcony/observer projection surface
  const r=Math.hypot((u-.18)*IMAGE_ASPECT,v-.66);
  const stellarFront=15-2.4*Math.sqrt(Math.max(0,1-(r/.515)**2));
  const wall=19-10*smooth(.35,1,u)+1.5*(.5-v);
  return stellarFront*(1-smooth(.49,.57,r))+wall*smooth(.49,.57,r);
}
export function projectedPoint(u,v,depth,shift=[0,0,0]) {
  const z=depth-shift[2];
  return [.5+((u-.5)*2*IMAGE_ASPECT*depth-shift[0])/(2*IMAGE_ASPECT*z),.5-((.5-v)*2*depth-shift[1])/(2*z)];
}
export function makeSurface(layer,columns=96,rows=56) {
  const vertices=new Float32Array((columns+1)*(rows+1)*5),indices=new Uint16Array(columns*rows*6);
  let n=0;
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
    const u=-.045+1.09*x/columns,v=-.045+1.09*y/rows,d=surfaceDepth(u,v,layer);
    vertices[n++]=(u-.5)*2*IMAGE_ASPECT*d;vertices[n++]=(.5-v)*2*d;
    vertices[n++]=d;vertices[n++]=u;vertices[n++]=v;
  }
  n=0;
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;
    for(const i of [a,c,b,b,c,d])indices[n++]=i;
  }
  return {vertices,indices};
}
export function cameraRail(seconds) {
  const phase=seconds*Math.PI/24;
  return [MAX_SHIFT*Math.sin(phase),.025*Math.sin(phase*.5),.055*(1-Math.cos(phase))];
}
