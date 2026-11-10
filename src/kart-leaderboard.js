import {ROAD,ROAD_HALF_WIDTH,RUNOFF_WIDTH,projectToRoute,raceStart} from "../public/kart-track.js";

// Continuous on-road progress verification. No checkpoint gates or checkpoints UI.
// Times use server wall-clock, and accepted samples must stay near the circuit
// and travel plausible distances. This is an arcade leaderboard, not anti-cheat proof.
export const MIN_LAP_MS=22000;
export const MAX_LAP_MS=10*60*1000;
export const MAX_SPEED_MPS=37;
export function sanitizeDriverName(name){
 return String(name||"Racer").replace(/[^\p{L}\p{N} _.-]/gu,"").trim().slice(0,22)||"Racer";
}
export function leaderboardEntries(records,limit=10){
 return Object.entries(records).map(([id,r])=>({id,name:r.name,bestMs:r.bestMs,at:r.at,version:r.version||1}))
  .filter(r=>Number.isInteger(r.bestMs)&&r.bestMs>=MIN_LAP_MS&&r.bestMs<=MAX_LAP_MS&&r.version===3)
  .sort((a,b)=>a.bestMs-b.bestMs||a.at-b.at).slice(0,limit)
  .map((r,i)=>({rank:i+1,name:r.name,bestMs:r.bestMs,at:r.at}));
}
export function validateSample(session,x,z,now){
 if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>220||Math.abs(z)>160)
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
 async read(){return await this.storage.get("best-times-v3")||{};}
 async fetch(request){
  const url=new URL(request.url);
  if(request.method==="GET"&&url.pathname==="/leaderboard"){
   const records=await this.read();
   return Response.json({track:"Velvet Circuit Extended",laps:1,entries:leaderboardEntries(records)},
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
    progress:0,travel:0,valid:true};
   await this.storage.put("kart-session-v3:"+id,s);
   return Response.json({ok:true,raceId:s.id,startedAt:s.start,
    trackLength:Math.round(ROAD.length),bestMs:(await this.read())[id]?.bestMs??null});
  }
  const key="kart-session-v2:"+id,session=await this.storage.get(key);
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
  const check=validateSample(session,x,z,now);
  if(check.error){
   session.valid=false;await this.storage.put(key,session);
   return Response.json({error:check.error},{status:422});
  }
  if(!session.valid)
   return Response.json({error:"This lap was invalidated. Restart to record a new time."},{status:422});
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
    readyToFinish:!!session.crossed});
  }
  if(!check.complete&&!session.crossed)
   return Response.json({error:"Cross the start/finish line after a full lap."},{status:422});
  const elapsed=now-session.start;
  if(elapsed<MIN_LAP_MS||session.travel<.93||session.travel>1.2)
   return Response.json({error:"Lap must complete the circuit at racing speed."},{status:422});
  const result=await this.storage.transaction(async txn=>{
   const records=await txn.get("best-times-v2")||{};
   const previous=records[id]?.bestMs??Infinity;
   const personalBest=elapsed<previous;
   if(personalBest){
    records[id]={name:session.name,bestMs:elapsed,at:now,version:3};
    await txn.put("best-times-v2",records);
   }
   await txn.delete(key);
   return {personalBest,bestMs:personalBest?elapsed:previous,entries:leaderboardEntries(records)};
  });
  return Response.json({ok:true,elapsedMs:elapsed,...result},
   {headers:{"cache-control":"no-store"}});
 }
}
