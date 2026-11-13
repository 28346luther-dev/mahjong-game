import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {ROAD,ROAD_HALF_WIDTH,sampleAt} from "../public/kart-track.js";
import {KartLeaderboard} from "../src/kart-leaderboard.js";
import {activeEventId,eventPhase,QUALIFY_MS,START_LIGHTS_MS} from "../src/kart-race-events.js";
import {newBlackjack,joinBlackjack,readyBlackjack,disconnectBlackjack,reconcileBlackjack} from "../src/blackjack-multiplayer.js";
const user=c=>c.repeat(64);
function fixture(){
 const data=new Map();
 const storage={
  async get(k){return data.get(k);},
  async put(k,v){data.set(k,structuredClone(v));},
  async delete(k){data.delete(k);},
  async transaction(fn){return fn(this);}
 };
 return {data,race:new KartLeaderboard({storage})};
}
async function submit(race,path,body){
 const response=await race.fetch(new Request("https://kart"+path,{
  method:"POST",body:JSON.stringify(body)
 }));
 return {status:response.status,result:await response.json()};
}
test("five red lights hold drivers before simultaneous race release",()=>{
 const start=activeEventId(1790000000000);
 assert.equal(START_LIGHTS_MS,8000);
 assert.equal(eventPhase(start,start+QUALIFY_MS-1),"qualifying");
 assert.equal(eventPhase(start,start+QUALIFY_MS),"grid");
 assert.equal(eventPhase(start,start+QUALIFY_MS+7999),"grid");
 assert.equal(eventPhase(start,start+QUALIFY_MS+8000),"race");
});
test("wide circuit supports side-by-side racing",()=>{
 assert.ok(ROAD_HALF_WIDTH>=6);
 assert.ok(ROAD.length>400);
});
test("full-lap leaderboard accepts valid laps without sector notifications",async()=>{
 const {race,data}=fixture(),id=user("c");
 const started=await submit(race,"/start",{user:id,name:"Solo Lap"});
 assert.equal(started.status,200);
 const raceId=started.result.raceId;
 for(let i=1;i<=50;i++){
  const point=sampleAt(i===50?.005:i/50);
  const session=data.get("road-atlanta-mapped-session-v2:"+id);
  session.lastAt=Date.now()-2600;
  session.start=Date.now()-90000;
  // Missed sector split signals must never invalidate a real full lap.
  session.sectorTimes=[];
  data.set("road-atlanta-mapped-session-v2:"+id,session);
  const step=await submit(race,"/sample",{user:id,raceId,x:point.x,z:point.z});
  assert.equal(step.status,200,JSON.stringify(step.result));
 }
 const finish=sampleAt(.005);
 const response=await submit(race,"/finish",{user:id,raceId,x:finish.x,z:finish.z});
 assert.equal(response.status,200,JSON.stringify(response.result));
 assert.equal(response.result.entries[0].name,"Solo Lap");
 assert.equal(response.result.elapsedMs>=22000,true);
});
test("disconnected blackjack ready seats are removed and refunded",()=>{
 const game=newBlackjack(),wallets={a:{balance:500},b:{balance:500}};
 joinBlackjack(game,"a","A");
 joinBlackjack(game,"b","B");
 game.players.forEach(p=>p.online=true);
 readyBlackjack(game,"a",wallets);
 readyBlackjack(game,"b",wallets);
 assert.equal(wallets.a.balance,490);
 assert.equal(wallets.b.balance,490);
 assert.equal(disconnectBlackjack(game,"b",wallets),true);
 assert.equal(wallets.b.balance,500);
 assert.equal(game.players.some(p=>p.id==="b"),false);
 reconcileBlackjack(game,new Set(),wallets);
 assert.equal(game.players.some(p=>p.status==="ready"),false);
});
test("selector, start lights, fullscreen HUD and navigation exist",()=>{
 const html=readFileSync("public/index.html","utf8");
 const racing=readFileSync("public/kart-racing.js","utf8");
 const css=readFileSync("public/kart-racing.css","utf8");
 const meetings=readFileSync("public/kart-meetings.js","utf8");
 for(const id of ["kartModeHub","kartStartLights","kartTrackPositions","kartBackSelector","kartRaceModesBack","kartHubLeaderboard"])
  assert.ok(html.includes('id="'+id+'"'));
 assert.doesNotMatch(html,/data-kart-mode="practice"/);
 assert.match(html,/id="kartLiveLeaderboard"/);
 assert.match(html,/data-kart-mode="timetrial"/);
 assert.match(html,/data-kart-mode="races"/);
 assert.match(racing,/function backToSelector\(\)/);
 assert.match(racing,/const mergeReady=/);
 assert.match(meetings,/light-bulb/);
 assert.match(css,/\.kart-driving:fullscreen \.kart-stage/);
});
test("all updated modules parse",()=>{
 for(const path of ["src/kart-race-events.js","src/kart-leaderboard.js","src/blackjack-multiplayer.js","src/poker-table.js","public/kart-racing.js","public/kart-meetings.js"])
  execFileSync(process.execPath,["--check",path]);
});
