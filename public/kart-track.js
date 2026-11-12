import {ATLANTA_DATA} from './data/road-atlanta-data.js';
/* Velvet Circuit road-course geometry shared by browser and leaderboard.
 * The route is a closed continuous spline, not a generic ellipse.
 * No checkpoint gates, index-based user interactions or floating track props.
 */
// Mapped OSM centreline and coarse Mapzen terrain; not a surveyed digital twin.
export const TRACK_NAME="Road Atlanta · mapped reconstruction";
export const ROAD_HALF_WIDTH=6;
export const RUNOFF_WIDTH=8;
export const TRACK_SCALE=2.8216461;
export const PIT_FAST_LANE_WIDTH=4.4;
export const PIT_SERVICE_LANE_WIDTH=5.6;
export const PIT_LANE_MARGIN=1.3;
export const PIT_HALF_WIDTH=6.35;
export const PIT_SERVICE_OFFSET=3.3;
export const PIT_BAY_TOLERANCE=3.65;
// Longitude/latitude converted to local metric coordinates; no length rescaling.
export const GEO_ORIGIN=[-83.81421866666666,34.150378833333335];
export function geoToWorld(lon,lat){return {x:(lon-GEO_ORIGIN[0])*Math.PI/180*6371008.8*Math.cos(GEO_ORIGIN[1]*Math.PI/180),z:-(lat-GEO_ORIGIN[1])*Math.PI/180*6371008.8};}
export function mappedTerrainHeight(x,z){
 const lon=GEO_ORIGIN[0]+x/(Math.PI/180*6371008.8*Math.cos(GEO_ORIGIN[1]*Math.PI/180));
 const lat=GEO_ORIGIN[1]-z/(Math.PI/180*6371008.8),t=ATLANTA_DATA.terrain;
 const u=Math.max(0,Math.min(t.columns-1,(lon-t.bounds[0])/(t.bounds[2]-t.bounds[0])*(t.columns-1)));
 const v=Math.max(0,Math.min(t.rows-1,(t.bounds[3]-lat)/(t.bounds[3]-t.bounds[1])*(t.rows-1)));
 const i=Math.min(t.columns-2,Math.floor(u)),j=Math.min(t.rows-2,Math.floor(v)),a=u-i,b=v-j;
 const at=(col,row)=>t.heights[row*t.columns+col]-260;
 return (at(i,j)*(1-a)+at(i+1,j)*a)*(1-b)+(at(i,j+1)*(1-a)+at(i+1,j+1)*a)*b;
}
const mapped=ATLANTA_DATA.coordinates.slice(0,-1).map(([lon,lat])=>{const p=geoToWorld(lon,lat);return [p.x,p.z,mappedTerrainHeight(p.x,p.z)];});
const originIndex=mapped.reduce((best,p,i)=>Math.hypot(p[0],p[1])<Math.hypot(...mapped[best].slice(0,2))?i:best,0);
export const ROAD_POINTS=mapped.slice(originIndex).concat(mapped.slice(0,originIndex));
// Pit alignment is a procedural approximation pending a licensed pit-lane trace.
const pitReference=makeRoute(ROAD_POINTS,800,true);
export const PIT_POINTS=Array.from({length:17},(_,i)=>{
 const t=i/16,progress=.89+t*.19,p=sampleAt(progress,pitReference),q=sampleAt(progress+.0005,pitReference);
 const dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz)||1;
 const offset=24*Math.sin(Math.PI*t)**.65;
 return [p.x-dz/len*offset,p.z+dx/len*offset,p.y];
});
// No surveyed crossfall is available. Keep neutral camber rather than
// inventing the earlier oval-style 17-degree bank.
export const BANK_START=.49,BANK_END=.62,BANK_MAX_DEGREES=0;
export function bankAngle(progress){
 const p=((progress%1)+1)%1;
 if(p<=BANK_START||p>=BANK_END)return 0;
 const t=(p-BANK_START)/(BANK_END-BANK_START);
 const taper=Math.sin(Math.PI*t)**2;
 return (BANK_MAX_DEGREES*Math.PI/180)*taper;
}
export function bankRise(progress,lateralOffset){
 // Outside of this right-hander lies on the negative normal side.
 return -lateralOffset*Math.tan(bankAngle(progress));
}
// Four protected service boxes off the fast lane, facing the pit garages.
// The drive-through portion of the pit route remains usable in free practice.
// Bays are set back into the service apron, toward the garages (+normal)
// while the fast lane stays open on the race-track side (-normal).
export const PIT_BAYS=[.33,.40,.47,.54].map((fraction,i)=>{
 const route=makeRoute(PIT_POINTS,96,false);
 const n=Math.min(route.samples.length-2,Math.round(fraction*96));
 const p=route.samples[n],q=route.samples[n+1],prev=route.samples[Math.max(0,n-1)];
 const dx=q.x-prev.x,dz=q.z-prev.z,len=Math.hypot(dx,dz)||1;
 return {index:i,x:p.x-dz/len*PIT_SERVICE_OFFSET,
  z:p.z+dx/len*PIT_SERVICE_OFFSET,y:p.y,
  label:"BAY "+(i+1),radius:PIT_BAY_TOLERANCE};
});
export const TRACK_SAMPLES=800;
function point(p){return {x:p[0],z:p[1],y:p[2]};}
function catmull(a,b,c,d,t){
 const t2=t*t,t3=t2*t;
 return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);
}
function sampleCurve(points,u,closed){
 const count=points.length;
 const v=Math.max(0,Math.min(closed?count:count-1,u));
 const start=Math.min(Math.floor(v),closed?count-1:count-2),t=v-start;
 const at=i=>points[closed?(i+count*3)%count:Math.max(0,Math.min(count-1,i))];
 const a=at(start-1),b=at(start),c=at(start+1),d=at(start+2);
 // Centripetal Catmull-Rom avoids loops/overshoot at uneven OSM point spacing.
 const gap=(p,q)=>Math.max(.0001,Math.sqrt(Math.hypot(q[0]-p[0],q[1]-p[1])));
 const t0=0,t1=gap(a,b),t2=t1+gap(b,c),t3=t2+gap(c,d),u1=t1+t*(t2-t1);
 const mix=(p,q,lo,hi)=>p.map((v,i)=>(hi-u1)/(hi-lo)*v+(u1-lo)/(hi-lo)*q[i]);
 const A=mix(a,b,t0,t1),B=mix(b,c,t1,t2),C=mix(c,d,t2,t3);
 const D=mix(A,B,t0,t2),E=mix(B,C,t1,t3),v1=mix(D,E,t1,t2);
 return {x:v1[0],z:v1[1],y:v1[2]};
}
export function makeRoute(points=ROAD_POINTS,count=TRACK_SAMPLES,closed=true){
 const denseCount=Math.max(count*5,points.length*24);
 const dense=Array.from({length:denseCount+1},(_,i)=>sampleCurve(points,i/denseCount*(closed?points.length:points.length-1),closed));
 let total=0;dense[0].distance=0;
 for(let i=1;i<dense.length;i++){total+=Math.hypot(dense[i].x-dense[i-1].x,dense[i].z-dense[i-1].z);dense[i].distance=total;}
 const samples=[];let cursor=0;
 for(let i=0;i<count+(closed?0:1);i++){
  const target=i/count*total;
  while(cursor<dense.length-2&&dense[cursor+1].distance<target)cursor++;
  const a=dense[cursor],b=dense[cursor+1],t=(target-a.distance)/(b.distance-a.distance||1);
  samples.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:a.y+(b.y-a.y)*t});
 }
 let distance=0;
 for(let i=0;i<samples.length;i++){samples[i].distance=distance;const next=samples[(i+1)%samples.length];if(i<samples.length-1||closed)distance+=Math.hypot(next.x-samples[i].x,next.z-samples[i].z);}
 return {samples,length:distance,closed};
}
// The timing line belongs at the FAR END of the pit straight, before turn 1.
// Rotate the closed spline's origin without changing the geometry or lap length.
// Every progress-based server/client lap check therefore uses the new line.
export const FINISH_LINE_SAMPLE=0;
function rotateClosedRoute(route,index){
 const samples=route.samples.slice(index).concat(route.samples.slice(0,index));
 let distance=0;
 for(let i=0;i<samples.length;i++){
  const next=samples[(i+1)%samples.length];
  samples[i].distance=distance;
  distance+=Math.hypot(next.x-samples[i].x,next.z-samples[i].z);
 }
 return {samples,length:distance,closed:true};
}
export const ROAD=rotateClosedRoute(makeRoute(),FINISH_LINE_SAMPLE);
// Higher-density VISUAL spline only: preserves the exact racing spline,
// timing origin, progress and server-side lap validation geometry.
export const VISUAL_SUBDIVISIONS=4;
export function refineRoute(route,subdivisions=VISUAL_SUBDIVISIONS){
 const input=route.samples,n=input.length,closed=route.closed;
 const segments=closed?n:n-1;
 const result=[];
 const at=i=>input[closed?(i%n+n)%n:Math.max(0,Math.min(n-1,i))];
 for(let i=0;i<segments;i++){
  const a=at(i-1),b=at(i),c=at(i+1),d=at(i+2);
  for(let step=0;step<subdivisions;step++){
   const t=step/subdivisions;
   result.push({x:catmull(a.x,b.x,c.x,d.x,t),
    z:catmull(a.z,b.z,c.z,d.z,t),
    y:catmull(a.y,b.y,c.y,d.y,t)});
  }
 }
 if(!closed)result.push({...input[n-1]});
 let length=0;
 for(let i=0;i<result.length;i++){
  const p=result[i],q=result[(i+1)%result.length];
  p.distance=length;
  if(i<result.length-1||closed)length+=Math.hypot(q.x-p.x,q.z-p.z);
 }
 return {samples:result,length,closed,visual:true,detail:subdivisions};
}

