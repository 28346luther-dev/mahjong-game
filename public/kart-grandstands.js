/* Motorsport grandstands placed outside all paved roads, pit lane, garage
 * aprons and the extended runoff. Tiered seats, stair aisles, steel trusses,
 * roof canopies and a catch-fence. Geometry is instanced for low draw calls.
 */
import {ROAD,PIT,ROAD_HALF_WIDTH,RUNOFF_WIDTH,PIT_HALF_WIDTH,projectToRoute} from "./kart-track.js";
export function addCircuitGrandstands(THREE,scene){
 const grandstandSections=[
  {index:85,side:-1,rows:7,cols:16,label:"NORTH BEND"},
  {index:205,side:1,rows:8,cols:18,label:"CHICANE"},
  {index:325,side:-1,rows:6,cols:14,label:"SOUTH GRANDSTAND"}
 ];
 const steel=new THREE.MeshStandardMaterial({color:0x6a777f,roughness:.43,metalness:.7});
 const steelDark=new THREE.MeshStandardMaterial({color:0x3b4d56,roughness:.5,metalness:.65});
 const deckMat=new THREE.MeshStandardMaterial({color:0xbbb5a4,roughness:.89});
 const seats=[0x9f304c,0xc5a165,0x425b6b,0x704d66].map(color=>
  new THREE.MeshStandardMaterial({color,roughness:.7}));
 const roofMat=new THREE.MeshStandardMaterial({color:0x5f6571,metalness:.42,roughness:.48});
 const seatGeo=new THREE.BoxGeometry(.62,.35,.45);
 const dummy=new THREE.Object3D();
 const seatPools=seats.map(()=>[]);
 const structures=[];
 function box(w,h,d,m,parent,x=0,y=0,z=0){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
  mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
 }
 function supportBetween(parent,a,b,width=.13){
  const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b);
  const delta=q.clone().sub(p);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(width,width,delta.length(),8),steel);
  mesh.position.copy(p.add(q).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
  parent.add(mesh);
 }
 for(const st of grandstandSections){
  const sample=ROAD.samples[st.index];
  const before=ROAD.samples[(st.index+ROAD.samples.length-4)%ROAD.samples.length];
  const after=ROAD.samples[(st.index+4)%ROAD.samples.length];
  const dx=after.x-before.x,dz=after.z-before.z,len=Math.hypot(dx,dz)||1;
  const tx=dx/len,tz=dz/len,nx=-tz,nz=dx/len;
  const outward=st.side*(ROAD_HALF_WIDTH+RUNOFF_WIDTH+27);
  const cx=sample.x+nx*outward,cz=sample.z+nz*outward;
  // Do not build grandstands on the pit building or within driving areas.
  if(projectToRoute(cx,cz,PIT).distance<PIT_HALF_WIDTH+22||
     projectToRoute(cx,cz,ROAD).distance<ROAD_HALF_WIDTH+RUNOFF_WIDTH+17)continue;
  const group=new THREE.Group();
  group.position.set(cx,Math.max(.15,sample.y-1.1),cz);
  group.rotation.y=Math.atan2(tx,tz);
  scene.add(group);structures.push(group);
  const colWidth=.86,step=1.2,rise=.55,totalWidth=st.cols*colWidth;
  // Rear roof over all rows, held up by pillars outside the spectator aisle.
  box(totalWidth+2,.24,st.rows*step+2,roofMat,group,0,st.rows*rise+3.8,(st.rows*step)/2);
  for(const x of [-totalWidth/2-.4,totalWidth/2+.4]){
   for(const z of [-.8,st.rows*step+.5]){
    box(.21,st.rows*rise+3.9,.21,steel,group,x,(st.rows*rise+3.9)/2,z);
   }
  }
  for(let row=0;row<st.rows;row++){
   const z=row*step,y=.6+row*rise;
   box(totalWidth+.9,.13,step,deckMat,group,0,y-.3,z);
   for(let col=0;col<st.cols;col++){
    if(col===Math.floor(st.cols/2)||col===Math.floor(st.cols/2)-1)continue;
    const x=(col-(st.cols-1)/2)*colWidth;
    seatPools[(row+Math.floor(col/4))%seatPools.length].push({
     group,x,y:y+.04,z:z+.05
    });
   }
  }
  const H=st.rows*rise+2.3;
  for(const x of [-totalWidth/2-.3,totalWidth/2+.3]){
   supportBetween(group,[x,.1,-.9],[x,H,st.rows*step+.2],.10);
   supportBetween(group,[x,.1,st.rows*step+.2],[x,H,-.9],.10);
  }
  // Safe stair aisle in the centre and a low transparent catch fence.
  const fenceMat=new THREE.MeshStandardMaterial({color:0x9eabb1,transparent:true,opacity:.28,
    metalness:.35,roughness:.65,side:THREE.DoubleSide});
  box(totalWidth+.6,1.65,.075,fenceMat,group,0,1.03,-1.1);
  for(let col=0;col<=st.cols;col+=2){
   const x=(col-st.cols/2)*colWidth;
   box(.08,1.8,.08,steelDark,group,x,1,-1.16);
  }
  // Wide base and structural cross-braces genuinely connect to the ground.
  box(totalWidth+1,.4,st.rows*step+2,steelDark,group,0,-.12,st.rows*step/2);
 }
 for(let type=0;type<seatPools.length;type++){
  const entries=seatPools[type];
  if(!entries.length)continue;
  const instanced=new THREE.InstancedMesh(seatGeo,seats[type],entries.length);
  // Instanced matrices are world-space, so apply each stand's transform once.
  entries.forEach((entry,i)=>{
   dummy.position.set(entry.x,entry.y,entry.z);
   dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();
   dummy.matrix.premultiply(entry.group.matrixWorld);
   instanced.setMatrixAt(i,dummy.matrix);
  });
  instanced.instanceMatrix.needsUpdate=true;scene.add(instanced);
 }
 return {stands:structures.length,seatGroups:seatPools.map(x=>x.length)};
}
