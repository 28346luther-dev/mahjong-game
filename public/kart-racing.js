import {clearPitGrass} from './kart-road-contact.js';
import {RGBELoader} from './vendor/loaders/RGBELoader.js';
import {RivalMotion} from './kart-network-motion.js';
import {GTDynamics,wheelSurface,brakeSpeed} from './kart-vehicle-dynamics.js';
import {addRoadAtlantaLandscape,terrainHeight} from './kart-landscape.js';
const dynamics=new GTDynamics();
let carVisual=null,miniMap=null;
let mapDrawAt=0,shadowDrawAt=0,frameCost=16;
function drawTrackMap(){
 const now=performance.now();if(now-mapDrawAt<100)return;mapDrawAt=now;
 if(!miniMap){
  const canvas=document.createElement('canvas');canvas.width=280;canvas.height=360;canvas.style.cssText='position:absolute;right:22px;top:20px;width:140px;height:180px;pointer-events:none';canvas.setAttribute('aria-label','Road Atlanta circuit map');document.getElementById('kartCanvas').parentElement.append(canvas);
  const ps=ROAD.samples,b=ps.reduce((b,p)=>({x:Math.min(b.x,p.x),z:Math.min(b.z,p.z),X:Math.max(b.X,p.x),Z:Math.max(b.Z,p.z)}),{x:Infinity,z:Infinity,X:-Infinity,Z:-Infinity});
  miniMap={canvas,b,scale:Math.min(230/(b.X-b.x),300/(b.Z-b.z))};
 }
 const {canvas,b,scale}=miniMap;
 const liveBoard=document.querySelector(".kart-time-board");
 canvas.style.top=($("kartGame").classList.contains("kart-time-trial")?(liveBoard?.offsetTop||20)+(liveBoard?.offsetHeight||180)+15:20)+"px";
 const ctx=canvas.getContext('2d'),px=x=>25+(x-b.x)*scale,pz=z=>25+(z-b.z)*scale;
 ctx.clearRect(0,0,280,360);ctx.beginPath();ROAD.samples.forEach((p,i)=>i?ctx.lineTo(px(p.x),pz(p.z)):ctx.moveTo(px(p.x),pz(p.z)));ctx.closePath();ctx.strokeStyle='#162533b0';ctx.lineWidth=8;ctx.stroke();ctx.strokeStyle='#f4f5f0';ctx.lineWidth=3;ctx.stroke();
 ctx.save();ctx.translate(px(pos.x),pz(pos.z));ctx.rotate(-yaw);ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(-5,-5);ctx.lineTo(5,-5);ctx.closePath();ctx.fillStyle='#ff6436';ctx.fill();ctx.restore();
}

import {ROAD,PIT,PIT_BAYS,ROAD_HALF_WIDTH,PIT_HALF_WIDTH,RUNOFF_WIDTH,TRACK_SCALE,bankRise,bankAngle,cornerKerbGripWidth,refineRoute,projectToRoute,raceStart} from "./kart-track.js";
import {addCircuitGraphics} from "./kart-graphics.js";
import {addKartSafety} from "./kart-safety.js";
import {addPitComplex} from "./kart-pit-complex.js";
import {createGTCar,prepareGTCar} from "./kart-gt-car.js";
import {addCircuitGrandstands} from "./kart-grandstands.js";
import {addStraightGlassBarriers} from "./kart-straight-barriers.js";
import {resolveKartCollision,surfaceNormal,nearPitBay,gravityAlongRoad} from "./kart-physics.js";
const $=id=>document.getElementById(id);
const format=ms=>ms==null?"--:--.---":String(Math.floor(ms/60000)).padStart(2,"0")+":"+String(Math.floor(ms%60000/1000)).padStart(2,"0")+"."+String(Math.floor(ms%1000)).padStart(3,"0");
let THREE,renderer,scene,camera,clock,kart,active=false,playing=false,busy=false,raceId=null,reportedFinish=false;
let speed=0,yaw=0,pos={x:0,y:0,z:0},started=0,progress=0,sendAt=0,telemetryPending=false,lastStatusAt=0;
let lapCount=1,lapToastTimeout=null,lastLeaderboardRefresh=0,boardRequest=null;
let bonnetYaw=0,rivalClockOffset=null;
let cameraMode="chase",cockpitOccluders=[],previousCameraMode="chase";
let driveMode="timetrial",meetingPhase=null,remoteKarts=new Map();
const rivalTargets=new Map();
let selectedMode="timetrial",timeTrial=true,selectorVisible=true;
let localPitUntil=0,localPitBay=null,localPitDone=false;
function getLocalPitRemaining(){return Math.max(0,localPitUntil-Date.now());}
function resetLocalPit(){localPitUntil=0;localPitBay=null;localPitDone=false;}
function localPitService(){
 if(driveMode==="meeting"&&meetingPhase==="race")return;
 if(!inPitLane||!pitLimiter||Math.abs(speed)>.45)return;
 const bay=PIT_BAYS.find(b=>nearPitBay(pos.x,pos.z,b));
 if(!bay||localPitDone||localPitUntil)return;
 localPitUntil=Date.now()+10000;localPitBay=bay.index;
 message("PIT SERVICE · BAY "+(bay.index+1)+" · 10 SECOND STOP");
}