export const PIT=makeRoute(PIT_POINTS,320,false);
// Shared merge elevation: lane, shoulders and physics meet the same main road.
for(const p of PIT.samples)p.y=projectToRoute(p.x,p.z,ROAD).y;
for(const bay of PIT_BAYS)bay.y=projectToRoute(bay.x,bay.z,PIT).y;
export function cornerKerbGripWidth(progress){
 // Same local curvature criteria used by the visual apex and exit kerbs.
 const samples=ROAD.samples,n=samples.length;
 const i=Math.max(0,Math.min(n-1,samples.findIndex(p=>p.distance>=Math.max(0,Math.min(.999999,progress))*ROAD.length)));
 const tangent=j=>{
  const a=samples[(j-1+n)%n],b=samples[(j+1)%n],dx=b.x-a.x,dz=b.z-a.z;
  const d=Math.hypot(dx,dz)||1;return {x:dx/d,z:dz/d};
 };
 const bend=j=>{
  const a=tangent((j-7+n)%n),b=tangent((j+7)%n);
  return a.x*b.z-a.z*b.x;
 };
 const prior=Math.abs(bend((i-11+n)%n)),now=Math.abs(bend(i));
 if(prior>.13&&now>.035&&now<prior*1.22)return 3.56;
 const next=Math.abs(bend((i+11)%n));
 return Math.max(prior,now,next)>.125?1.5:1.23;
}

