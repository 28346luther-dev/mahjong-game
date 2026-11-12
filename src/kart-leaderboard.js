import {handleRaceEvent} from "./kart-race-events.js";
import {ROAD,PIT,PIT_HALF_WIDTH,ROAD_HALF_WIDTH,RUNOFF_WIDTH,TRACK_NAME,projectToRoute,raceStart} from "../public/kart-track.js";

// Continuous on-road progress verification. No checkpoint gates or checkpoints UI.
// Times use server wall-clock, and accepted samples must stay near the circuit
// and travel plausible distances. This is an arcade leaderboard, not anti-cheat proof.
export const MIN_LAP_MS=1; // Accept any positive, server-verified full lap.
export const MAX_LAP_MS=10*60*1000;
export const MAX_SPEED_MPS=105;
export const SECTOR_MARKS=[1/3,2/3];
export function sanitizeDriverName(name){
 return String(name||"Racer").replace(/[^\p{L}\p{N} _.-]/gu,"").trim().slice(0,22)||"Racer";
}
export function leaderboardEntries(records,limit=10){
 return Object.entries(records).map(([id,r])=>({id,name:r.name,bestMs:r.bestMs,at:r.at,version:r.version||1}))
  .filter(r=>Number.isInteger(r.bestMs)&&r.bestMs>=MIN_LAP_MS&&r.bestMs<=MAX_LAP_MS&&r.version===4)
  .sort((a,b)=>a.bestMs-b.bestMs||a.at-b.at).slice(0,limit)
  .map((r,i)=>({rank:i+1,name:r.name,bestMs:r.bestMs,at:r.at}));
}
export function validateSample(session,x,z,now){
 if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>2500||Math.abs(z)>2500)
  return {error:"Invalid kart position"};
 const road=projectToRoute(x,z);
 if(road.distance>ROAD_HALF_WIDTH+RUNOFF_WIDTH)return {error:"Stay on the race track for a valid lap"};
 const dt=now-session.lastAt;
 if(dt<0)return {error:"Invalid race clock"};
 const moved=Math.hypot(x-session.x,z-session.z);
 // One half-second telemetry interval at 12.6 m/s covers ~6 metres.
 if(moved>MAX_SPEED_MPS*dt/1000+7)
  return {error:"Lap rejected: position changed too quickly"};
 const old=session.progress,p=road.progress;
 let delta=p-old;
 // Finish line seam: 0.98 -> 0.01 means a forward crossing.
 if(delta<-.7)delta+=1;
 if(delta>.7)delta-=1;
 if(delta>0.10)return {error:"Lap rejected: progress jumped too far"};
 if(delta<-.08)return {error:"Lap rejected: reverse shortcut"};
 return {progress:p,delta,complete:old>.94&&p<.06&&delta>=0};
}
export class KartLeaderboard {
 constructor(ctx){this.ctx=ctx;this.storage=ctx.storage;}
 async read(){return await this.storage.get("road-atlanta-best-times-v1")||{};}
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==="/events"||url.pathname.startsWith("/event/"))return handleRaceEvent(request,this.storage);
  if(request.method==="GET"&&url.pathname==="/leaderboard"){
   const records=await this.read();
   return Response.json({track:TRACK_NAME,laps:"unlimited",entries:leaderboardEntries(records)},
    {headers:{"cache-control":"no-store"}});
  }
  if(request.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
  let body;try{body=await request.json();}catch{return Response.json({error:"Invalid request"},{status:400});}
  const id=String(body.user||"");
  if(!/^[a-f0-9]{64}$/.test(id))return Response.json({error:"Sign in required"},{status:401});
  const now=Date.now();
  if(url.pathname==="/start"){
   const start=raceStart();
   const s={id:crypto.randomUUID(),name:sanitizeDriverName(body.name),
    start:now,lastAt:now,lastAtProgress:0,x:start.x,z:start.z,
    progress:0,travel:0,valid:true,lap:1,crossed:false,sectorTimes:[],sectorLastAt:now};
   await this.storage.put("road-atlanta-kart-session-v1:"+id,s);
   return Response.json({ok:true,raceId:s.id,startedAt:s.start,
    trackLength:Math.round(ROAD.length),bestMs:(await this.read())[id]?.bestMs??null});
  }
  const key="road-atlanta-kart-session-v1:"+id,session=await this.storage.get(key);
  if(!session||session.id!==body.raceId)
   return Response.json({error:"No active lap. Start a new race."},{status:409});
  if(now-session.start>MAX_LAP_MS){
   await this.storage.delete(key);
   return Response.json({error:"The race timer expired."},{status:410});
  }
  if(url.pathname==="/abort"){
   await this.storage.delete(key);
   return Response.json({ok:true});
  }
  if(url.pathname!=="/sample"&&url.pathname!=="/finish")
   return Response.json({error:"Unknown kart route"},{status:404});
  const x=Number(body.x),z=Number(body.z);
  // The marked pit lane is a legitimate separate road, but is never a shortcut
  // for a leaderboard lap. A pit visit discards the current lap and a fresh
  // timed circuit begins only once the driver rejoins the main asphalt.
  const pit=body.pit===true;
  if(pit&&url.pathname==="/sample"){
   const projected=projectToRoute(x,z,PIT);
   const dt=now-session.lastAt;
   const displacement=Math.hypot(x-session.x,z-session.z);
   if(!Number.isFinite(x)||!Number.isFinite(z)||projected.distance>PIT_HALF_WIDTH+.8||
      dt<0||displacement>15*dt/1000+6){
    session.valid=false;await this.storage.put(key,session);
    return Response.json({error:"Pit lane requires the limiter and a valid entry."},{status:422});
   }
   const entered=!session.pitMode;
   session.pitMode=true;session.pitVisited=true;
   session.x=x;session.z=z;session.lastAt=now;
   session.travel=0;session.crossed=false;session.sectorTimes=[];session.sectorLastAt=now;
   await this.storage.put(key,session);
   return Response.json({ok:true,pit:true,pitEntry:entered,progress:0,readyToFinish:false});
  }
  if(session.pitMode&&url.pathname==="/sample"){
   const road=projectToRoute(x,z,ROAD);
   const dt=now-session.lastAt;
   if(road.distance>ROAD_HALF_WIDTH+3.0||
      Math.hypot(x-session.x,z-session.z)>MAX_SPEED_MPS*dt/1000+7){
    return Response.json({error:"Rejoin the main track safely at pit exit."},{status:422});
   }
   session.pitMode=false;session.pitVisited=false;
   session.progress=road.progress;session.x=x;session.z=z;session.lastAt=now;
   session.start=now;session.travel=0;session.crossed=false;session.valid=true;
   session.sectorTimes=[];session.sectorLastAt=now;
   await this.storage.put(key,session);
   return Response.json({ok:true,pitExit:true,progress:0,readyToFinish:false});
  }
  const check=validateSample(session,x,z,now);
  if(check.error){
   session.valid=false;await this.storage.put(key,session);
   return Response.json({error:check.error},{status:422});
  }
  if(!session.valid)
   return Response.json({error:"This lap was invalidated. Restart to record a new time."},{status:422});
  // Three server-timed sectors, 0%-33%, 33%-66%, 66%-finish.
  // Each sector is acknowledged only once, at the real split crossing.
  const previousProgress=session.progress;
  let sectorUpdate=null;
  if(url.pathname==="/sample"&&!check.complete){
   const count=(session.sectorTimes||[]).length;
   const threshold=SECTOR_MARKS[count];
   if(threshold!==undefined&&previousProgress<threshold&&check.progress>=threshold){
    session.sectorTimes??=[];
    session.sectorLastAt??=session.start;
    const timeMs=Math.max(1,now-session.sectorLastAt);
    session.sectorTimes.push(timeMs);
    session.sectorLastAt=now;
    sectorUpdate={index:count+1,timeMs,lap:session.lap||1};
   }
  }
  const increase=Math.max(0,check.delta);
  session.travel+=increase;
  session.progress=check.progress;session.x=x;session.z=z;session.lastAt=now;
  if(url.pathname==="/sample"){
   if(check.complete){
    // Finish can only be committed via the explicit finish request.
    session.crossed=true;
   }
   await this.storage.put(key,session);
   return Response.json({ok:true,progress:Math.min(100,Math.floor(session.travel*100)),
    readyToFinish:!!session.crossed,lapElapsedMs:now-session.start,sectorUpdate});
  }
  if(!check.complete&&!session.crossed)
   return Response.json({error:"Cross the start/finish line after a full lap."},{status:422});
  const elapsed=now-session.start;
  if(elapsed<MIN_LAP_MS||session.travel<.93||session.travel>1.2)
   return Response.json({error:"Lap must complete the circuit at racing speed."},{status:422});
  // Split display is OPTIONAL telemetry. Only the full verified lap time
  // determines the personal best; a missing sector message cannot reject it.
  const sectorTimes=[...(session.sectorTimes||[])];
  if(sectorTimes.length===2)sectorTimes.push(Math.max(1,elapsed-sectorTimes[0]-sectorTimes[1]));
  const result=await this.storage.transaction(async txn=>{
   const records=await txn.get("road-atlanta-best-times-v1")||{};
   const previous=records[id]?.bestMs??Infinity;
   const personalBest=elapsed<previous;
   if(personalBest){
    records[id]={name:session.name,bestMs:elapsed,at:now,version:4};
    await txn.put("road-atlanta-best-times-v1",records);
   }
   // Finish does NOT end the driving session. Start the next timed lap at this
   // finish crossing and retain the same race ID, so players keep racing.
   const completedLap=session.lap||1;
   session.lap=completedLap+1;
   session.start=now;session.lastAt=now;
   session.travel=0;session.crossed=false;
   session.sectorTimes=[];session.sectorLastAt=now;
   session.progress=check.progress;
   session.x=x;session.z=z;session.valid=true;
   await txn.put(key,session);
   return {lap:completedLap,nextLap:session.lap,sectorTimes,personalBest,
    bestMs:personalBest?elapsed:previous,entries:leaderboardEntries(records)};
  });
  return Response.json({ok:true,elapsedMs:elapsed,...result},
   {headers:{"cache-control":"no-store"}});
 }
}
