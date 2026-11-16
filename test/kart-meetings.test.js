import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {activeEventId,eventPhase,scheduledEvents,eventSnapshot,handleRaceEvent,
 EVENT_INTERVAL_MS,QUALIFY_MS,RACE_LAPS,PIT_SERVICE_MS} from "../src/kart-race-events.js";
import {PIT_BAYS,BANK_MAX_DEGREES,ROAD,PIT,projectToRoute,sampleAt} from "../public/kart-track.js";
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
test("meetings launch every ten minutes with two-minute qualification and three-lap racing",()=>{
 const origin=activeEventId(1790000000000);
 assert.equal(EVENT_INTERVAL_MS,600000);assert.equal(QUALIFY_MS,120000);
 assert.equal(PIT_SERVICE_MS,10000);assert.equal(RACE_LAPS,3);
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
 const car=readFileSync("public/kart-gt-car.js","utf8");
 const client=readFileSync("public/kart-racing.js","utf8");
 const meetings=readFileSync("public/kart-meetings.js","utf8");
 const graphics=readFileSync("public/kart-meetings.css","utf8");
 const pit=readFileSync("public/kart-pit-complex.js","utf8");
 const html=readFileSync("public/index.html","utf8");
 assert.match(car,/export function createGTCar/);
 assert.match(car,/hiddenInCockpit/);assert.match(car,/wheel/);
 assert.match(client,/createGTCar/);assert.match(client,/createRival/);
 assert.match(client,/addPitComplex/);
 assert.match(pit,/garage|roll-up|roll.up/i);
 assert.match(meetings,/sectorUpdate/);
 assert.match(graphics,/sector-chip\.purple/);
 assert.match(graphics,/sector-chip\.green/);
 assert.match(graphics,/sector-chip\.yellow/);
 for(const id of ["kartEventList","kartMeetingRegister","kartPitService","kartServiceCountdown","kartMeetingRoster"])
  assert.ok(html.includes('id="'+id+'"'));
 assert.equal(BANK_MAX_DEGREES,0); // No surveyed bank; remove invented oval banking.
 assert.equal(PIT_BAYS.length,4);
});
test("all new racing source parses",()=>{
 for(const path of ["src/kart-race-events.js","src/kart-leaderboard.js","src/worker.js",
  "public/kart-formula-vee.js","public/kart-pit-complex.js","public/kart-track.js",
  "public/kart-racing.js","public/kart-meetings.js"])
  execFileSync(process.execPath,["--check",path]);
});
test('third verified race lap finishes the race and snapshots include live motion',async()=>{
 const {storage,data}=fixture(),original=Date.now,base=activeEventId(original())+EVENT_INTERVAL_MS,id=user('e');
 try{
  Date.now=()=>base-1000;
  await request(storage,'/event/register',{eventId:base,user:id,name:'Three laps'});
  Date.now=()=>base+QUALIFY_MS+100000;
  await request(storage,'/event/state',{eventId:base,user:id});
  const meeting=data.get('meeting:'+base),driver=meeting.players[0],point=sampleAt(.99);
  Object.assign(driver,{x:point.x,z:point.z,progress:.99,travel:.95,lap:2,lapStarted:Date.now()-80000,lastAt:Date.now()-1000,pitComplete:true});
  data.set('meeting:'+base,meeting);
  const finish=sampleAt(.005),response=await request(storage,'/event/sample',{eventId:base,user:id,...finish,yaw:1.2,speed:40});
  assert.equal(response.status,200,JSON.stringify(response.result));
  assert.equal(response.result.laps,3);
  const racer=response.result.racers.find(p=>p.id===id);
  assert.equal(racer.lap,3);assert.ok(racer.finishedAt);assert.equal(racer.speed,40);assert.equal(racer.yaw,1.2);
 }finally{Date.now=original;}
});
test('leader opens the chequered flag; following crossings finish lapped cars in lap order',async()=>{
 const {storage,data}=fixture(),original=Date.now,base=activeEventId(original())+EVENT_INTERVAL_MS;
 const drivers=['a','b','c','d','e'].map(user);let clock=base+QUALIFY_MS+240000;
 try{
  Date.now=()=>base-1000;
  for(const id of drivers)await request(storage,'/event/register',{eventId:base,user:id,name:id[0]});
  Date.now=()=>clock;await request(storage,'/event/state',{eventId:base,user:drivers[0]});
  function line(id,lap,travel=.95){
   const m=data.get('meeting:'+base),p=m.players.find(p=>p.id===id),point=sampleAt(.99);
   Object.assign(p,{...point,lap,progress:.99,travel,lapStarted:clock-80000,lastAt:clock-3000,pitComplete:true,startedDriving:true});
   data.set('meeting:'+base,m);
  }
  async function cross(id){clock+=1000;return request(storage,'/event/sample',{eventId:base,user:id,...sampleAt(.005),speed:35});}
  line(drivers[1],1);
  let response=await cross(drivers[1]);
  assert.equal(response.status,200);assert.equal(response.result.chequeredAt,null);
  assert.equal(response.result.racers.find(p=>p.id===drivers[1]).finishedAt,null,'crossing before leader does not finish');
  line(drivers[0],2);response=await cross(drivers[0]);
  const flag=clock;assert.equal(response.result.chequeredAt,flag);assert.equal(response.result.chequeredBy,drivers[0]);
  assert.equal(response.result.racers.find(p=>p.id===drivers[0]).finishedMs,flag-(base+QUALIFY_MS+8000),'race time begins at lights out');
  line(drivers[2],0);response=await cross(drivers[2]);
  assert.ok(response.result.racers.find(p=>p.id===drivers[2]).finishedAt,'lapped driver finishes at next crossing');
  line(drivers[1],2);response=await cross(drivers[1]);
  assert.deepEqual(response.result.racers.slice(0,3).map(p=>p.id),drivers.slice(0,3),'lapped finisher cannot beat the second driver on three laps');
  line(drivers[3],0,.2);response=await cross(drivers[3]);
  assert.ok(response.result.racers.find(p=>p.id===drivers[3]).finishedAt,'pit-interrupted lap still ends at the flag');
  line(drivers[4],0);
  response=await request(storage,'/event/sample',{eventId:base,user:drivers[4],...sampleAt(.995),speed:35});
  assert.equal(response.result.racers.find(p=>p.id===drivers[4]).finishedAt,null,'flag does not stop a driver before crossing');
  const m=data.get('meeting:'+base);m.players.find(p=>p.id===drivers[4]).pitComplete=false;data.set('meeting:'+base,m);
  response=await cross(drivers[4]);assert.equal(response.result.racers.at(-1).disqualified,true,'mandatory pit rule still applies');
  assert.equal(response.result.chequeredAt,flag,'the original flag time remains fixed');
 }finally{Date.now=original;}
});
test('race entries store an allowed car choice and duplicate registration cannot change it',async()=>{
 const {storage}=fixture(),original=Date.now,base=activeEventId(original())+EVENT_INTERVAL_MS;
 try{
  Date.now=()=>base-1000;
  let response=await request(storage,'/event/register',{eventId:base,user:user('a'),carId:'nova'});
  assert.equal(response.result.racers[0].carId,'nova');
  response=await request(storage,'/event/register',{eventId:base,user:user('a'),carId:'falcon'});
  assert.equal(response.result.racers[0].carId,'nova');
  response=await request(storage,'/event/register',{eventId:base,user:user('b'),carId:'../../bad'});
  assert.equal(response.result.racers.find(p=>p.id===user('b')).carId,'apex');
  Date.now=()=>base+QUALIFY_MS+9000;
  response=await request(storage,'/event/state',{eventId:base,user:user('a')});
  assert.equal(response.result.racers.find(p=>p.id===user('a')).carId,'nova');
 }finally{Date.now=original;}
});

test('a driver crossing the pit-lane timing line after the leader also finishes',async()=>{
 const {storage,data}=fixture(),original=Date.now,base=activeEventId(original())+EVENT_INTERVAL_MS,id=user('a');
 try{
  Date.now=()=>base-1000;await request(storage,'/event/register',{eventId:base,user:id});
  Date.now=()=>base+QUALIFY_MS+240000;await request(storage,'/event/state',{eventId:base,user:id});
  const meeting=data.get('meeting:'+base),before=sampleAt(.55,PIT),after=sampleAt(.57,PIT);
  meeting.chequeredAt=Date.now()-1000;meeting.chequeredBy=user('b');
  Object.assign(meeting.players[0],{...before,pitMode:true,pitComplete:true,lap:1,lastAt:Date.now()-3000,progress:projectToRoute(before.x,before.z).progress});
  data.set('meeting:'+base,meeting);
  const response=await request(storage,'/event/sample',{eventId:base,user:id,...after,pit:true,speed:10});
  assert.equal(response.status,200);assert.ok(response.result.racers[0].finishedAt);assert.equal(response.result.racers[0].disqualified,false);
 }finally{Date.now=original;}
});
