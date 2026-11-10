import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {KartLeaderboard,MIN_LAP_MS} from "../src/kart-leaderboard.js";
import {sampleAt} from "../public/kart-track.js";
const id="a".repeat(64);
function harness(){
 const db=new Map();
 const storage={
  async get(k){return db.get(k);},
  async put(k,v){db.set(k,structuredClone(v));},
  async delete(k){db.delete(k);},
  async transaction(fn){return fn(this);}
 };
 return {race:new KartLeaderboard({storage}),db};
}
async function post(race,path,args){
 const res=await race.fetch(new Request("https://kart"+path,{method:"POST",
  body:JSON.stringify({user:id,...args})}));
 return {status:res.status,payload:await res.json()};
}
async function lap(race,db,raceId){
 for(let i=1;i<=50;i++){
  const pct=i===50?.005:i/50;
  const sample=sampleAt(pct);
  const s=db.get("kart-session-v3:"+id);
  s.lastAt=Date.now()-1300;
  s.lapStart=Date.now()-MIN_LAP_MS-4000;
  db.set("kart-session-v3:"+id,s);
  const r=await post(race,"/sample",{raceId,x:sample.x,z:sample.z});
  assert.equal(r.status,200,JSON.stringify(r.payload));
 }
 const point=sampleAt(.005);
 return post(race,"/finish",{raceId,x:point.x,z:point.z});
}
test("continuous race records lap 1 and lap 2 without a restart",async()=>{
 const {race,db}=harness();
 const started=await post(race,"/start",{name:"Circuit Racer"});
 assert.equal(started.status,200);
 const raceId=started.payload.raceId;
 const first=await lap(race,db,raceId);
 assert.equal(first.status,200,JSON.stringify(first.payload));
 assert.equal(first.payload.nextLap,2);
 assert.equal(first.payload.lapNumber,1);
 assert.equal(db.has("kart-session-v3:"+id),true);
 const second=await lap(race,db,raceId);
 assert.equal(second.status,200,JSON.stringify(second.payload));
 assert.equal(second.payload.nextLap,3);
 assert.equal(second.payload.lapNumber,2);
 const board=await race.fetch(new Request("https://kart/leaderboard"));
 const data=await board.json();
 assert.equal(data.entries.length,1,"only best lap per user appears globally");
 assert.equal(data.unlimitedLaps,true);
 assert.ok(data.entries[0].bestMs<=Math.max(first.payload.elapsedMs,second.payload.elapsedMs));
});
test("graphics use real curved curb ribbons, painted runoff, textures, lights and instancing",()=>{
 const art=readFileSync("public/kart-graphics.js","utf8");
 const game=readFileSync("public/kart-racing.js","utf8");
 const html=readFileSync("public/index.html","utf8");
 for(const term of ["cornerKerbs","quads(","surfaceTexture","InstancedMesh","ROAD_HALF_WIDTH+3.4"])
  assert.ok(art.includes(term),term);
 assert.match(game,/enhanceCircuit\(THREE,scene\)/);
 assert.match(game,/renderer\.shadowMap\.enabled=true/);
 assert.match(game,/TorusGeometry/);
 assert.match(game,/setInterval\(\(\)=>\{if\(active\)leaderboard\(\);\},12000\)/);
 assert.match(html,/id="kartLap"/);
 assert.match(html,/id="kartLast"/);
});
