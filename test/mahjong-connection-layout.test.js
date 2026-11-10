import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {MahjongRoom} from "../src/worker.js";

function harness(){
 const sockets=[];
 const storage={async get(){return null;},async put(){},async setAlarm(){},async deleteAlarm(){}};
 const ctx={storage,getWebSockets:()=>sockets,acceptWebSocket:()=>{}};
 return {ctx,sockets,room:new MahjongRoom(ctx)};
}
const player=id=>({id,name:id,ready:false,hand:[],discards:[],melds:[]});
const fakeSocket=(id,enabled=false)=>{
 const messages=[];
 return {id,messages,attachment:{playerId:id,cameraEnabled:enabled},
  deserializeAttachment(){return this.attachment;},
  serializeAttachment(obj){this.attachment=obj;},
  send(payload){messages.push(JSON.parse(payload));},
  close(){this.closed=true;}
 };
};
test("Mahjong Durable Object restores active WebSocket players when the instance wakes",()=>{
 const h=harness();
 h.sockets.push(fakeSocket("alice",true),fakeSocket("bob"));
 const resumed=new MahjongRoom(h.ctx);
 assert.equal(resumed.sockets.size,2);
 assert.equal(resumed.reactionTransfers.size,0);
 assert.equal(resumed.submittedReactions.size,0);
});
test("hibernated WebSocket messages use attachment identity for heartbeat and cleanup",async()=>{
 const h=harness();
 h.room.state={players:[player("alice")],phase:"lobby",wall:[],claimWindow:null,message:""};
 const alice=fakeSocket("alice");h.room.sockets.set("alice",alice);
 await h.room.webSocketMessage(alice,JSON.stringify({action:"heartbeat"}));
 assert.equal(alice.messages.at(-1).type,"heartbeatAck");
 await h.room.webSocketClose(alice);
 assert.equal(h.room.sockets.size,0);
 assert.equal(h.room.reactionTransfers.has("alice"),false);
});
test("room ignores events from replaced sockets without losing the current player",async()=>{
 const h=harness();
 const old=fakeSocket("alice"),current=fakeSocket("alice");
 h.room.sockets.set("alice",current);
 await h.room.webSocketClose(old);
 assert.equal(h.room.sockets.get("alice"),current);
 await h.room.webSocketMessage(old,JSON.stringify({action:"reactionClipStart",eventId:"fake",mime:"video/webm",chunks:1}));
 assert.equal(h.room.reactionTransfers.size,0);
});
test("client reconnects and restores the same player identity instead of requiring a refresh",()=>{
 const client=readFileSync("public/app.js","utf8");
 assert.match(client,/function openSocket\(/);
 assert.match(client,/reconnectTimer=setTimeout\(openSocket/);
 assert.match(client,/encodeURIComponent\(id\)/);
 assert.match(client,/action:"heartbeat"/);
 assert.match(client,/leavingRoom=true;stopTransport\(\)/);
});
test("Mahjong screen-fit CSS loads after legacy table styles and supports small viewports",()=>{
 const html=readFileSync("public/index.html","utf8");
 const premium=html.indexOf("/premium-table.css"),fitted=html.indexOf("/mahjong-screen-fit.css");
 assert.ok(premium>=0&&fitted>premium);
 const css=readFileSync("public/mahjong-screen-fit.css","utf8");
 assert.match(css,/#room \.tabletop/);
 assert.match(css,/100dvh/);
 assert.match(css,/#room \.hand>\.tile/);
 assert.match(css,/overflow-x:auto/);
});
test("Mahjong game server and client pass syntax validation",()=>{
 for(const file of ["src/worker.js","public/app.js"])
  execFileSync(process.execPath,["--check",file]);
});
