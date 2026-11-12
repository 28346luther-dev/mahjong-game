import {ROAD,PIT,PIT_BAYS,ROAD_HALF_WIDTH,PIT_HALF_WIDTH,RUNOFF_WIDTH,TRACK_SCALE,bankRise,bankAngle,cornerKerbGripWidth,refineRoute,projectToRoute,raceStart} from "./kart-track.js";
import {addRoadAtlantaLandmarks} from "./kart-road-atlanta-landmarks.js";
import {addCircuitGraphics} from "./kart-graphics.js";
import {addKartSafety} from "./kart-safety.js";
import {addPitComplex} from "./kart-pit-complex.js";
import {createGTCar} from "./kart-gt-car.js";
import {addCircuitGrandstands} from "./kart-grandstands.js";
import {addStraightGlassBarriers} from "./kart-straight-barriers.js";
import {resolveKartCollision,surfaceNormal,nearPitBay,gravityAlongRoad,createSuspensionState,stepSuspension} from "./kart-physics.js";
const $=id=>document.getElementById(id);
const format=ms=>ms==null?"--:--.---":String(Math.floor(ms/60000)).padStart(2,"0")+":"+String(Math.floor(ms%60000/1000)).padStart(2,"0")+"."+String(Math.floor(ms%1000)).padStart(3,"0");
let THREE,renderer,scene,camera,clock,kart,active=false,playing=false,busy=false,raceId=null,reportedFinish=false;
const suspension=createSuspensionState();
let speed=0,yaw=0,pos={x:0,y:0,z:0},started=0,progress=0,sendAt=0,telemetryPending=false,lastStatusAt=0;
let lapCount=1,lapToastTimeout=null,lastLeaderboardRefresh=0,boardRequest=null;
let cameraMode="chase",cockpitOccluders=[],previousCameraMode="chase";
let driveMode="practice",meetingPhase=null,remoteKarts=new Map();
const rivalTargets=new Map();
let selectedMode="practice",timeTrial=false,selectorVisible=true;
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
 scene.add(model.group);return model.group;
}
function updateRivals(racers,myId){
 const list=$("kartTrackPositions");
 if(list){
  list.replaceChildren();
  for(const [index,p] of (racers||[]).entries()){
   const li=document.createElement("li");
   li.textContent="P"+(p.position||index+1)+" "+p.name+(p.id===myId?" · YOU":"")+" L"+(p.lap||0)+"/10";
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
  // Never snap remote karts to sporadic HTTP snapshots. Interpolate
  // positions and shortest-angle headings every animation frame.
  const road=projectToRoute(driver.x,driver.z,ROAD);
  const pit=projectToRoute(driver.x,driver.z,PIT);
  rivalTargets.set(driver.id,{x:driver.x,z:driver.z,yaw:driver.yaw||0,
   y:pit.distance<road.distance?pit.y:road.y,
   speed:driver.speed||0,lastAt:now});
 }
 for(const [id,group] of remoteKarts){
  const target=rivalTargets.get(id);
  if(!target||now-target.lastAt>7500){
   scene.remove(group);remoteKarts.delete(id);rivalTargets.delete(id);
  }
 }
}
function animateRivals(dt){
 const now=performance.now();
 for(const [id,group] of remoteKarts){
  const target=rivalTargets.get(id);if(!target)continue;
  const alpha=1-Math.exp(-Math.min(.05,dt)*9);
  group.position.x+=(target.x-group.position.x)*alpha;
  group.position.z+=(target.z-group.position.z)*alpha;
  group.position.y+=(target.y-group.position.y)*Math.min(1,dt*7);
  const targetYaw=target.yaw+Math.PI;
  const delta=Math.atan2(Math.sin(targetYaw-group.rotation.y),Math.cos(targetYaw-group.rotation.y));
  group.rotation.y+=delta*alpha;
 }
}
async function beginMeetingStage(phase,mine){
 if(driveMode==="meeting"&&meetingPhase==="grid"&&phase==="race"){
  meetingPhase="race";playing=true;speed=0;started=performance.now();
  $("kartRacePhase").textContent="RACE";
  message("LIGHTS OUT! GO! Complete 10 laps and the mandatory pit stop.");
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
    "LIGHTS OUT! Grid P"+mine.grid+" · ten laps · mandatory pit service.");
 }catch(error){message("Could not start multiplayer session: "+error.message);}
}
function clearMeetingStage(){
 if(driveMode==="meeting"){playing=false;driveMode="practice";meetingPhase=null;speed=0;}
 for(const group of remoteKarts.values())scene?.remove(group);
 remoteKarts.clear();rivalTargets.clear();
}
function finishMeetingStage(mine){
 if(driveMode!=="meeting"||!mine?.finishedAt)return;
 playing=false;speed=0;
 message(mine.disqualified?
  "Race completed but disqualified: mandatory pit stop not completed.":
  "CHEQUERED FLAG! You finished P"+mine.position+" of the 10-lap race.");
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
  $("kartLap").textContent=String(Math.min(10,data.lap+1));
  message("RACE LAP "+data.lap+"/10 · "+format(data.timeMs));
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
 cameraMode=mode;
 for(const mesh of cockpitOccluders)mesh.visible=mode!=="cockpit";
 const label=document.getElementById("kartCameraLabel");
 if(label)label.textContent=mode==="cockpit"?"HELMET / FIRST PERSON":"CHASE / THIRD PERSON";
 const button=document.getElementById("kartCameraToggle");
 if(button){
  button.textContent=mode==="cockpit"?"🎥 Third-person view":"⛑ First-person view";
  button.setAttribute("aria-pressed",String(mode==="cockpit"));
 }
 const caption=document.getElementById("kartCameraHelp");
 if(caption)caption.textContent=mode==="cockpit"
  ?"First-person helmet camera · press C to switch back"
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
 const selectorList=$("kartHubLeaderboard");
 if(selectorList)selectorList.replaceChildren();
 if(!records?.length){
  for(const parent of [list,selectorList].filter(Boolean)){
   const li=document.createElement("li");li.textContent="No recorded laps yet — set the first full lap!";
   parent.append(li);
  }
  return;
 }
 for(const p of records){
  const li=document.createElement("li"),rank=document.createElement("strong"),name=document.createElement("span"),time=document.createElement("b");
  rank.textContent="#"+p.rank;name.textContent=p.name;time.textContent=format(p.bestMs);
  li.append(rank,name,time);list.append(li);
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
 geo.setIndex(indices);geo.computeVertexNormals();
 return object(geo,material(color,.94),0,0,0);
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
  vertices.push(p.x+d.nx*(edge+side*width),-.12,p.z+d.nz*(edge+side*width));
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
 geometry.setIndex(indices);geometry.computeVertexNormals();
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
 embankment(visualRoad,-1);embankment(visualRoad,1);
 ribbon(visualRoad,-ROAD_HALF_WIDTH-RUNOFF_WIDTH,ROAD_HALF_WIDTH+RUNOFF_WIDTH,0x698c68,-.058);
  ribbon(visualRoad,-ROAD_HALF_WIDTH,ROAD_HALF_WIDTH,0x373b43,.015);
 ribbon(visualPit,-PIT_HALF_WIDTH,PIT_HALF_WIDTH,0x353c44,.067);
 // A single coherent textured circuit surface and curved kerb system
 // replaces the previous overlapping paving, sharp blocks and floating sheets.
 addCircuitGraphics(THREE,scene,visualRoad,visualPit,ROAD_HALF_WIDTH,RUNOFF_WIDTH);
 addRoadAtlantaLandmarks(THREE,scene,ROAD,ROAD_HALF_WIDTH);
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
 // Physical starting gantry on the outside of the racing line.
 const p=ROAD.samples[0],d=tangent(ROAD,0);
 for(const side of [-1,1])post(.16,4.1,0xd4ad79,p.x+d.nx*side*(ROAD_HALF_WIDTH+1.1),p.y+2,p.z+d.nz*side*(ROAD_HALF_WIDTH+1.1));
 const banner=box(ROAD_HALF_WIDTH*2+2,.9,.28,0x583149,p.x,p.y+4.1,p.z);
 banner.rotation.y=Math.atan2(d.tx,d.tz);
 const cv=document.createElement("canvas");cv.width=1024;cv.height=140;
 const ctx=cv.getContext("2d");
 ctx.fillStyle="#583149";ctx.fillRect(0,0,1024,140);
 ctx.fillStyle="#f8dfa9";ctx.font="bold 66px Georgia";ctx.textAlign="center";ctx.fillText("ROAD ATLANTA · 2.54 MI",512,96);
 const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
 const front=object(new THREE.PlaneGeometry(ROAD_HALF_WIDTH*2+1.6,1.05),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}),
  p.x,p.y+4.1,p.z+.17);
 front.rotation.y=Math.atan2(d.tx,d.tz);
 // Legacy track-specific tyre stacks removed from the new pit apron.
}
function kartModel(){
 const vee=createGTCar(THREE,{color:0xa62c46,number:7});
 kart=vee.group;scene.add(kart);
 cockpitOccluders.push(...vee.hiddenInCockpit);
}
function construct(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0xa2c6d0);scene.fog=new THREE.FogExp2(0xa2c6d0,.0025);
 scene.add(new THREE.HemisphereLight(0xf2f6ff,0x5f765b,1.8));
 scene.add(new THREE.AmbientLight(0xffe9d5,.38));
 const sun=new THREE.DirectionalLight(0xffe2a3,2.6);
 sun.position.set(-35,76,28);sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);
 sun.shadow.normalBias=.023;
 sun.shadow.radius=2;
 sun.shadow.camera.left=-850;sun.shadow.camera.right=850;
 sun.shadow.camera.top=1350;sun.shadow.camera.bottom=-1350;
 sun.shadow.camera.far=1800;sun.shadow.bias=-.0002;
 scene.add(sun);
 // A tall sky dome uses a physically inspired horizon-to-zenith gradient.
 const skyMaterial=new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,
  uniforms:{topColor:{value:new THREE.Color(0x558fc7)},horizonColor:{value:new THREE.Color(0xdcebf0)},
    bottomColor:{value:new THREE.Color(0xb2c9b9)}},
  vertexShader:"varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
  fragmentShader:"varying vec3 vWorld;uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 bottomColor;void main(){float t=normalize(vWorld).y;vec3 col=t>0.?mix(horizonColor,topColor,pow(clamp(t,0.,1.),.48)):mix(horizonColor,bottomColor,clamp(-t*1.6,0.,1.));gl_FragColor=vec4(col,1.);}"
 });
 scene.add(new THREE.Mesh(new THREE.SphereGeometry(3200,48,24),skyMaterial));
 track();kartModel();setCameraMode(cameraMode);
}
async function init(){
 if(renderer)return;
 THREE=await import("https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js");
 renderer=new THREE.WebGLRenderer({canvas:$("kartCanvas"),antialias:true,powerPreference:"high-performance"});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 renderer.physicallyCorrectLights=true;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 camera=new THREE.PerspectiveCamera(64,1,.1,3500);clock=new THREE.Clock();
 construct();reset();requestAnimationFrame(frame);
}
function reset(){
 resetLocalPit();
 const start=raceStart();pos={x:start.x,y:start.y,z:start.z};yaw=start.yaw;
 speed=0;progress=0;reportedFinish=false;pitLimiter=false;inPitLane=false;updatePitHUD();
 if(kart){kart.position.set(pos.x,pos.y,pos.z);kart.rotation.y=yaw+Math.PI;}
}
function positionOnTrack(x,z){
 const road=projectToRoute(x,z,ROAD),pit=projectToRoute(x,z,PIT);
 // The limiter commits the car to a long, smooth PIT IN route. It does not
 // release it until the *paved* PIT OUT merge meets the racing asphalt.
 // At either junction the two surfaces overlap and driving is continuous.
 const mergeReady=inPitLane&&pit.progress>.96&&
  road.distance<ROAD_HALF_WIDTH+1.5;
 const pitAvailable=pit.distance<PIT_HALF_WIDTH+1.25;
 const enterReady=pitAvailable&&pit.progress>.01&&pit.progress<.94;
 if(pitLimiter&&!mergeReady&&pitAvailable&&(inPitLane||enterReady))
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
 pos.y+=(contactY-pos.y)*Math.min(1,dt*12);
 const suspensionContact=stepSuspension(suspension,{speed,lateral,
  halfWidth:ROAD_HALF_WIDTH,kerbWidth:cornerKerbGripWidth(projected.progress),
  progress:projected.progress,dt});
 const up=projected.isPit?new THREE.Vector3(0,1,0):
  surfaceNormal(ROAD,projected,bankAngle(projected.progress),THREE);
 const bankQuat=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),up);
 const yawQuat=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw+Math.PI);
 kart.quaternion.slerp(bankQuat.multiply(yawQuat),Math.min(1,dt*11));
 // Kerb compliance rolls the chassis and compresses the spring rather than
 // treating painted kerbs as an entirely flat extension of the asphalt.
 kart.rotateZ(suspensionContact.roll);
 kart.position.set(pos.x,pos.y+suspensionContact.heave,pos.z);
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
  if(performance.now()-sendAt>480){sendAt=performance.now();transmit();}
  return;
 }
 const accelerate=down("w")||down("arrowup");
 const brake=down("s")||down("arrowdown")||down(" ");
 const steer=Number(down("d")||down("arrowright"))-Number(down("a")||down("arrowleft"));
 speed+=Number(accelerate)*24*dt;
 speed-=Math.sign(speed)*(0.9+Math.abs(speed)*.08)*dt;
 if(brake)speed-=Math.sign(speed||1)*67*dt;
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
 const steeringRate=2.25/(1+Math.abs(speed)/27);
 yaw-=steer*dt*steeringRate*suspension.grip*Math.min(1,Math.abs(speed)/3)*(speed>=0?1:-1);
 const proposedX=pos.x+Math.sin(yaw)*speed*dt;
 const proposedZ=pos.z+Math.cos(yaw)*speed*dt;
 const collision=driveMode==="meeting"?resolveKartCollision(pos.x,pos.z,proposedX,proposedZ,
   [...remoteKarts.values()].filter(g=>g.visible).map(g=>({x:g.position.x,z:g.position.z}))):null;
 const x=collision?.x??proposedX,z=collision?.z??proposedZ;
 if(collision?.hit){speed*=.22;message("CONTACT · Avoid the other GT cars.");}
 const projected=positionOnTrack(x,z);
 const grip=gripForDistance(projected.distance,projected.isPit,projected.progress);
 // PIT route is a real driveable road ONLY with P limiter enabled.
 // Do not penalise tarmac, kerbs or green painted runoff.
 if(grip.drag>0)speed*=Math.exp(-grip.drag*dt);
 if(grip.surface!=="barrier"){
  pos.x=x;pos.z=z;
  const lateral=(x-projected.x)*projected.normalX+(z-projected.z)*projected.normalZ;
  pos.y=projected.y+(projected.isPit?0:bankRise(projected.progress,lateral));
  if(inPitLane!==projected.isPit){
   if(!projected.isPit){localPitUntil=0;localPitDone=false;}
   inPitLane=projected.isPit;
   updatePitHUD();
   message(inPitLane?"Entering pit lane at 40 km/h. Your lap timer is paused.":"Pit exit — back on the circuit.");
  }
 }else{
  speed*=.23; // Outside barrier prevents off-track shortcut.
 }
 updateRideHeightAndBank(dt);
 localPitService();
 if(performance.now()-sendAt>320&&!telemetryPending){sendAt=performance.now();transmit();}
 // Sector times are display-only and never reset this lap clock.
 if(driveMode!=="meeting")$("kartTime").textContent=format(performance.now()-started);
 else if(meetingPhase==="qualifying"||meetingPhase==="race")$("kartTime").textContent=format(performance.now()-started);
}
function frame(){
 requestAnimationFrame(frame);
 if(!active||!renderer)return;
 const dt=Math.min(.05,clock.getDelta());update(dt);
 const w=$("kartCanvas").clientWidth||100,h=$("kartCanvas").clientHeight||100,dpr=renderer.getPixelRatio();
 if(renderer.domElement.width!==Math.round(w*dpr)||renderer.domElement.height!==Math.round(h*dpr)){
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
 }
 if(cameraMode==="cockpit"){
  // The body points along local -Z, hence the helmet view follows the
  // world-space vehicle heading (yaw) without inverting steering.
  // Lock cockpit to a point FORWARD of the driver's helmet. Never smooth
  // behind the kart: chase-style interpolation exposed the driver's head
  // whenever acceleration caused the vehicle to pull ahead of the camera.
  const forwardX=Math.sin(yaw),forwardZ=Math.cos(yaw);
  camera.position.set(pos.x+forwardX*.40,pos.y+1.27,pos.z+forwardZ*.40);
  camera.lookAt(pos.x+forwardX*28,pos.y+1.42,pos.z+forwardZ*28);
  // Fixed FOV: the tapered Formula Vee nose and front wheels remain visible.
  if(camera.fov!==73){camera.fov=73;camera.updateProjectionMatrix();}
 }else{
  const target=new THREE.Vector3(pos.x-Math.sin(yaw)*11,pos.y+7.3,pos.z-Math.cos(yaw)*11);
  camera.position.lerp(target,Math.min(1,dt*4.5));
  camera.lookAt(pos.x,pos.y+1.1,pos.z);
  if(camera.fov!==64){camera.fov=64;camera.updateProjectionMatrix();}
 }
 animateRivals(dt);
 renderer.render(scene,camera);
 window.KartMeetings?.tick?.();
 if(performance.now()-lastLeaderboardRefresh>15000){lastLeaderboardRefresh=performance.now();leaderboard();}
 $("kartSpeed").textContent=Math.round(Math.abs(speed)*3.6)+" km/h";
}
async function begin(){
 if(driveMode==="meeting")clearMeetingStage();
 driveMode="practice";
 if(busy)return;busy=true;$("kartStart").disabled=true;
 try{
  await init();
  const result=await api("start",{});
  raceId=result.raceId;reset();resetSectors();lapCount=1;started=performance.now();sendAt=performance.now();playing=true;
  $("kartLap").textContent="1";$("kartLast").textContent="LAST --:--.---";
  $("kartTime").textContent="00:00.000";
  $("kartProgress").textContent="0%";
  $("kartStart").textContent="Restart session";
  if(result.bestMs)$("kartBest").textContent="BEST "+format(result.bestMs);
  $("kartRacePhase").textContent=timeTrial?"TIME TRIAL":"FREE PRACTICE";
  message("GO! Hit the apex kerbs, keep clear of the gravel, and stay out for unlimited timed laps.");
 }catch(error){message(error.message);}
 finally{busy=false;$("kartStart").disabled=false;}
}
function enterTrack(mode="practice"){
 selectedMode=mode;timeTrial=mode==="timetrial";selectorVisible=false;
 $("kartGame").classList.add("kart-driving");
 $("kartGame").classList.remove("kart-selector");
 $("kartDrivingMode").textContent=mode==="timetrial"?"TIME TRIAL":mode==="races"?"CHAMPIONSHIP":"FREE PRACTICE";
 $("kartTrackPositions").replaceChildren();
 if(mode!=="races"){
  const item=document.createElement("li");item.textContent=mode==="timetrial"?"GLOBAL TIME TRIAL":"SOLO PRACTICE";
  $("kartTrackPositions").append(item);
 }
 if(mode==="practice"||mode==="timetrial"){begin();}
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
window.KartRacing={open,close,isOpen:()=>active,setCameraMode,meetingSectorUpdate,
 beginMeetingStage,clearMeetingStage,finishMeetingStage,meetingLapUpdate,updateRivals,
 getPose,pitBays:()=>PIT_BAYS,beginPractice:()=>enterTrack("practice"),enterTrack,backToSelector,mayAutoJoinMeeting,getLocalPitRemaining,resetLocalPit};
