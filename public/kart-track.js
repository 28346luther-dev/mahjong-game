/* Velvet Circuit road-course geometry shared by browser and leaderboard.
 * The route is a closed continuous spline, not a generic ellipse.
 * No checkpoint gates, index-based user interactions or floating track props.
 */
// Michelin Raceway Road Atlanta-inspired layout reconstructed from supplied
// corner map and published 2.54-mile circuit length. This is NOT surveyed GPS
// geometry or a licensed, exact 1:1 digital twin. Distances are metrically
// scaled and the circuit includes T1–T12, the Esses, 10A/10B, and a long back straight.
export const TRACK_NAME="Road Atlanta Inspired";
export const ROAD_HALF_WIDTH=6.3;
export const RUNOFF_WIDTH=8;
export const TRACK_SCALE=2.8216461;
export const PIT_FAST_LANE_WIDTH=4.4;
export const PIT_SERVICE_LANE_WIDTH=5.6;
export const PIT_LANE_MARGIN=1.3;
export const PIT_HALF_WIDTH=6.35;
export const PIT_SERVICE_OFFSET=3.3;
export const PIT_BAY_TOLERANCE=3.65;
export const ROAD_POINTS=[
 [-10,-25,6],[-85,-25,6],[-135,-18,13],[-147,5,21],
 [-145,35,26],[-151,57,29],[-158,72,31],[-144,88,24],
 [-158,112,16],[-149,150,18],[-162,179,12],[-151,210,9],
 [-175,255,19],[-216,325,30],[-231,353,35],[-220,380,38],
 [-193,400,34],[-166,382,30],[-135,340,26],[-75,280,19],
 [10,205,12],[105,122,6],[149,65,5],[171,23,6],
 [189,24,8],[204,35,11],[214,5,6],[191,-22,1],
 [148,-34,3],[90,-26,5],[20,-25,6]
].map(([x,z,y])=>[x*TRACK_SCALE,z*TRACK_SCALE,y]);
// Driving direction is toward decreasing X on the front straight. PIT IN
// branches BEFORE the timing line and uses a long parallel approach.
// The PIT OUT branch merges after the first uphill right into the T2 rise.
export const PIT_POINTS=[
 [173,-26,2],[159,-31,3],[144,-36,4],[120,-42,5],
 [93,-47,5.5],[65,-49,6],[35,-49,6],[5,-49,6],
 [-26,-49,6.2],[-60,-48,6.5],[-93,-43,9],
 [-119,-30,12],[-139,-12,17],[-147,5,21],
 [-145,35,26]
].map(([x,z,y])=>[x*TRACK_SCALE,z*TRACK_SCALE,y]);
// The extended eastern right-hand sweeper has approximately 17 degrees of
// progressive banking. Banking is tapered smoothly on entry and exit.
export const BANK_START=.49,BANK_END=.62,BANK_MAX_DEGREES=17;
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
 return {
  x:catmull(a[0],b[0],c[0],d[0],t),
  z:catmull(a[1],b[1],c[1],d[1],t),
  y:catmull(a[2],b[2],c[2],d[2],t)
 };
}
export function makeRoute(points=ROAD_POINTS,count=TRACK_SAMPLES,closed=true){
 const samples=Array.from({length:count+(closed?0:1)},(_,i)=>
  sampleCurve(points,(i/count)*(closed?points.length:points.length-1),closed));
 let distance=0;
 for(let i=0;i<samples.length;i++){
  const next=samples[(i+1)%samples.length];
  const prev=samples[i];
  prev.distance=distance;
  if(i<samples.length-1||closed)distance+=Math.hypot(next.x-prev.x,next.z-prev.z);
 }
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
export function cornerKerbGripWidth(progress){
 // Same local curvature criteria used by the visual apex and exit kerbs.
 const samples=ROAD.samples,n=samples.length;
 const i=Math.max(0,Math.min(n-1,Math.floor(Math.max(0,Math.min(.999999,progress))*n)));
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
 for(let i=0;i<segments;i++){
  const p=ps[i],q=ps[(i+1)%n],dx=q.x-p.x,dz=q.z-p.z;
  const den=dx*dx+dz*dz||1;
  const t=Math.max(0,Math.min(1,((x-p.x)*dx+(z-p.z)*dz)/den));
  const px=p.x+t*dx,pz=p.z+t*dz,distance=Math.hypot(x-px,z-pz);
  if(distance<best.distance){
   const length=Math.sqrt(den);
   const progress=(p.distance+t*length)/route.length;
   best={distance,index:i,t,progress:Math.min(1,progress),
    x:px,z:pz,y:p.y+(q.y-p.y)*t,normalX:-dz/length,normalZ:dx/length};
  }
 }
 return best;
}
export function sampleAt(progress,route=ROAD){
 const p=((progress%1)+1)%1,ps=route.samples;
 const j=Math.min(ps.length-1,Math.floor(p*ps.length));
 const a=ps[j],b=ps[(j+1)%ps.length];
 const t=p*ps.length-j;
 return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:a.y+(b.y-a.y)*t};
}
export function raceStart(){
 const s=ROAD.samples[0],n=ROAD.samples[1];
 return {x:s.x,z:s.z,y:s.y,yaw:Math.atan2(n.x-s.x,n.z-s.z)};
}
