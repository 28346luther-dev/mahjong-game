/* Pure racing physics helpers: normal alignment and soft car-to-car contact.
 * Browser-independent so collision and banking can be exercised in node tests. */
export const KART_CONTACT_RADIUS=1.55;
export function nearPitBay(x,z,bay,margin=0){
 return !!bay&&Number.isFinite(x)&&Number.isFinite(z)&&
  Math.hypot(x-bay.x,z-bay.z)<=(bay.radius||3.65)+margin;
}
export function resolveKartCollision(oldX,oldZ,newX,newZ,rivals=[],minSeparation=KART_CONTACT_RADIUS*2){
 let x=newX,z=newZ,hit=false;
 for(const p of rivals){
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z))continue;
  let dx=x-p.x,dz=z-p.z,dist=Math.hypot(dx,dz);
  if(dist>=minSeparation)continue;
  hit=true;
  if(dist<.0001){
   dx=oldX-p.x;dz=oldZ-p.z;dist=Math.hypot(dx,dz);
  }
  if(dist<.0001){dx=1;dz=0;dist=1;}
  // No penetration. The contact normal pushes the car to the outer edge
  // of the rival's bounding cylinder while retaining lateral movement.
  x=p.x+dx/dist*minSeparation;
  z=p.z+dz/dist*minSeparation;
 }
 return {x,z,hit};
}
export function surfaceNormal(route,projection,angle,THREE){
 const samples=route.samples;
 const i=projection.index;
 const from=samples[Math.max(0,i)],to=samples[(i+1)%samples.length];
 const dx=to.x-from.x,dz=to.z-from.z;
 const horizontal=Math.hypot(dx,dz)||1;
 const tx=dx/horizontal,tz=dz/horizontal;
 const grade=(to.y-from.y)/horizontal;
 const crossSlope=-Math.tan(angle||0);
 const nx=-tz,nz=tx;
 // Height field y(s,n) = grade*s + crossSlope*n;
 // the upward-facing geometric normal is (-dy/dx,1,-dy/dz).
 return new THREE.Vector3(-grade*tx-crossSlope*nx,1,-grade*tz-crossSlope*nz).normalize();
}

export function gravityAlongRoad(route,projection,headingYaw,g=9.81){
 const samples=route.samples,i=projection.index;
 const a=samples[i],b=samples[(i+1)%samples.length];
 const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
 // Gravity accelerates downhill along the direction of travel.
 const grade=(b.y-a.y)/len;
 const alignment=(dx*Math.sin(headingYaw)+dz*Math.cos(headingYaw))/len;
 return -g*grade*alignment;
}

/* Damped sprung-mass approximation: kerb strike, compression and rebound.
 * Units are metres, seconds and m/s; independent of render frame rate. */
export function createSuspensionState(){return {heave:0,heaveVelocity:0,roll:0,rollVelocity:0,grip:1};}
export function stepSuspension(state,{speed=0,lateral=0,halfWidth=6.3,kerbWidth=2.35,progress=0,dt=1/60}={}){
 const h=Math.min(.033,Math.max(0,dt)),edge=Math.abs(lateral)-halfWidth;
 const onKerb=edge>-.15&&edge<kerbWidth;
 const strike=onKerb?Math.sin((progress*4088.0)*Math.PI*2/.92)*.013:0;
 const crown=onKerb?.021*Math.sin(Math.PI*Math.max(0,Math.min(1,(edge+.15)/(kerbWidth+.15)))):0;
 const target=crown+strike*Math.min(1,Math.abs(speed)/35);
 const spring=145,damping=18;
 state.heaveVelocity+=(target-state.heave)*spring*h-state.heaveVelocity*damping*h;
 state.heave+=state.heaveVelocity*h;
 const targetRoll=(onKerb?Math.sign(lateral)*.018:0)*Math.min(1,Math.abs(speed)/28);
 state.rollVelocity+=(targetRoll-state.roll)*95*h-state.rollVelocity*15*h;
 state.roll+=state.rollVelocity*h;
 state.grip=onKerb?Math.max(.76,1-.16*Math.min(1,Math.abs(speed)/40)):1;
 return {heave:state.heave,roll:state.roll,grip:state.grip,onKerb};
}
