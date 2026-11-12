import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {ROAD,PIT,PIT_POINTS,PIT_BAYS,PIT_HALF_WIDTH,ROAD_HALF_WIDTH,
 projectToRoute,sampleAt,refineRoute} from "../public/kart-track.js";
test("pit entry peels gradually off the straight instead of turning sharply",()=>{
 assert.equal(PIT_POINTS.length,17);
 assert.ok(PIT.samples.length>=200);
 const entry=PIT.samples[0],end=PIT.samples.at(-1);
 assert.ok(projectToRoute(entry.x,entry.z,ROAD).distance<1.2);
 assert.ok(projectToRoute(end.x,end.z,ROAD).distance<1.2,
  "PIT OUT must land ON asphalt, not in grass or gravel");
 const early=sampleAt(.1,PIT),middle=sampleAt(.3,PIT);
 assert.ok(projectToRoute(early.x,early.z,ROAD).distance<
   projectToRoute(middle.x,middle.z,ROAD).distance,
  "entry must peel progressively away from main straight");
 const pts=PIT.samples;
 for(let i=3;i<pts.length-4;i++){
  const before=pts[i-2],now=pts[i],after=pts[i+2];
  const a=Math.atan2(now.z-before.z,now.x-before.x);
  const b=Math.atan2(after.z-now.z,after.x-now.x);
  const turn=Math.atan2(Math.sin(a-b),Math.cos(a-b));
  assert.ok(Math.abs(turn)<.25,"pit corner is too sharp at sample "+i);
 }
});
test("service boxes all lie on the garage-side apron, not the driving lane",()=>{
 assert.equal(PIT_BAYS.length,4);
 for(const box of PIT_BAYS){
  const p=projectToRoute(box.x,box.z,PIT);
  assert.ok(p.distance>2.6&&p.distance<PIT_HALF_WIDTH);
  assert.ok(box.radius>=3.5);
 }
});
test("corner kerbs are shallow continuous curved bands instead of discrete raised blocks",()=>{
 const gfx=readFileSync("public/kart-graphics.js","utf8");
 const client=readFileSync("public/kart-racing.js","utf8");
 assert.match(gfx,/smoothstep=\(a,b,v\)/);
 assert.match(gfx,/kerbWeight=i=>/);
 assert.match(gfx,/const h0=\.065,h1=\.068/);
 assert.match(gfx,/Math\.floor\(p\.distance\/4\.6\)%2/);
 assert.match(gfx,/pitBand\(-PIT_HALF_WIDTH\+\.04,PIT_HALF_WIDTH-\.04,roadMat,\.087\)/);
 assert.doesNotMatch(gfx,/curvedStrip\(/);
 assert.match(client,/Math\.max\(3\.6,kerbWidth\)/);
 assert.match(client,/ribbon\(visualPit/);
});
test("retired scene pieces cannot obstruct long pit entry or pit-exit blend",()=>{
 const safety=readFileSync("public/kart-safety.js","utf8");
 const glass=readFileSync("public/kart-straight-barriers.js","utf8");
 const gfx=readFileSync("public/kart-graphics.js","utf8");
 const client=readFileSync("public/kart-racing.js","utf8");
 assert.match(safety,/distance<PIT_HALF_WIDTH\+12/);
 assert.match(safety,/distance<PIT_HALF_WIDTH\+20/);
 assert.match(glass,/distance<8\.5/);
 assert.match(gfx,/distance<PIT_HALF_WIDTH\+26/);
 assert.match(client,/const mergeReady=inPitLane&&pit\.progress>\.955/);
 assert.match(client,/road\.distance<ROAD_HALF_WIDTH\+1\.5/);
});
test("all rebuilt modules parse",()=>{
 for(const p of ["public/kart-track.js","public/kart-racing.js",
  "public/kart-graphics.js","public/kart-pit-complex.js","public/kart-safety.js",
  "public/kart-straight-barriers.js"])execFileSync(process.execPath,["--check",p]);
});
