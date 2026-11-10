// Realtime social clubhouse. One Durable Object per lobby, separate from Mahjong rooms.
// Authenticated by the main Worker before a socket is forwarded here.
const clean=(value,max)=>String(value||"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
const zoneOf=(x,z)=>x< -10?(z<0?"mahjong":"blackjack"):x>10?(z<0?"poker":"slots"):"hall";
const validPoint=(p)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.yaw)&&Math.abs(p.x)<=22.5&&Math.abs(p.z)<=16.5;
export class ClubSocial {
 constructor(ctx){this.ctx=ctx;this.members=new Map();}
 socketInfo(ws){
  if(this.members.has(ws))return this.members.get(ws);
  const info=ws.deserializeAttachment?.();
  if(info)this.members.set(ws,info);
  return info;
 }
 send(ws,data){try{ws.send(JSON.stringify(data));}catch{}}
 broadcast(data,except){for(const ws of this.ctx.getWebSockets()){if(ws!==except)this.send(ws,data);}}
 peers(){
  return this.ctx.getWebSockets().map(ws=>this.socketInfo(ws)).filter(Boolean).map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,yaw:p.yaw,zone:p.zone,voice:p.voice,color:p.color||"ruby",hair:p.hair||"dark",photo:p.photo||""}));
 }
 async fetch(request){
  if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return new Response("WebSocket required",{status:426});
  const name=clean(request.headers.get("x-club-name"),25)||"Guest";
  const userId=clean(request.headers.get("x-club-user"),100);
  const color=clean(request.headers.get("x-club-color"),12),hair=clean(request.headers.get("x-club-hair"),12);
  const candidate=request.headers.get("x-club-photo")||"";
  const photo=/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(candidate)&&candidate.length<18000?candidate:"";
  if(!userId)return new Response("Unauthorized",{status:401});
  const pair=new WebSocketPair();
  const client=pair[0],server=pair[1];
  const info={id:crypto.randomUUID(),name,x:0,z:11,yaw:0,zone:"hall",voice:false,color,hair,photo,userId,lastChat:0,lastMove:0,lastSignal:0};
  this.ctx.acceptWebSocket(server);
  server.serializeAttachment(info);this.members.set(server,info);
  this.send(server,{type:"welcome",id:info.id,peers:this.peers(),messages:[]});
  this.broadcast({type:"join",peer:{id:info.id,name:info.name,x:info.x,z:info.z,yaw:0,zone:"hall",voice:false,color,hair,photo}},server);
  return new Response(null,{status:101,webSocket:client});
 }
 webSocketMessage(ws,raw){
  const info=this.socketInfo(ws);if(!info)return;
  let data;try{data=JSON.parse(typeof raw==="string"?raw:new TextDecoder().decode(raw));}catch{return;}
  const now=Date.now();
  if(data.type==="move"&&now-info.lastMove>=80&&validPoint(data)){
   info.x=Number(data.x);info.z=Number(data.z);info.yaw=Number(data.yaw);
   info.zone=zoneOf(info.x,info.z);info.lastMove=now;ws.serializeAttachment(info);
   this.broadcast({type:"move",id:info.id,x:info.x,z:info.z,yaw:info.yaw,zone:info.zone},ws);
  }
  if(data.type==="chat"&&now-info.lastChat>=850){
   const message=clean(data.text,180);if(!message)return;
   info.lastChat=now;ws.serializeAttachment(info);
   this.broadcast({type:"chat",id:info.id,name:info.name,text:message,zone:info.zone,time:now});
  }
  if(data.type==="profile"){
   const name=clean(data.name,22),color=clean(data.color,12),hair=clean(data.hair,12);
   const raw=typeof data.photo==="string"?data.photo:"";
   const photo=raw.length<18000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(raw)?raw:"";
   if(name.length>=2&&/^[\p{L}\p{N} _.-]+$/u.test(name)&&
      ["ruby","plum","emerald","navy","gold"].includes(color)&&
      ["dark","brown","blonde","auburn"].includes(hair)){
    info.name=name;info.color=color;info.hair=hair;info.photo=photo;ws.serializeAttachment(info);
    this.broadcast({type:"profile",id:info.id,name,color,hair,photo},ws);
   }
  }
  if(data.type==="voice"&&typeof data.enabled==="boolean"){
   info.voice=data.enabled;ws.serializeAttachment(info);
   this.broadcast({type:"voice",id:info.id,enabled:info.voice});
  }
  if(data.type==="signal"&&typeof data.to==="string"&&["offer","answer","ice"].includes(data.kind)){
   if(JSON.stringify(data.payload??{}).length>14000)return;
   const recipient=this.ctx.getWebSockets().find(peer=>this.socketInfo(peer)?.id===data.to);
   if(!recipient)return;
   const remote=this.socketInfo(recipient);
   if(!info.voice||!remote.voice||info.zone!==remote.zone)return;
   this.send(recipient,{type:"signal",from:info.id,kind:data.kind,payload:data.payload});
  }
 }
 webSocketClose(ws){this.leave(ws);}
 webSocketError(ws){this.leave(ws);}
 leave(ws){
  const info=this.socketInfo(ws);this.members.delete(ws);
  if(info)this.broadcast({type:"leave",id:info.id},ws);
  try{ws.close(1000,"Goodbye");}catch{}
 }
}
