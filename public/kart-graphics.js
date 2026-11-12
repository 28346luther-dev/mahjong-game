/* VELVET CIRCUIT — high-detail, procedural Three.js art pass.
   Curved paint & apex kerbs are geometry following the road surface, not
   stacked cubes. Low-cost instancing retains frame rate on laptop GPUs. */
import {bankRise,PIT,PIT_HALF_WIDTH,projectToRoute} from "./kart-track.js";
export function addCircuitGraphics(THREE,scene,ROAD,PIT,halfWidth,runoffWidth){
 const ps=ROAD.samples,N=ps.length,PI2=Math.PI*2,detail=ROAD.detail||1;
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
  texture.anisotropy=16;
  texture.generateMipmaps=true;
  return texture;
 }
 const asphalt=texturedCanvas(1024,(ctx,s)=>{
  ctx.fillStyle="#3b3a38";ctx.fillRect(0,0,s,s);
  // Fine aggregate, tire polishing and worn race-line rubber without tiling hard seams.
  for(let i=0;i<100000;i++){
   const v=Math.round(35+rand()*78);
   ctx.fillStyle="rgba("+v+","+v+","+v+","+(0.12+rand()*.28)+")";
   const x=rand()*s,y=rand()*s;ctx.fillRect(x,y,.5+rand()*2,.5+rand()*2);
  }
  for(let i=0;i<130;i++){
   ctx.strokeStyle="rgba(210,202,190,"+(rand()*.08)+")";
   ctx.beginPath();const x=rand()*s;ctx.moveTo(x,0);ctx.lineTo(x+(rand()-.5)*11,s);ctx.stroke();
  }
  // Parallel curved rubber deposits, the subtle dark band seen on used circuits.
  for(let i=0;i<170;i++){
   const x=rand()*s,y=rand()*s;
   ctx.strokeStyle="rgba(9,13,17,"+(0.015+rand()*.045)+")";
   ctx.lineWidth=1+rand()*3;
   ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+12,y-14,x+16,y-35,x+27,y-48);ctx.stroke();
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
  const a=tangent((i-7*detail+N)%N),b=tangent((i+7*detail)%N);
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
    positions.push(pt.x+d.nx*offset,pt.y+height+bankRise(pt.distance/ROAD.length,offset),pt.z+d.nz*offset);
    uv.push(pt.distance/8,offset/8);
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
 // One continuous layered circuit surface; no box kerbs, no diagonal
 // polygon sheets, no discontinuous gravel strips floating into the road.
 // Each ribbon shares exactly the same sampled Catmull centreline.
 const roadMat=standard(0xffffff,.83);roadMat.map=asphalt;
 roadMat.bumpMap=asphalt;roadMat.bumpScale=.008;roadMat.envMapIntensity=.15;
 const turfMat=standard(0xffffff,.98);turfMat.map=grass;
 const gravelMat=standard(0xffffff,.98);gravelMat.map=gravel;
 gravelMat.bumpMap=gravel;gravelMat.bumpScale=.02;
 const greenMat=standard(0xffffff,.9);greenMat.map=paint;
 addBand(-halfWidth+.06,halfWidth-.06,roadMat,.044);
 for(const side of [-1,1]){
  // Gravel and grass stay OUTSIDE the kerb/runoff paint at every corner.
  addBand(side*(halfWidth+3.75),side*(halfWidth+runoffWidth),turfMat,.018);
  addBand(side*(halfWidth+1.62),side*(halfWidth+3.75),gravelMat,.036);
  addBand(side*(halfWidth+.08),side*(halfWidth+1.62),turfMat,.05);
  addBand(side*(halfWidth+.08),side*(halfWidth+1.62),greenMat,.058,i=>Math.abs(bend(i))>.05);
 }
 // Kerbs follow the exact road-edge geometry with a shallow rounded 2cm
 // crown, and use alternating paint over ~5m ARCLENGTH intervals.
 // Their width fades smoothly in and out of bends; no discrete cuboids.
 const red=standard(0x167ab5,.86),white=standard(0xf4cb31,.86); // Road Atlanta blue / yellow kerbs
 const kerbMeshes=[[],[]];
 const bendAt=i=>Math.abs(bend((i%N+N)%N));
 const smoothstep=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
 const kerbWeight=i=>{
  const strength=Math.max(bendAt(i),bendAt(i-6*detail),bendAt(i+6*detail));
  return smoothstep(.045,.19,strength);
 };
 // Side chosen from the signed, smoothly averaged local curvature. The
 // outside edge is allowed to use a wider, flush 2.4m exit kerb.
 const kerbSide=i=>Math.sign(
  bend(i)+bend((i-4*detail+N)%N)+bend((i+4*detail)%N))||1;
 function vertex(p,d,offset,h,progress){
  return [p.x+d.nx*offset,p.y+h+bankRise(progress,offset),p.z+d.nz*offset];
 }
 function quad(arr,a,b,c,d){arr.push(...a,...b,...c,...c,...b,...d);}
 for(let i=0;i<N;i++){
  const j=(i+1)%N,p=ps[i],q=ps[j],d=tangent(i),e=tangent(j);
  const w0=kerbWeight(i),w1=kerbWeight(j);
  if(w0<.005&&w1<.005)continue;
  const side=kerbSide(i);
  // In bends: apex-side 1.6m kerb, other side a broad 2.35m exit.
  for(const [edge,outerWidth] of [[side,1.6],[-side,2.35]]){
   const outside0=halfWidth+outerWidth*w0;
   const outside1=halfWidth+outerWidth*w1;
   const inner=halfWidth-.12;
   const h0=.065,h1=.068;
   const arr=kerbMeshes[Math.floor(p.distance/4.6)%2];
   const a=vertex(p,d,edge*inner,h0,i/N);
   const b=vertex(p,d,edge*((inner+outside0)/2),h0+.05*w0,i/N);
   const c=vertex(p,d,edge*outside0,h0,i/N);
   const d0=vertex(q,e,edge*inner,h1,j/N);
   const e0=vertex(q,e,edge*((inner+outside1)/2),h1+.05*w1,j/N);
   const f=vertex(q,e,edge*outside1,h1,j/N);
   quad(arr,a,b,d0,e0);
   quad(arr,b,c,e0,f);
  }
 }
 for(let i=0;i<2;i++){
  if(!kerbMeshes[i].length)continue;
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(kerbMeshes[i],3));
  g.computeVertexNormals();makeMesh(g,i?white:red);
 }
 // White edge stripes are thin flush paint, NOT raised walls.
 const line=standard(0xf5f1e8,.8);
 addBand(-halfWidth+.14,-halfWidth+.21,line,.069);
 addBand(halfWidth-.21,halfWidth-.14,line,.069);
 // Dedicated pit tarmac uses the SAME asphalt finish, with seamless
 // merge curves and uninterrupted lane surface from entry to exit.
 function pitBand(offset0,offset1,material,height){
  const points=PIT.samples,positions=[],uv=[];
  const normals=i=>{
   const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
   const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
   return {nx:-dz/len,nz:dx/len};
  };
  for(let i=0;i<points.length-1;i++){
   const p=points[i],q=points[i+1],d=normals(i),e=normals(i+1);
   const coord=(point,normal,offset)=>[
    point.x+normal.nx*offset,point.y+height,point.z+normal.nz*offset];
   const a=coord(p,d,offset0),b=coord(p,d,offset1);
   const c=coord(q,e,offset0),d0=coord(q,e,offset1);
   positions.push(...a,...b,...c,...c,...b,...d0);
   const u=p.distance/8,v=q.distance/8;
   uv.push(u,0,u,1,v,0,v,0,u,1,v,1);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  geo.computeVertexNormals();makeMesh(geo,material);
 }
 pitBand(-PIT_HALF_WIDTH+.04,PIT_HALF_WIDTH-.04,roadMat,.087);
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
   const off=side*(halfWidth+runoffWidth+8);
   const x=point.x+t.nx*off,z=point.z+t.nz*off;
   // Keep all tyre stacks well outside both entry and pit-exit junctions.
   if(projectToRoute(x,z,PIT).distance<PIT_HALF_WIDTH+26)continue;
   tyrePositions.push({x,y:point.y+.42+n*.31,z});
  }
 }
 const tyreMesh=new THREE.InstancedMesh(tyreGeo,tyreMat,tyrePositions.length);
 const temp=new THREE.Object3D();
 tyrePositions.forEach((p,i)=>{temp.position.set(p.x,p.y,p.z);temp.rotation.x=Math.PI/2;temp.updateMatrix();tyreMesh.setMatrixAt(i,temp.matrix);});
 tyreMesh.instanceMatrix.needsUpdate=true;scene.add(tyreMesh);
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
