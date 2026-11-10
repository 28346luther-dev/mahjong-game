import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {MahjongRoom} from "../src/worker.js";

const tile=(id,key=id)=>({id,key,suit:"characters",rank:Number(id.slice(1)),name:id+" Characters"});
const player=(id,hand=[])=>({id,name:id.toUpperCase(),hand,melds:[],discards:[],ready:true});
const makeRoom=(hand=[],wall=[])=>{
 const storage={data:new Map(),async get(k){return this.data.get(k);},async put(k,v){this.data.set(k,v);},async setAlarm(){},async deleteAlarm(){}};
 const room=new MahjongRoom({storage});
 room.state={players:[player("a",hand),player("b",[])],wall,phase:"playing",turn:0,dealer:0,
 lastDiscard:null,claimWindow:null,message:"",winner:null,pendingDraw:null,lastReaction:null};
 return room;
};
test("draw remains above hand until the player explicitly keeps it",async()=>{
 const hand=Array.from({length:13},(_,i)=>tile("c1","hand-"+i));
 const room=makeRoom(hand,[tile("c7","draw-1")]);
 await room.onMessage("a",JSON.stringify({action:"draw"}));
 assert.equal(room.state.players[0].hand.length,13);
 assert.equal(room.state.pendingDraw.key,"draw-1");
 await room.onMessage("a",JSON.stringify({action:"discard",tileKey:"hand-0"}));
 assert.equal(room.state.players[0].hand.length,13,"cannot discard from hand before deciding");
 await room.onMessage("a",JSON.stringify({action:"keepDrawn"}));
 assert.equal(room.state.pendingDraw,null);
 assert.equal(room.state.players[0].hand.length,14);
 assert.equal(room.state.players[0].hand.some(t=>t.key==="draw-1"),true);
});
test("discarding drawn tile never adds it to hand",async()=>{
 const hand=Array.from({length:13},(_,i)=>tile("c1","hand-"+i));
 const room=makeRoom(hand,[tile("c8","next-draw"),tile("c9","draw-2")]);
 await room.onMessage("a",JSON.stringify({action:"draw"}));
 await room.onMessage("a",JSON.stringify({action:"discardDrawn"}));
 assert.equal(room.state.players[0].hand.length,13);
 assert.equal(room.state.players[0].discards.at(-1).key,"draw-2");
 assert.equal(room.state.turn,1);
 assert.equal(room.state.pendingDraw.key,"next-draw");
});
test("self-drawn Mahjong checks visible new tile and records the actual winner",async()=>{
 const hand=[...Array.from({length:3},(_,i)=>tile("c1","a"+i)),
  ...Array.from({length:3},(_,i)=>tile("c2","b"+i)),
  ...Array.from({length:3},(_,i)=>tile("c3","c"+i)),
  ...Array.from({length:3},(_,i)=>tile("c4","d"+i)),tile("c5","e0")];
 const room=makeRoom(hand,[]);
 room.state.pendingDraw=tile("c5","e1");
 await room.onMessage("a",JSON.stringify({action:"selfWin"}));
 assert.equal(room.state.phase,"finished");
 assert.equal(room.state.winner,"a");
 assert.equal(room.state.pendingDraw,null);
 assert.equal(room.state.lastReaction.playerId,"a");
 assert.equal(room.state.lastReaction.claim,"mahjong");
});
test("only resolved Pong or Chow claims produce a reaction moment",()=>{
 for(const action of ["pong","chow"]){
  const hand=action==="pong"?[tile("c6","x"),tile("c6","y")]:[tile("c3","x"),tile("c4","y")];
  const room=makeRoom(hand,[]);
  room.state.phase="claim";
  room.state.lastDiscard={tile:tile(action==="pong"?"c6":"c5","claim-tile"),from:1};
  room.state.players[1].discards.push(room.state.lastDiscard.tile);
  room.state.claimWindow={eligible:["a"],responses:{a:{action,tiles:["x","y"]}}};
  room.resolveClaimWindow();
  assert.equal(room.state.lastReaction.claim,action);
  assert.equal(room.state.lastReaction.playerId,"a");
  assert.equal(room.state.players[0].melds.at(-1).type,action);
 }
});
test("reaction videos require a confirmed claim and never activate a live stream",async()=>{
 const room=makeRoom();
 room.state.lastReaction={id:"reaction-test",playerId:"a",playerName:"A",claim:"chow",at:Date.now()};
 const other=[];
 room.sockets.set("a",{send(){}});
 room.sockets.set("b",{send:s=>other.push(JSON.parse(s))});
 await room.onMessage("a",JSON.stringify({action:"reactionClipStart",eventId:"reaction-test",mime:"video/webm",chunks:1}));
 assert.equal(other.at(-1).type,"reactionClipStart");
 assert.equal(other.at(-1).claim,"chow");
});
test("Mahjong camera and drawn tile scripts pass syntax and are wired to the page",()=>{
 execFileSync(process.execPath,["--check","public/app.js"]);
 execFileSync(process.execPath,["--check","public/reaction-camera.js"]);
 const html=readFileSync("public/index.html","utf8");
 for(const id of ["reactionOverlay","reactionVideo","reactionAccept","drawnTileArea","drawnTileFace"])
  assert.match(html,new RegExp('id="'+id+'"'));
 const client=readFileSync("public/app.js","utf8");
 assert.match(client,/keepDrawn/);assert.match(client,/discardDrawn/);
 assert.match(client,/MahjongReactionCam/);
});
