import test from 'node:test';
import assert from 'node:assert/strict';
import {KartLive} from '../src/kart-live.js';
import {QUALIFY_MS,EVENT_INTERVAL_MS} from '../src/kart-race-events.js';
import {raceStart} from '../public/kart-track.js';
function fixture(){
 const values=new Map(),writes=[];
 const ctx={storage:{async get(k){return structuredClone(values.get(k));},async put(k,v){writes.push(k);values.set(k,structuredClone(v));},async setAlarm(){}},getWebSockets:()=>[]};
 return {live:new KartLive(ctx),values,writes};
}
const request=(path,body)=>new Request('https://kart'+path,{method:'POST',body:JSON.stringify(body)});
test('100ms race samples stay in memory, overlap is allowed, disconnect checkpoints restore',async()=>{
 const oldNow=Date.now,base=Math.floor(oldNow()/EVENT_INTERVAL_MS)*EVENT_INTERVAL_MS;
 try{
  Date.now=()=>base-1000;
  const {live,values,writes}=fixture(),a='a'.repeat(64),b='b'.repeat(64);
  for(const user of [a,b])assert.equal((await live.handle(request('/event/register',{eventId:base,user,name:user[0]}))).status,200);
  Date.now=()=>base+QUALIFY_MS+9000;
  await live.handle(request('/event/state',{eventId:base,user:a}));
  const meeting=await live.get('meeting:'+base),point=raceStart();
  for(const p of meeting.players)Object.assign(p,{x:point.x,z:point.z,lastAt:Date.now(),startedDriving:true});
  await live.put('meeting:'+base,meeting);await live.flush(true);
  const before=writes.length;
  for(let n=0;n<20;n++){
   Date.now=()=>base+QUALIFY_MS+9100+n*100;
   for(const user of [a,b]){
    const response=await live.handle(request('/event/sample',{eventId:base,user,x:point.x,z:point.z,yaw:0,speed:0}));
    assert.equal(response.status,200,await response.text());
   }
  }
  assert.equal(writes.length,before,'no SQLite writes for forty pose samples');
  await live.close();assert.ok(writes.length>before);
  const restored=new KartLive({storage:{async get(k){return values.get(k);}}});
  assert.equal((await restored.get('meeting:'+base)).players[0].lastAt,Date.now());
 }finally{Date.now=oldNow;}
});
test('socket identity cannot be overridden and oversized messages close',async()=>{
 const {live}=fixture(),packets=[],user='a'.repeat(64);
 live.handle=async req=>{packets.push(await req.json());return Response.json({ok:true});};
 const closes=[],ws={deserializeAttachment:()=>({user,eventId:123,expires:Date.now()+1000}),close:(...args)=>closes.push(args)};
 await live.message(ws,JSON.stringify({type:'sample',user:'b'.repeat(64),eventId:456,x:1,z:2}));
 assert.equal(packets[0].user,user);assert.equal(packets[0].eventId,123);
 await live.message(ws,'x'.repeat(2049));assert.equal(closes[0][0],1009);
});
test('broadcast timers stop with finished or disconnected drivers; registration uses an alarm',async()=>{
 const {live}=fixture();let sockets=[],alarm=null;
 live.ctx.getWebSockets=()=>sockets;live.ctx.storage.setAlarm=async at=>{alarm=at;};
 const user='a'.repeat(64),eventId=Date.now()+60000;
 const ws={readyState:1,deserializeAttachment:()=>({user,eventId,expires:Date.now()+600000}),send:()=>{}};
 sockets=[ws];
 let phase='race',finishedAt=null;
 live.handle=async()=>Response.json({phase,qualifyingAt:eventId,racers:[{id:user,finishedAt}]});
 await live.broadcast();assert.ok(live.timer,'connected racing driver gets 100ms broadcasts');
 sockets=[];await live.close();assert.equal(live.timer,null,'disconnect clears pending timer');
 sockets=[ws];finishedAt=Date.now();await live.broadcast();assert.equal(live.timer,null,'finished race has no broadcast loop');
 phase='registration';await live.broadcast();assert.equal(live.timer,null);assert.equal(alarm,eventId);
});