export function projectToRoute(x,z,route=ROAD){
 let best={distance:Infinity,index:0,t:0,progress:0,y:0,x:0,z:0,normalX:0,normalZ:0};
 const ps=route.samples,n=ps.length,segments=route.closed?n:n-1;
 let bestSquared=Infinity;
 for(let i=0;i<segments;i++){
  const p=ps[i],q=ps[(i+1)%n],dx=q.x-p.x,dz=q.z-p.z;
  const den=dx*dx+dz*dz||1;
  const t=Math.max(0,Math.min(1,((x-p.x)*dx+(z-p.z)*dz)/den));
  const px=p.x+t*dx,pz=p.z+t*dz,distanceSquared=(x-px)**2+(z-pz)**2;
  if(distanceSquared<bestSquared){
   bestSquared=distanceSquared;
   const length=Math.sqrt(den);
   const progress=(p.distance+t*length)/route.length;
   best={distance:Math.sqrt(distanceSquared),index:i,t,progress:Math.min(1,progress),
    x:px,z:pz,y:p.y+(q.y-p.y)*t,normalX:-dz/length,normalZ:dx/length};
  }
 }
 return best;
}
export function sampleAt(progress,route=ROAD){
 // Progress is a fraction of arc LENGTH, not spline sample index. Road
 // Atlanta has fast straights and tight Esses; sample index isn't distance.
 const distance=((progress%1)+1)%1*route.length,ps=route.samples;
 let low=0,high=ps.length-1;
 while(low<high){
  const mid=(low+high+1)>>1;
  if(ps[mid].distance<=distance)low=mid;else high=mid-1;
 }
 const a=ps[low],b=ps[(low+1)%ps.length];
 const segment=Math.hypot(b.x-a.x,b.z-a.z)||1;
 const t=Math.min(1,Math.max(0,(distance-a.distance)/segment));
 return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:a.y+(b.y-a.y)*t};
}
export function raceStart(){
 const s=ROAD.samples[0],n=ROAD.samples[1];
 return {x:s.x,z:s.z,y:s.y,yaw:Math.atan2(n.x-s.x,n.z-s.z)};
}
