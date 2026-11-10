import {ROAD,PIT,ROAD_HALF_WIDTH,RUNOFF_WIDTH,projectToRoute} from "./kart-track.js";

// Curved circuit art. Batched kerb triangles follow the spline rather than
// floating rectangular boxes. Materials are generated locally from canvas.
const tangent=(samples,i)=>{
 const n=samples.length,a=samples[(i+n-1)%n],b=samples[(i+1)%n];
 const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;
 return {nx:-dz/l,nz:dx/l,tx:dx/l,tz:dz/l};
};
function quads(THREE,scene,patches,color){
 const v=[],idx=[];
 for(const q of patches){
  const k=v.length/3;
  for(const p of q)v.push(...p);
  idx.push(k,k+1,k+2,k+1,k+3,k+2);
 }
 if(!idx.length)return;
 const g=new THREE.BufferGeometry();
 g.setAttribute("position",new THREE.Float32BufferAttribute(v,3));
 g.setIndex(idx);g.computeVertexNormals();
 const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.68,side:THREE.DoubleSide}));
 mesh.receiveShadow=true;scene.add(mesh);
}
export function surfaceTexture(THREE,kind){
 const c=document.createElement("canvas");c.width=256;c.height=256;
 const ctx=c.getContext("2d"),asphalt=kind==="road";
 ctx.fillStyle=asphalt?"#5a5e62":"#68865c";ctx.fillRect(0,0,256,256);
 let seed=asphalt?13771:8521;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<12000;i++){
  const shade=Math.floor(random()*155)+35;
  ctx.fillStyle="rgba("+shade+","+Math.min(255,shade+7)+","+Math.min(255,shade+10)+","+(asphalt?.075:.05)+")";
  ctx.fillRect(random()*256,random()*256,1+random()*3,1+random()*3);
 }
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=8;
 return tex;
}
export function cornerKerbs(THREE,scene){
 const ps=ROAD.samples,n=ps.length,red=[],white=[],green=[],edge=[];
 for(let i=0;i<n;i++){
  const a=ps[(i-9+n)%n],p=ps[i],b=ps[(i+9)%n];
  const dx=p.x-a.x,dz=p.z-a.z,ex=b.x-p.x,ez=b.z-p.z;
  const angle=Math.atan2(dx*ez-dz*ex,dx*ex+dz*ez);
  if(Math.abs(angle)<.115)continue;
  const side=Math.sign(angle)||1,q=ps[(i+1)%n],t=tangent(ps,i),u=tangent(ps,(i+1)%n);
  const at=(s,d,offset,height)=>[s.x+d.nx*side*offset,s.y+height,s.z+d.nz*side*offset];
  const curb=[at(p,t,ROAD_HALF_WIDTH-.37,.078),at(p,t,ROAD_HALF_WIDTH+1.13,.13),
   at(q,u,ROAD_HALF_WIDTH-.37,.078),at(q,u,ROAD_HALF_WIDTH+1.13,.13)];
  (Math.floor(i/4)%2?red:white).push(curb);
  green.push([at(p,t,ROAD_HALF_WIDTH+1.15,.055),at(p,t,ROAD_HALF_WIDTH+3.4,.04),
   at(q,u,ROAD_HALF_WIDTH+1.15,.055),at(q,u,ROAD_HALF_WIDTH+3.4,.04)]);
  edge.push([at(p,t,ROAD_HALF_WIDTH+3.42,.055),at(p,t,ROAD_HALF_WIDTH+3.56,.056),
   at(q,u,ROAD_HALF_WIDTH+3.42,.055),at(q,u,ROAD_HALF_WIDTH+3.56,.056)]);
 }
 quads(THREE,scene,green,0x29b96c);
 quads(THREE,scene,edge,0xe8f1e2);
 quads(THREE,scene,red,0xd63c4a);
 quads(THREE,scene,white,0xfff3e3);
}
function forestry(THREE,scene){
 let seed=12231;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const points=[];
 for(let i=0;i<520;i++){
  const x=(random()-.5)*430,z=(random()-.5)*320;
  if(projectToRoute(x,z,ROAD).distance<ROAD_HALF_WIDTH+RUNOFF_WIDTH+5)continue;
  if(projectToRoute(x,z,PIT).distance<12)continue;
  points.push({x,z,height:4.5+random()*5,scale:.6+random()*.9});
  if(points.length===220)break;
 }
 const dummy=new THREE.Object3D();
 const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.3,2,7),
  new THREE.MeshStandardMaterial({color:0x6b503f,roughness:1}),points.length);
 const foliage=new THREE.InstancedMesh(new THREE.ConeGeometry(1.6,5,9),
  new THREE.MeshStandardMaterial({color:0x366d50,roughness:1,flatShading:true}),points.length);
 points.forEach((p,i)=>{
  dummy.position.set(p.x,1.0,p.z);dummy.scale.set(p.scale,1, p.scale);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);
  dummy.position.set(p.x,p.height*.65,p.z);dummy.scale.set(p.scale,p.height/5,p.scale);
  dummy.rotation.y=random()*6.28;dummy.updateMatrix();foliage.setMatrixAt(i,dummy.matrix);
 });
 trunk.instanceMatrix.needsUpdate=true;foliage.instanceMatrix.needsUpdate=true;
 trunk.castShadow=foliage.castShadow=true;scene.add(trunk,foliage);
}
function trackside(THREE,scene){
 const metal=new THREE.MeshStandardMaterial({color:0xb6bcb6,roughness:.48,metalness:.43});
 const pale=new THREE.MeshStandardMaterial({color:0xe5ddc9,roughness:.7});
 // Approach boards and more convincing safety rails outside the runoff.
 const ps=ROAD.samples;
 for(let i=18;i<ps.length;i+=23){
  const p=ps[i],t=tangent(ps,i),side=i%2?1:-1;
  const x=p.x+t.nx*side*(ROAD_HALF_WIDTH+RUNOFF_WIDTH+2),
        z=p.z+t.nz*side*(ROAD_HALF_WIDTH+RUNOFF_WIDTH+2);
  const post=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,2.4,9),metal);
  post.position.set(x,p.y+1.2,z);scene.add(post);
  if(i%3===0){
   const board=new THREE.Mesh(new THREE.BoxGeometry(1.9,1.1,.10),pale);
   board.position.set(x,p.y+2.3,z);
   board.rotation.y=Math.atan2(t.tx,t.tz);scene.add(board);
  }
 }
 // Tyre stacks, marshal shelters and guard rails beyond the apex kerbs.
 for(let i=0;i<ps.length;i+=35){
  const p=ps[i],t=tangent(ps,i);
  const x=p.x-t.nx*(ROAD_HALF_WIDTH+RUNOFF_WIDTH+2),
        z=p.z-t.nz*(ROAD_HALF_WIDTH+RUNOFF_WIDTH+2);
  for(let stack=0;stack<3;stack++){
   const tyre=new THREE.Mesh(new THREE.TorusGeometry(.66,.20,8,14),
    new THREE.MeshStandardMaterial({color:0x22282d,roughness:.96}));
   tyre.rotation.x=Math.PI/2;
   tyre.position.set(x,p.y+.21+stack*.28,z);scene.add(tyre);
  }
 }
}
export function enhanceCircuit(THREE,scene){
 cornerKerbs(THREE,scene);
 forestry(THREE,scene);
 trackside(THREE,scene);
}
