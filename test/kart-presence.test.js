import test from 'node:test';
import assert from 'node:assert/strict';
import {handleKartPresence,activeCounts,PRESENCE_TTL_MS} from '../src/kart-presence.js';
import {activeEventId,QUALIFY_MS,START_LIGHTS_MS} from '../src/kart-race-events.js';
import {raceAnnouncement,playerCountText} from '../public/kart-activity.js';
const user=n=>n.repeat(64),client=n=>n.repeat(32);
function fixture(){const data=new Map();return {data,storage:{get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v))}};}
const request=body=>new Request('https://kart/presence',{method:'POST',body:JSON.stringify(body)});
test('presence counts modes, deduplicates account tabs, and removes only the departed lease',async()=>{
 const {storage}=fixture();
 for(const [id,mode] of [['a','preLobby'],['b','raceLobby'],['c','timeTrial'],['d','racing']])
  assert.equal((await handleKartPresence(request({user:user(id),client:client('1'),mode}),storage)).status,200);
 let snapshot=await (await handleKartPresence(request({user:user('c'),client:client('2'),mode:'preLobby'}),storage)).json();
 assert.deepEqual(snapshot.counts,{preLobby:1,raceLobby:1,timeTrial:1,racing:1,total:4,driving:2});
 snapshot=await (await handleKartPresence(request({user:user('c'),client:client('2'),mode:null}),storage)).json();
 assert.equal(snapshot.counts.timeTrial,1);assert.equal(snapshot.counts.total,4);
 snapshot=await (await handleKartPresence(request({user:user('c'),client:client('1'),mode:null}),storage)).json();
 assert.equal(snapshot.counts.timeTrial,0);assert.equal(snapshot.counts.total,3);
 assert.match(playerCountText(snapshot.counts),/Pre-lobby: 1.*Race lobby: 1.*Racing: 1.*Time Trial: 0/);
});
test('disconnected presence expires without permanently counting offline drivers',()=>{
 const leases={a:{user:user('a'),mode:'racing',at:1000},b:{user:user('b'),mode:'timeTrial',at:2000}};
 assert.equal(activeCounts(leases,1000+PRESENCE_TTL_MS).driving,1);
 assert.equal(activeCounts(leases,2000+PRESENCE_TTL_MS).total,0);
});
test('activity uses lights-out time and actual registered entries for the next race',async()=>{
 const original=Date.now,{data,storage}=fixture(),base=activeEventId(original());
 try{
  Date.now=()=>base+QUALIFY_MS+START_LIGHTS_MS-60000;
  data.set('meeting:'+base,{players:[{id:user('a')},{id:user('b')}]});
  const response=await handleKartPresence(new Request('https://kart/activity'),storage),snapshot=await response.json();
  assert.equal(response.status,200);assert.equal(snapshot.nextRace.startsAt,base+QUALIFY_MS+START_LIGHTS_MS);
  assert.equal(snapshot.nextRace.registered,2);
  snapshot.counts.driving=7;
  assert.equal(raceAnnouncement(snapshot,Date.now()).text,'Next race is starting in 1 Minute, there are 7 players racing right now. Join the race lobby to race.');
  assert.equal(raceAnnouncement(snapshot,Date.now()-1),null);
  assert.equal(raceAnnouncement(snapshot,base+QUALIFY_MS),null,'do not invite registration after it closes');
  assert.equal(raceAnnouncement(snapshot,snapshot.nextRace.startsAt),null);
 }finally{Date.now=original;}
});
test('presence rejects missing identities and invalid activities',async()=>{
 const {storage}=fixture();
 assert.equal((await handleKartPresence(request(null),storage)).status,400);
 assert.equal((await handleKartPresence(request({user:'forged',client:client('1'),mode:'racing'}),storage)).status,401);
 assert.equal((await handleKartPresence(request({user:user('a'),client:client('1'),mode:'fake'}),storage)).status,400);
});
