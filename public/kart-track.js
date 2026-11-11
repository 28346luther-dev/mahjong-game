/* Velvet Circuit road-course geometry shared by browser and leaderboard.
 * The route is a closed continuous spline, not a generic ellipse.
 * No checkpoint gates, index-based user interactions or floating track props.
 */
export const ROAD_HALF_WIDTH=4.2;
export const RUNOFF_WIDTH=7.5;
export const TRACK_SCALE=1.65;
export const PIT_HALF_WIDTH=2.45;
export const ROAD_POINTS=[
 [-47,-22,0.8],[-30,-22,0.8],[-10,-22,0.9],[5,-22,0.9],
 [16,-24,1.05],[27,-32,1.25],[37,-22,1.65],[53,-18,2.15],
 [65,-7,2.85],[68,9,3.2],[60,24,3.5],[46,27,3.2],
 [33,18,2.65],[21,13,2.1],[10,25,1.45],[-2,37,1.05],
 [-20,36,.65],[-31,27,.6],[-39,19,.95],[-53,30,1.25],
 [-65,28,1.45],[-72,12,1.55],[-67,-7,1.2],[-57,-18,.85]
].map(([x,z,y])=>[x*TRACK_SCALE,z*TRACK_SCALE,y*1.35]);
export const PIT_POINTS=[
 [-46,-22,.8],[-40,-16,.8],[-29,-10,.8],[-12,-9,.8],
 [3,-9,.82],[11,-12,.85],[19,-22,1.05]
].map(([x,z,y])=>[x*TRACK_SCALE,z*TRACK_SCALE,y*1.35]);
// The extended eastern right-hand sweeper has approximately 9 degrees of
// progressive banking. Banking is tapered smoothly on entry and exit.
export const BANK_START=.20,BANK_END=.40,BANK_MAX_DEGREES=9;
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
export const PIT_BAYS=[.31,.43,.55,.67].map((fraction,i)=>{
 const n=Math.round(fraction*72),route=makeRoute(PIT_POINTS,72,false);
 const p=route.samples[Math.min(n,route.samples.length-1)];
 return {index:i,x:p.x,z:p.z+1.15,y:p.y,label:"BAY "+(i+1)};
});
export const TRACK_SAMPLES=480;
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
export const ROAD=makeRoute();
export const PIT=makeRoute(PIT_POINTS,72,false);
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
