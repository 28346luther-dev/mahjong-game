import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {ROAD,PIT,ROAD_POINTS,PIT_POINTS,TRACK_NAME,TRACK_SCALE,PIT_BAYS,
 projectToRoute,refineRoute} from "../public/kart-track.js";
import {leaderboardEntries,MIN_LAP_MS,MAX_SPEED_MPS,validateSample} from "../src/kart-leaderboard.js";
import {chooseClaimWinner} from "../src/worker.js";
const source=path=>readFileSync(path,"utf8");
test("published full-length Road Atlanta track is metrically scaled to 2.54 miles",()=>{
 assert.match(TRACK_NAME,/Road Atlanta/);
 const metres=2.54*1609.344;
 assert.ok(Math.abs(ROAD.length-metres)<28,
  "Track is "+ROAD.length.toFixed(2)+"m; expected ~"+metres.toFixed(2)+"m");
 assert.ok(ROAD.length>4000);
 assert.equal(ROAD.samples.length,800);
 assert.equal(ROAD_POINTS.length,31);
 assert.ok(Math.max(...ROAD.samples.map(p=>p.y))-Math.min(...ROAD.samples.map(p=>p.y))>=28);
 const rendered=refineRoute(ROAD,4);
 assert.ok(Math.abs(rendered.length-ROAD.length)<40);
});
test("new pit lane is connected at both ends and service boxes remain available",()=>{
 assert.equal(PIT_POINTS.length,15);
 assert.ok(PIT.length>800);
 for(const end of [PIT.samples[0],PIT.samples.at(-1)])
  assert.ok(projectToRoute(end.x,end.z,ROAD).distance<ROAD.length*.004,
   "pit endpoint "+JSON.stringify(end)+" is not joined to driving track");
 assert.equal(PIT_BAYS.length,4);
});
test("sub-21s verified laps aren't excluded by arbitrary leaderboard minimum",()=>{
 assert.equal(MIN_LAP_MS,1);
 const results=leaderboardEntries({"first":{name:"Fast driver",bestMs:19999,at:1,version:4},
  "other":{name:"Another",bestMs:22000,at:2,version:4}});
 assert.equal(results[0].bestMs,19999);
 assert.equal(results.length,2);
 assert.ok(MAX_SPEED_MPS>82);
});
test("online GT car rendering and high-speed movement use full-size track settings",()=>{
 const racing=source("public/kart-racing.js"),events=source("src/kart-race-events.js");
 const leader=source("src/kart-leaderboard.js"),model=source("public/kart-gt-car.js");
 const meetings=source("public/kart-meetings.js");
 assert.match(racing,/createGTCar/);
 assert.match(racing,/pitLimiter\?PIT_LIMIT_MS:82/);
 assert.match(model,/export function createGTCar/);
 assert.match(racing,/animateRivals\(dt\)/);
 assert.match(meetings,/},650\)/);
 assert.match(leader,/2500/);
 assert.match(events,/MAX_STEP_MPS=105/);
 assert.match(leader,/road-atlanta-best-times-v1/);
 assert.match(events,/road-atlanta-best-times-v1/);
});
test("Mahjong claims always permit passing and confirmed Kong offers reaction recording",()=>{
 const app=source("public/app.js"),worker=source("src/worker.js");
 const cam=source("public/reaction-camera.js");
 assert.match(app,/Decline all claims \(Pass\)/);
 assert.match(app,/send\(action,extra\)/);
 assert.match(worker,/msg\.action==="pass"/);
 assert.match(worker,/\["pong","chow","kong"\]\.includes\(response\.action\)/);
 assert.match(cam,/\["pong","chow","kong","mahjong"\]/);
 const players=[{id:"a"},{id:"b"},{id:"c"}];
 assert.equal(chooseClaimWinner(players,0,{"b":{action:"pass"}}),null);
});
test("all changed modules parse",()=>{
 for(const p of ["public/kart-track.js","public/kart-gt-car.js","public/kart-racing.js",
  "public/kart-graphics.js","public/kart-pit-complex.js","public/kart-meetings.js",
  "src/kart-leaderboard.js","src/kart-race-events.js","src/worker.js",
  "public/app.js","public/reaction-camera.js"])
  execFileSync(process.execPath,["--check",p]);
});
