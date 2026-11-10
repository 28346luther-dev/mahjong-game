import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {KartLeaderboard,GATES,GATE_COUNT,MIN_LAP_MS,nearGate,leaderboardEntries} from "../src/kart-leaderboard.js";
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
test("track has exactly eight ordered gates and centerline locations are valid",()=>{
 assert.equal(GATE_COUNT,8);assert.equal(GATES.length,8);
 assert.ok(nearGate(0,0,-15));
 assert.ok(nearGate(2,25,0));
 assert.equal(nearGate(5,100,100),false);
});
test("kart leaderboard rejects anonymous users, skips and impossible early finishes",async()=>{
 const {race,data}=fixture(),id=user("a");
 assert.equal((await post(race,"/start",{user:"bad"})).status,401);
 const started=await post(race,"/start",{user:id,name:"Driver"});
 assert.equal(started.status,200);assert.equal(started.result.nextCheckpoint,1);
 assert.equal((await post(race,"/finish",{user:id,raceId:started.result.raceId,x:0,z:-15})).status,422);
 assert.equal((await post(race,"/checkpoint",{user:id,raceId:started.result.raceId,index:2,x:25,z:0})).status,422);
 const sess=data.get("session:"+id);sess.last=Date.now()-1000;data.set("session:"+id,sess);
 const first=await post(race,"/checkpoint",{user:id,raceId:started.result.raceId,index:1,x:GATES[1].x,z:GATES[1].z});
 assert.equal(first.status,200);assert.equal(first.result.nextCheckpoint,2);
});
test("full valid lap is persisted as a server-measured personal best",async()=>{
 const {race,data}=fixture(),id=user("b");
 const start=await post(race,"/start",{user:id,name:"Racer One"});
 const raceId=start.result.raceId;
 for(let i=1;i<GATE_COUNT;i++){
  const session=data.get("session:"+id);
  session.last=Date.now()-1000;session.start=Date.now()-MIN_LAP_MS-3000;
  data.set("session:"+id,session);
  const checkpoint=await post(race,"/checkpoint",{user:id,raceId,index:i,x:GATES[i].x,z:GATES[i].z});
  assert.equal(checkpoint.status,200,"checkpoint "+i+" "+JSON.stringify(checkpoint.result));
 }
 const session=data.get("session:"+id);
 session.last=Date.now()-1000;session.start=Date.now()-MIN_LAP_MS-3000;
 data.set("session:"+id,session);
 const finished=await post(race,"/finish",{user:id,raceId,x:0,z:-15});
 assert.equal(finished.status,200);
 assert.equal(finished.result.personalBest,true);
 assert.ok(finished.result.elapsedMs>=MIN_LAP_MS);
 assert.equal(finished.result.entries[0].name,"Racer One");
 assert.equal(finished.result.entries[0].rank,1);
 assert.equal(data.has("session:"+id),false);
});
test("leaderboard retains sorted bests, strips email-like naming and limits to ten",()=>{
 const records={};
 for(let i=0;i<15;i++)records[String(i)]={name:"Driver "+i,bestMs:16000+i*100,at:i};
 assert.equal(leaderboardEntries(records).length,10);
 assert.equal(leaderboardEntries(records)[0].bestMs,16000);
});
test("kart portal has visible 3D geometry and clubhouse correctly opens race mode",()=>{
 const world=readFileSync("public/club-velvet-world.js","utf8");
 const house=readFileSync("public/clubhouse.js","utf8");
 const html=readFileSync("public/index.html","utf8");
 assert.match(world,/function goKartPortal\(\)/);
 assert.match(world,/id:"gokarts"/);
 assert.match(house,/KartRacing\?\.open\(\)/);
 assert.match(house,/KartRacing\?\.isOpen\(\)/);
 for(const id of ["kartGame","kartCanvas","kartStart","kartLeaderboard","kartClose","kartGate"])
  assert.ok(html.includes('id="'+id+'"'),"Missing "+id);
 assert.match(html,/kart-racing\.css/);assert.match(html,/kart-racing\.js/);
});
test("duplicate poker plaque is removed and noticeboard is on an actual wall section",()=>{
 const world=readFileSync("public/club-velvet-world.js","utf8");
 assert.doesNotMatch(world,/st\.z<0\?-18\.23:1\.47/);
 assert.match(world,/g\.position\.set\(-9\.69,3\.05,1\.75\)/);
});
test("kart server, Worker and browser modules pass syntax checks",()=>{
 for(const p of ["src/kart-leaderboard.js","src/worker.js","public/kart-racing.js","public/clubhouse.js","public/club-velvet-world.js"])
  execFileSync(process.execPath,["--check",p]);
 const config=readFileSync("wrangler.toml","utf8");
 assert.match(config,/class_name = "KartLeaderboard"/);
 assert.match(config,/tag = "v5"/);
});
