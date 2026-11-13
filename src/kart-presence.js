import {scheduledEvents} from './kart-race-events.js';
export const PRESENCE_TTL_MS=25000;
const modes=['preLobby','raceLobby','timeTrial','racing'];
export function activeCounts(leases,now){
 const users=new Map();
 for(const entry of Object.values(leases)){
  if(now-entry.at>=PRESENCE_TTL_MS||entry.at>now||!modes.includes(entry.mode))continue;
  const old=users.get(entry.user);
  // A second lobby tab must not hide the same player's active driving tab.
  if(!old||modes.indexOf(entry.mode)>modes.indexOf(old.mode))users.set(entry.user,entry);
 }
 const counts={preLobby:0,raceLobby:0,timeTrial:0,racing:0,total:users.size};
 for(const entry of users.values())counts[entry.mode]++;
 counts.driving=counts.racing+counts.timeTrial;
 return counts;
}
export async function handleKartPresence(request,storage){
 const now=Date.now(),url=new URL(request.url);
 let leases=await storage.get('kart-presence-v1')||{};
 leases=Object.fromEntries(Object.entries(leases).filter(([,entry])=>now-entry.at<PRESENCE_TTL_MS&&entry.at<=now));
 if(url.pathname==='/presence'){
  if(request.method!=='POST')return Response.json({error:'POST required'},{status:405});
  let body;try{body=await request.json();}catch{return Response.json({error:'Invalid JSON'},{status:400});}
  if(!body||typeof body!=='object'||Array.isArray(body))return Response.json({error:'Invalid presence'},{status:400});
  if(!/^[a-f0-9]{64}$/.test(body.user||''))return Response.json({error:'Sign in first'},{status:401});
  if(!/^[a-f0-9-]{16,64}$/.test(body.client||'')||body.mode!==null&&!modes.includes(body.mode))return Response.json({error:'Invalid presence'},{status:400});
  const key=body.user+':'+body.client;
  if(body.mode===null)delete leases[key];
  else leases[key]={user:body.user,mode:body.mode,at:now};
  await storage.put('kart-presence-v1',leases);
 }else if(url.pathname!=='/activity'||request.method!=='GET')return Response.json({error:'Unknown activity endpoint'},{status:404});
 const next=scheduledEvents(now).find(event=>event.lightsOutAt>now);
 let nextRace=null;
 if(next){
  const meeting=await storage.get('meeting:'+next.id);
  nextRace={id:next.id,startsAt:next.lightsOutAt,qualifyingAt:next.qualifyingAt,registrationCloses:next.registrationCloses,registered:meeting?.players?.length||0};
 }
 return Response.json({counts:activeCounts(leases,now),nextRace,serverNow:now},{headers:{'cache-control':'no-store'}});
}
