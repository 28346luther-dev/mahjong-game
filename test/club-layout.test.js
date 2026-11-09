import test from "node:test";
import assert from "node:assert/strict";
import {
 DOOR_GAPS,SIDE_WALL_SEGMENTS,sideSkirtingSegments,chairFacing,
 couchSeatPlan,barSeatPlan,gameSeatPlan,nearestInteraction,blockedBy
} from "../public/club-layout.js";

test("wall skirting is segmented and never crosses either doorway",()=>{
 const segments=sideSkirtingSegments();
 assert.equal(segments.length,3);
 for(const [gapStart,gapEnd] of DOOR_GAPS){
  for(const section of segments){
   assert.ok(section.end<=gapStart||section.start>=gapEnd,
    `skirting from ${section.start} to ${section.end} blocks a doorway`);
  }
 }
 for(const s of segments)assert.equal(s.length,s.end-s.start);
 assert.deepEqual(segments.map(s=>[s.start,s.end]),SIDE_WALL_SEGMENTS);
});
test("table chairs look toward the table centre from every side",()=>{
 const st={id:"mahjong",x:-17,z:-11};
 const seats=gameSeatPlan(st);
 assert.equal(seats.length,4);
 for(const seat of seats){
  const towardX=st.x-seat.x,towardZ=st.z-seat.z;
  // A Three.js seat's forward direction with yaw theta is (sin(theta),cos(theta)).
  const alignment=(Math.sin(seat.yaw)*towardX+Math.cos(seat.yaw)*towardZ)/Math.hypot(towardX,towardZ);
  assert.ok(alignment>.9999,`Chair ${seat.id} faces away from the table`);
 }
 assert.equal(chairFacing(0,-1),0);
});
test("sofa cushions have distinct sit coordinates and look toward coffee table",()=>{
 const north=couchSeatPlan(-5,7.65,Math.PI,"left-north");
 const south=couchSeatPlan(-5,4.35,0,"left-south");
 assert.equal(north.length,3);assert.equal(south.length,3);
 assert.equal(new Set(north.map(x=>x.x)).size,3);
 assert.ok(north.every(s=>Math.cos(s.yaw)<0));
 assert.ok(south.every(s=>Math.cos(s.yaw)>0));
 assert.ok(north.every(s=>s.eyeY>1.3&&s.standZ<s.z));
 assert.ok(south.every(s=>s.eyeY>1.3&&s.standZ>s.z));
});
test("bar stools are individually sittable and face the actual counter",()=>{
 const seats=barSeatPlan();
 assert.equal(seats.length,4);
 assert.equal(new Set(seats.map(s=>s.id)).size,4);
 assert.ok(seats.every(s=>s.kind==="stool"&&Math.abs(s.yaw-Math.PI)<.0001));
 assert.ok(seats.every(s=>s.z>-7.35&&s.standZ>s.z));
});
test("nearest interaction identifies sofa seats, stools, table chairs and not distant props",()=>{
 const sofa=couchSeatPlan(0,5,0,"test");
 const stool=barSeatPlan();
 const table=gameSeatPlan({id:"mahjong",x:-17,z:-11});
 const seats=[...sofa,...stool,...table];
 for(const seat of [sofa[1],stool[0],table[2]]){
  assert.equal(nearestInteraction(seat.x,seat.z,seats,[])?.id,seat.id);
 }
 assert.equal(nearestInteraction(300,300,seats,[]),null);
});
test("collision helper ignores decorations and detects physical wall sections",()=>{
 const sections=sideSkirtingSegments();
 const walls=sections.map(s=>({x:10,z:s.center,w:.32,d:s.length}));
 for(const [a,b] of DOOR_GAPS){
  assert.equal(blockedBy(10,(a+b)/2,walls,.35),false);
 }
 assert.equal(blockedBy(10,-14,walls,.35),true);
});
