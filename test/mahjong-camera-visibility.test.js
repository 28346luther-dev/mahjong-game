import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import worker,{MahjongRoom} from "../src/worker.js";

const person=id=>({id,name:id,ready:true,hand:[],melds:[],discards:[]});
function fakeSocket(id){
 const messages=[];
 return {messages,attachment:{playerId:id,cameraEnabled:false},
  deserializeAttachment(){return this.attachment;},
  serializeAttachment(a){this.attachment=a;},
  send(s){messages.push(JSON.parse(s));},close(){}};
}
function roomFixture(){
 const storage={async get(){return null;},async put(){}};
 const room=new MahjongRoom({storage,getWebSockets:()=>[]});
 room.state={players:[person("a"),person("b")],phase:"lobby",wall:[],claimWindow:null,message:""};
 const a=fakeSocket("a"),b=fakeSocket("b");
 room.sockets.set("a",a);room.sockets.set("b",b);
 return {room,a,b};
}
test("joining table cannot subscribe to an unconsenting camera",async()=>{
 const {room,a,b}=roomFixture();
 await room.onMessage("b",JSON.stringify({action:"cameraSubscribe",to:"a"}));
 assert.equal(a.messages.length,0);
 await room.onMessage("a",JSON.stringify({action:"cameraStatus",enabled:true}));
 assert.equal(b.messages.at(-1).type,"cameraStatus");
 assert.equal(b.messages.at(-1).enabled,true);
 await room.onMessage("b",JSON.stringify({action:"cameraSubscribe",to:"a"}));
 assert.deepEqual(a.messages.at(-1),{type:"cameraSubscribe",from:"b"});
});
test("offer answer and rapid ICE candidates reach subscribed camera viewers",async()=>{
 const {room,a,b}=roomFixture();
 await room.onMessage("a",JSON.stringify({action:"cameraStatus",enabled:true}));
 for(const kind of ["offer","ice","ice","answer"]){
  await room.onMessage(kind==="answer"?"b":"a",JSON.stringify({
    action:"cameraSignal",to:kind==="answer"?"a":"b",kind,payload:{type:kind,candidate:"test"}
  }));
 }
 const received=b.messages.filter(m=>m.type==="cameraSignal").map(m=>m.kind);
 assert.deepEqual(received,["offer","ice","ice"]);
 assert.equal(a.messages.at(-1).kind,"answer");
 await room.onMessage("a",JSON.stringify({action:"cameraStatus",enabled:false}));
 const before=b.messages.length;
 await room.onMessage("a",JSON.stringify({action:"cameraSignal",to:"b",kind:"offer",payload:{type:"offer"}}));
 assert.equal(b.messages.length,before);
});
test("ICE endpoint requires authentication before showing any configuration",async()=>{
 const response=await worker.fetch(new Request("https://study-plus.online/api/rtc/ice"),{
  AUTH:{idFromName:()=>({}),get:()=>({fetch:()=>new Response("{}",{status:401})})}
 });
 assert.equal(response.status,401);
});
test("camera UI provides a collapsed live gallery and keeps separate popup reaction",()=>{
 const html=readFileSync("public/index.html","utf8"),js=readFileSync("public/reaction-camera.js","utf8");
 for(const id of ["reactionCameraGallery","reactionCameraGalleryToggle","reactionCameraCount","reactionOverlay"])
  assert.ok(html.includes('id="'+id+'"'),"Missing "+id);
 assert.match(js,/cameraSubscribe/);assert.match(js,/RTCPeerConnection/);
 assert.match(js,/updateGallery/);assert.match(js,/requestReplay/);
 assert.match(js,/iceServers/);assert.match(js,/relayAvailable/);
});
test("camera and Worker source pass syntax checks and responsive style is linked",()=>{
 for(const path of ["public/reaction-camera.js","src/worker.js"])
  execFileSync(process.execPath,["--check",path]);
 const html=readFileSync("public/index.html","utf8");
 assert.ok(html.includes("/reaction-gallery-layout.css"));
 const css=readFileSync("public/reaction-gallery-layout.css","utf8");
 assert.match(css,/reaction-camera-gallery/);
 assert.match(css,/max-width:700px/);
});

test("camera relay status and retry button are present after TURN setup",()=>{
 const html=readFileSync("public/index.html","utf8");
 const camera=readFileSync("public/reaction-camera.js","utf8");
 assert.match(html,/id="reactionCameraRetry"/);
 assert.match(camera,/TURN relay not configured/);
 assert.match(camera,/function retry\(\)/);
 assert.match(camera,/iceConfig=null;icePromise=null/);
});
