import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {MahjongRoom} from "../src/worker.js";
import {ROAD,ROAD_HALF_WIDTH,TRACK_SCALE,RUNOFF_WIDTH} from "../public/kart-track.js";
import {MAX_SPEED_MPS} from "../src/kart-leaderboard.js";

const person=(name,id)=>({id,name,hand:[],melds:[],discards:[],ready:false});
function fixture(){
 const saved=new Map();
 const ctx={storage:{
  async get(k){return saved.get(k);},
  async put(k,v){saved.set(k,structuredClone(v));},
  async setAlarm(){},async deleteAlarm(){}
 }};
 const room=new MahjongRoom(ctx);
 room.state={code:"ABC123",players:[person("Alice","alice"),person("Bob","bob")],
  spectators:[],phase:"playing",round:1,wall:[],turn:0,dealer:0,
  lastDiscard:null,claimWindow:null,pendingDraw:null,lastReaction:null,winner:null,message:""};
 return room;
}
async function join(room,name){
 const response=await room.fetch(new Request("https://room/join",{
  method:"POST",body:JSON.stringify({name})
 }));
 return {status:response.status,...await response.json()};
}
test("late Mahjong joiners automatically spectate instead of being rejected",async()=>{
 const room=fixture();
 const result=await join(room,"Charlie");
 assert.equal(result.status,200);
 assert.equal(result.spectator,true);
 assert.equal(room.state.players.length,2);
 assert.equal(room.state.spectators.length,1);
 const view=room.state;
 assert.equal(view.spectators[0].name,"Charlie");
});
test("spectator sees only public table data and may join next round",async()=>{
 const room=fixture();
 room.state.players[0].hand=[{key:"private-east",id:"c2",name:"2 characters"}];
 room.state.players[1].hand=[{key:"private-south",id:"c4",name:"4 characters"}];
 const result=await join(room,"Charlie");
 const observer=result.playerId;
 await room.onMessage(observer,JSON.stringify({action:"queueNext"}));
 assert.equal(room.state.spectators[0].ready,true);
 // Joining next round does not grant private tiles during the active game.
 const responseMessages=[];
 room.sockets.set(observer,{send:value=>responseMessages.push(JSON.parse(value))});
 room.broadcast();
 const seen=responseMessages.at(-1).state;
 assert.equal(seen.myIndex,-1);
 assert.equal(seen.spectator,true);
 assert.equal(JSON.stringify(seen).includes("private-east"),false);
 assert.equal(JSON.stringify(seen).includes("private-south"),false);
 assert.equal(seen.queuePosition,1);
});
test("spectator queue is promoted into next game without creating a new room",async()=>{
 const room=fixture();
 const late=await join(room,"Charlie");
 room.state.phase="finished";
 await room.onMessage(late.playerId,JSON.stringify({action:"queueNext"}));
 await room.onMessage("alice",JSON.stringify({action:"nextReady"}));
 await room.onMessage(late.playerId,JSON.stringify({action:"nextRound"}));
 assert.equal(room.state.phase,"playing");
 assert.equal(room.state.round,2);
 assert.equal(room.state.players.length,2);
 assert.equal(room.state.players[0].name,"Charlie");
 assert.equal(room.state.players[1].name,"Alice");
 assert.equal(room.state.spectators.some(p=>p.id==="bob"),true);
 assert.equal(room.state.players.every(p=>p.hand.length>=13),true);
});
test("Mahjong session browser and picture-in-picture recording preview are connected",()=>{
 const html=readFileSync("public/index.html","utf8");
 const app=readFileSync("public/app.js","utf8");
 const css=readFileSync("public/mahjong-spectator.css","utf8");
 for(const id of ["mahjongQueue","sessionGames","refreshSessions","mahjongSession","reactionCameraPreview"])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(app,/api\/sessions/);
 assert.match(app,/queueNext/);
 assert.match(app,/nextRound/);
 assert.match(css,/position:fixed/);
 assert.match(css,/reaction-camera-preview:not\(\.hidden\)/);
});
test("extended kart circuit is longer, faster, direction corrected, with runoff",()=>{
 const js=readFileSync("public/kart-racing.js","utf8");
 assert.ok(TRACK_SCALE>=1.5);
 assert.ok(ROAD.length>400);
 assert.ok(ROAD_HALF_WIDTH>3);
 assert.ok(RUNOFF_WIDTH>=6);
 assert.ok(MAX_SPEED_MPS>=35);
 assert.match(js,/yaw-=steer\*dt/);
 assert.match(js,/Math\.min\(pitLimiter\?PIT_LIMIT_MS:29,speed\)/);
 assert.match(js,/if\(brake\)speed/);
 assert.match(js,/ribbon\(ROAD,-ROAD_HALF_WIDTH-RUNOFF_WIDTH/);
});
test("all updated sources parse",()=>{
 for(const p of ["src/worker.js","src/club-social.js","public/app.js","public/kart-track.js","public/kart-racing.js","src/kart-leaderboard.js"])
  execFileSync(process.execPath,["--check",p]);
});
