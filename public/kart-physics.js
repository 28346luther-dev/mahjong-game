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
