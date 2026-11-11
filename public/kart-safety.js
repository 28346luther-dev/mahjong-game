import {PIT,PIT_HALF_WIDTH,projectToRoute} from "./kart-track.js";
/* Circuit safety infrastructure: double-height steel Armco barriers, steel
 * posts, reflective bolt caps and crash pads. Geometry follows real road bends;
 * barrier placement stays beyond kerbs, gravel and green runoff. */
export function addKartSafety(THREE,scene,ROAD,halfWidth,runoffWidth){
 const pts=ROAD.samples,n=pts.length,guardOffset=halfWidth+runoffWidth+2.8;
 const steel=new THREE.MeshStandardMaterial({color:0xb4bac0,metalness:.88,roughness:.32,side:THREE.DoubleSide});
 const dark=new THREE.MeshStandardMaterial({color:0x50565b,metalness:.75,roughness:.43,side:THREE.DoubleSide});
 const bolts=new THREE.MeshStandardMaterial({color:0xe3e6e7,metalness:.96,roughness:.24});
 const rubber=new THREE.MeshStandardMaterial({color:0x26292d,roughness:.92});
 function tangent(i){
  const prev=pts[(i-5+n)%n],next=pts[(i+5)%n];
  const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1;
  return {nx:-dz/len,nz:dx/len,dx:dx/len,dz:dz/len};
 }
 function bend(i){
  const a=tangent((i-11+n)%n),b=tangent((i+11)%n);
  return a.dx*b.dz-a.dz*b.dx;
 }
 // A guarded segment uses two corrugated steel bands. At high curvature the
 // outside is protected; on high-speed straights, guard both edges.
 function protectedSide(i,side){
  // The main straight is protected by the flush glass barrier system.
  // Do NOT also draw the old setback Armco on the same straight.
  if(i>=n-70||i<=5)return false;
  const curve=bend(i);
  if(Math.abs(curve)>.055)return Math.sign(curve)!==side;
  return i<66||i>n-46||(i>135&&i<187)||(i>315&&i<385);
 }
 const postPositions=[],boltPositions=[];
 const surfaces=[[],[]]; // first and second metal beams
 function tri(arr,a,b,c){arr.push(...a,...b,...c);}
 for(let i=0;i<n;i++){
  const j=(i+1)%n,p=pts[i],q=pts[j],a=tangent(i),b=tangent(j);
  for(const side of [-1,1]){
   if(!protectedSide(i,side)||!protectedSide(j,side))continue;
   const base=side*guardOffset;
   // Safety opening: do not build an Armco wall across the branch
   // between the main straight and the pit-lane entrance/exit.
   const guardX=p.x+a.nx*base,guardZ=p.z+a.nz*base;
   const nextX=q.x+b.nx*base,nextZ=q.z+b.nz*base;
   if(projectToRoute(guardX,guardZ,PIT).distance<PIT_HALF_WIDTH+4.2||
      projectToRoute(nextX,nextZ,PIT).distance<PIT_HALF_WIDTH+4.2)continue;
   for(let rail=0;rail<2;rail++){
    const height=.64+rail*.44;
    const a0=[p.x+a.nx*base,p.y+height-.13,p.z+a.nz*base];
    const a1=[p.x+a.nx*base,p.y+height+.13,p.z+a.nz*base];
    const b0=[q.x+b.nx*base,q.y+height-.13,q.z+b.nz*base];
    const b1=[q.x+b.nx*base,q.y+height+.13,q.z+b.nz*base];
    tri(surfaces[rail],a0,b0,a1);tri(surfaces[rail],a1,b0,b1);
    // The central longitudinal pressed rib reflects light like W-beam Armco.
    const a2=[p.x+a.nx*(base+side*.06),p.y+height,p.z+a.nz*(base+side*.06)];
    const b2=[q.x+b.nx*(base+side*.06),q.y+height,q.z+b.nz*(base+side*.06)];
    tri(surfaces[rail],a0,a2,b0);tri(surfaces[rail],b0,a2,b2);
    tri(surfaces[rail],a2,a1,b2);tri(surfaces[rail],b2,a1,b1);
   }
   if(i%8===0){
    postPositions.push({x:p.x+a.nx*(base+side*.12),y:p.y+.65,z:p.z+a.nz*(base+side*.12)});
    boltPositions.push({x:p.x+a.nx*(base-side*.04),y:p.y+.66,z:p.z+a.nz*(base-side*.04)});
    boltPositions.push({x:p.x+a.nx*(base-side*.04),y:p.y+1.1,z:p.z+a.nz*(base-side*.04)});
   }
  }
 }
 for(const vertices of surfaces){
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  geo.computeVertexNormals();
  const rail=new THREE.Mesh(geo,steel);rail.receiveShadow=true;scene.add(rail);
 }
 const dummy=new THREE.Object3D();
 const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.15,1.35,.15),dark,postPositions.length);
 postPositions.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();posts.setMatrixAt(i,dummy.matrix);});
 posts.instanceMatrix.needsUpdate=true;posts.castShadow=true;scene.add(posts);
 const fixtures=new THREE.InstancedMesh(new THREE.SphereGeometry(.046,8,6),bolts,boltPositions.length);
 boltPositions.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.updateMatrix();fixtures.setMatrixAt(i,dummy.matrix);});
 fixtures.instanceMatrix.needsUpdate=true;scene.add(fixtures);
 // Black/yellow impact pads on the outside of the fastest exposed corners.
 const padData=[];
 for(let i=0;i<n;i+=18){
  const curve=bend(i);if(Math.abs(curve)<.09)continue;
  const p=pts[i],t=tangent(i),side=-Math.sign(curve);
  padData.push({x:p.x+t.nx*side*(guardOffset-.34),y:p.y+.52,z:p.z+t.nz*side*(guardOffset-.34),angle:Math.atan2(t.dx,t.dz)});
 }
 const padGeometry=new THREE.BoxGeometry(1.2,.65,.24);
 const padMaterials=[rubber,new THREE.MeshStandardMaterial({color:0xe0b34d,roughness:.71})];
 const pads=new THREE.InstancedMesh(padGeometry,padMaterials[1],padData.length);
 padData.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle,0);dummy.updateMatrix();pads.setMatrixAt(i,dummy.matrix);});
 pads.instanceMatrix.needsUpdate=true;scene.add(pads);
 return {guardrails:surfaces.length,posts:postPositions.length,impactPads:padData.length};
}
