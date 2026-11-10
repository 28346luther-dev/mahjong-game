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
 assert.equal(projectToRoute(100,100).distance>ROAD_HALF_WIDTH,true);
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
 assert.equal(data.get("kart-session-v3:"+id).valid,false);
});
test("continuous telemetry can complete an honest full-lap sequence and persist best time",async()=>{
 const {race,data}=fixture(),id=user("b");
 const started=await post(race,"/start",{user:id,name:"Road Racer"});
 assert.equal(started.status,200);
 const raceId=started.result.raceId;
 for(let i=1;i<=50;i++){
  const pct=i===50?.005:i/50;
  const point=sampleAt(pct);
  const session=data.get("kart-session-v3:"+id);
  session.lastAt=Date.now()-1300;session.start=Date.now()-MIN_LAP_MS-2000;
  data.set("kart-session-v3:"+id,session);
  const res=await post(race,"/sample",{user:id,raceId,x:point.x,z:point.z});
  assert.equal(res.status,200,"progress "+pct+" "+JSON.stringify(res.result));
 }
 const finishPoint=sampleAt(.005);
 const completed=await post(race,"/finish",{user:id,raceId,x:finishPoint.x,z:finishPoint.z});
 assert.equal(completed.status,200,JSON.stringify(completed.result));
 assert.equal(completed.result.personalBest,true);
 assert.equal(completed.result.entries[0].name,"Road Racer");
 assert.equal(data.has("kart-session-v3:"+id),false);
});
test("new circuit leaderboard does not compare old oval records to new road course",()=>{
 const entries=leaderboardEntries({
  old:{name:"Old Track",bestMs:14000,at:1},
  new:{name:"Extended Track",bestMs:60000,at:2,version:3}
 });
 assert.deepEqual(entries.map(x=>x.name),["Extended Track"]);
});
test("blackjack allows a computer dealer or a real challenger/dealer with 10 Sana each",()=>{
 const game=newBlackjack(),wallets={a:{balance:500},b:{balance:500}};
 joinBlackjack(game,"a","Alice");joinBlackjack(game,"b","Bob");
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
 assert.match(client,/ribbon\(PIT/);
 assert.match(client,/for\(let row=0;row<2;row\+\+\)/);
 assert.match(client,/const kerb=box/);
 assert.match(client,/projectToRoute/);
 assert.doesNotMatch(client,/glowing turquoise checkpoint|GATE_COUNT|turquoise\.*/);
 assert.ok(html.includes('id="kartProgress"'));
 assert.ok(!html.includes('id="kartGate"'));
 assert.match(house,/KartRacing\?\.open/);
 assert.match(html,/blackjackVsPerson/);
});
test("all kart, blackjack and worker modules pass syntax checks",()=>{
 for(const p of ["public/kart-track.js","src/kart-leaderboard.js","src/blackjack-multiplayer.js","src/poker-table.js","src/worker.js","public/kart-racing.js","public/salon-games.js"])
  execFileSync(process.execPath,["--check",p]);
});
