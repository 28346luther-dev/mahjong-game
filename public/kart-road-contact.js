import {PIT,PIT_HALF_WIDTH,projectToRoute} from './kart-track.js';
// Lower complete grass/shoulder triangles intersecting the paved pit corridor.
// Testing only terrain vertices misses a lane crossing the middle of a triangle.
export function clearPitGrass(geometry){
 const p=geometry.attributes.position,index=geometry.index;
 const count=index?index.count:p.count;
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
  const points=ids.map(j=>({x:p.getX(j),z:p.getZ(j)}));
  const x=points.reduce((s,v)=>s+v.x,0)/3,z=points.reduce((s,v)=>s+v.z,0)/3;
  const radius=Math.max(...points.map(v=>Math.hypot(v.x-x,v.z-z)));
  const nearest=projectToRoute(x,z,PIT);
  if(nearest.distance>PIT_HALF_WIDTH+.4+radius)continue;
  const floor=Math.min(nearest.y,...points.map(v=>projectToRoute(v.x,v.z,PIT).y))-.3;
  for(const j of ids)p.setY(j,Math.min(p.getY(j),floor));
 }
 p.needsUpdate=true;
 return geometry;
}