function getPose(){return {x:pos.x,z:pos.z,yaw,speed,pit:inPitLane};}
function createRival(p){
 const palette=[0xb33749,0x2a739d,0x3f8a6b,0xd2ac51,0x805b98,0xdc7b39];
 const index=parseInt(p.id.slice(0,7),16)%palette.length;
 const model=createGTCar(THREE,{color:palette[index],number:index+1});
 model.group.userData.vehicle=model;scene.add(model.group);return model.group;
}
function updateRivals(racers,myId,serverNow=Date.now()){
 const offset=serverNow-performance.now();
 rivalClockOffset=rivalClockOffset===null?offset:rivalClockOffset+Math.max(-2,Math.min(2,offset-rivalClockOffset));
 const list=$("kartTrackPositions");
 if(list){
  list.replaceChildren();
  for(const [index,p] of (racers||[]).entries()){
   const li=document.createElement("li");
   li.textContent="P"+(p.position||index+1)+" "+p.name+(p.id===myId?" · YOU":"")+" L"+(p.lap||0)+"/3";
   if(p.id===myId)li.className="my-position";
   list.append(li);
  }
 }
 if(!scene)return;
 const now=performance.now();
 for(const driver of racers||[]){
  if(driver.id===myId||driver.finishedAt||!Number.isFinite(driver.x)||!Number.isFinite(driver.z))continue;
  let group=remoteKarts.get(driver.id);
  if(!group){
   group=createRival(driver);
   remoteKarts.set(driver.id,group);
   group.position.set(driver.x,projectToRoute(driver.x,driver.z,ROAD).y,driver.z);
   group.rotation.y=(driver.yaw||0)+Math.PI;
  }
  let target=rivalTargets.get(driver.id);
  if(!target){target={motion:new RivalMotion(),lastAt:now};rivalTargets.set(driver.id,target);}
  target.lastAt=now;target.motion.push({x:driver.x,z:driver.z,yaw:driver.yaw||0,speed:driver.speed||0,pit:driver.pitMode,t:driver.lastAt||serverNow});

 }
 for(const [id,group] of remoteKarts){
  const target=rivalTargets.get(id);
  if(!target||now-target.lastAt>7500||!(racers||[]).some(p=>p.id===id&&!p.finishedAt)){
   scene.remove(group);remoteKarts.delete(id);rivalTargets.delete(id);
  }
 }
}
function animateRivals(dt,serverTime=performance.now()+rivalClockOffset){
 for(const [id,group] of remoteKarts){
  const target=rivalTargets.get(id);if(!target)continue;
  const pose=target.motion.sample(serverTime-150);if(!pose)continue;
  const road=projectToRoute(pose.x,pose.z,pose.pit?PIT:ROAD);
  group.position.set(pose.x,wheelSurface(pose.x,pose.z).height+.044,pose.z);
  const up=surfaceNormal(pose.pit?PIT:ROAD,road,0,THREE);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),up).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.yaw+Math.PI));
  group.userData.vehicle?.animate(pose.speed,0,dt);

 }
}
async function beginMeetingStage(phase,mine){
 if(driveMode==="meeting"&&meetingPhase==="grid"&&phase==="race"){
  meetingPhase="race";playing=true;speed=0;started=performance.now();
  $("kartRacePhase").textContent="RACE";
  message("LIGHTS OUT! GO! Complete 3 laps and the mandatory pit stop.");
  return;
 }
 enterTrack("races");
 if(!active)return;
 try{
  await init();driveMode="meeting";meetingPhase=phase;personalSectorBests=[null,null,null];
  playing=true;raceId=null;reportedFinish=false;
  reset();
  if(["grid","race"].includes(phase)&&Number.isFinite(mine?.x)){
   pos.x=mine.x;pos.z=mine.z;
   pos.y=projectToRoute(pos.x,pos.z,ROAD).y;
   yaw=mine.yaw||yaw;
   kart.position.set(pos.x,pos.y,pos.z);kart.rotation.y=yaw+Math.PI;
  }
  started=performance.now();sendAt=performance.now();lapCount=1;resetSectors();
  $("kartRacePhase").textContent=phase.toUpperCase();
  $("kartLap").textContent="1";$("kartProgress").textContent="0%";
  message(phase==="qualifying"?"QUALIFYING: Set your best full lap before the race starts.":
    phase==="grid"?"GRID P"+mine.grid+" · stay stationary until the red lights go out.":
    "LIGHTS OUT! Grid P"+mine.grid+" · three laps · mandatory pit service.");
 }catch(error){message("Could not start multiplayer session: "+error.message);}
}
function clearMeetingStage(){
 if(driveMode==="meeting"){playing=false;driveMode="timetrial";meetingPhase=null;speed=0;}
 for(const group of remoteKarts.values())scene?.remove(group);
 remoteKarts.clear();rivalTargets.clear();
}
function finishMeetingStage(mine){
 if(driveMode!=="meeting"||!mine?.finishedAt)return;
 playing=false;speed=0;
 message(mine.disqualified?
  "Race completed but disqualified: mandatory pit stop not completed.":
  "CHEQUERED FLAG! You finished P"+mine.position+" of the 3-lap race.");
}
function meetingSectorUpdate(data){
 if(driveMode!=="meeting"||!data)return;
 showSector(data.index,data.timeMs,data.color);
 const legend={purple:"SESSION BEST",green:"PERSONAL BEST",yellow:"NO IMPROVEMENT"};
 message("S"+data.index+" · "+format(data.timeMs)+" · "+(legend[data.color]||"SPLIT"));
}
function meetingLapUpdate(data){
 if(driveMode!=="meeting")return;
 if(data.type==="qualifying"){
  $("kartBest").textContent="QUALI BEST "+format(data.bestMs);
  message("Qualifying: "+format(data.timeMs)+" · best "+format(data.bestMs));
 }else if(data.type==="race"){
  $("kartLast").textContent="LAST "+format(data.timeMs);
  $("kartLap").textContent=String(Math.min(3,data.lap+1));
  message("RACE LAP "+data.lap+"/3 · "+format(data.timeMs));
 }
 started=performance.now();
}

