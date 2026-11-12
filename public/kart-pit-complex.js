/* Road Atlanta pit frontage reconstruction. Dimensions remain approximate;
 * modular footprints follow the mapped lane and protect the complete circuit. */
import {mergeGeometries} from './vendor/utils/BufferGeometryUtils.js';
import {planPitBuildings} from "./kart-pit-layout.js";
import {PIT_HALF_WIDTH,PIT_FAST_LANE_WIDTH,PIT_SERVICE_LANE_WIDTH,PIT_SERVICE_OFFSET} from "./kart-track.js";
export function addPitComplex(THREE,scene,PIT,bays){
 const mat=(color,roughness=.65,metalness=0,transparent=false,opacity=1)=>
  new THREE.MeshStandardMaterial({color,roughness,metalness,transparent,opacity,side:THREE.DoubleSide});
 const concrete=mat(0xc9c9c6,.85),white=mat(0xe6e7e7,.57),
  steel=mat(0x66717b,.32,.72),window=mat(0x204151,.22,.65,true,.77),
  glass=mat(0x76939d,.2,.54,true,.48),red=mat(0xc03944,.52),asphalt=mat(0x444c50,.92),
  yellow=mat(0xeacf63,.55),stripe=mat(0xf7f0da,.55);
 function item(g,m,x,y,z,parent=scene){
  const object=new THREE.Mesh(g,m);object.position.set(x,y,z);
  object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
 }
 function block(w,h,d,m,x,y,z,parent=scene){return item(new THREE.BoxGeometry(w,h,d),m,x,y,z,parent);}
 // Separate low garage sections follow the lane instead of spanning T12
 // with one enormous straight box. An outboard roof, clerestory and ribbed
 // roller doors provide depth without obstructing the final-corner sightline.
 const buildings=planPitBuildings(),buildingGroups=[];
 for(const layout of buildings){
  const garage=new THREE.Group();garage.name='pitGarage'+layout.index;
  garage.position.set(layout.x,layout.y,layout.z);garage.rotation.y=layout.yaw;
  garage.userData.footprint=layout;scene.add(garage);buildingGroups.push(garage);
  const length=layout.length;
  block(10,3.7,length,concrete,0,1.85,0,garage);
  block(10.8,.22,length+.3,white,0,3.8,0,garage);
  block(9.8,.65,length-.4,window,0,4.18,0,garage);
  const roof=block(11,.18,length+.6,steel,0,4.65,0,garage);roof.rotation.z=-.055;
  // Track-facing facade lies on local +X (toward the service apron).
  block(.12,2.8,length-1.4,steel,5.07,1.55,0,garage);
  for(let rib=0;rib<10;rib++)block(.025,.022,length-1.6,white,5.15,.35+rib*.26,0,garage);
  block(.13,.28,length-.9,red,5.18,3.34,0,garage);
  for(const z of [-length/2+.25,length/2-.25])block(.35,4.4,.35,white,5,2.2,z,garage);
  const awning=block(2.1,.12,length-.5,white,5.9,3.45,0,garage);awning.rotation.z=.055;
 }
 // Bake static frontage into one mesh per material, retaining detail without
 // hundreds of extra draw calls along the straight.
 const batches=new Map();
 for(const garage of buildingGroups){
  garage.updateMatrixWorld(true);
  for(const mesh of [...garage.children]){
   const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
   if(!batches.has(mesh.material))batches.set(mesh.material,[]);
   batches.get(mesh.material).push(geometry);
   mesh.geometry.dispose();garage.remove(mesh);
  }
 }
 for(const [material,geometries] of batches){
  const merged=mergeGeometries(geometries),mesh=new THREE.Mesh(merged,material);
  mesh.name='pitFrontage';mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
  for(const geometry of geometries)geometry.dispose();
 }
 // Pit lane is TWO genuinely separate paved channels: an unobstructed
 // FAST LANE on the racetrack side, plus the garage-side SERVICE APRON.
 // Roadway linework follows the pit centreline and never cuts across it.
 const pitPs=PIT.samples;
 function tangent(i){
  const p=pitPs[Math.max(0,i-1)],q=pitPs[Math.min(pitPs.length-1,i+1)];
  const dx=q.x-p.x,dz=q.z-p.z,length=Math.hypot(dx,dz)||1;
  return {tx:dx/length,tz:dz/length,nx:-dz/length,nz:dx/length};
 }
 function strip(offset,width,paintMaterial,first=9,last=pitPs.length-10){
  const positions=[];
  for(let i=first;i<last;i++){
   const p=pitPs[i],q=pitPs[i+1],a=tangent(i),b=tangent(i+1);
   const vertex=(pt,dir,lateral)=>[
    pt.x+dir.nx*lateral,pt.y+.112,pt.z+dir.nz*lateral
   ];
   const p0=vertex(p,a,offset),p1=vertex(p,a,offset+width);
   const q0=vertex(q,b,offset),q1=vertex(q,b,offset+width);
   positions.push(...p0,...q0,...p1,...p1,...q0,...q1);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geo.computeVertexNormals();
  const marking=new THREE.Mesh(geo,paintMaterial);scene.add(marking);
 }
 // A long yellow line separates moving cars (negative normal) from parked cars.
 strip(.47,.13,yellow);
 // Solid white boundary on each outer edge, with a red pit-lane apron edge.
 strip(-PIT_HALF_WIDTH+.35,.13,stripe,3,pitPs.length-4);
 strip(PIT_HALF_WIDTH-.36,.17,stripe,3,pitPs.length-4);
 strip(PIT_HALF_WIDTH-.66,.22,red,14,pitPs.length-17);
 // Broken white lane guides, drawn parallel to traffic (never across boxes).
 for(let i=12;i<pitPs.length-11;i+=9){
  const p=pitPs[i],d=tangent(i);
  const mark=block(.11,.025,2.1,stripe,p.x-d.nx*2.15,p.y+.12,p.z-d.nz*2.15);
  mark.rotation.y=Math.atan2(d.tx,d.tz);
 }
 // Bold entry and exit arrows sit on tarmac, and the junctions are unobstructed.
 for(const [i,colour] of [[8,yellow],[pitPs.length-11,stripe]]){
  const p=pitPs[i],d=tangent(i);
  const arrow=block(1.5,.025,.12,colour,p.x-d.nx*2,p.y+.12,p.z-d.nz*2);
  arrow.rotation.y=Math.atan2(d.tx,d.tz);
 }
 // Clean Formula-style service bay decals, individually aligned to each
 // section of pit road. One 7.3m long by 5.4m wide bay per crew.
 for(const bay of bays){
  const {x,z,y,index}=bay;
  const nearest=pitPs.reduce((best,p,i)=>{
   const dist=Math.hypot(p.x-x,p.z-z);
   return dist<best.distance?{distance:dist,i}:best;
  },{distance:Infinity,i:0});
  const dir=tangent(nearest.i),yaw=Math.atan2(dir.tx,dir.tz);
  const space=new THREE.Group();space.position.set(x,y,z);space.rotation.y=yaw;scene.add(space);
  // Reflective dark asphalt grounding, white service-lane edge and the yellow
  // rectangle, with a genuine full-colour stopping target texture.
  block(5.2,.018,7.25,asphalt,0,.093,0,space);
  const marking=document.createElement("canvas");
  marking.width=512;marking.height=512;
  const ctx=marking.getContext("2d");
  ctx.clearRect(0,0,512,512);
  ctx.lineJoin="round";
  ctx.strokeStyle="#f8d85d";ctx.lineWidth=16;
  ctx.strokeRect(27,22,458,466);
  ctx.strokeStyle="#f8f6ef";ctx.lineWidth=8;
  ctx.beginPath();ctx.moveTo(256,36);ctx.lineTo(256,342);ctx.stroke();
  ctx.fillStyle="#f1d65f";ctx.fillRect(50,304,412,22);
  ctx.fillStyle="#d63a46";
  ctx.beginPath();ctx.moveTo(256,148);ctx.lineTo(207,222);ctx.lineTo(305,222);ctx.closePath();ctx.fill();
  ctx.fillStyle="#fff7e7";ctx.font="bold 56px sans-serif";ctx.textAlign="center";
  ctx.fillText("BOX "+(index+1),256,432);
  const tex=new THREE.CanvasTexture(marking);tex.colorSpace=THREE.SRGBColorSpace;
  const target=new THREE.Mesh(new THREE.PlaneGeometry(5.25,7.25),
   new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  target.rotation.x=-Math.PI/2;target.position.y=.135;space.add(target);
  // Four low wheel stop markings, outside the centre of the box.
  for(const lateral of [-1.55,1.55])
   for(const fore of [-1.4,1.35])block(.72,.044,.26,yellow,lateral,.145,fore,space);
  // Crew equipment and pit boom sit OUTBOARD, toward the garage, so they
  // cannot physically obstruct a car entering from the fast lane.
  const boomX=-3.25,boomZ=2.2;
  block(.18,4.8,.18,steel,boomX,2.4,boomZ,space);
  block(3.5,.16,.17,steel,-1.5,4.60,boomZ,space);
  block(.13,1.3,.13,steel,.05,3.98,boomZ,space);
  block(.72,.35,.55,mat(0xe8bc49,.4,.15),.05,3.30,boomZ,space);
  block(.18,.11,.11,mat(0x51d692),-.16,3.20,boomZ-.28,space);
  block(.18,.11,.11,mat(0xd84a50),.16,3.20,boomZ-.28,space);
  block(.72,.52,.65,red,-3.55,.30,3.05,space);
  const tire=item(new THREE.TorusGeometry(.29,.1,8,16),mat(0x20252b,.9),-3.38,.26,-2.55,space);
  tire.rotation.x=Math.PI/2;
  block(.14,2.6,.14,steel,-3.15,1.30,-2.85,space);
  block(1.1,.65,.12,red,-3.15,2.52,-2.85,space);
 }
 function roadsideSign(index,label){
  const p=pitPs[index],d=tangent(index);
  // Entire sign and both posts stand well OUTSIDE the widened service apron.
  // This avoids the previous PIT IN billboard floating in the driving lane.
  const offset=PIT_HALF_WIDTH+4;
  const signX=p.x+d.nx*offset,signZ=p.z+d.nz*offset;
  block(.14,2.85,.14,steel,signX,p.y+1.42,signZ);
  const panel=block(4.2,1.13,.15,steel,signX,p.y+2.96,signZ);
  panel.rotation.y=Math.atan2(d.tx,d.tz);
  const c=document.createElement("canvas");c.width=640;c.height=180;
  const ctx=c.getContext("2d");
  ctx.fillStyle="#203642";ctx.fillRect(0,0,640,180);
  ctx.fillStyle="#f7dfa7";ctx.font="bold 74px system-ui";ctx.textAlign="center";
  ctx.fillText(label,320,122);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const front=item(new THREE.PlaneGeometry(4.13,1.1),
    new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}),
    signX,p.y+2.96,signZ-.12);
  front.rotation.y=Math.atan2(d.tx,d.tz);
 }
 roadsideSign(9,"PIT IN · 40");
 roadsideSign(pitPs.length-11,"PIT OUT");
 // Obsolete free-standing pit fence removed: it projected through the
 // asphalt and duplicated the main straight's continuous glass safety wall.
 // The dedicated track-edge glass barrier owns the straight protection.
 return {pitBuilding:true,bays:bays.length,buildings};
}
