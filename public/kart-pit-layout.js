/* Pit frontage follows the mapped lane. Every module reserves clearance from
 * the complete racing loop, including the curved T12 approach behind it. */
import {ROAD,PIT,ROAD_HALF_WIDTH,PIT_HALF_WIDTH,projectToRoute,sampleAt} from './kart-track.js';
export function footprintClearance(module,route){
 const c=Math.cos(module.yaw),s=Math.sin(module.yaw);
 let clearance=Infinity;
 for(let x=-module.width/2;x<=module.width/2+.01;x+=module.width/8)
  for(let z=-module.length/2;z<=module.length/2+.01;z+=module.length/16){
   clearance=Math.min(clearance,projectToRoute(module.x+c*x+s*z,module.z-s*x+c*z,route).distance);
  }
 return clearance;
}
export function planPitBuildings(road=ROAD,pit=PIT){
 const modules=[];
 const count=12,start=.29,end=.70,spacing=(end-start)*pit.length/count;
 for(let i=0;i<count;i++){
  const progress=start+(i+.5)*(end-start)/count,p=sampleAt(progress,pit),q=sampleAt(progress+.001,pit);
  const yaw=Math.atan2(q.x-p.x,q.z-p.z),nx=-Math.cos(yaw),nz=Math.sin(yaw);
  const module={x:0,z:0,y:p.y,yaw,width:10,length:Math.min(18,spacing-.8),index:i};
  // Positive normal is the garage side of this lane. Never let a long
  // building chord span the final bend or the pit entry/exit junctions.
  let placed=false;
  for(let offset=18;offset<=80;offset+=2){
   module.x=p.x+nx*offset;module.z=p.z+nz*offset;
   if(footprintClearance(module,road)>ROAD_HALF_WIDTH+6&&footprintClearance(module,pit)>PIT_HALF_WIDTH+3){placed=true;break;}
  }
  if(!placed)throw new Error('No clear pit building footprint at section '+i);
  modules.push(module);
 }
 return modules;
}