const PIT_LIMIT_MS=11.1; // 40 km/h
let pitLimiter=false,inPitLane=false;
let currentSector=1,sectorStarted=0,personalSectorBests=[null,null,null];
function resetSectors(){
 currentSector=1;sectorStarted=performance.now();
 for(let i=1;i<=3;i++){
  const el=$("kartSector"+i);
  if(el){el.textContent="--:--.---";el.classList.remove("sector-current","sector-purple","sector-green","sector-yellow");el.parentElement?.removeAttribute("data-sector-color");}
 }
 $("kartSector1")?.classList.add("sector-current");
 const live=$("kartSectorLive");if(live)live.textContent="SECTOR 1";
}
function showSector(index,ms,color=null){
 const idx=index-1;
 const prior=personalSectorBests[idx];
 const result=color||((prior===null||ms<prior)?"purple":"yellow");
 personalSectorBests[idx]=Math.min(prior??Infinity,ms);
 const el=$("kartSector"+index);
 if(el){
  el.textContent=format(ms);
  el.classList.remove("sector-current","sector-purple","sector-green","sector-yellow");
  el.classList.add("sector-"+result);
  el.parentElement?.setAttribute("data-sector-color",result);
 }
 currentSector=Math.min(3,index+1);
 sectorStarted=performance.now();
 $("kartSector"+currentSector)?.classList.add("sector-current");
 const live=$("kartSectorLive");if(live)live.textContent="SECTOR "+currentSector;
}
function updatePitHUD(){
 const button=$("kartPitLimiter"),label=$("kartPitStatus");
 if(button){button.textContent=pitLimiter?"🟡 PIT LIMITER ON · P":"🛠 PIT LIMITER OFF · P";button.setAttribute("aria-pressed",String(pitLimiter));}
 if(label){label.textContent=inPitLane?"PIT LANE · 40 KM/H":pitLimiter?"PIT LIMITER ACTIVE · 40 KM/H":"PIT LIMITER OFF";}
}
function togglePitLimiter(){
 if(inPitLane&&pitLimiter){message("Stay on the pit limiter until you've rejoined the circuit.");return;}
 pitLimiter=!pitLimiter;
 updatePitHUD();
 message(pitLimiter?"Pit limiter engaged — maximum 40 km/h. Follow the marked pit-lane entry.":
 "Pit limiter disengaged — full racing speed restored.");
}
function setCameraMode(mode){
 if(!["chase","cockpit"].includes(mode))return;
 cameraMode=mode;bonnetYaw=yaw;
 for(const mesh of cockpitOccluders)mesh.visible=mode!=="cockpit";
 const label=document.getElementById("kartCameraLabel");
 if(label)label.textContent=mode==="cockpit"?"BONNET / FIRST PERSON":"CHASE / THIRD PERSON";
 const button=document.getElementById("kartCameraToggle");
 if(button){
  button.textContent=mode==="cockpit"?"🎥 Third-person view":"⛑ First-person view";
  button.setAttribute("aria-pressed",String(mode==="cockpit"));
 }
 const caption=document.getElementById("kartCameraHelp");
 if(caption)caption.textContent=mode==="cockpit"
  ?"First-person bonnet camera · press C to switch back"
  :"Chase camera · press C for a driver's-eye view";
}
const keys=new Set(),touch=new Set(),down=k=>keys.has(k)||touch.has(k);
const visualRoad=refineRoute(ROAD,4),visualPit=refineRoute(PIT,3);
async function api(path,body){
 const r=await fetch("/api/kart/"+path,{method:body?"POST":"GET",credentials:"same-origin",
  headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined,cache:"no-store"});
 const result=await r.json();if(!r.ok)throw Error(result.error||"Race service unavailable");
 return result;
}
function gripForDistance(distance,isPit=false,progress=0){
 // Painted racing kerbs and adjoining green paint have full road grip.
 // Sand and grass alone drag the kart down.
 // Apex kerbs extend 1.48 m beyond the edge; selected exits extend 2.46 m.
 // Keep the full painted exit strip driveable, not just the original narrow kerb.
 const kerbWidth=cornerKerbGripWidth(progress);
 if(isPit||distance<=ROAD_HALF_WIDTH+Math.max(3.6,kerbWidth))return {drag:0,surface:"kerb"};
 if(distance<=ROAD_HALF_WIDTH+5.2)return {drag:2.1,surface:"gravel"};
 if(distance<=ROAD_HALF_WIDTH+RUNOFF_WIDTH)return {drag:3.3,surface:"grass"};
 return {drag:7.5,surface:"barrier"};
}
async function toggleFullscreen(){
 const root=$("kartGame");
 try{
  if(document.fullscreenElement===root){
   await document.exitFullscreen();
  }else{
   if(!root.requestFullscreen)throw Error("Fullscreen unavailable in this browser");
   await root.requestFullscreen();
  }
 }catch(error){message("Could not enter fullscreen: "+error.message);}
}
function syncFullscreen(){
 const full=document.fullscreenElement===$("kartGame");
 const btn=$("kartFullscreen");
 btn.textContent=full?"⛶ Exit fullscreen":"⛶ Fullscreen";
 btn.setAttribute("aria-pressed",String(full));
}
document.addEventListener("fullscreenchange",syncFullscreen);
function message(t){$("kartStatus").textContent=t;}
function standings(records){
 const list=$("kartLeaderboard");list.replaceChildren();
 const selectorList=$("kartHubLeaderboard"),liveList=$("kartLiveLeaderboard");
 liveList?.replaceChildren();
 if(selectorList)selectorList.replaceChildren();
 if(!records?.length){
  for(const parent of [list,selectorList,liveList].filter(Boolean)){
   const li=document.createElement("li");li.textContent="No recorded laps yet — set the first full lap!";
   parent.append(li);
  }
  return;
 }
 for(const p of records){
  const li=document.createElement("li"),rank=document.createElement("strong"),name=document.createElement("span"),time=document.createElement("b");
  rank.textContent="#"+p.rank;name.textContent=p.name;time.textContent=format(p.bestMs);
  li.append(rank,name,time);list.append(li);
  liveList?.append(li.cloneNode(true));
  if(selectorList){
   const row=document.createElement("li");
   row.textContent="#"+p.rank+"  "+p.name+"  —  "+format(p.bestMs);
   selectorList.append(row);
  }
 }
}
async function leaderboard(){
 if(boardRequest)return boardRequest;
 boardRequest=(async()=>{
  try{standings((await api("leaderboard")).entries);}catch{
   if(active)message("Leaderboard temporarily unavailable; keep racing.");
  }finally{boardRequest=null;}
 })();
 return boardRequest;
}
function object(geometry,material,x,y,z,parent=scene){
 const o=new THREE.Mesh(geometry,material);o.position.set(x,y,z);
 o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
}
function material(color,roughness=.75,metalness=0){
 return new THREE.MeshStandardMaterial({color,roughness,metalness,side:THREE.DoubleSide});
}
function box(w,h,d,color,x,y,z,parent=scene){
 return object(new THREE.BoxGeometry(w,h,d),material(color),x,y,z,parent);
}
function post(r,h,color,x,y,z){
 return object(new THREE.CylinderGeometry(r,r,h,12),material(color),x,y,z);
}
function tangent(route,i){
 const points=route.samples;
 const from=points[route.closed?(i-1+points.length)%points.length:Math.max(0,i-1)],to=points[route.closed?(i+1)%points.length:Math.min(points.length-1,i+1)];
 const dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz)||1;
 return {tx:dx/len,tz:dz/len,nx:-dz/len,nz:dx/len};
}
function ribbon(route,from,to,color,raise=.02){
 const ps=route.samples,verts=[],uv=[],indices=[];
 for(let i=0;i<ps.length;i++){
  const p=ps[i],dir=tangent(route,i);
  for(const offset of [from,to]){
   verts.push(p.x+dir.nx*offset,p.y+raise+(route.closed?bankRise(i/ps.length,offset):0),p.z+dir.nz*offset);
   uv.push(i/ps.length*14,offset===from?0:1);
  }
 }
 for(let i=0;i<(route.closed?ps.length:ps.length-1);i++){
  const k=i*2,l=((i+1)%ps.length)*2;
  indices.push(k,k+1,l,k+1,l+1,l);
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));
 geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
 geo.setIndex(indices);
 if(color===0x698c68)clearPitGrass(geo);
 geo.computeVertexNormals();
 const mesh=object(geo,material(color,.94),0,0,0);
 if(color===0x373b43||color===0x353c44)mesh.userData.paved=true;
 return mesh;
}
function embankment(route,side,width=8){
 // Triangulated soil shoulders meet the underlying grass, so elevated corners
 // sit on hills rather than appearing to hover several metres above the ground.
 const vertices=[],indices=[],samples=route.samples;
 for(let i=0;i<samples.length;i++){
  const p=samples[i],d=tangent(route,i);
  // Start outside all kerbs and runoff; original embankment began inside
  // the paved verge and intersected the asphalt as an ugly grass lip.
  const edge=(ROAD_HALF_WIDTH+RUNOFF_WIDTH+.35)*side;
  vertices.push(p.x+d.nx*edge,p.y+bankRise(i/samples.length,edge)-.12,p.z+d.nz*edge);
  const ox=p.x+d.nx*(edge+side*width),oz=p.z+d.nz*(edge+side*width);
  vertices.push(ox,terrainHeight(ox,oz)-.15,oz);
 }
 for(let i=0;i<(route.closed?samples.length:samples.length-1);i++){
  const a=i*2,b=((i+1)%samples.length)*2;
  // Suppress the main-track grass embankment where the paved pit road
  // branches off or merges back. Otherwise a green lip crosses the exit.
  const p=samples[i],q=samples[(i+1)%samples.length],d=tangent(route,i);
  const edge=(ROAD_HALF_WIDTH+RUNOFF_WIDTH+.35+width/2)*side;
  const testX=(p.x+q.x)/2+d.nx*edge,testZ=(p.z+q.z)/2+d.nz*edge;
  if(projectToRoute(testX,testZ,PIT).distance<PIT_HALF_WIDTH+8)continue;
  indices.push(a,a+1,b,a+1,b+1,b);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
 geometry.setIndex(indices);clearPitGrass(geometry);geometry.computeVertexNormals();
 object(geometry,material(0x5b7a57,.99),0,0,0);
}
function stripeAcross(route,i,color,count=10,depth=.5){
 const ps=route.samples,p=ps[i%ps.length],d=tangent(route,i%ps.length);
 for(let n=0;n<count;n++){
  const across=-ROAD_HALF_WIDTH+(n+.5)*ROAD_HALF_WIDTH*2/count;
  const block=box(ROAD_HALF_WIDTH*2/count-.04,.02,depth,color?p.color||color:0xffffff,
   p.x+d.nx*across,p.y+.075,p.z+d.nz*across);
  block.rotation.y=Math.atan2(d.tx,d.tz);
 }
}
function track(){
 const bounds=ROAD.samples.reduce((b,p)=>({
  minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),
  minZ:Math.min(b.minZ,p.z),maxZ:Math.max(b.maxZ,p.z)}),
  {minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
 const green=object(new THREE.PlaneGeometry(bounds.maxX-bounds.minX+330,
  bounds.maxZ-bounds.minZ+330),material(0x477854,.97),
  (bounds.minX+bounds.maxX)/2,-.1,(bounds.minZ+bounds.maxZ)/2);
 green.rotation.x=-Math.PI/2;
 scene.remove(green);
 addRoadAtlantaLandscape(THREE,scene);
 embankment(visualRoad,-1,40);embankment(visualRoad,1,40);
 ribbon(visualRoad,-ROAD_HALF_WIDTH-RUNOFF_WIDTH,ROAD_HALF_WIDTH+RUNOFF_WIDTH,0x698c68,-.058);
  ribbon(visualRoad,-ROAD_HALF_WIDTH,ROAD_HALF_WIDTH,0x373b43,.015);
 ribbon(visualPit,-PIT_HALF_WIDTH,PIT_HALF_WIDTH,0x353c44,.067);
 // A single coherent textured circuit surface and curved kerb system
 // replaces the previous overlapping paving, sharp blocks and floating sheets.
 addCircuitGraphics(THREE,scene,visualRoad,visualPit,ROAD_HALF_WIDTH,RUNOFF_WIDTH);
 addKartSafety(THREE,scene,ROAD,ROAD_HALF_WIDTH,RUNOFF_WIDTH);
 // Detailed two-level garage building, safe entry signs and four marked service bays.
 addPitComplex(THREE,scene,PIT,PIT_BAYS);
 addCircuitGrandstands(THREE,scene);
 // Road Atlanta-style barriers are handled by the circuit safety layout.
 // The legacy pit-straight glass wall no longer matches this new route.
 // Sixteen staggered, clean half-box grid positions. The start/finish
 // line is now at the END of the pit straight, so all boxes sit BACK from
 // the finish line along the straight, not scattered into turn one.
 const gridStart=ROAD.samples[0],gridPrevious=ROAD.samples[ROAD.samples.length-8];
 const gridDx=gridStart.x-gridPrevious.x,gridDz=gridStart.z-gridPrevious.z;
 const gridLen=Math.hypot(gridDx,gridDz)||1,gtx=gridDx/gridLen,gtz=gridDz/gridLen;
 const gridYaw=Math.atan2(gtx,gtz);
 const drawGridLine=(width,length,x,z)=>{
  const y=projectToRoute(x,z,ROAD).y+.13;
  const stripe=box(width,.017,length,0xf8f6ef,x,y,z);
  stripe.rotation.y=gridYaw;
  return stripe;
 };
 for(let i=0;i<16;i++){
  const side=i%2?1:-1,lane=side*2.25;
  const back=8+Math.floor(i/2)*5.7;
  const gx=gridStart.x-gtx*back-gtz*lane;
  const gz=gridStart.z-gtz*back+gtx*lane;
  // Short forward transverse edge plus ONE longitudinal edge: an L shape.
  drawGridLine(2.08,.105,gx+gtx*1.49,gz+gtz*1.49);
  const outer=side*1.03;
  drawGridLine(.105,2.95,gx-gtz*outer,gz+gtx*outer);
 }
 // Timing paint is retained; the invented front-straight gantry is removed.
 // Legacy track-specific tyre stacks removed from the new pit apron.
}
function kartModel(){
 const vee=createGTCar(THREE,{color:0xff4c0a,number:7});
 carVisual=vee;kart=vee.group;scene.add(kart);
 cockpitOccluders.push(...vee.hiddenInCockpit);
}
function construct(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0xa2c6d0);scene.fog=new THREE.FogExp2(0xa2c6d0,.00048);
 scene.add(new THREE.HemisphereLight(0xdfeeff,0x474438,.95));
 scene.add(new THREE.AmbientLight(0xffe9d5,.12));
 const sun=new THREE.DirectionalLight(0xfff0d6,2.1);
 sun.position.set(-35,76,28);sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);
 sun.shadow.normalBias=.023;
 sun.shadow.radius=2;
 sun.shadow.camera.left=-75;sun.shadow.camera.right=75;
 sun.shadow.camera.top=75;sun.shadow.camera.bottom=-75;
 sun.shadow.camera.near=10;sun.shadow.camera.far=260;sun.shadow.bias=-.0002;
 sun.name="circuitSun";scene.add(sun);scene.add(sun.target);
 // A tall sky dome uses a physically inspired horizon-to-zenith gradient.
 const skyMaterial=new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,
  uniforms:{topColor:{value:new THREE.Color(0x558fc7)},horizonColor:{value:new THREE.Color(0xdcebf0)},
    bottomColor:{value:new THREE.Color(0xb2c9b9)}},
  vertexShader:"varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
  fragmentShader:`
   varying vec3 vWorld;uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 bottomColor;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
   void main(){
    vec3 direction=normalize(vWorld);float t=direction.y;
    vec3 col=t>0.?mix(horizonColor,topColor,pow(clamp(t,0.,1.),.48)):mix(horizonColor,bottomColor,clamp(-t*1.6,0.,1.));
    if(t>.025){
     vec2 p=direction.xz/(t+.18)*3.5;
     float cloud=noise(p)*.60+noise(p*2.03)*.27+noise(p*4.07)*.13;
     float cover=smoothstep(.53,.73,cloud)*smoothstep(.025,.22,t);
     col=mix(col,mix(vec3(.72,.79,.83),vec3(.98,.97,.93),smoothstep(.53,.80,cloud)),cover*.86);
    }
    gl_FragColor=vec4(col,1.);
   }`

 });
 scene.add(new THREE.Mesh(new THREE.SphereGeometry(3200,48,24),skyMaterial));
 const environment=new THREE.Scene();environment.add(new THREE.Mesh(new THREE.SphereGeometry(50,32,16),skyMaterial.clone()));
 const pmrem=new THREE.PMREMGenerator(renderer);const envTarget=pmrem.fromScene(environment,.04,1,100);scene.environment=envTarget.texture;pmrem.dispose();
 track();kartModel();setCameraMode(cameraMode);
}
async function init(){
 if(renderer)return;
 THREE=await import("./vendor/three.module.js");
 renderer=new THREE.WebGLRenderer({canvas:$("kartCanvas"),antialias:true,powerPreference:"high-performance"});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 renderer.physicallyCorrectLights=true;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 camera=new THREE.PerspectiveCamera(64,1,.1,3500);clock=new THREE.Clock();
 await prepareGTCar();
 construct();
 const hdr=await new RGBELoader().loadAsync('/assets/daylight.hdr');
 hdr.mapping=THREE.EquirectangularReflectionMapping;
 scene.environment=hdr;
 reset();requestAnimationFrame(frame);
}
function reset(){
 resetLocalPit();
 const start=raceStart();pos={x:start.x,y:start.y,z:start.z};yaw=start.yaw;bonnetYaw=yaw;
 dynamics.reset(start.y);speed=0;progress=0;reportedFinish=false;pitLimiter=false;inPitLane=false;updatePitHUD();
 if(kart){kart.position.set(pos.x,pos.y,pos.z);kart.rotation.y=yaw+Math.PI;}
 if(camera){camera.position.set(pos.x-Math.sin(yaw)*7.2,pos.y+2.9,pos.z-Math.cos(yaw)*7.2);camera.lookAt(pos.x+Math.sin(yaw)*8,pos.y+.85,pos.z+Math.cos(yaw)*8);}
}
function positionOnTrack(x,z){
 const road=projectToRoute(x,z,ROAD),pit=projectToRoute(x,z,PIT);
 // Entering the paved branch selects the pit lane and engages its limiter.
 // Keep the lane selected until the PIT OUT merge meets the racing asphalt.
 // At either junction the two surfaces overlap and driving is continuous.
 const mergeReady=inPitLane&&pit.progress>.96&&
  road.distance<ROAD_HALF_WIDTH+1.5;
 const pitAvailable=pit.distance<PIT_HALF_WIDTH+1.25;
 const enterReady=pitAvailable&&pit.progress>.01&&pit.progress<.94;
 if((pitLimiter||inPitLane||road.distance>ROAD_HALF_WIDTH&&pit.distance<road.distance)&&!mergeReady&&pitAvailable&&(inPitLane||enterReady))
  return {...pit,isPit:true};
 return {...road,isPit:false};
}
async function transmit(){
 if(driveMode==="meeting"){
  if(playing)await window.KartMeetings?.sendTelemetry?.(getPose());
  return;
 }
 if(telemetryPending||!raceId||!playing)return;
 telemetryPending=true;
 const current=raceId,position={x:pos.x,z:pos.z,pit:inPitLane};
 try{
  const result=await api("sample",{raceId:current,...position});
  if(!active||raceId!==current)return;
  progress=result.progress;
  $("kartProgress").textContent=progress+"%";
  if(Number.isFinite(result.lapElapsedMs)){
   // Single cumulative lap clock; split updates never change its origin.
   $("kartTime").textContent=format(result.lapElapsedMs);
 }
 if(result.sectorUpdate){
   showSector(result.sectorUpdate.index,result.sectorUpdate.timeMs);
   message("Sector "+result.sectorUpdate.index+": "+format(result.sectorUpdate.timeMs));
  }
  if(result.pit){
   $("kartProgress").textContent="PIT";
   if(result.pitEntry){resetSectors();message("In the pit lane — 40 km/h limiter active. Your current lap is not timed.");}
  }else if(result.pitExit){
   started=performance.now();resetSectors();
   $("kartTime").textContent="00:00.000";
   message("Pit exit — rejoin the circuit. Your timed lap has restarted.");
  }
  if(result.readyToFinish&&!reportedFinish){
   reportedFinish=true;
   const finish=await api("finish",{raceId:current,...position});
   if(raceId!==current)return;
   // Crossing the line records a lap and immediately starts the next one.
   // Keep the same race ID and driving velocity; never lock the controls.
   // Display complete last-lap splits before the next sector starts.
   if(Array.isArray(finish.sectorTimes)){
    finish.sectorTimes.forEach((ms,i)=>{$("kartSector"+(i+1)).textContent=format(ms);});
   }
   lapCount=finish.nextLap;
   started=performance.now();currentSector=1;sectorStarted=started;
   $("kartSectorLive").textContent="SECTOR 1";
   progress=0;reportedFinish=false;
   $("kartLap").textContent=String(lapCount);
   $("kartTime").textContent="00:00.000";
   $("kartProgress").textContent="0%";
   $("kartLast").textContent="LAST "+format(finish.elapsedMs);
   $("kartBest").textContent="BEST "+format(finish.bestMs);
   message((finish.personalBest?"🏆 NEW PERSONAL BEST! ":"LAP "+finish.lap+" COMPLETE! ")+
     format(finish.elapsedMs)+" · Lap "+lapCount+" now running.");
   standings(finish.entries);
   lastLeaderboardRefresh=performance.now();
   if(timeTrial){
    // Time Trial is an ongoing best-lap session, NOT a one-lap mode.
    // Preserve velocity and the same server session for unlimited attempts.
    resetSectors();
    message("Time trial lap "+finish.lap+": "+format(finish.elapsedMs)+
      (finish.personalBest?" · NEW BEST!":" · keep racing for a faster lap!"));
   }
  }
 }catch(error){
  if(raceId===current){playing=false;message(error.message+" Restart the lap to try again.");}
 }finally{telemetryPending=false;}
}
function updateRideHeightAndBank(dt){
 if(!kart||!THREE)return;
 const projected=positionOnTrack(pos.x,pos.z);
 const lateral=(pos.x-projected.x)*projected.normalX+(pos.z-projected.z)*projected.normalZ;
 const contactY=projected.y+(projected.isPit?0:bankRise(projected.progress,lateral));
 pos.y=contactY;
 const yawQuat=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw+Math.PI);
 const roadAt=(x,z)=>wheelSurface(x,z).height+.044;
 const contacts=(carVisual?.wheels||[]).filter(w=>w.restY!==undefined).map(w=>{
  const local=new THREE.Vector3(w.group.position.x,w.restY,w.group.position.z);
  const world=local.clone().applyQuaternion(yawQuat).add(new THREE.Vector3(pos.x,0,pos.z));
  return {wheel:w,local,height:roadAt(world.x,world.z)};
 });
 if(contacts.length===4){
  const mean=(list,get)=>list.reduce((sum,p)=>sum+get(p),0)/list.length;
  const front=contacts.filter(c=>c.wheel.front),rear=contacts.filter(c=>!c.wheel.front);
  const left=contacts.filter(c=>c.local.x<0),right=contacts.filter(c=>c.local.x>0);
  const slopeZ=(mean(rear,c=>c.height)-mean(front,c=>c.height))/(mean(rear,c=>c.local.z)-mean(front,c=>c.local.z));
  const slopeX=(mean(right,c=>c.height)-mean(left,c=>c.height))/(mean(right,c=>c.local.x)-mean(left,c=>c.local.x));
  const localUp=new THREE.Vector3(-slopeX,1,-slopeZ).normalize();
  const roadQuat=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),localUp);
  const suspension=new THREE.Quaternion().setFromEuler(new THREE.Euler(dynamics.pitch,0,dynamics.roll));
  kart.quaternion.copy(yawQuat).multiply(roadQuat).multiply(suspension);
  // Fit the chassis to all four contacts, rather than suspending it above
  // one centreline height. Only a small sprung-body movement remains.
  const rootY=mean(contacts,c=>c.height+c.wheel.radius/localUp.y-c.local.clone().applyQuaternion(kart.quaternion).y);
  kart.position.set(pos.x,rootY+dynamics.heave,pos.z);
  const upY=new THREE.Vector3(0,1,0).applyQuaternion(kart.quaternion).y;
  for(const {wheel} of contacts){
   wheel.group.position.y=wheel.restY;
   for(let i=0;i<2;i++){
    const world=wheel.group.position.clone().applyQuaternion(kart.quaternion).add(kart.position);
    wheel.group.position.y+=(roadAt(world.x,world.z)+wheel.radius/localUp.y-world.y)/upY;
   }
  }
 }else{
  const up=surfaceNormal(projected.isPit?PIT:ROAD,projected,projected.isPit?0:bankAngle(projected.progress),THREE);
  kart.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),up)).multiply(yawQuat);
  kart.position.set(pos.x,contactY+(projected.isPit?.087:.044),pos.z);
 }
 kart.updateMatrixWorld(true);

}
function update(dt){
 if(!playing)return;
 if(localPitUntil){
  if(getLocalPitRemaining()>0){
   speed=0;updateRideHeightAndBank(dt);return;
  }
  localPitUntil=0;localPitDone=true;
  message("PIT SERVICE COMPLETE · RELEASED FROM BAY "+(Number(localPitBay)+1));
 }
 if(driveMode==="meeting"&&!window.KartMeetings?.canDrive?.()){
  speed=0;updateRideHeightAndBank(dt);
  if(performance.now()-sendAt>(driveMode==="meeting"?100:480)){sendAt=performance.now();transmit();}
  return;
 }
 const accelerate=down("w")||down("arrowup");
 const brake=down("s")||down("arrowdown")||down(" ");
 const steer=Number(down("d")||down("arrowright"))-Number(down("a")||down("arrowleft"));
 speed+=Number(accelerate&&!brake)*Math.min(8.8,330000/(1320*Math.max(12,Math.abs(speed))))*dt;
 speed-=Math.sign(speed)*(.16+.00065*speed*speed)*dt;
 if(brake)speed=brakeSpeed(speed,dt);
 speed=Math.max(-4,Math.min(pitLimiter?PIT_LIMIT_MS:82,speed));
 if(pitLimiter&&speed>PIT_LIMIT_MS)speed=PIT_LIMIT_MS;
 if(!accelerate&&!brake&&Math.abs(speed)<.15)speed=0;
 const grade=positionOnTrack(pos.x,pos.z);
 if(Math.abs(speed)>.05&&!grade.isPit){
  // Small but physical downhill/uphill acceleration from the actual road grade.
  speed+=gravityAlongRoad(ROAD,grade,yaw)*dt;
  speed=Math.max(-4,Math.min(pitLimiter?PIT_LIMIT_MS:82,speed));
 }
 // In this coordinate system positive yaw steers world-left, so D decreases yaw.
 // Higher speed increases the turning radius; brake before the chicanes.
 const response=dynamics.step(dt,{x:pos.x,z:pos.z,y:grade.y,yaw,speed,steer,brake,isPit:grade.isPit});
 yaw+=response.yawDelta;
 const proposedX=pos.x+Math.sin(yaw)*speed*dt+Math.cos(yaw)*response.sideDistance;
 const proposedZ=pos.z+Math.cos(yaw)*speed*dt-Math.sin(yaw)*response.sideDistance;
 carVisual?.animate(speed,-dynamics.steer,dt);
 const collision=driveMode==="meeting"?resolveKartCollision(pos.x,pos.z,proposedX,proposedZ,
   [...remoteKarts.values()].filter(g=>g.visible).map(g=>({x:g.position.x,z:g.position.z}))):null;
 const x=collision?.x??proposedX,z=collision?.z??proposedZ;
 if(collision?.hit){speed*=.22;message("CONTACT · Avoid the other GT cars.");}
 const projected=positionOnTrack(x,z);
 const grip=gripForDistance(projected.distance,projected.isPit,projected.progress);
 // The pit branch is paved; entering it automatically engages the limiter.
 // Do not penalise tarmac, kerbs or green painted runoff.
 if(grip.drag>0)speed*=Math.exp(-grip.drag*dt);
 if(grip.surface!=="barrier"){
  pos.x=x;pos.z=z;
  const lateral=(x-projected.x)*projected.normalX+(z-projected.z)*projected.normalZ;
  pos.y=projected.y+(projected.isPit?0:bankRise(projected.progress,lateral));
  if(inPitLane!==projected.isPit){
   if(!projected.isPit){localPitUntil=0;localPitDone=false;}
   inPitLane=projected.isPit;
   if(inPitLane){pitLimiter=true;speed=Math.min(speed,PIT_LIMIT_MS);}
   updatePitHUD();
   message(inPitLane?"Entering pit lane at 40 km/h. Your lap timer is paused.":"Pit exit — back on the circuit.");
  }
 }else{
  speed*=.23; // Outside barrier prevents off-track shortcut.
 }
 localPitService();
 if(performance.now()-sendAt>(driveMode==="meeting"?100:320)&&!telemetryPending){sendAt=performance.now();transmit();}
 // Sector times are display-only and never reset this lap clock.
 if(driveMode!=="meeting")$("kartTime").textContent=format(performance.now()-started);
 else if(meetingPhase==="qualifying"||meetingPhase==="race")$("kartTime").textContent=format(performance.now()-started);
}
function frame(){
 requestAnimationFrame(frame);
 if(!active||!renderer)return;
 const frameStart=performance.now();
 const dt=Math.min(.1,clock.getDelta());
 // Retain elapsed time on slower frames without a giant physics step.
 for(let remaining=dt;remaining>1e-8;){const step=Math.min(1/60,remaining);update(step);remaining-=step;}
 updateRideHeightAndBank(dt);
 const w=$("kartCanvas").clientWidth||100,h=$("kartCanvas").clientHeight||100,dpr=renderer.getPixelRatio();
 if(renderer.domElement.width!==Math.round(w*dpr)||renderer.domElement.height!==Math.round(h*dpr)){
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
 }
 if(cameraMode==="cockpit"){
  // Bonnet camera sits ahead of the cabin: only the car nose frames the road.
  const eye=new THREE.Vector3(0,1.08,-1.05).applyQuaternion(kart.quaternion).add(kart.position);
  const ahead=new THREE.Vector3(0,1.14,-31).applyQuaternion(kart.quaternion).add(kart.position);
  // A short, bounded heading follow lets the nose visibly pivot in a turn
  // while keeping the viewpoint attached to the bonnet and the horizon stable.
  const turn=Math.atan2(Math.sin(yaw-bonnetYaw),Math.cos(yaw-bonnetYaw));
  bonnetYaw=yaw-Math.max(-.10,Math.min(.10,turn*Math.exp(-dt*10)));
  ahead.x=eye.x+Math.sin(bonnetYaw)*30;ahead.z=eye.z+Math.cos(bonnetYaw)*30;
  camera.position.copy(eye);camera.up.set(0,1,0);camera.lookAt(ahead);
  // Fixed bonnet FOV avoids speed-dependent zoom.
  if(camera.fov!==73){camera.fov=73;camera.updateProjectionMatrix();}
 }else{
  camera.up.set(0,1,0);
  const target=new THREE.Vector3(pos.x-Math.sin(yaw)*7.2,pos.y+2.9,pos.z-Math.cos(yaw)*7.2);
  camera.position.lerp(target,1-Math.exp(-dt*12));
  camera.lookAt(pos.x+Math.sin(yaw)*8,pos.y+.85,pos.z+Math.cos(yaw)*8);
  if(camera.fov!==58){camera.fov=58;camera.updateProjectionMatrix();}
 }
 animateRivals(dt);drawTrackMap();
 const sun=scene.getObjectByName('circuitSun');
 if(sun){sun.position.set(pos.x-65,pos.y+120,pos.z+45);sun.target.position.set(pos.x,pos.y,pos.z);sun.target.updateMatrixWorld();}
 // Keep moving shadows, but avoid redrawing the complete shadow atlas at
 // display refresh rate. The main pass still renders every input frame.
 renderer.shadowMap.autoUpdate=false;
 if(frameStart-shadowDrawAt>33){renderer.shadowMap.needsUpdate=true;shadowDrawAt=frameStart;}
 renderer.render(scene,camera);
 frameCost+=(performance.now()-frameStart-frameCost)*.05;
 // Retain antialiasing and detailed materials; reduce fill rate on slow GPUs.
 const desiredRatio=frameCost>25?1:Math.min(window.devicePixelRatio||1,2);
 if(renderer.getPixelRatio()!==desiredRatio&&Math.abs(frameCost-25)>5)renderer.setPixelRatio(desiredRatio);

 window.KartMeetings?.tick?.();
 if(performance.now()-lastLeaderboardRefresh>5000){lastLeaderboardRefresh=performance.now();leaderboard();}
 $("kartSpeed").textContent=Math.round(Math.abs(speed)*3.6)+" km/h";
}
async function begin(){
 if(driveMode==="meeting")clearMeetingStage();
 driveMode="timetrial";
 if(busy)return;busy=true;$("kartStart").disabled=true;message("Loading circuit and car…");
 try{
  await init();
  if(!active||selectorVisible||selectedMode!=="timetrial")return;
  const result=await api("start",{});
  if(!active||selectorVisible||selectedMode!=="timetrial")return;
  raceId=result.raceId;reset();resetSectors();lapCount=1;started=performance.now();sendAt=performance.now();playing=true;
  $("kartLap").textContent="1";$("kartLast").textContent="LAST --:--.---";
  $("kartTime").textContent="00:00.000";
  $("kartProgress").textContent="0%";
  $("kartStart").textContent="Restart session";
  if(result.bestMs)$("kartBest").textContent="BEST "+format(result.bestMs);
  $("kartRacePhase").textContent="TIME TRIAL";
  message("GO! Hit the apex kerbs, keep clear of the gravel, and stay out for unlimited timed laps.");
 }catch(error){message(error.message);}
 finally{busy=false;$("kartStart").disabled=false;}
}
function enterTrack(mode="timetrial"){
 if(mode==="practice")mode="timetrial";
 selectedMode=mode;timeTrial=mode==="timetrial";selectorVisible=false;
 $("kartGame").classList.add("kart-driving");
 $("kartGame").classList.toggle("kart-time-trial",mode==="timetrial");
 $("kartGame").classList.remove("kart-selector");
 $("kartDrivingMode").textContent=mode==="timetrial"?"TIME TRIAL":mode==="races"?"CHAMPIONSHIP":"TIME TRIAL";
 $("kartTrackPositions").replaceChildren();
 if(mode!=="races"){
  const item=document.createElement("li");item.textContent="GLOBAL TIME TRIAL";
  $("kartTrackPositions").append(item);
 }
 if(mode==="timetrial"){leaderboard();begin();}
 else message("Race meeting selected. Qualifying begins at the scheduled time.");
}
function backToSelector(){
 if(document.fullscreenElement===$("kartGame"))document.exitFullscreen().catch(()=>{});
 playing=false;speed=0;raceId=null;clearMeetingStage();keys.clear();touch.clear();
 selectorVisible=true;
 $("kartGame").classList.remove("kart-driving","kart-races-hub");
 $("kartGame").classList.add("kart-selector");
 window.KartMeetings?.refresh?.();
}
function showRaceMeetings(){
 if(!selectorVisible)backToSelector();
 selectorVisible=true;$("kartGame").classList.add("kart-selector","kart-races-hub");
 $("kartGame").classList.remove("kart-driving");
 window.KartMeetings?.refresh?.();
}
function mayAutoJoinMeeting(){
 return active&&(!selectorVisible||$("kartGame").classList.contains("kart-races-hub"));
}
function open(){
 if(active)return;active=true;$("kartGame").classList.remove("hidden");
 document.body.classList.add("kart-open");document.exitPointerLock?.();
 $("kartGame").classList.add("kart-selector");
 $("kartGame").classList.remove("kart-driving","kart-races-hub");
 selectorVisible=true;message("Choose your racing mode to begin.");
 if(!document.getElementById('circuitAttribution')){const a=document.createElement('a');a.id='circuitAttribution';a.href='/data/road-atlanta-source.json';a.target='_blank';a.rel='noopener';a.textContent='Map © OSM · Terrain: USGS/NOAA · Car: vicent091036 / three.js · modified GT-style';a.style.cssText='position:absolute;bottom:5px;left:8px;z-index:20;color:#ddd;font:10px sans-serif;background:#142129b0;padding:3px 5px';$('kartGame').append(a);}
 leaderboard();lastLeaderboardRefresh=performance.now();
 window.KartMeetings?.open?.();
}
function close(){
 window.KartMeetings?.close?.();clearMeetingStage();
 if(document.fullscreenElement===$("kartGame"))document.exitFullscreen().catch(()=>{});
 active=false;playing=false;raceId=null;keys.clear();touch.clear();speed=0;selectorVisible=true;pitLimiter=false;inPitLane=false;updatePitHUD();
 $("kartGame").classList.add("hidden");$("kartGame").classList.remove("kart-driving","kart-selector","kart-races-hub");document.body.classList.remove("kart-open");
}
window.addEventListener("keydown",e=>{
 if(!active||["INPUT","TEXTAREA"].includes(document.activeElement?.tagName))return;
 const k=e.key.toLowerCase();
 if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)){
  keys.add(k);e.preventDefault();
 }
 if(k==="c"){setCameraMode(cameraMode==="chase"?"cockpit":"chase");e.preventDefault();}
 if(k==="p"){togglePitLimiter();e.preventDefault();}
 if(k==="f"&&!selectorVisible){toggleFullscreen();e.preventDefault();}
 if(k==="r"&&!selectorVisible){reset();playing=false;message("Kart reset. Start a new timed lap to record a result.");}
 if(k==="escape"){e.preventDefault();if(!selectorVisible)backToSelector();else close();}
});
window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
window.addEventListener("blur",()=>keys.clear());
document.querySelectorAll("[data-kart-key]").forEach(button=>{
 const k=button.dataset.kartKey;
 button.addEventListener("pointerdown",e=>{e.preventDefault();touch.add(k);button.setPointerCapture?.(e.pointerId);});
 for(const event of ["pointerup","pointercancel","lostpointercapture"])button.addEventListener(event,()=>touch.delete(k));
});
$("kartCameraToggle").addEventListener("click",()=>setCameraMode(cameraMode==="chase"?"cockpit":"chase"));
$("kartFullscreen").addEventListener("click",toggleFullscreen);
$("kartPitLimiter").addEventListener("click",togglePitLimiter);
$("kartStart").addEventListener("click",begin);
$("kartClose").addEventListener("click",close);
$("kartBackSelector").addEventListener("click",backToSelector);
$("kartRaceModesBack").addEventListener("click",backToSelector);
for(const card of document.querySelectorAll("[data-kart-mode]")){
 card.addEventListener("click",()=>{
  const mode=card.dataset.kartMode;
  if(mode==="races")showRaceMeetings();
  else enterTrack(mode);
 });
}
$("kartRefresh").addEventListener("click",leaderboard);
function getActivity(){
 if(!active)return "preLobby";
 if(selectorVisible)return $("kartGame").classList.contains("kart-races-hub")?"raceLobby":"preLobby";
 if(driveMode==="meeting")return playing&&["qualifying","race"].includes(meetingPhase)?"racing":"raceLobby";
 return "timeTrial";
}
window.KartRacing={open,close,showRaceMeetings,getActivity,isOpen:()=>active,setCameraMode,meetingSectorUpdate,
 beginMeetingStage,clearMeetingStage,finishMeetingStage,meetingLapUpdate,updateRivals,
 getPose,pitBays:()=>PIT_BAYS,beginPractice:()=>enterTrack("timetrial"),enterTrack,backToSelector,mayAutoJoinMeeting,getLocalPitRemaining,resetLocalPit};
