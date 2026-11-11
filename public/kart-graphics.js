/* VELVET CIRCUIT — high-detail, procedural Three.js art pass.
   Curved paint & apex kerbs are geometry following the road surface, not
   stacked cubes. Low-cost instancing retains frame rate on laptop GPUs. */
import {bankRise,PIT,PIT_HALF_WIDTH,projectToRoute} from "./kart-track.js";
export function addCircuitGraphics(THREE,scene,ROAD,PIT,halfWidth,runoffWidth){
 const ps=ROAD.samples,N=ps.length,PI2=Math.PI*2;
 const standard=(color,rough=.85,metal=0)=>new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal,side:THREE.DoubleSide});
 const makeMesh=(geo,mat,x=0,y=0,z=0)=>{
  const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.receiveShadow=true;scene.add(m);return m;
 };
 const rand=(()=>{let seed=906734;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};})();
 function texturedCanvas(size,paint){
  const c=document.createElement("canvas");c.width=c.height=size;
  const ctx=c.getContext("2d");paint(ctx,size);
  const texture=new THREE.CanvasTexture(c);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  return texture;
 }
 const asphalt=texturedCanvas(384,(ctx,s)=>{
  ctx.fillStyle="#484a4e";ctx.fillRect(0,0,s,s);
  for(let i=0;i<18000;i++){
   const v=Math.round(55+rand()*45);
   ctx.fillStyle="rgba("+v+","+v+","+v+","+(0.06+rand()*.16)+")";
   const x=rand()*s,y=rand()*s;ctx.fillRect(x,y,.5+rand()*2,.5+rand()*2);
  }
  for(let i=0;i<65;i++){
   ctx.strokeStyle="rgba(210,202,190,"+(rand()*.08)+")";
   ctx.beginPath();const x=rand()*s;ctx.moveTo(x,0);ctx.lineTo(x+(rand()-.5)*11,s);ctx.stroke();
  }
 });
 const grass=texturedCanvas(256,(ctx,s)=>{
  ctx.fillStyle="#4a8055";ctx.fillRect(0,0,s,s);
  for(let i=0;i<10500;i++){
   ctx.fillStyle=rand()>.47?"rgba(174,203,105,.14)":"rgba(21,64,28,.18)";
   const x=rand()*s,y=rand()*s;ctx.fillRect(x,y,1+rand()*3,1+rand()*4);
  }
 });
 const gravel=texturedCanvas(256,(ctx,s)=>{
  ctx.fillStyle="#b79a7b";ctx.fillRect(0,0,s,s);
  for(let i=0;i<7000;i++){
   const k=rand()*100|0;
   ctx.fillStyle="rgba("+Math.round(85+k)+","+Math.round(76+k)+","+Math.round(63+k)+",.2)";
   ctx.fillRect(rand()*s,rand()*s,1+rand()*3,1+rand()*2);
  }
 });
 const paint=texturedCanvas(256,(ctx,s)=>{
  ctx.fillStyle="#179f65";ctx.fillRect(0,0,s,s);
  for(let i=0;i<1900;i++){ctx.fillStyle="rgba(195,233,182,.08)";ctx.fillRect(rand()*s,rand()*s,1,2);}
 });
 function tangent(i){
  const a=ps[(i-1+N)%N],b=ps[(i+1)%N];
  const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;
  return {x:dx/l,z:dz/l,nx:-dz/l,nz:dx/l};
 }
 // Local curvature measured over several metres; sign determines inside turn.
 function bend(i){
  const a=tangent((i-7+N)%N),b=tangent((i+7)%N);
  return a.x*b.z-a.z*b.x;
 }
 function addBand(from,to,mat,height=.08,condition=()=>true){
  const positions=[],uv=[],indices=[];
  let index=0;
  for(let i=0;i<N;i++){
   if(!condition(i))continue;
   const j=(i+1)%N;
   if(!condition(j))continue;
   const p=ps[i],q=ps[j],da=tangent(i),db=tangent(j);
   const quad=[
    [p,da,from],[p,da,to],[q,db,from],
    [q,db,from],[p,da,to],[q,db,to]
   ];
   for(const [pt,d,offset] of quad){
    positions.push(pt.x+d.nx*offset,pt.y+height+bankRise(i/N,offset),pt.z+d.nz*offset);
    uv.push((i/N)*22,offset===from?0:1);
    indices.push(index++);
   }
  }
  if(!positions.length)return;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(indices);geo.computeVertexNormals();
  makeMesh(geo,mat);
 }
 // Photographic reference: vivid green paint outside a flush red/white raised
 // kerb, itself at the corner apex, and gravel beyond. No kerbs on every straight.
 const roadMat=standard(0xffffff,.93);roadMat.map=asphalt;
 const greenMat=standard(0xffffff,.9);greenMat.map=paint;
 const gravelMat=standard(0xffffff,.95);gravelMat.map=gravel;
 const turfMat=standard(0xffffff,1);turfMat.map=grass;
 addBand(-halfWidth+.10,halfWidth-.10,roadMat,.041);
 for(const side of [-1,1]){
  const outer=side*halfWidth;
  addBand(outer,outer+side*1.23,greenMat,.06,i=>Math.abs(bend(i))>.14);
  addBand(outer+side*1.23,outer+side*3.9,gravelMat,.018,i=>Math.abs(bend(i))>.14);
  addBand(outer+side*3.9,outer+side*runoffWidth,turfMat,.004);
 }
 const red=standard(0xd32937,.61),white=standard(0xfff6e5,.6);
 const kerbVerts=[[],[]];
 function stripVertex(out,p,t,offset,y){
  out.push(p.x+t.nx*offset,p.y+y+bankRise((p.distance||0)/ROAD.length,offset),p.z+t.nz*offset);
 }
 // Side selection follows curvature, so apex kerbs sit inside a corner.
 // Triangles are merged into two draw calls (red and white) instead of
 // hundreds of heavy box meshes.
 for(let i=0;i<N;i++){
  const b=bend(i);
  if(Math.abs(b)<.14)continue;
  const j=(i+1)%N,side=b>0?1:-1;
  const p=ps[i],q=ps[j],d=tangent(i),e=tangent(j);
  const inner=side*(halfWidth-.26),outer=side*(halfWidth+.95);
  const arr=kerbVerts[Math.floor(i/3)%2];
  const h=.09;
  for(const [pt,t,offset] of [[p,d,inner],[p,d,outer],[q,e,inner],[q,e,inner],[p,d,outer],[q,e,outer]])
   stripVertex(arr,pt,t,offset,h);
 }
 for(let col=0;col<2;col++){
  const vertices=kerbVerts[col],geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  makeMesh(geometry,col?white:red);
 }
 // Wide, fully driveable corner-exit kerbs: long alternating red/white
 // stripes following the OUTSIDE edge as steering unwinds. Asphalt, kerbs
 // and green paint are one full-grip surface; gravel begins farther out.
 const exitVertices=[[],[]];
 for(let i=0;i<N;i++){
  const bendNow=bend(i),prior=bend((i-10+N)%N);
  const exit=Math.abs(prior)>.13&&Math.abs(bendNow)>.065&&Math.abs(bendNow)<Math.abs(prior)*1.1;
  if(!exit)continue;
  const j=(i+1)%N,side=prior>0?-1:1;
  const p=ps[i],q=ps[j],d=tangent(i),e=tangent(j);
  const inside=side*(halfWidth-.18),outside=side*(halfWidth+2.3);
  const vertices=exitVertices[Math.floor(i/5)%2];
  for(const [point,t,off] of [[p,d,inside],[p,d,outside],[q,e,inside],
   [q,e,inside],[p,d,outside],[q,e,outside]])
   stripVertex(vertices,point,t,off,.11);
 }
 for(let i=0;i<2;i++){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(exitVertices[i],3));
  geometry.computeVertexNormals();
  makeMesh(geometry,i?white:red);
 }
 // Painted white edge lines with actual curved mesh, not short floating rods.
 const line=standard(0xf9eee1,.65);
 addBand(-halfWidth+.12,-halfWidth+.19,line,.057);
 addBand(halfWidth-.19,halfWidth-.12,line,.057);
 // Start/finish squares across the road width and two short rows along travel.
 const p=ps[0],t=tangent(0);
 const finishMaterials=[standard(0x1b2630,.68),standard(0xfff5ea,.68)];
 const squares=[[],[]];
 const depth=.65;
 for(let r=0;r<2;r++)for(let c=0;c<16;c++){
  const a=-halfWidth+c*2*halfWidth/16,b=a+2*halfWidth/16;
  const longitudinal=-(r+.5)*depth;
  const point={x:p.x+t.x*longitudinal,z:p.z+t.z*longitudinal,y:p.y};
  const arr=squares[(r+c)%2];
  for(const offset of [[a,0],[b,0],[a,depth],[a,depth],[b,0],[b,depth]]){
   const lat=offset[0],forward=offset[1];
   arr.push(point.x+t.nx*lat+t.x*forward,p.y+.073,
     point.z+t.nz*lat+t.z*forward);
  }
 }
 for(let i=0;i<2;i++){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(squares[i],3));
  geometry.computeVertexNormals();
  makeMesh(geometry,finishMaterials[i]);
 }
 // Tyre walls: instanced rings close to the outer runoff edge at select corners.
 const tyreMat=standard(0x20242a,.94),tyreGeo=new THREE.TorusGeometry(.43,.18,7,12);
 const tyrePositions=[];
 for(let i=0;i<N;i+=7){
  if(Math.abs(bend(i))<.17)continue;
  const point=ps[i],t=tangent(i),side=Math.sign(bend(i));
  for(let n=0;n<3;n++){
   const off=side*(halfWidth+runoffWidth+1.5);
   tyrePositions.push({x:point.x+t.nx*off,y:point.y+.42+n*.31,z:point.z+t.nz*off});
  }
 }
 const tyreMesh=new THREE.InstancedMesh(tyreGeo,tyreMat,tyrePositions.length);
 const temp=new THREE.Object3D();
 tyrePositions.forEach((p,i)=>{temp.position.set(p.x,p.y,p.z);temp.rotation.x=Math.PI/2;temp.updateMatrix();tyreMesh.setMatrixAt(i,temp.matrix);});
 tyreMesh.instanceMatrix.needsUpdate=true;scene.add(tyreMesh);
 // Detailed lush trees placed off runoff, with irregular trunks and soft crowns.
 const trunkMat=standard(0x66503e,1),treeColors=[0x335c42,0x4f7850,0x345b49,0x628050];
 const trunkGeo=new THREE.CylinderGeometry(.20,.31,2.1,7);
 const crownGeo=new THREE.IcosahedronGeometry(1.35,1);
 const woods=[];
 for(let i=0;i<400;i++){
  const x=(rand()-.5)*410,z=(rand()-.5)*305;
  let near=Infinity;
  for(let j=0;j<N;j+=3){const p=ps[j];near=Math.min(near,Math.hypot(x-p.x,z-p.z));}
  // Keep the entire pit road, all garage fronts and their apron clear of trees.
  // Their trunks must never appear inside a service bay or behind the pit wall.
  if(near<halfWidth+runoffWidth+6||
     projectToRoute(x,z,PIT).distance<PIT_HALF_WIDTH+17||
     (x>-89&&x<45&&z>-28&&z<16))continue;
  woods.push({x,z,h:2+rand()*2.3,s:0.7+rand()*.65,col:Math.floor(rand()*treeColors.length)});
 }
 const trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,woods.length);
 const foliage=treeColors.map(c=>new THREE.InstancedMesh(crownGeo,standard(c,.97),woods.length));
 let counts=new Array(treeColors.length).fill(0);
 woods.forEach((v,i)=>{
  temp.position.set(v.x,v.h*.46,v.z);temp.scale.set(v.s*.85,v.h*.52,v.s*.85);
  temp.rotation.set(0,rand()*PI2,0);temp.updateMatrix();trunks.setMatrixAt(i,temp.matrix);
  temp.position.set(v.x,v.h+1.3*v.s,v.z);
  temp.scale.set(v.s*1.2,v.s*1.1,v.s*1.2);temp.updateMatrix();
  foliage[v.col].setMatrixAt(counts[v.col]++,temp.matrix);
 });
 trunks.instanceMatrix.needsUpdate=true;scene.add(trunks);
 foliage.forEach((m,i)=>{m.count=counts[i];m.instanceMatrix.needsUpdate=true;scene.add(m);});
 // Pit building signage, guard rails, advertising hoardings and floodlights.
 const burgundy=standard(0x73354f,.5,.15),gold=standard(0xe5bf82,.42,.36);
 const metal=standard(0x92969d,.36,.75);
 for(let i=0;i<10;i++){
  const point=ps[(25+i*44)%N],d=tangent((25+i*44)%N);
  const x=point.x+d.nx*(halfWidth+runoffWidth+3),z=point.z+d.nz*(halfWidth+runoffWidth+3);
  const pole=makeMesh(new THREE.CylinderGeometry(.09,.12,8,10),metal,x,point.y+4,z);
  const lamp=makeMesh(new THREE.BoxGeometry(1.8,.32,.65),gold,x,point.y+8,z);
  lamp.rotation.y=Math.atan2(d.x,d.z);
  const sign=makeMesh(new THREE.BoxGeometry(3.2,1.25,.14),burgundy,x,point.y+4,z);
  sign.rotation.y=Math.atan2(d.x,d.z);
 }
 return {asphalt,grass,gravel};
}
