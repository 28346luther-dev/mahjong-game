// Server-validated casual go-kart time trial for The Games Club.
// A full lap crosses checkpoints 1..7 then the finish at 0 in that order.
// Times are measured on the server (never accepted from the browser).
export const GATE_COUNT=8;
export const TRACK_RX=25,TRACK_RZ=15,TRACK_WIDTH=8;
export const GATES=Array.from({length:GATE_COUNT},(_,i)=>{
 const angle=i*Math.PI*2/GATE_COUNT;
 return {index:i,x:Math.sin(angle)*TRACK_RX,z:-Math.cos(angle)*TRACK_RZ};
});
export const MIN_SECTOR_MS=750;
export const MIN_LAP_MS=14000;
export const MAX_LAP_MS=10*60*1000;
export function nearGate(index,x,z){
 const gate=GATES[index];
 return !!gate&&Number.isFinite(x)&&Number.isFinite(z)&&Math.hypot(x-gate.x,z-gate.z)<4.4;
}
export function sanitizeDriverName(name){
 return String(name||"Racer").replace(/[^\p{L}\p{N} _.-]/gu,"").trim().slice(0,22)||"Racer";
}
export function leaderboardEntries(records,limit=10){
 return Object.entries(records).map(([id,r])=>({id,name:r.name,bestMs:r.bestMs,at:r.at}))
  .filter(r=>Number.isInteger(r.bestMs)&&r.bestMs>=MIN_LAP_MS&&r.bestMs<=MAX_LAP_MS)
  .sort((a,b)=>a.bestMs-b.bestMs||a.at-b.at).slice(0,limit)
  .map((r,i)=>({rank:i+1,name:r.name,bestMs:r.bestMs,at:r.at}));
}
export class KartLeaderboard{
 constructor(ctx){this.ctx=ctx;this.storage=ctx.storage;this.sessions=new Map();}
 async read(){return await this.storage.get("best-times")||{};}
 async fetch(request){
  const url=new URL(request.url);
  if(request.method==="GET"&&url.pathname==="/leaderboard"){
   const records=await this.read();
   return Response.json({track:"Velvet Circuit",laps:1,entries:leaderboardEntries(records)},{headers:{"cache-control":"no-store"}});
  }
  if(request.method!=="POST")return Response.json({error:"Method not allowed"},{status:405});
  let body;
  try{body=await request.json();}catch{return Response.json({error:"Invalid request"},{status:400});}
  const id=String(body.user||"");
  if(!/^[a-f0-9]{64}$/.test(id))return Response.json({error:"Sign in required"},{status:401});
  const now=Date.now();
  if(url.pathname==="/start"){
   const session={id:crypto.randomUUID(),name:sanitizeDriverName(body.name),start:now,last:now,next:1};
   await this.storage.put("session:"+id,session);
   return Response.json({ok:true,raceId:session.id,startedAt:session.start,nextCheckpoint:1,checkpoints:GATES});
  }
  const session=await this.storage.get("session:"+id);
  if(!session||session.id!==body.raceId)return Response.json({error:"No active race. Start again."},{status:409});
  if(now-session.start>MAX_LAP_MS){
   await this.storage.delete("session:"+id);
   return Response.json({error:"Race expired. Please restart."},{status:410});
  }
  if(url.pathname==="/checkpoint"){
   const index=body.index,x=Number(body.x),z=Number(body.z);
   if(!Number.isInteger(index)||index!==session.next||index>=GATE_COUNT||!nearGate(index,x,z))
    return Response.json({error:"Checkpoint must be crossed in order."},{status:422});
   if(now-session.last<MIN_SECTOR_MS)
    return Response.json({error:"Checkpoint was reached too quickly."},{status:422});
   session.last=now;session.next++;
   await this.storage.put("session:"+id,session);
   return Response.json({ok:true,nextCheckpoint:session.next});
  }
  if(url.pathname==="/finish"){
   if(session.next!==GATE_COUNT||!nearGate(0,Number(body.x),Number(body.z)))
    return Response.json({error:"Complete all checkpoints before the finish line."},{status:422});
   const elapsed=now-session.start;
   if(elapsed<MIN_LAP_MS||now-session.last<MIN_SECTOR_MS)
    return Response.json({error:"Lap time was too short to be valid."},{status:422});
   // No separate read-modify-write race across users: one Durable Object serializes
   // race requests through storage transactions.
   const result=await this.storage.transaction(async txn=>{
    const records=await txn.get("best-times")||{};
    const prev=records[id]?.bestMs??Infinity;
    const personalBest=elapsed<prev;
    if(personalBest){
     records[id]={name:session.name,bestMs:elapsed,at:now};
     await txn.put("best-times",records);
    }
    await txn.delete("session:"+id);
    return {personalBest,bestMs:personalBest?elapsed:prev,entries:leaderboardEntries(records)};
   });
   return Response.json({ok:true,elapsedMs:elapsed,...result},{headers:{"cache-control":"no-store"}});
  }
  if(url.pathname==="/abort"){
   await this.storage.delete("session:"+id);
   return Response.json({ok:true});
  }
  return Response.json({error:"Unknown route"},{status:404});
 }
}
