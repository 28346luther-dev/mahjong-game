import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {ROAD,ROAD_POINTS,PIT,ROAD_HALF_WIDTH,FINISH_LINE_SAMPLE,raceStart,projectToRoute} from "../public/kart-track.js";
const racing=readFileSync("public/kart-racing.js","utf8");
const barriers=readFileSync("public/kart-straight-barriers.js","utf8");
const events=readFileSync("src/kart-race-events.js","utf8");
test("timing line is at the FAR END of pit straight, not its original start",()=>{
 assert.ok(FINISH_LINE_SAMPLE>=60&&FINISH_LINE_SAMPLE<=75);
 const finish=raceStart(),oldStart=ROAD_POINTS[0],pitStart=PIT.samples[0],pitExit=PIT.samples.at(-1);
 assert.ok(finish.x-oldStart[0]>55);
 assert.ok(Math.hypot(finish.x-pitExit.x,finish.z-pitExit.z)<
  Math.hypot(finish.x-pitStart.x,finish.z-pitStart.z));
 assert.ok(projectToRoute(finish.x,finish.z,ROAD).distance<.01);
 assert.equal(ROAD.samples[0].distance,0);
 assert.ok(Math.abs(ROAD.samples.at(-1).distance-ROAD.length)<2);
 assert.match(readFileSync("public/kart-graphics.js","utf8"),/Start\/finish squares/);
});
test("staggered starting slots use L-shaped half rectangles straight behind finish",()=>{
 assert.match(racing,/gridPrevious=ROAD.samples\[ROAD.samples.length-8\]/);
 assert.match(racing,/const back=8\+Math.floor\(i\/2\)\*5\.7/);
 assert.match(racing,/drawGridLine\(2\.08,\.105/);
 assert.match(racing,/drawGridLine\(\.105,2\.95/);
 assert.doesNotMatch(racing,/sideLine=box\(\.09,\.022,3\.6/);
 assert.match(events,/const lane=\(index%2\?1:-1\)\*2\.25,back=/);
 assert.match(events,/start.x-tx\*back-tz\*lane/);
 const p=ROAD.samples[0],prior=ROAD.samples.at(-8);
 const forwardX=p.x-prior.x,forwardZ=p.z-prior.z;
 const x=p.x-8*forwardX/Math.hypot(forwardX,forwardZ);
 assert.ok(x<p.x,"pole grid is behind the line");
});
test("joined glass safety panels border BOTH sides of main straight, with pit entry gap",()=>{
 assert.match(racing,/addStraightGlassBarriers\(THREE,scene,ROAD,ROAD_HALF_WIDTH\)/);
 assert.match(barriers,/const barrier=new THREE.MeshStandardMaterial/);
 assert.match(barriers,/const glass=new THREE.MeshPhysicalMaterial/);
 assert.match(barriers,/for\(const side of \[-1,1\]\)/);
 assert.match(barriers,/roadHalfWidth\+\.27/);
 assert.match(barriers,/side===1\?from\+15:from/);
 assert.match(barriers,/for\(let i=first;i<to;i\+\+\)/);
 assert.match(barriers,/quad\(glassVertices,a1,b1,a2,b2\)/);
 assert.match(barriers,/InstancedMesh/);
});
test("time trials retain momentum and server race session after each complete lap",()=>{
 assert.match(racing,/if\(timeTrial\)\{\s*\/\/ Time Trial is an ongoing best-lap session/);
 assert.doesNotMatch(racing,/if\(timeTrial\)\{playing=false;speed=0/);
 assert.match(racing,/resetSectors\(\);\s*message\("Time trial lap/);
 assert.match(racing,/lapCount=finish.nextLap/);
 assert.match(racing,/reportedFinish=false/);
});
test("all updated modules pass syntax",()=>{
 for(const path of ["public/kart-track.js","public/kart-straight-barriers.js",
  "public/kart-racing.js","src/kart-race-events.js"])
  execFileSync(process.execPath,["--check",path]);
});
