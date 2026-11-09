// Pure, testable venue layout helpers. Units are world metres; +Z is local chair front.
export const DOOR_GAPS=[[-6.1,-2.35],[5.15,9.2]];
export const SIDE_WALL_SEGMENTS=[[-18.5,-6.1],[-2.35,5.15],[9.2,18.5]];
export function sideSkirtingSegments(){
 // Match actual wall sections. Never bridge the playable doorway openings.
 return SIDE_WALL_SEGMENTS.map(([start,end])=>({start,end,center:(start+end)/2,length:end-start}));
}
export function chairFacing(x,z){
 // In Three.js a chair's local +Z points toward the gaming table.
 return Math.atan2(-x,-z);
}
export function couchSeatPlan(x,z,rotation,id){
 const cos=Math.cos(rotation),sin=Math.sin(rotation);
 return [-.9,0,.9].map((localX,i)=>({
  id:`${id}-${i+1}`,label:"LOUNGE SOFA · SIT",kind:"sofa",
  x:x+cos*localX+sin*.08,
  z:z-sin*localX+cos*.08,
  yaw:rotation,eyeY:1.49,
  standX:x+cos*localX+sin*.88,
  standZ:z-sin*localX+cos*.88,
  r:1.55
 }));
}
export function barSeatPlan(){
 return [3.55,4.8,6.05,7.3].map((x,i)=>({
  id:`bar-stool-${i+1}`,label:"BAR STOOL · SIT",kind:"stool",
  x,z:-5.65,yaw:Math.PI,eyeY:1.38,
  standX:x,standZ:-4.5,r:1.55
 }));
}
export function gameSeatPlan(st){
 return [[-2.18,0],[2.18,0],[0,-1.74],[0,1.74]].map(([x,z],i)=>({
  id:`${st.id}-chair-${i+1}`,label:"TABLE CHAIR · SIT",kind:"table",
  x:st.x+x,z:st.z+z,yaw:chairFacing(x,z),eyeY:1.38,
  standX:st.x+x*1.38,standZ:st.z+z*1.38,r:1.3
 }));
}
export function nearestInteraction(x,z,seats,stations){
 const options=[
  ...seats.filter(s=>Math.hypot(x-s.x,z-s.z)<=s.r),
  ...stations.filter(s=>Math.hypot(x-s.x,z-s.z)<=s.r)
 ];
 return options.sort((a,b)=>{
  const da=Math.hypot(x-a.x,z-a.z),db=Math.hypot(x-b.x,z-b.z);
  return da-db;
 })[0]||null;
}
export function blockedBy(x,z,obstacles,clearance=.35){
 return obstacles.some(o=>Math.abs(x-o.x)<o.w/2+clearance&&Math.abs(z-o.z)<o.d/2+clearance);
}
