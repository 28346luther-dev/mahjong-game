import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {ROAD,PIT,PIT_POINTS,PIT_HALF_WIDTH,PIT_FAST_LANE_WIDTH,
 PIT_SERVICE_LANE_WIDTH,PIT_BAYS,projectToRoute,cornerKerbGripWidth} from "../public/kart-track.js";
import {nearPitBay} from "../public/kart-physics.js";

test("pit route has a fully paved continuous entry and exit on the racing circuit",()=>{
 const entry=PIT.samples[0],exit=PIT.samples.at(-1);
 assert.ok(projectToRoute(entry.x,entry.z,ROAD).distance<1.1);
 assert.ok(projectToRoute(exit.x,exit.z,ROAD).distance<1.1);
 assert.ok(PIT.samples.length>=150);
 assert.ok(PIT_POINTS.length>=12);
 assert.ok(PIT_HALF_WIDTH>=6);
 assert.ok(PIT_FAST_LANE_WIDTH>=4);
 assert.ok(PIT_SERVICE_LANE_WIDTH>=5);
});
test("dedicated service lane leaves an unobstructed fast lane",()=>{
 assert.equal(PIT_BAYS.length,4);
 for(const bay of PIT_BAYS){
  const projected=projectToRoute(bay.x,bay.z,PIT);
  assert.ok(projected.distance>2.7,"bay must be away from pit fast-lane centre");
  assert.ok(projected.distance<PIT_HALF_WIDTH,"bay must stay within paved apron");
  assert.equal(nearPitBay(bay.x,bay.z,bay),true);
 }
 const building=readFileSync("public/kart-pit-complex.js","utf8");
 assert.match(building,/FAST LANE/);
 assert.match(building,/SERVICE APRON/);
 assert.match(building,/strip\(\.47,\.13,yellow\)/);
 assert.match(building,/new THREE\.PlaneGeometry\(5\.25,7\.25\)/);
 assert.match(building,/roadsideSign\(pitPs\.length-11,"PIT OUT"\)/);
 assert.match(building,/const offset=PIT_HALF_WIDTH\+4/);
});
test("corner kerbs are continuous curved striped paint, not alternating floating blocks",()=>{
 const gfx=readFileSync("public/kart-graphics.js","utf8");
 const client=readFileSync("public/kart-racing.js","utf8");
 assert.match(gfx,/const kerbMeshes=\[\[\],\[\]\]/);
 assert.match(gfx,/curvedStrip\(i,side,halfWidth-\.22,halfWidth\+1\.48/);
 assert.match(gfx,/curvedStrip\(i,outside,halfWidth-\.18,halfWidth\+2\.46/);
 assert.match(gfx,/Math\.floor\(i\/6\)%2/);
 assert.match(gfx,/finishMesh\(kerbMeshes\[0\],red\)/);
 assert.match(gfx,/blueMeshes/);
 assert.match(client,/cornerKerbGripWidth\(progress\)/);
 assert.ok(cornerKerbGripWidth(.25)>=1.23);
 assert.match(client,/PIT_HALF_WIDTH\+8\)continue/);
});
test("amended track, visuals, pit complex and physics parse",()=>{
 for(const file of ["public/kart-track.js","public/kart-graphics.js",
  "public/kart-racing.js","public/kart-pit-complex.js"])
  execFileSync(process.execPath,["--check",file]);
});
