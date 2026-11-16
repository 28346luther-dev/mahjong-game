import {handleRaceEvent} from './kart-race-events.js';

// One ordered queue for HTTP actions, socket samples and broadcasts. The hot
// meeting state never crosses a storage transaction on each movement packet.
export class KartLive {
 constructor(ctx){this.ctx=ctx;this.cache=new Map();this.saved=new Map();this.lastFlush=0;this.queue=Promise.resolve();this.timer=null;this.critical=false;}
 run(fn){const result=this.queue.then(fn);this.queue=result.catch(()=>{});return result;}
 async get(key){if(!key.startsWith("meeting:"))return this.ctx.storage.get(key);if(!this.cache.has(key)){const value=await this.ctx.storage.get(key);this.cache.set(key,value);this.saved.set(key,JSON.stringify(value));}return structuredClone(this.cache.get(key));}
 async put(key,value){
  if(!key.startsWith("meeting:"))return this.ctx.storage.put(key,value);
  const previous=this.cache.get(key);
  const milestones=m=>JSON.stringify([m?.gridStarted,m?.chequeredAt,m?.players?.map(p=>[p.id,p.lap,p.pitUntil,p.pitComplete,p.finishedAt])]);
  if(milestones(previous)!==milestones(value))this.critical=true;
  this.cache.set(key,structuredClone(value));
 }
 async flush(force=false){
  if(!force&&!this.critical&&Date.now()-this.lastFlush<5000)return;
  for(const [key,value] of this.cache){const encoded=JSON.stringify(value);if(encoded!==this.saved.get(key)){await this.ctx.storage.put(key,value);this.saved.set(key,encoded);}}
  this.lastFlush=Date.now();this.critical=false;
  for(const key of this.cache.keys()){
   if(Number(key.slice("meeting:".length))<Date.now()-45*60*1000){this.cache.delete(key);this.saved.delete(key);}
  }
 }
 async handle(request){
  const response=await handleRaceEvent(request,this);
  const data=await response.clone().json();
  const path=new URL(request.url).pathname;
  await this.flush(!['/event/sample','/event/state','/events'].includes(path)||!!data.lapUpdate||!!data.pitExit);
  return response;
 }
 sockets(){return (this.ctx.getWebSockets?.()||[]).filter(ws=>ws.readyState===1);}
 async connect(request){
  const url=new URL(request.url),user=request.headers.get('x-kart-user'),eventId=Number(url.searchParams.get('id'));
  if(!/^[a-f0-9]{64}$/.test(user||''))return new Response('Unauthorized',{status:401});
  const response=await this.handle(new Request('https://kart/event/state',{method:'POST',body:JSON.stringify({user,eventId})}));
  if(!response.ok)return response;
  const pair=new WebSocketPair(),[client,server]=Object.values(pair);
  this.ctx.acceptWebSocket(server);
  server.serializeAttachment({user,eventId,expires:Date.now()+60*60*1000});
  server.send(JSON.stringify(await response.json()));
  this.schedule();
  return new Response(null,{status:101,webSocket:client});
 }
 async message(ws,message){
  const identity=ws.deserializeAttachment();
  if(!identity||Date.now()>identity.expires){ws.close(1008,'Reconnect to authenticate');return;}
  if(typeof message!=='string'||message.length>2048){ws.close(1009,'Packet too large');return;}
  let body;try{body=JSON.parse(message);}catch{ws.close(1008,'Invalid packet');return;}
  if(body?.type!=='sample')return;
  // Identity and meeting always come from the authenticated attachment.
  const {x,z,yaw,speed,pit}=body;
  const response=await this.handle(new Request('https://kart/event/sample',{method:'POST',body:JSON.stringify({x,z,yaw,speed,pit:pit===true,user:identity.user,eventId:identity.eventId})}));
  const data=await response.json();
  // Ordinary snapshots are sent on the shared 100 ms clock, rather than once
  // per sender per recipient. Preserve one-shot lap and sector acknowledgments.
  if(!response.ok||data.lapUpdate||data.sectorUpdate)ws.send(JSON.stringify(data));
  this.schedule();
 }
 schedule(){if(this.timer||!this.sockets().length)return;this.timer=setTimeout(()=>{this.timer=null;this.run(()=>this.broadcast()).catch(()=>{for(const ws of this.sockets())try{ws.close(1011,'Race service unavailable');}catch{}});},100);}
 async broadcast(){
  let active=false,next=Infinity;
  for(const ws of this.sockets()){
   try{
    const a=ws.deserializeAttachment();if(Date.now()>a.expires){ws.close(1008,'Reconnect to authenticate');continue;}
    const response=await this.handle(new Request('https://kart/event/state',{method:'POST',body:JSON.stringify({user:a.user,eventId:a.eventId})}));
    const data=await response.json();ws.send(JSON.stringify(data));
    if(!response.ok){ws.close(1008,'Meeting unavailable');continue;}
    const connected=new Set(this.sockets().map(peer=>peer.deserializeAttachment()).filter(peer=>peer?.eventId===a.eventId).map(peer=>peer.user));
    const unfinished=data.racers?.some(p=>connected.has(p.id)&&!p.finishedAt);
    if(['qualifying','grid','race'].includes(data.phase)&&unfinished)active=true;
    if(data.phase==='registration')next=Math.min(next,data.qualifyingAt);
   }catch{try{ws.close(1011,'Race service unavailable');}catch{}}
  }
  if(active)this.schedule();
  // Registration can hibernate until the phase transition; no idle polling.
  else if(Number.isFinite(next))await this.ctx.storage.setAlarm(Math.max(Date.now()+1000,next));
 }
 async close(){if(!this.sockets().length&&this.timer){clearTimeout(this.timer);this.timer=null;}await this.flush(true);}
}
