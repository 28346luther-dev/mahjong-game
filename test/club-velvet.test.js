import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {STATIONS} from "../public/club-velvet-world.js";
import {barSeatPlan,couchSeatPlan,gameSeatPlan,DOOR_GAPS} from "../public/club-layout.js";

test("all existing gameplay and social interaction targets survive the visual overhaul",()=>{
 const needed=["mahjong","poker","blackjack","slots","board","gokarts","karaoke","bar","sofa-left","sofa-right"];
 assert.deepEqual(STATIONS.map(s=>s.id),needed);
 assert.equal(STATIONS.find(s=>s.id==="mahjong").enabled,true);
 assert.equal(STATIONS.find(s=>s.id==="poker").enabled,true);
});
test("red velvet lounges and bar retain seating locations",()=>{
 const sofa=couchSeatPlan(-5.15,7.62,Math.PI,"west-north");
 assert.equal(sofa.length,3);
 assert.equal(barSeatPlan().length,4);
 assert.equal(gameSeatPlan(STATIONS[0]).length,4);
});
test("doorway openings remain wide enough to enter every room",()=>{
 for(const [from,to] of DOOR_GAPS)assert.ok(to-from>3);
});
test("all 3D modules parse cleanly, and no old low-poly world builder remains",()=>{
 for(const path of ["public/club-velvet-world.js","public/clubhouse.js","public/club-social.js"]){
  execFileSync(process.execPath,["--check",path]);
 }
 const entry=readFileSync("public/clubhouse.js","utf8");
 assert.match(entry,/buildVelvetClub\(THREE,scene\)/);
 assert.doesNotMatch(entry,/function slotMachines\(/);
 assert.doesNotMatch(entry,/musicNote\(/);
 assert.match(entry,/createClubSocial/);
 assert.match(entry,/returnToLobby/);
 const world=readFileSync("public/club-velvet-world.js","utf8");
 assert.match(world,/MeshPhysicalMaterial/);
 assert.match(world,/ExtrudeGeometry/);
 assert.match(world,/sideSkirtingSegments/);
 assert.match(world,/THREE.FrontSide/);
 assert.doesNotMatch(world,/0xffffff/);
});
