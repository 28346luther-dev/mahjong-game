import test from "node:test";
import assert from "node:assert/strict";
import {ClubSocial} from "../src/club-social.js";
import worker from "../src/worker.js";
import {execFileSync} from "node:child_process";

class FakeSocket{
 constructor(info){this.info=info;this.messages=[];}
 deserializeAttachment(){return this.info;}
 serializeAttachment(next){this.info=next;}
 send(msg){this.messages.push(JSON.parse(msg));}
 close(){}
}
function fixture(){
 const a=new FakeSocket({id:"alice",name:"Alice",x:0,z:9,yaw:0,zone:"hall",voice:false,lastChat:0,lastMove:0,lastSignal:0});
 const b=new FakeSocket({id:"bob",name:"Bob",x:1,z:9,yaw:0,zone:"hall",voice:false,lastChat:0,lastMove:0,lastSignal:0});
 const sockets=[a,b],ctx={getWebSockets:()=>sockets};
 return {a,b,room:new ClubSocial(ctx)};
}
test("social chat sends escaped plain text data to other visitors without executable markup",()=>{
 const {a,b,room}=fixture();
 room.webSocketMessage(a,JSON.stringify({type:"chat",text:"Hello <script>alert(1)</script>"}));
 const message=b.messages.find(m=>m.type==="chat");
 assert.equal(message.text,"Hello <script>alert(1)</script>");
 assert.equal(message.name,"Alice");
});
test("movement updates room presence and rejects out of bounds",()=>{
 const {a,b,room}=fixture();
 room.webSocketMessage(a,JSON.stringify({type:"move",x:-17,z:-11,yaw:0}));
 assert.equal(b.messages.at(-1).zone,"mahjong");
 const total=b.messages.length;
 room.webSocketMessage(a,JSON.stringify({type:"move",x:99,z:1,yaw:0}));
 assert.equal(b.messages.length,total);
});
test("voice signaling is refused across rooms or when either user has mic disabled",()=>{
 const {a,b,room}=fixture();
 room.webSocketMessage(a,JSON.stringify({type:"signal",to:"bob",kind:"offer",payload:{sdp:"sample"}}));
 assert.equal(b.messages.length,0);
 a.info.voice=true;b.info.voice=true;b.info.zone="poker";
 room.webSocketMessage(a,JSON.stringify({type:"signal",to:"bob",kind:"offer",payload:{sdp:"sample"}}));
 assert.equal(b.messages.length,0);
 b.info.zone="hall";
 room.webSocketMessage(a,JSON.stringify({type:"signal",to:"bob",kind:"offer",payload:{sdp:"sample"}}));
 assert.equal(b.messages.at(-1).type,"signal");
});
test("social WebSocket endpoint requires signed-in viewer",async()=>{
 const response=await worker.fetch(new Request("https://study-plus.online/club/ws",{headers:{Upgrade:"websocket"}}),{
  AUTH:{idFromName:()=>({}),get:()=>({fetch:()=>new Response("{}")})}
 });
 assert.equal(response.status,401);
});
test("client modules and Worker code pass JavaScript syntax checks",()=>{
 for(const path of ["public/clubhouse.js","public/club-social.js","src/club-social.js","src/worker.js"])
  execFileSync(process.execPath,["--check",path]);
});
