/* Scheduled multiplayer Velvet Circuit race meetings.
 * Every 10 minutes a new two-minute qualifying session begins, followed by a
 * ten-lap race. Events are independent; overlapping race meetings do not erase
 * one another. All registered positions, lap times, pit service and results are
 * held in the existing KartLeaderboard Durable Object.
 */
import {ROAD,PIT,PIT_HALF_WIDTH,ROAD_HALF_WIDTH,RUNOFF_WIDTH,PIT_BAYS,PIT_BAY_TOLERANCE,projectToRoute,sampleAt} from "../public/kart-track.js";
export const EVENT_INTERVAL_MS=600_000;
export const QUALIFY_MS=120_000;
export const RACE_LAPS=10;
export const PIT_SERVICE_MS=10_000;
export const EVENT_LIFETIME_MS=45*60_000;
const MIN_LAP_MS=20_000;
const MAX_STEP_MPS=42;
const eventKey=id=>"meeting:"+id;
export const activeEventId=now=>Math.floor(now/EVENT_INTERVAL_MS)*EVENT_INTERVAL_MS;
export function eventPhase(id,now){
 if(now<id)return "registration";
 if(now<id+QUALIFY_MS)return "qualifying";
 if(now<id+EVENT_LIFETIME_MS)return "race";
 return "closed";
}
export function scheduledEvents(now=Date.now()){
 const base=activeEventId(now);
 return [-2,-1,0,1,2,3].map(n=>base+n*EVENT_INTERVAL_MS).filter(id=>id>0&&now<id+EVENT_LIFETIME_MS)
  .map(id=>({id,qualifyingAt:id,raceAt:id+QUALIFY_MS,registrationCloses:id+QUALIFY_MS,
    phase:eventPhase(id,now),raceLaps:RACE_LAPS,qualifyingMinutes:2}))
  .sort((a,b)=>a.id-b.id);
}
function driverView(p){return {
 id:p.id,name:p.name,qualifiedMs:p.qualifiedMs,grid:p.grid||null,
 lap:p.lap||0,finishedMs:p.finishedMs||null,finishedAt:p.finishedAt||null,
 sectorTimes:p.sectorTimes||[],sectorColors:p.sectorColors||[],
 pitComplete:!!p.pitComplete,pitUntil:p.pitUntil||0,pitBay:p.pitBay??null,
 pitMode:!!p.pitMode,disqualified:!!p.disqualified,
 x:p.x,z:p.z,yaw:p.yaw||0,lastAt:p.lastAt||0,
 position:p.position||null
};}
function rankPlayers(players){
 const grid=[...players].sort((a,b)=>(a.qualifiedMs||Infinity)-(b.qualifiedMs||Infinity)||a.joined-b.joined);
 grid.forEach((p,i)=>p.grid=i+1);
 return grid;
}
function raceStanding(players){
 return [...players].sort((a,b)=>{
  if(Boolean(a.finishedAt)!==Boolean(b.finishedAt))return a.finishedAt?-1:1;
  if(a.finishedAt&&b.finishedAt)return a.finishedAt-b.finishedAt;
  // Grid positions remain stable until the race actually gets underway.
  if(!a.startedDriving&&!b.startedDriving)return (a.grid||99)-(b.grid||99);
  return (b.lap||0)-(a.lap||0)||(b.progress||0)-(a.progress||0);
 });
}
export function eventSnapshot(meeting,now=Date.now(),user=null){
 const phase=eventPhase(meeting.id,now);
 const racers=meeting.players||[];
 const ordered=phase==="registration"||phase==="qualifying"?
  [...racers].sort((a,b)=>(a.qualifiedMs??Infinity)-(b.qualifiedMs??Infinity)||a.joined-b.joined):
  raceStanding(racers);
 return {id:meeting.id,phase,qualifyingAt:meeting.id,raceAt:meeting.id+QUALIFY_MS,
  qualifyingRemainingMs:Math.max(0,meeting.id+QUALIFY_MS-now),
  phaseRemainingMs:phase==="registration"?Math.max(0,meeting.id-now):
   phase==="qualifying"?Math.max(0,meeting.id+QUALIFY_MS-now):null,
  laps:RACE_LAPS,pitServiceMs:PIT_SERVICE_MS,
  racers:ordered.map((p,i)=>({...driverView(p),position:i+1})),
  registered:racers.length,sessionSectors:meeting.sessionSectors||[null,null,null],
  you:racers.some(p=>p.id===user)?user:null,
  serverNow:now};
}
function gridPosition(index){
 // Starting grid on the main straight, staggered behind the finish line.
 const lane=(index%2?1:-1)*1.3,forward=8+Math.floor(index/2)*5.1;
 const start=ROAD.samples[0],ahead=ROAD.samples[4];
 const dx=ahead.x-start.x,dz=ahead.z-start.z,len=Math.hypot(dx,dz)||1;
 const tx=dx/len,tz=dz/len;
 return {x:start.x+tx*forward-tz*lane,z:start.z+tz*forward+tx*lane,
  yaw:Math.atan2(tx,tz)};
}
function advance(meeting,now){
 const phase=eventPhase(meeting.id,now);
 if(phase==="race"&&!meeting.gridStarted){
  const order=rankPlayers(meeting.players);
  for(let i=0;i<order.length;i++){
   const p=order[i],grid=gridPosition(i),proj=projectToRoute(grid.x,grid.z);
   Object.assign(p,grid,{progress:proj.progress,travel:0,lastAt:now,
    lapStarted:meeting.id+QUALIFY_MS,lap:0,finishedAt:null,finishedMs:null,
    pitComplete:false,pitUntil:0,pitBay:null,pitMode:false,disqualified:false,startedDriving:false,
    sectorTimes:[],sectorColors:[],sectorIndex:0,sectorLastAt:now});
  }
  meeting.gridStarted=true;
 }
 return phase;
}
function sampleMovement(p,x,z,now,allowPit=false){
 const route=allowPit?PIT:ROAD;
 if(!Number.isFinite(x)||!Number.isFinite(z))return {error:"Invalid position"};
 const projected=projectToRoute(x,z,route);
 if(projected.distance>(allowPit?PIT_HALF_WIDTH+.85:ROAD_HALF_WIDTH+RUNOFF_WIDTH))
  return {error:allowPit?"Keep to the marked pit lane":"Stay on the circuit"};
 const dt=Math.max(0,now-p.lastAt);
 if(Math.hypot(x-p.x,z-p.z)>MAX_STEP_MPS*dt/1000+7)return {error:"Position changed too quickly"};
 let delta=projected.progress-p.progress;
 if(!allowPit){if(delta<-.7)delta++;if(delta>.7)delta--;
  if(delta>.10||delta<-.09)return {error:"Invalid lap progression"};}
 return {...projected,delta};
}
function makeDriver(user,name,now){
 const start=ROAD.samples[0],next=ROAD.samples[3];
 return {id:user,name:String(name||"Racer").replace(/[^\p{L}\p{N} _.-]/gu,"").trim().slice(0,22)||"Racer",
  joined:now,qualifiedMs:null,qualStart:now,grid:null,lap:0,travel:0,progress:0,
  x:start.x,z:start.z,yaw:Math.atan2(next.x-start.x,next.z-start.z),
  lastAt:now,lapStarted:now,pitComplete:false,pitUntil:0,pitBay:null,pitMode:false,
  sectorTimes:[],sectorColors:[],sectorBest:[null,null,null],sectorIndex:0,sectorLastAt:now};
}
function pitAtBay(x,z,index){
 const box=PIT_BAYS[index];
 return box&&Math.hypot(x-box.x,z-box.z)<=PIT_BAY_TOLERANCE;
}
function pitPose(x,z){
 return PIT_BAYS.some((bay,i)=>pitAtBay(x,z,i));
}
export async function handleRaceEvent(request,storage){
 const url=new URL(request.url),now=Date.now();
 if(url.pathname==="/events"&&request.method==="GET"){
  const entries=scheduledEvents(now);
  const list=[];
  for(const item of entries){
   const stored=await storage.get(eventKey(item.id));
   list.push({...item,registered:stored?.players?.length||0});
  }
  return Response.json({events:list,serverNow:now},{headers:{"cache-control":"no-store"}});
 }
 let body={};
 if(request.method==="POST")try{body=await request.json();}catch{return Response.json({error:"Invalid JSON"},{status:400});}
 const id=Number(url.searchParams.get("id")||body.eventId);
 if(!Number.isSafeInteger(id)||id%EVENT_INTERVAL_MS!==0||id<1e12||
    id<now-EVENT_LIFETIME_MS||id>now+4*EVENT_INTERVAL_MS)
  return Response.json({error:"Select an upcoming race meeting."},{status:400});
 const key=eventKey(id);
 let meeting=await storage.get(key)||{id,players:[],gridStarted:false};
 const phase=advance(meeting,now);
 if(url.pathname==="/event/state"){
  await storage.put(key,meeting);
  return Response.json(eventSnapshot(meeting,now,body.user||null),{headers:{"cache-control":"no-store"}});
 }
 const user=String(body.user||"");
 if(!/^[a-f0-9]{64}$/.test(user))
  return Response.json({error:"Sign in to register for a race."},{status:401});
 if(url.pathname==="/event/register"){
  if(phase!=="registration"&&phase!=="qualifying")
   return Response.json({error:"Registration for this race has closed."},{status:409});
  if(!meeting.players.some(p=>p.id===user)){
   if(meeting.players.length>=16)return Response.json({error:"This event is full (16 karts)."},{status:409});
   meeting.players.push(makeDriver(user,body.name,now));
  }
  await storage.put(key,meeting);
  return Response.json({ok:true,...eventSnapshot(meeting,now,user)});
 }
 const player=meeting.players.find(p=>p.id===user);
 if(!player)return Response.json({error:"Register for this meeting first."},{status:403});
 if(url.pathname==="/event/leave"){
  if(phase==="registration")meeting.players=meeting.players.filter(p=>p.id!==user);
  await storage.put(key,meeting);
  return Response.json({ok:true});
 }
 if(url.pathname==="/event/pit"){
  if(phase!=="race")return Response.json({error:"Pit stops are available during the race."},{status:409});
  if(player.pitComplete)return Response.json({error:"Mandatory stop already completed."},{status:409});
  if(player.pitUntil)return Response.json({ok:true,serviceUntil:player.pitUntil});
  const bay=Number(body.bay),x=Number(body.x),z=Number(body.z),speed=Number(body.speed);
  if(!player.pitMode||!Number.isInteger(bay)||bay<0||bay>=PIT_BAYS.length||
    !pitAtBay(x,z,bay)||!Number.isFinite(speed)||Math.abs(speed)>.65)
   return Response.json({error:"Stop fully in a marked pit bay with P limiter before servicing."},{status:422});
  const dt=now-player.lastAt;
  if(Math.hypot(x-player.x,z-player.z)>MAX_STEP_MPS*dt/1000+2)
   return Response.json({error:"Move into your pit box before servicing."},{status:422});
  player.pitUntil=now+PIT_SERVICE_MS;player.pitBay=bay;
  await storage.put(key,meeting);
  return Response.json({ok:true,serviceUntil:player.pitUntil,pitBay:bay});
 }
 if(url.pathname!=="/event/sample"||request.method!=="POST")
  return Response.json({error:"Unknown race action"},{status:404});
 if(phase!=="qualifying"&&phase!=="race")
  return Response.json({error:"Session not currently driving."},{status:409});
 if(player.finishedAt)return Response.json({ok:true,...eventSnapshot(meeting,now,user)});
 if(player.pitUntil){
  // Pit service is a controlled stationary hold; don't accept the driver
  // teleporting away while the ten-second maintenance countdown runs.
  if(now<player.pitUntil)
   return Response.json({ok:true,pitServiceRemainingMs:player.pitUntil-now,...eventSnapshot(meeting,now,user)});
  player.pitComplete=true;player.pitUntil=0;player.pitBay=null;
 }
 const x=Number(body.x),z=Number(body.z),pit=body.pit===true;
 const speed=Number(body.speed||0);
 if(pit&&(!Number.isFinite(speed)||Math.abs(speed)>11.4))
  return Response.json({error:"Engage the 40 km/h pit limiter."},{status:422});
 // Server-side overlap validation protects competitive races from clients
 // which omit local car-to-car contact handling.
 if(phase==="race"&&!pit){
  for(const rival of meeting.players){
   if(rival.id===user||rival.finishedAt||!rival.startedDriving||now-rival.lastAt>3500)continue;
   if(Math.hypot(x-rival.x,z-rival.z)<2.8)
    return Response.json({error:"Contact with another car: leave a safe gap.",collision:true,
     ...eventSnapshot(meeting,now,user)},{status:409});
  }
 }
  const movement=sampleMovement(player,x,z,now,pit);
 if(movement.error)return Response.json({error:movement.error},{status:422});
 if(pit){
  player.pitMode=true;player.progress=projectToRoute(x,z,ROAD).progress;
  player.travel=0;player.x=x;player.z=z;player.lastAt=now;
  player.sectorIndex=0;player.sectorTimes=[];player.sectorColors=[];player.sectorLastAt=now;
  await storage.put(key,meeting);
  return Response.json({ok:true,pit:true,pitComplete:player.pitComplete,
   ...eventSnapshot(meeting,now,user)});
 }
 if(player.pitMode){
  player.pitMode=false;
  player.progress=movement.progress;player.x=x;player.z=z;player.lastAt=now;
  player.travel=0;player.lapStarted=now;
  player.sectorIndex=0;player.sectorTimes=[];player.sectorColors=[];player.sectorLastAt=now;
  await storage.put(key,meeting);
  return Response.json({ok:true,pitExit:true,...eventSnapshot(meeting,now,user)});
 }
 let sectorUpdate=null;
 const previousProgress=player.progress;
 const mark=[1/3,2/3][player.sectorIndex||0];
 if(mark!==undefined&&previousProgress<mark&&movement.progress>=mark){
  const idx=player.sectorIndex||0;
  const sectorMs=Math.max(1,now-(player.sectorLastAt||player.lapStarted));
  meeting.sessionSectors??=[null,null,null];
  player.sectorBest??=[null,null,null];
  const purple=meeting.sessionSectors[idx]===null||sectorMs<meeting.sessionSectors[idx];
  const green=!purple&&(player.sectorBest[idx]===null||sectorMs<player.sectorBest[idx]);
  const color=purple?"purple":green?"green":"yellow";
  meeting.sessionSectors[idx]=Math.min(meeting.sessionSectors[idx]??Infinity,sectorMs);
  player.sectorBest[idx]=Math.min(player.sectorBest[idx]??Infinity,sectorMs);
  player.sectorTimes.push(sectorMs);player.sectorColors.push(color);
  player.sectorIndex=idx+1;player.sectorLastAt=now;
  sectorUpdate={index:idx+1,timeMs:sectorMs,color};
 }
 const crossed=player.progress>.94&&movement.progress<.06&&movement.delta>=0;
 player.travel+=Math.max(0,movement.delta);
 player.progress=movement.progress;player.x=x;player.z=z;player.lastAt=now;
 player.yaw=Number.isFinite(body.yaw)?body.yaw:player.yaw;
 player.startedDriving=true;
 let lapUpdate=null;
 if(crossed&&player.travel>.89){
  const elapsed=now-player.lapStarted;
  if(elapsed>=MIN_LAP_MS){
   if(phase==="qualifying"){
    player.qualifiedMs=Math.min(player.qualifiedMs??Infinity,elapsed);
    lapUpdate={type:"qualifying",timeMs:elapsed,bestMs:player.qualifiedMs};
   }else{
    player.lap++;
    lapUpdate={type:"race",lap:player.lap,timeMs:elapsed};
    if(player.lap>=RACE_LAPS){
     player.finishedAt=now;player.finishedMs=now-(meeting.id+QUALIFY_MS);
     player.disqualified=!player.pitComplete;
    }
   }
   if(player.sectorTimes.length===2){
    const idx=2,sectorMs=Math.max(1,now-player.sectorLastAt);
    meeting.sessionSectors??=[null,null,null];
    player.sectorBest??=[null,null,null];
    const purple=meeting.sessionSectors[idx]===null||sectorMs<meeting.sessionSectors[idx];
    const green=!purple&&(player.sectorBest[idx]===null||sectorMs<player.sectorBest[idx]);
    const color=purple?"purple":green?"green":"yellow";
    meeting.sessionSectors[idx]=Math.min(meeting.sessionSectors[idx]??Infinity,sectorMs);
    player.sectorBest[idx]=Math.min(player.sectorBest[idx]??Infinity,sectorMs);
    player.sectorTimes.push(sectorMs);player.sectorColors.push(color);
    sectorUpdate={index:3,timeMs:sectorMs,color};
   }
   player.travel=0;player.lapStarted=now;
   player.sectorIndex=0;player.sectorTimes=[];player.sectorColors=[];player.sectorLastAt=now;
  }
 }
 await storage.put(key,meeting);
 return Response.json({ok:true,lapUpdate,sectorUpdate,...eventSnapshot(meeting,now,user)});
}
