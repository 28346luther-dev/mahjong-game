import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {MahjongRoom} from "../src/worker.js";

const person=id=>({id,name:id,ready:true,hand:[],melds:[],discards:[]});
const fakeSocket=()=>{const messages=[];return {messages,send:data=>messages.push(JSON.parse(data))};};
function fixture(){
 const storage={async get(){return null;},async put(){}};
 const room=new MahjongRoom({storage,getWebSockets:()=>[]});
 room.state={players:[person("a"),person("b"),person("c")],phase:"playing",wall:[],claimWindow:null,
   message:"",lastReaction:{id:"claim-123",playerId:"a",playerName:"Alice",claim:"pong",at:Date.now()}};
 const a=fakeSocket(),b=fakeSocket(),c=fakeSocket();
 room.sockets.set("a",a);room.sockets.set("b",b);room.sockets.set("c",c);
 return {room,a,b,c};
}
test("only winner of confirmed Pong Chow or Mahjong may upload event reaction",async()=>{
 const {room,a,b,c}=fixture();
 await room.onMessage("b",JSON.stringify({action:"reactionClipStart",eventId:"claim-123",mime:"video/webm",chunks:1}));
 assert.equal(a.messages.length,0);assert.equal(c.messages.length,0);
 await room.onMessage("a",JSON.stringify({action:"reactionClipStart",eventId:"wrong-id",mime:"video/webm",chunks:1}));
 assert.equal(b.messages.length,0);
 await room.onMessage("a",JSON.stringify({action:"reactionClipStart",eventId:"claim-123",mime:"video/webm",chunks:1}));
 assert.equal(b.messages.at(-1).type,"reactionClipStart");
 assert.equal(c.messages.at(-1).name,"Alice");
 assert.equal(a.messages.length,0);
});
test("three-second clip chunks fan out to all other room players without storage",async()=>{
 const {room,a,b,c}=fixture();
 const msg=obj=>room.onMessage("a",JSON.stringify(obj));
 await msg({action:"reactionClipStart",eventId:"claim-123",mime:"video/webm",chunks:2});
 await msg({action:"reactionClipChunk",eventId:"claim-123",index:0,data:"AQID"});
 await msg({action:"reactionClipChunk",eventId:"claim-123",index:1,data:"BAUG"});
 await msg({action:"reactionClipEnd",eventId:"claim-123"});
 assert.deepEqual(b.messages.map(x=>x.type),["reactionClipStart","reactionClipChunk","reactionClipChunk","reactionClipEnd"]);
 assert.deepEqual(c.messages.map(x=>x.type),["reactionClipStart","reactionClipChunk","reactionClipChunk","reactionClipEnd"]);
 assert.equal(a.messages.at(-1).type,"reactionClipAccepted");
 const before=b.messages.length;
 await msg({action:"reactionClipStart",eventId:"claim-123",mime:"video/webm",chunks:1});
 assert.equal(b.messages.length,before,"only one reaction per claim");
 assert.equal(room.state.lastReaction.id,"claim-123","video data never written to game state");
});
test("server rejects malformed, oversized, or out-of-order clip chunks",async()=>{
 const {room,b}=fixture();const msg=obj=>room.onMessage("a",JSON.stringify(obj));
 await msg({action:"reactionClipStart",eventId:"claim-123",mime:"text/html",chunks:1});
 assert.equal(b.messages.length,0);
 await msg({action:"reactionClipStart",eventId:"claim-123",mime:"video/mp4",chunks:1});
 await msg({action:"reactionClipChunk",eventId:"claim-123",index:12,data:"AAAA"});
 assert.equal(b.messages.at(-1).type,"reactionClipAbort");
 assert.equal(room.reactionTransfers.size,0);
 await msg({action:"reactionClipStart",eventId:"claim-123",mime:"video/webm",chunks:1});
 await msg({action:"reactionClipChunk",eventId:"claim-123",index:0,data:"<>script"});
 assert.equal(room.reactionTransfers.size,0);
});
test("new prompt replaces old always-on webcam and the app still handles reactions",()=>{
 const html=readFileSync("public/index.html","utf8"),client=readFileSync("public/reaction-camera.js","utf8");
 for(const id of ["reactionConsent","reactionAccept","reactionSkip","reactionOverlay","reactionVideo"])
  assert.ok(html.includes('id="'+id+'"'),"Missing "+id);
 for(const removed of ["reactionCameraToggle","reactionCameraGalleryToggle","reactionCameraRetry"])
  assert.ok(!html.includes('id="'+removed+'"'),"Obsolete live camera control remains");
 assert.match(client,/RECORD_MS=3000/);
 assert.match(client,/getUserMedia/);
 assert.match(client,/MediaRecorder/);
 assert.match(client,/reactionClipStart/);
 assert.doesNotMatch(client,/RTCPeerConnection|cameraSubscribe|cameraSignal/);
});
test("client and Worker syntax pass and clip-specific CSS is linked",()=>{
 for(const path of ["public/reaction-camera.js","src/worker.js","public/app.js"])
  execFileSync(process.execPath,["--check",path]);
 const html=readFileSync("public/index.html","utf8");
 assert.match(html,/reaction-clip.css/);
 const css=readFileSync("public/reaction-clip.css","utf8");
 assert.match(css,/reaction-consent/);
});
