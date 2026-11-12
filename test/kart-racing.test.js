import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {ROAD,PIT,ROAD_POINTS,ROAD_HALF_WIDTH,projectToRoute,raceStart,sampleAt} from "../public/kart-track.js";
import {KartLeaderboard,validateSample,MIN_LAP_MS,leaderboardEntries} from "../src/kart-leaderboard.js";
import {newBlackjack,joinBlackjack,chooseBlackjackMode,readyBlackjack,beginBlackjack,moveBlackjack,blackjackView} from "../src/blackjack-multiplayer.js";

const user=id=>id.repeat(64);
function fixture(){
 const data=new Map(),storage={
  async get(k){return data.get(k);},
  async put(k,v){data.set(k,structuredClone(v));},
  async delete(k){data.delete(k);},
  async transaction(fn){return fn(this);}
 };
 return {race:new KartLeaderboard({storage}),storage,data};
}
async function post(race,path,body){
 const r=await race.fetch(new Request("https://kart"+path,{method:"POST",body:JSON.stringify(body)}));
 return {status:r.status,result:await r.json()};
}
test("new track has chicanes, hairpins, hills, and its own pit lane",()=>{
 assert.ok(ROAD_POINTS.length>=20);
 assert.ok(ROAD.samples.length>=400);
 assert.ok(ROAD.length>400);
 assert.ok(Math.max(...ROAD_POINTS.map(p=>p[2]))-Math.min(...ROAD_POINTS.map(p=>p[2]))>2);
 assert.ok(PIT.samples.length>50);
 assert.ok(ROAD_HALF_WIDTH>3);
 const start=raceStart();
 assert.ok(projectToRoute(start.x,start.z).distance<.1);
 assert.equal(projectToRoute(2200,2200).distance>ROAD_HALF_WIDTH,true);
});
test("server rejects anonymous drivers, shortcuts and teleports without physical gates",async()=>{
 const {race,data}=fixture(),id=user("a");
 assert.equal((await post(race,"/start",{user:"bad"})).status,401);
 const start=await post(race,"/start",{user:id,name:"Test Driver"});
 assert.equal(start.status,200);
 assert.equal(start.result.checkpoints,undefined,"no numbered checkpoint system");
 assert.equal((await post(race,"/finish",{user:id,raceId:start.result.raceId,x:100,z:100})).status,422);
 const far=sampleAt(.48);
 assert.equal((await post(race,"/sample",{user:id,raceId:start.result.raceId,x:far.x,z:far.z})).status,422);
 assert.equal(data.get("road-atlanta-mapped-session-v2:"+id).valid,false);
});
test("continuous telemetry can complete an honest full-lap sequence and persist best time",async()=>{
 const {race,data}=fixture(),id=user("b");
 const started=await post(race,"/start",{user:id,name:"Road Racer"});
 assert.equal(started.status,200);
 const raceId=started.result.raceId;
 for(let i=1;i<=50;i++){
  const pct=i===50?.005:i/50;
  const point=sampleAt(pct);
  const session=data.get("road-atlanta-mapped-session-v2:"+id);
  session.lastAt=Date.now()-2500;session.start=Date.now()-90000;
  data.set("road-atlanta-mapped-session-v2:"+id,session);
  const res=await post(race,"/sample",{user:id,raceId,x:point.x,z:point.z});
  assert.equal(res.status,200,"progress "+pct+" "+JSON.stringify(res.result));
 }
 const finishPoint=sampleAt(.005);
 const completed=await post(race,"/finish",{user:id,raceId,x:finishPoint.x,z:finishPoint.z});
 assert.equal(completed.status,200,JSON.stringify(completed.result));
 assert.equal(completed.result.personalBest,true);
 assert.equal(completed.result.entries[0].name,"Road Racer");
 assert.equal(data.has("road-atlanta-mapped-session-v2:"+id),true,"finished lap must preserve driving session");
 const continued=data.get("road-atlanta-mapped-session-v2:"+id);
 assert.equal(continued.lap,2);
 assert.equal(continued.travel,0);
 assert.equal(continued.crossed,false);
 assert.equal(continued.id,raceId);
 assert.equal(completed.result.nextLap,2);
});
test("new circuit leaderboard does not compare old oval records to new road course",()=>{
 const entries=leaderboardEntries({
  old:{name:"Old Track",bestMs:14000,at:1},
  new:{name:"Extended Track",bestMs:60000,at:2,version:5}
 });
 assert.deepEqual(entries.map(x=>x.name),["Extended Track"]);
});
test("blackjack allows a computer dealer or a real challenger/dealer with 10 Sana each",()=>{
 const game=newBlackjack(),wallets={a:{balance:500},b:{balance:500}};
 joinBlackjack(game,"a","Alice");joinBlackjack(game,"b","Bob");
 game.players.forEach(p=>p.online=true);
 chooseBlackjackMode(game,"person");
 readyBlackjack(game,"a",wallets);readyBlackjack(game,"b",wallets);
 assert.equal(wallets.a.balance,490);assert.equal(wallets.b.balance,490);
 beginBlackjack(game,wallets);
 assert.equal(game.dealerId,"b");
 assert.equal(game.phase,"playing");
 assert.equal(blackjackView(game,"a",{balance:490}).dealer[1],null);
 const challenger=game.players.find(p=>p.id==="a");
 if(challenger.status==="playing")moveBlackjack(game,"a","stand",wallets);
 const dealer=game.players.find(p=>p.id==="b");
 if(dealer.status==="playing")moveBlackjack(game,"b","stand",wallets);
 assert.equal(game.phase,"finished");
 assert.equal(wallets.a.balance+wallets.b.balance,1000,"duel simply redistributes the pot");
 chooseBlackjackMode(game,"computer");
 assert.equal(game.mode,"computer");
});
test("kart UI removes checkpoint arches, uses progress, and shows pit-lane geometry",()=>{
 const client=readFileSync("public/kart-racing.js","utf8");
 const html=readFileSync("public/index.html","utf8");
 const house=readFileSync("public/clubhouse.js","utf8");
 assert.match(client,/ribbon\(visualPit/);
 assert.match(client,/addCircuitGraphics/);
 assert.match(readFileSync("public/kart-graphics.js","utf8"),/const kerbMeshes/);
 assert.match(client,/projectToRoute/);
 assert.doesNotMatch(client,/glowing turquoise checkpoint|GATE_COUNT|turquoise\.*/);
 assert.ok(html.includes('id="kartProgress"'));
 assert.ok(!html.includes('id="kartGate"'));
 assert.match(house,/KartRacing\?\.open/);
 assert.match(html,/blackjackVsPerson/);
});
test("high-quality circuit renders curved corner kerbs, asphalt and painted runoff",()=>{
 const graphics=readFileSync("public/kart-graphics.js","utf8");
 const client=readFileSync("public/kart-racing.js","utf8");
 const html=readFileSync("public/index.html","utf8");
 const clubhouse=readFileSync("public/kart-global-board.js","utf8");
 assert.match(graphics,/kerbWeight/);
 assert.match(graphics,/kerbMeshes/);
 assert.match(graphics,/greenMat/);
 assert.match(graphics,/asphalt=texturedCanvas/);
 assert.match(graphics,/InstancedMesh/);
 assert.match(client,/lapCount=finish\.nextLap/);
 assert.doesNotMatch(client,/playing=false;raceId=null;speed=0;\s*\$\("kartTime"\)/);
 assert.match(classicCheck(html),/id="kartClubLeaderboard"/);
 assert.match(classicCheck(html),/id="kartLap"/);
 assert.match(classicCheck(html),/id="kartLast"/);
 assert.match(clubhouse,/setInterval\(refresh,15000\)/);
});
function classicCheck(value){return value;}
test("cockpit view, realistic metal guardrails and fullscreen race controls are wired",()=>{
 const client=readFileSync("public/kart-racing.js","utf8");
 const safety=readFileSync("public/kart-safety.js","utf8");
 const html=readFileSync("public/index.html","utf8");
 const css=readFileSync("public/kart-racing.css","utf8");
 assert.match(client,/cameraMode==="cockpit"/);
 assert.match(client,/setCameraMode\(cameraMode==="chase"\?"cockpit":"chase"\)/);
 assert.match(client,/addKartSafety\(THREE,scene,ROAD,ROAD_HALF_WIDTH,RUNOFF_WIDTH\)/);
 assert.match(safety,/guardOffset=halfWidth\+runoffWidth\+2\.8/);
 assert.match(safety,/InstancedMesh/);
 assert.match(safety,/steel/);
 assert.match(html,/id="kartCameraToggle"/);
 assert.match(html,/id="kartFullscreen"/);
 assert.match(html,/id="kartCameraLabel"/);
 assert.match(client,/requestFullscreen\(\)/);
 assert.match(client,/document\.exitFullscreen\(\)/);
 assert.match(css,/\.kart-modal:fullscreen/);
});
test("racing kerbs do not slow down, while gravel and grass do",()=>{
 const client=readFileSync("public/kart-racing.js","utf8");
 assert.match(client,/Math\.max\(3\.6,kerbWidth\)/);
 assert.match(client,/surface:"gravel"/);
 assert.match(client,/surface:"grass"/);
 assert.match(client,/if\(grip\.drag>0\)speed\*=Math\.exp\(-grip\.drag\*dt\)/);
 assert.doesNotMatch(client,/onRunoff=projected\.distance>ROAD_HALF_WIDTH-\.2/);
});
test("first-person camera stays forward of driver head with a fixed FOV",()=>{
 const client=readFileSync("public/kart-racing.js","utf8");
 assert.match(client,/camera\.position\.set\(pos\.x\+forwardX\*\.40,pos\.y\+1\.27\+dynamics\.heave\*\.55,pos\.z\+forwardZ\*\.40\)/);
 assert.match(client,/camera\.fov!==73/);
 assert.doesNotMatch(client,/camera\.position\.lerp\(eye/);
 assert.match(client,/cockpitOccluders\.push\(\.\.\.vee\.hiddenInCockpit\)/);
 assert.match(readFileSync("public/kart-gt-car.js","utf8"),/hiddenInCockpit\.push/);
});
test("P toggles pit speed limiter, exposes pit HUD and forwards session telemetry",()=>{
 const client=readFileSync("public/kart-racing.js","utf8");
 const worker=readFileSync("src/worker.js","utf8");
 const html=readFileSync("public/index.html","utf8");
 assert.match(client,/const PIT_LIMIT_MS=11\.1/);
 assert.match(client,/if\(k==="p"\)\{togglePitLimiter\(\)/);
 assert.match(client,/Math\.min\(pitLimiter\?PIT_LIMIT_MS:82,speed\)/);
 assert.match(client,/pit:inPitLane/);
 assert.match(worker,/pit:body\.pit===true/);
 assert.match(html,/id="kartPitLimiter"/);
 assert.match(html,/id="kartPitStatus"/);
});
test("pit entry is recognized as legitimate, discards shortcut lap and resets timer on exit",async()=>{
 const {race,data}=fixture(),id=user("c");
 const started=await post(race,"/start",{user:id,name:"Pit Driver"});
 assert.equal(started.status,200);
 const raceId=started.result.raceId;
 const {PIT}=await import("../public/kart-track.js");
 const pitStart=PIT.samples[0];
 // The finish line is now at the END of the pit straight, so simulate
 // a legal slow approach to PIT IN rather than teleport from the new line.
 const approaching=data.get("road-atlanta-mapped-session-v2:"+id);
 approaching.x=pitStart.x;approaching.z=pitStart.z;
 approaching.lastAt=Date.now()-1000;
 data.set("road-atlanta-mapped-session-v2:"+id,approaching);
 const entry=await post(race,"/sample",{user:id,raceId,pit:true,x:pitStart.x,z:pitStart.z});
 assert.equal(entry.status,200,JSON.stringify(entry.result));
 assert.equal(entry.result.pitEntry,true);
 assert.equal(data.get("road-atlanta-mapped-session-v2:"+id).pitMode,true);
 // Advance the pit car to the paved PIT OUT merge before rejoining;
 // driving directly to the finish line would be an invalid teleport.
 const pitEnd=PIT.samples.at(-1);
 const inPit=data.get("road-atlanta-mapped-session-v2:"+id);
 inPit.x=pitEnd.x;inPit.z=pitEnd.z;
 inPit.lastAt=Date.now()-1000;
 data.set("road-atlanta-mapped-session-v2:"+id,inPit);
 const merge=projectToRoute(pitEnd.x,pitEnd.z);
 const exit=await post(race,"/sample",{user:id,raceId,pit:false,x:merge.x,z:merge.z});
 assert.equal(exit.status,200,JSON.stringify(exit.result));
 assert.equal(exit.result.pitExit,true);
 const after=data.get("road-atlanta-mapped-session-v2:"+id);
 assert.equal(after.pitMode,false);
 assert.equal(after.travel,0);
 assert.equal(after.crossed,false);
});
test("mapped circuit does not invent banking without surveyed crossfall",async()=>{
 const {bankAngle,bankRise,BANK_MAX_DEGREES}=await import("../public/kart-track.js");
 assert.equal(BANK_MAX_DEGREES,0); // No surveyed bank; remove invented oval banking.
 assert.equal(bankAngle(.1),0);
 assert.equal(bankAngle(.55),0);
 assert.equal(Math.abs(bankRise(.55,-4)),0);
 assert.equal(Math.abs(bankRise(.55,4)),0);
 assert.ok(Math.abs(bankRise(.7,4))<1e-12);
 const client=readFileSync("public/kart-racing.js","utf8");
 const graphics=readFileSync("public/kart-graphics.js","utf8");
 assert.match(client,/bankRise\(i\/ps\.length,offset\)/);
 assert.match(client,/bankRise\(projected\.progress,lateral\)/);
 assert.match(graphics,/bankRise\(pt.distance\/ROAD.length,offset\)/);
});
test("live sector UI displays three official timed split values",()=>{
 const client=readFileSync("public/kart-racing.js","utf8");
 const server=readFileSync("src/kart-leaderboard.js","utf8");
 const html=readFileSync("public/index.html","utf8");
 for(let i=1;i<=3;i++)assert.ok(html.includes('id="kartSector'+i+'"'));
 assert.match(client,/showSector\(result\.sectorUpdate\.index,result\.sectorUpdate\.timeMs\)/);
 assert.match(client,/finish\.sectorTimes\.forEach/);
 assert.match(server,/SECTOR_MARKS=\[1\/3,2\/3\]/);
 assert.match(server,/sectorUpdate=\{index:count\+1,timeMs,lap:session\.lap\|\|1\}/);
});
test("all kart, blackjack and worker modules pass syntax checks",()=>{
 for(const p of ["public/kart-safety.js","public/kart-graphics.js","public/kart-global-board.js","public/kart-track.js","src/kart-leaderboard.js","src/blackjack-multiplayer.js","src/poker-table.js","src/worker.js","public/kart-racing.js","public/salon-games.js"])
  execFileSync(process.execPath,["--check",p]);
});
