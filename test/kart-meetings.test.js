import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {activeEventId,eventPhase,scheduledEvents,eventSnapshot,handleRaceEvent,
 EVENT_INTERVAL_MS,QUALIFY_MS,RACE_LAPS,PIT_SERVICE_MS} from "../src/kart-race-events.js";
import {PIT_BAYS,BANK_MAX_DEGREES,ROAD,projectToRoute,sampleAt} from "../public/kart-track.js";
function fixture(){
 const data=new Map(),storage={
  async get(key){return data.get(key);},
  async put(key,value){data.set(key,structuredClone(value));},
  async delete(key){data.delete(key);},
  async transaction(callback){return callback(this);}
 };
 return {data,storage};
}
async function request(storage,path,body={}){
 const response=await handleRaceEvent(new Request("https://kart"+path,{
  method:"POST",body:JSON.stringify(body)
 }),storage);
 return {status:response.status,result:await response.json()};
}
const user=(c)=>c.repeat(64);
test("meetings launch every ten minutes with two-minute qualification and ten-lap racing",()=>{
 const origin=activeEventId(1790000000000);
 assert.equal(EVENT_INTERVAL_MS,600000);assert.equal(QUALIFY_MS,120000);
 assert.equal(PIT_SERVICE_MS,10000);assert.equal(RACE_LAPS,10);
 assert.equal(eventPhase(origin,origin-10),"registration");
 assert.equal(eventPhase(origin,origin+119999),"qualifying");
 assert.equal(eventPhase(origin,origin+120000),"grid");
 assert.equal(eventPhase(origin,origin+127999),"grid");
 assert.equal(eventPhase(origin,origin+128000),"race");
 const events=scheduledEvents(origin+35000);
 assert.ok(events.some(e=>e.id===origin));
 assert.ok(events.some(e=>e.id===origin+600000));
});
test("register drivers and schedule real qualifying classifications",async()=>{
 const {storage,data}=fixture(),original=Date.now,base=activeEventId(original())+EVENT_INTERVAL_MS;
 try{
  Date.now=()=>base-20000;
  const a=await request(storage,"/event/register",{eventId:base,user:user("a"),name:"Vee driver"});
  const b=await request(storage,"/event/register",{eventId:base,user:user("b"),name:"Other racer"});
  assert.equal(a.status,200);assert.equal(b.status,200);
  assert.equal(b.result.registered,2);
  assert.equal(b.result.phase,"registration");
  const duplicate=await request(storage,"/event/register",{eventId:base,user:user("a"),name:"Vee driver"});
  assert.equal(duplicate.result.registered,2);
  const meeting=data.get("meeting:"+base);
  meeting.players[0].qualifiedMs=63500;
  meeting.players[1].qualifiedMs=61000;
  data.set("meeting:"+base,meeting);
  Date.now=()=>base+120100;
  const grid=await request(storage,"/event/state",{eventId:base,user:user("a")});
  assert.equal(grid.status,200);assert.equal(grid.result.phase,"grid");
  assert.equal(grid.result.redLights,1);
  assert.equal(grid.result.lightsOutAt,base+128000);
  const drivers=grid.result.racers;
  assert.equal(drivers[0].name,"Other racer");
  assert.equal(drivers[0].grid,1);
  assert.equal(drivers[1].grid,2);
  assert.ok(drivers.every(d=>projectToRoute(d.x,d.z).distance<3.9));
  assert.ok(Math.hypot(drivers[0].x-drivers[1].x,drivers[0].z-drivers[1].z)>2);
 }finally{Date.now=original;}
});
test("pit stop needs a marked bay, zero speed and ten seconds of service",async()=>{
 const {storage,data}=fixture(),original=Date.now,base=activeEventId(original())+EVENT_INTERVAL_MS;
 const id=user("c"),bay=PIT_BAYS[0];
 try{
  Date.now=()=>base-5000;
  assert.equal((await request(storage,"/event/register",{eventId:base,user:id,name:"Racer"})).status,200);
  Date.now=()=>base+QUALIFY_MS+9000;
  const first=await request(storage,"/event/state",{eventId:base,user:id});
  assert.equal(first.status,200);
  const meeting=data.get("meeting:"+base);
  const racer=meeting.players[0];
  racer.pitMode=true;racer.x=bay.x;racer.z=bay.z;
  racer.lastAt=Date.now()-1000;
  data.set("meeting:"+base,meeting);
  const invalid=await request(storage,"/event/pit",{eventId:base,user:id,bay:0,x:bay.x,z:bay.z,speed:2});
  assert.equal(invalid.status,422);
  const stop=await request(storage,"/event/pit",{eventId:base,user:id,bay:0,x:bay.x,z:bay.z,speed:0});
  assert.equal(stop.status,200,JSON.stringify(stop.result));
  assert.equal(stop.result.serviceUntil,Date.now()+10000);
  const waiting=await request(storage,"/event/sample",{eventId:base,user:id,pit:true,x:bay.x,z:bay.z,speed:0});
  assert.equal(waiting.status,200);assert.ok(waiting.result.pitServiceRemainingMs>0);
  Date.now=()=>base+QUALIFY_MS+20000;
  const finished=await request(storage,"/event/sample",{eventId:base,user:id,pit:true,x:bay.x,z:bay.z,speed:0});
  assert.equal(finished.status,200,JSON.stringify(finished.result));
  assert.equal(data.get("meeting:"+base).players[0].pitComplete,true);
 }finally{Date.now=original;}
});
test("racing sectors use purple, green and yellow session comparisons",async()=>{
 const {storage}=fixture(),original=Date.now,base=activeEventId(original())+EVENT_INTERVAL_MS;
 const id=user("d");
 try{
  Date.now=()=>base-1000;
  await request(storage,"/event/register",{eventId:base,user:id,name:"Racer"});
  Date.now=()=>base+2000;
  await request(storage,"/event/state",{eventId:base,user:id});
  const sectors=[];
  // Advance along actual road geometry in small legal telemetry increments.
  for(let i=1;i<=14;i++){
   Date.now=()=>base+2000+i*7500;
   const point=sampleAt(i*.05);
   const step=await request(storage,"/event/sample",{eventId:base,user:id,x:point.x,z:point.z,speed:12});
   assert.equal(step.status,200,"sample "+i+" "+JSON.stringify(step.result));
   if(step.result.sectorUpdate)sectors.push(step.result.sectorUpdate);
  }
  assert.deepEqual(sectors.map(x=>x.index),[1,2]);
  assert.deepEqual(sectors.map(x=>x.color),["purple","purple"]);
 }finally{Date.now=original;}
});
test("Formula Vee cars, remote rivals, pit facilities and broadcast HUD are wired",()=>{
 const car=readFileSync("public/kart-formula-vee.js","utf8");
 const client=readFileSync("public/kart-racing.js","utf8");
 const meetings=readFileSync("public/kart-meetings.js","utf8");
 const graphics=readFileSync("public/kart-meetings.css","utf8");
 const pit=readFileSync("public/kart-pit-complex.js","utf8");
 const html=readFileSync("public/index.html","utf8");
 assert.match(car,/export function createFormulaVee/);
 assert.match(car,/hiddenInCockpit/);assert.match(car,/wishbones/);
 assert.match(client,/createFormulaVee/);assert.match(client,/createRival/);
 assert.match(client,/addPitComplex/);
 assert.match(pit,/garage|roll-up|roll.up/i);
 assert.match(meetings,/sectorUpdate/);
 assert.match(graphics,/sector-chip\.purple/);
 assert.match(graphics,/sector-chip\.green/);
 assert.match(graphics,/sector-chip\.yellow/);
 for(const id of ["kartEventList","kartMeetingRegister","kartPitService","kartServiceCountdown","kartMeetingRoster"])
  assert.ok(html.includes('id="'+id+'"'));
 assert.ok(BANK_MAX_DEGREES>=15);
 assert.equal(PIT_BAYS.length,4);
});
test("all new racing source parses",()=>{
 for(const path of ["src/kart-race-events.js","src/kart-leaderboard.js","src/worker.js",
  "public/kart-formula-vee.js","public/kart-pit-complex.js","public/kart-track.js",
  "public/kart-racing.js","public/kart-meetings.js"])
  execFileSync(process.execPath,["--check",path]);
});
