import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {PIT,PIT_BAYS,PIT_BAY_TOLERANCE,BANK_MAX_DEGREES,ROAD,bankAngle} from "../public/kart-track.js";
import {nearPitBay,resolveKartCollision,gravityAlongRoad,surfaceNormal} from "../public/kart-physics.js";
test("pit box stopping has safe buffer at each of four bays",()=>{
 assert.equal(PIT_BAYS.length,4);
 assert.ok(PIT_BAY_TOLERANCE>=3.5);
 for(const bay of PIT_BAYS){
  assert.ok(nearPitBay(bay.x,bay.z,bay));
  assert.ok(nearPitBay(bay.x+3.0,bay.z,bay));
  assert.equal(nearPitBay(bay.x+8,bay.z,bay),false);
 }
});
test("multiplayer car contact prevents penetration",()=>{
 const first=resolveKartCollision(0,0,0.4,0,[{x:1,z:0}]);
 assert.equal(first.hit,true);
 assert.ok(Math.hypot(first.x-1,first.z)>=3.09);
 const clear=resolveKartCollision(0,0,5,0,[{x:-4,z:0}]);
 assert.equal(clear.hit,false);
 assert.equal(clear.x,5);
});
test("banked chassis surface normal and gravity reflect actual track profile",()=>{
 const projection={index:150};
 const fake={samples:[{x:0,z:0,y:0},{x:10,z:0,y:2}]};
 const downward=gravityAlongRoad(fake,{index:0},Math.PI/2);
 assert.ok(downward<0);
 const upward=gravityAlongRoad(fake,{index:0},-Math.PI/2);
 assert.ok(upward>0);
 assert.ok(BANK_MAX_DEGREES>=17);
 assert.ok(bankAngle(.55)>.2);
 const FakeTHREE={Vector3:class{constructor(x,y,z){this.x=x;this.y=y;this.z=z;}normalize(){const n=Math.hypot(this.x,this.y,this.z);this.x/=n;this.y/=n;this.z/=n;return this;}}};
 const normal=surfaceNormal(ROAD,projection,bankAngle(.55),FakeTHREE);
 assert.ok(Math.abs(normal.x)+Math.abs(normal.z)>.01);
 assert.ok(normal.y<1);
});
test("pit barriers stay outboard, pit boxes have graphical markings and pit booms",()=>{
 const complex=readFileSync("public/kart-pit-complex.js","utf8");
 const safety=readFileSync("public/kart-safety.js","utf8");
 const client=readFileSync("public/kart-racing.js","utf8");
 const track=readFileSync("public/kart-track.js","utf8");
 assert.match(complex,/new THREE\.CanvasTexture\(marking\)/);
 assert.match(complex,/new THREE\.PlaneGeometry\(5\.25,7\.25\)/);
 assert.match(complex,/boomX=-3\.25/);
 assert.doesNotMatch(complex,/for\(let i=25;i<pitPs\.length-27/);
 assert.match(safety,/projectToRoute\(guardX,guardZ,PIT\)/);
 assert.match(client,/addCircuitGrandstands/);
 assert.match(client,/addPitComplex/);
 assert.match(client,/getLocalPitRemaining/);
 assert.match(client,/pit\.progress>\.012/);
 assert.match(track,/PIT_BAY_TOLERANCE=3\.65/);
});
test("grass terrain stays beyond the runoff; wide exit kerbs preserve grip",()=>{
 const client=readFileSync("public/kart-racing.js","utf8");
 const graphics=readFileSync("public/kart-graphics.js","utf8");
 const stands=readFileSync("public/kart-grandstands.js","utf8");
 assert.match(client,/ROAD_HALF_WIDTH\+RUNOFF_WIDTH\+\.35/);
 assert.match(graphics,/kerbWeight/);
 assert.match(graphics,/\[\[side,1\.6\],\[-side,2\.35\]\]/);
 assert.match(graphics,/projectToRoute\(x,z,PIT\)\.distance<PIT_HALF_WIDTH\+26/);
 assert.match(client,/Math\.max\(3\.6,kerbWidth\)/);
 assert.match(stands,/grandstandSections/);
 assert.match(stands,/seatPools/);
});
test("practice and scheduled race both show ten-second pit service timer",()=>{
 const client=readFileSync("public/kart-racing.js","utf8");
 const meetings=readFileSync("public/kart-meetings.js","utf8");
 const server=readFileSync("src/kart-race-events.js","utf8");
 assert.match(client,/localPitUntil=Date\.now\(\)\+10000/);
 assert.match(meetings,/getLocalPitRemaining/);
 assert.match(meetings,/if\(ready&&!serviceRequested\)\{serviceRequested=true;service\(\);\}/);
 assert.match(server,/PIT_BAY_TOLERANCE/);
 assert.match(server,/PIT_SERVICE_MS=10_000/);
});
test("all amended visual and race modules parse",()=>{
 for(const path of ["public/kart-racing.js","public/kart-grandstands.js","public/kart-graphics.js",
  "public/kart-physics.js","public/kart-safety.js","public/kart-pit-complex.js",
  "public/kart-meetings.js","src/kart-race-events.js"])
  execFileSync(process.execPath,["--check",path]);
});
