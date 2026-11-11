import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {ROAD,PIT,TRACK_SAMPLES,VISUAL_SUBDIVISIONS,refineRoute,projectToRoute,raceStart} from "../public/kart-track.js";
test("visual Catmull subdivision smooths EVERY corner without moving validated racing route",()=>{
 const refined=refineRoute(ROAD);
 assert.equal(VISUAL_SUBDIVISIONS,4);
 assert.equal(ROAD.samples.length,TRACK_SAMPLES);
 assert.equal(refined.samples.length,ROAD.samples.length*VISUAL_SUBDIVISIONS);
 assert.equal(refined.closed,true);
 for(let i=0;i<ROAD.samples.length;i++){
  const old=ROAD.samples[i],visual=refined.samples[i*VISUAL_SUBDIVISIONS];
  assert.equal(old.x,visual.x);assert.equal(old.z,visual.z);assert.equal(old.y,visual.y);
 }
 assert.ok(Math.abs(ROAD.length-refined.length)<1.0,"visual road length remains aligned with racing geometry");
 const start=raceStart();
 assert.equal(start.x,refined.samples[0].x);
 assert.ok(projectToRoute(start.x,start.z).distance<1e-7);
 const pit=refineRoute(PIT,3);
 assert.equal(pit.samples.length,(PIT.samples.length-1)*3+1);
 assert.equal(pit.closed,false);
});
test("smooth road, runoff, kerbs and 1024px asphalt all use the refined visual geometry",()=>{
 const client=readFileSync("public/kart-racing.js","utf8");
 const graphics=readFileSync("public/kart-graphics.js","utf8");
 assert.match(client,/visualRoad=refineRoute\(ROAD,4\),visualPit=refineRoute\(PIT,3\)/);
 assert.match(client,/ribbon\(visualRoad/);
 assert.match(client,/embankment\(visualRoad/);
 assert.match(client,/addCircuitGraphics\(THREE,scene,visualRoad,visualPit/);
 assert.match(graphics,/detail=ROAD\.detail\|\|1/);
 assert.match(graphics,/7\*detail/);
 assert.match(graphics,/6\*detail/);
 assert.match(graphics,/asphalt=texturedCanvas\(1024/);
 assert.match(graphics,/roadMat\.bumpMap=asphalt/);
 assert.match(graphics,/texture\.anisotropy=16/);
});
test("obsolete pit wall and main-straight Armco replaced by contiguous track-edge glass",()=>{
 const pit=readFileSync("public/kart-pit-complex.js","utf8");
 const safety=readFileSync("public/kart-safety.js","utf8");
 const barriers=readFileSync("public/kart-straight-barriers.js","utf8");
 assert.doesNotMatch(pit,/for\(let i=25;i<pitPs\.length-27/);
 assert.match(safety,/if\(i>=n-70\|\|i<=5\)return false/);
 assert.match(barriers,/roadHalfWidth\+\.27/);
 assert.match(barriers,/const from=n-Math\.round\(n\*69\/480\)/);
 assert.match(barriers,/quad\(glassVertices,a1,b1,a2,b2\)/);
 assert.match(barriers,/quad\(topRails,a2,b2,a3,b3\)/);
 assert.match(barriers,/pitRoute/);
});
test("lighting, antialiasing and shadow upgrades parse",()=>{
 const client=readFileSync("public/kart-racing.js","utf8");
 assert.match(client,/setPixelRatio\(Math\.min\(window\.devicePixelRatio\|\|1,2\)\)/);
 assert.match(client,/sun\.shadow\.mapSize\.set\(2048,2048\)/);
 assert.match(client,/THREE\.ACESFilmicToneMapping/);
 for(const path of ["public/kart-track.js","public/kart-racing.js","public/kart-graphics.js",
  "public/kart-safety.js","public/kart-pit-complex.js","public/kart-straight-barriers.js"])
  execFileSync(process.execPath,["--check",path]);
});
