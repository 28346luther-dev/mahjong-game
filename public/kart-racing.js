import {ROAD,PIT,PIT_BAYS,ROAD_HALF_WIDTH,PIT_HALF_WIDTH,RUNOFF_WIDTH,TRACK_SCALE,bankRise,projectToRoute,raceStart} from "./kart-track.js";
import {addCircuitGraphics} from "./kart-graphics.js";
import {addKartSafety} from "./kart-safety.js";
import {addPitComplex} from "./kart-pit-complex.js";
const $=id=>document.getElementById(id);
const format=ms=>ms==null?"--:--.---":String(Math.floor(ms/60000)).padStart(2,"0")+":"+String(Math.floor(ms%60000/1000)).padStart(2,"0")+"."+String(Math.floor(ms%1000)).padStart(3,"0");
let THREE,renderer,scene,camera,clock,kart,active=false,playing=false,busy=false,raceId=null,reportedFinish=false;
let speed=0,yaw=0,pos={x:0,y:0,z:0},started=0,progress=0,sendAt=0,telemetryPending=false,lastStatusAt=0;
let lapCount=1,lapToastTimeout=null,lastLeaderboardRefresh=0,boardRequest=null;
let cameraMode="chase",cockpitOccluders=[],previousCameraMode="chase";
let driveMode="practice",meetingPhase=null,remoteKarts=new Map();
function getPose(){return {x:pos.x,z:pos.z,yaw,speed,pit:inPitLane};}
function createRival(p){
 const g=new THREE.Group();scene.add(g);
 const body=new THREE.Mesh(new THREE.BoxGeometry(1.45,.38,2.35),
  new THREE.MeshPhysicalMaterial({color:(Number.parseInt(p.id.slice(0,6),16)&0xffffff)||0x318ead,
    metalness:.32,roughness:.33,clearcoat:1}));
 body.position.y=.57;g.add(body);
 const helmet=new THREE.Mesh(new THREE.SphereGeometry(.29,16,12),
  new THREE.MeshStandardMaterial({color:0xffd998,roughness:.34}));
 helmet.position.set(0,1.4,.38);g.add(helmet);
 const tyres=new THREE.MeshStandardMaterial({color:0x1d2125,roughness:.9});
 for(const x of [-.78,.78])for(const z of [-.78,.78]){
  const w=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.25,14),tyres);
  w.position.set(x,.35,z);w.rotation.z=Math.PI/2;g.add(w);
 }
 return g;
}
function updateRivals(racers,myId){
 if(!scene)return;
 const present=new Set();
 for(const driver of racers||[]){
  if(driver.id===myId||driver.finishedAt||!Number.isFinite(driver.x)||!Number.isFinite(driver.z))continue;
  present.add(driver.id);
  let g=remoteKarts.get(driver.id);
  if(!g){g=createRival(driver);remoteKarts.set(driver.id,g);}
  const road=projectToRoute(driver.x,driver.z,ROAD);
  const pit=projectToRoute(driver.x,driver.z,PIT);
  const route=pit.distance<road.distance?pit:road;
  g.position.set(driver.x,route.y,driver.z);
  g.rotation.y=(driver.yaw||0)+Math.PI;
 }
 for(const [id,g] of remoteKarts)if(!present.has(id)){
  scene.remove(g);remoteKarts.delete(id);
 }
}
async function beginMeetingStage(phase,mine){
 if(!active)return;
 try{
  await init();driveMode="meeting";meetingPhase=phase;
  playing=true;raceId=null;reportedFinish=false;
  reset();
  if(phase==="race"&&Number.isFinite(mine?.x)){
   pos.x=mine.x;pos.z=mine.z;
   pos.y=projectToRoute(pos.x,pos.z,ROAD).y;
   yaw=mine.yaw||yaw;
   kart.position.set(pos.x,pos.y,pos.z);kart.rotation.y=yaw+Math.PI;
  }
  started=performance.now();sendAt=performance.now();lapCount=1;resetSectors();
  $("kartRacePhase").textContent=phase.toUpperCase();
  $("kartLap").textContent="1";$("kartProgress").textContent="0%";
  message(phase==="qualifying"?"QUALIFYING: Set your best full lap before the race starts.":
    "LIGHTS OUT! Grid P"+mine.grid+" · ten laps · mandatory pit service.");
 }catch(error){message("Could not start multiplayer session: "+error.message);}
}
function clearMeetingStage(){
 if(driveMode==="meeting"){playing=false;driveMode="practice";meetingPhase=null;speed=0;}
 for(const group of remoteKarts.values())scene?.remove(group);
 remoteKarts.clear();
}
function finishMeetingStage(mine){
 if(driveMode!=="meeting"||!mine?.finishedAt)return;
 playing=false;speed=0;
 message(mine.disqualified?
  "Race completed but disqualified: mandatory pit stop not completed.":
  "CHEQUERED FLAG! You finished P"+mine.position+" of the 10-lap race.");
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
let currentSector=1,sectorStarted=0;
function resetSectors(){
 currentSector=1;sectorStarted=performance.now();
 for(let i=1;i<=3;i++){
  const el=$("kartSector"+i);
  if(el){el.textContent="--:--.---";el.classList.remove("sector-current");}
 }
 $("kartSector1")?.classList.add("sector-current");
 const live=$("kartSectorLive");if(live)live.textContent="SECTOR 1";
}
function showSector(index,ms){
 const el=$("kartSector"+index);
 if(el){el.textContent=format(ms);el.classList.remove("sector-current");}
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
async function api(path,body){
 const r=await fetch("/api/kart/"+path,{method:body?"POST":"GET",credentials:"same-origin",
  headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined,cache:"no-store"});
 const result=await r.json();if(!r.ok)throw Error(result.error||"Race service unavailable");
 return result;
}
function gripForDistance(distance,isPit=false){
 // Painted racing kerbs and adjoining green paint have full road grip.
 // Sand and grass alone drag the kart down.
 if(isPit||distance<=ROAD_HALF_WIDTH+1.23)return {drag:0,surface:"kerb"};
 if(distance<=ROAD_HALF_WIDTH+3.9)return {drag:2.1,surface:"gravel"};
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
 if(!records?.length){const li=document.createElement("li");li.textContent="No times yet. Be the first!";list.append(li);return;}
 for(const p of records){
  const li=document.createElement("li"),rank=document.createElement("strong"),name=document.createElement("span"),time=document.createElement("b");
  rank.textContent="#"+p.rank;name.textContent=p.name;time.textContent=format(p.bestMs);
  li.append(rank,name,time);list.append(li);
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
   verts.push(p.x+dir.nx*offset,p.y+raise+(route===ROAD?bankRise(i/ps.length,offset):0),p.z+dir.nz*offset);
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
  const edge=(ROAD_HALF_WIDTH+.35)*side;
  vertices.push(p.x+d.nx*edge,p.y-.04,p.z+d.nz*edge);
  vertices.push(p.x+d.nx*(edge+side*width),Math.max(-.06,p.y-2.7),p.z+d.nz*(edge+side*width));
 }
 for(let i=0;i<(route.closed?samples.length:samples.length-1);i++){
  const a=i*2,b=((i+1)%samples.length)*2;
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
 const green=object(new THREE.PlaneGeometry(430,330),material(0x477854,.97),0,-.1,0);
 green.rotation.x=-Math.PI/2;
 embankment(ROAD,-1);embankment(ROAD,1);
 ribbon(ROAD,-ROAD_HALF_WIDTH-RUNOFF_WIDTH,ROAD_HALF_WIDTH+RUNOFF_WIDTH,0x698c68,-.058);
 ribbon(ROAD,-ROAD_HALF_WIDTH-2.7,ROAD_HALF_WIDTH+2.7,0xa98c6c,-.043);
 ribbon(ROAD,-ROAD_HALF_WIDTH-.55,ROAD_HALF_WIDTH+.55,0x9b7e65,-.025);
 ribbon(ROAD,-ROAD_HALF_WIDTH,ROAD_HALF_WIDTH,0x373b43,.015);
 ribbon(PIT,-PIT_HALF_WIDTH-.34,PIT_HALF_WIDTH+.34,0x927765,-.02);
 ribbon(PIT,-PIT_HALF_WIDTH,PIT_HALF_WIDTH,0x4b4e51,.035);
 // The graphics pass generates smooth apex kerbs and a wide green runoff
 // using batched geometry. The old alternating cubes along every straight,
 // and the longitudinal start line, are intentionally removed.
 addCircuitGraphics(THREE,scene,ROAD,PIT,ROAD_HALF_WIDTH,RUNOFF_WIDTH);
 addKartSafety(THREE,scene,ROAD,ROAD_HALF_WIDTH,RUNOFF_WIDTH);
 // Detailed two-level garage building, safe entry signs and four marked service bays.
 addPitComplex(THREE,scene,PIT,PIT_BAYS);
 // Physical starting gantry on the outside of the racing line.
 const p=ROAD.samples[0],d=tangent(ROAD,0);
 for(const side of [-1,1])post(.16,4.1,0xd4ad79,p.x+d.nx*side*4.8,p.y+2,p.z+d.nz*side*4.8);
 const banner=box(10,.9,.28,0x583149,p.x,p.y+4.1,p.z);
 banner.rotation.y=Math.atan2(d.tx,d.tz);
 const cv=document.createElement("canvas");cv.width=1024;cv.height=140;
 const ctx=cv.getContext("2d");
 ctx.fillStyle="#583149";ctx.fillRect(0,0,1024,140);
 ctx.fillStyle="#f8dfa9";ctx.font="bold 66px Georgia";ctx.textAlign="center";ctx.fillText("VELVET CIRCUIT",512,96);
 const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
 const front=object(new THREE.PlaneGeometry(9.6,1.05),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}),
  p.x,p.y+4.1,p.z+.17);
 front.rotation.y=Math.atan2(d.tx,d.tz);
 // Pit-lane tire stacks, curbs and trackside grandstand.
 for(let i=0;i<5;i++){
  const x=(55+i*4)*TRACK_SCALE,z=-40*TRACK_SCALE;
  for(let y=0;y<3;y++)post(.75,.46,y%2?0x2f3139:0x202128,x,y*.45+.2,z);
 }
}
function kartModel(){
 kart=new THREE.Group();scene.add(kart);
 const paint=new THREE.MeshPhysicalMaterial({color:0x9d284b,metalness:.35,roughness:.28,clearcoat:1,clearcoatRoughness:.11});
 const chrome=new THREE.MeshStandardMaterial({color:0xc9c6c1,metalness:.82,roughness:.2});
 const rubber=material(0x191b21,.98),leather=material(0x372735,.84);
 const body=object(new THREE.SphereGeometry(1,24,16),paint,0,.66,0,kart);
 body.scale.set(.83,.24,1.36);
 const nose=object(new THREE.SphereGeometry(1,24,16),paint,0,.52,-.91,kart);
 nose.scale.set(.68,.21,.54);
 const frontBumper=box(1.75,.11,.18,0xdab989,0,.42,-1.36,kart);
 box(1.85,.12,.18,0x23252b,0,.43,1.21,kart);
 box(1.08,.28,.95,0x29232c,0,.85,.42,kart);
 const seat=object(new THREE.SphereGeometry(1,16,12),leather,0,1.06,.45,kart);
 seat.scale.set(.48,.46,.37);
 for(const x of [-.79,.79])for(const z of [-.85,.85]){
  const wheel=object(new THREE.CylinderGeometry(.33,.33,.28,18),rubber,x,.35,z,kart);
  wheel.rotation.z=Math.PI/2;
  const hub=object(new THREE.CylinderGeometry(.14,.14,.295,16),chrome,x,.35,z,kart);
  hub.rotation.z=Math.PI/2;
 }
 const helmet=new THREE.Mesh(new THREE.SphereGeometry(.31,22,16),new THREE.MeshPhysicalMaterial({
  color:0xf2c77e,metalness:.35,roughness:.25,clearcoat:1}));
 helmet.position.set(0,1.57,.37);kart.add(helmet);cockpitOccluders.push(helmet);
 const visor=object(new THREE.SphereGeometry(.26,20,12),material(0x1b313c,.09,.48),0,1.56,.19,kart);
 visor.scale.set(.95,.47,.42);cockpitOccluders.push(visor);
 const wheel=object(new THREE.TorusGeometry(.23,.045,8,22),rubber,0,1.04,-.38,kart);
 wheel.rotation.x=Math.PI*.27;
 for(const x of [-.39,.39]){
  const arm=object(new THREE.CapsuleGeometry(.065,.36,5,9),material(0xdbc6a7,.75),x*.75,1.1,-.07,kart);
  arm.rotation.x=Math.PI/4;
  box(.11,.1,.14,0xf9eed5,x,.54,-1.31,kart);
 }
 const label=box(.75,.035,.55,0xf5e9d5,0,.93,-.7,kart);
 label.rotation.x=-.06;
 const number=box(.33,.014,.34,0x33333b,0,.961,-.7,kart);
 number.rotation.x=-.06;
 const shadow=new THREE.Mesh(new THREE.CircleGeometry(1.12,28),new THREE.MeshBasicMaterial({
  color:0x111219,transparent:true,opacity:.21,depthWrite:false}));
 shadow.rotation.x=-Math.PI/2;shadow.position.y=.024;
 kart.add(shadow);
}
function construct(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0xa2c6d0);scene.fog=new THREE.FogExp2(0xa2c6d0,.0034);
 scene.add(new THREE.HemisphereLight(0xf2f6ff,0x5f765b,2.25));
 scene.add(new THREE.AmbientLight(0xffe9d5,.38));
 const sun=new THREE.DirectionalLight(0xffe2a3,3.25);
 sun.position.set(-35,76,28);sun.castShadow=true;
 sun.shadow.mapSize.set(1024,1024);
 sun.shadow.camera.left=-160;sun.shadow.camera.right=160;
 sun.shadow.camera.top=125;sun.shadow.camera.bottom=-125;
 sun.shadow.camera.far=260;sun.shadow.bias=-.0002;
 scene.add(sun);
 // A tall sky dome uses a physically inspired horizon-to-zenith gradient.
 const skyMaterial=new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,
  uniforms:{topColor:{value:new THREE.Color(0x558fc7)},horizonColor:{value:new THREE.Color(0xdcebf0)},
    bottomColor:{value:new THREE.Color(0xb2c9b9)}},
  vertexShader:"varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
  fragmentShader:"varying vec3 vWorld;uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 bottomColor;void main(){float t=normalize(vWorld).y;vec3 col=t>0.?mix(horizonColor,topColor,pow(clamp(t,0.,1.),.48)):mix(horizonColor,bottomColor,clamp(-t*1.6,0.,1.));gl_FragColor=vec4(col,1.);}"
 });
 scene.add(new THREE.Mesh(new THREE.SphereGeometry(310,32,16),skyMaterial));
 track();kartModel();setCameraMode(cameraMode);
}
async function init(){
 if(renderer)return;
 THREE=await import("https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js");
 renderer=new THREE.WebGLRenderer({canvas:$("kartCanvas"),antialias:true,powerPreference:"high-performance"});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 camera=new THREE.PerspectiveCamera(64,1,.1,410);clock=new THREE.Clock();
 construct();reset();requestAnimationFrame(frame);
}
function reset(){
 const start=raceStart();pos={x:start.x,y:start.y,z:start.z};yaw=start.yaw;
 speed=0;progress=0;reportedFinish=false;pitLimiter=false;inPitLane=false;updatePitHUD();
 if(kart){kart.position.set(pos.x,pos.y,pos.z);kart.rotation.y=yaw+Math.PI;}
}
function positionOnTrack(x,z){
 const road=projectToRoute(x,z,ROAD),pit=projectToRoute(x,z,PIT);
 const pitSurface=pit.distance<PIT_HALF_WIDTH+.55&&pit.distance<road.distance;
 // The pit route is only accessible with the limiter engaged.
 if(pitSurface&&pitLimiter)return {...pit,isPit:true};
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
  }
 }catch(error){
  if(raceId===current){playing=false;message(error.message+" Restart the lap to try again.");}
 }finally{telemetryPending=false;}
}
function update(dt){
 if(!playing)return;
 if(driveMode==="meeting"&&!window.KartMeetings?.canDrive?.()){
  speed=0;
  if(performance.now()-sendAt>950){sendAt=performance.now();transmit();}
  return;
 }
 const accelerate=down("w")||down("arrowup");
 const brake=down("s")||down("arrowdown")||down(" ");
 const steer=Number(down("d")||down("arrowright"))-Number(down("a")||down("arrowleft"));
 speed+=Number(accelerate)*16*dt;
 speed-=Math.sign(speed)*(0.9+Math.abs(speed)*.08)*dt;
 if(brake)speed-=Math.sign(speed||1)*42*dt;
 speed=Math.max(-4,Math.min(pitLimiter?PIT_LIMIT_MS:29,speed));
 if(pitLimiter&&speed>PIT_LIMIT_MS)speed=PIT_LIMIT_MS;
 if(!accelerate&&!brake&&Math.abs(speed)<.15)speed=0;
 // In this coordinate system positive yaw steers world-left, so D decreases yaw.
 // Higher speed increases the turning radius; brake before the chicanes.
 const steeringRate=2.25/(1+Math.abs(speed)/15);
 yaw-=steer*dt*steeringRate*Math.min(1,Math.abs(speed)/3)*(speed>=0?1:-1);
 const x=pos.x+Math.sin(yaw)*speed*dt,z=pos.z+Math.cos(yaw)*speed*dt;
 const projected=positionOnTrack(x,z);
 const grip=gripForDistance(projected.distance,projected.isPit);
 // PIT route is a real driveable road ONLY with P limiter enabled.
 // Do not penalise tarmac, kerbs or green painted runoff.
 if(grip.drag>0)speed*=Math.exp(-grip.drag*dt);
 if(grip.surface!=="barrier"){
  pos.x=x;pos.z=z;
  const lateral=(x-projected.x)*projected.normalX+(z-projected.z)*projected.normalZ;
  pos.y=projected.y+(projected.isPit?0:bankRise(projected.progress,lateral));
  if(inPitLane!==projected.isPit){
   inPitLane=projected.isPit;
   updatePitHUD();
   message(inPitLane?"Entering pit lane at 40 km/h. Your lap timer is paused.":"Pit exit — back on the circuit.");
  }
 }else{
  speed*=.23; // Outside barrier prevents off-track shortcut.
 }
 kart.position.set(pos.x,pos.y,pos.z);kart.rotation.y=yaw+Math.PI;
 if(performance.now()-sendAt>600&&!telemetryPending){sendAt=performance.now();transmit();}
 $("kartTime").textContent=format(performance.now()-started);
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
  camera.position.set(pos.x+forwardX*.26,pos.y+1.30,pos.z+forwardZ*.26);
  camera.lookAt(pos.x+forwardX*28,pos.y+1.42,pos.z+forwardZ*28);
  // Constant field of view: no acceleration-induced zoom or head clipping.
  if(camera.fov!==73){camera.fov=73;camera.updateProjectionMatrix();}
 }else{
  const target=new THREE.Vector3(pos.x-Math.sin(yaw)*11,pos.y+7.3,pos.z-Math.cos(yaw)*11);
  camera.position.lerp(target,Math.min(1,dt*4.5));
  camera.lookAt(pos.x,pos.y+1.1,pos.z);
  if(camera.fov!==64){camera.fov=64;camera.updateProjectionMatrix();}
 }
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
  message("GO! Hit the apex kerbs, keep clear of the gravel, and stay out for unlimited timed laps.");
 }catch(error){message(error.message);}
 finally{busy=false;$("kartStart").disabled=false;}
}
function open(){
 if(active)return;active=true;$("kartGame").classList.remove("hidden");
 document.body.classList.add("kart-open");document.exitPointerLock?.();
 message("Race the redesigned Velvet Circuit — corners, chicanes, hills and a pit lane.");
 leaderboard();lastLeaderboardRefresh=performance.now();init().catch(error=>message("Track unavailable: "+error.message));
 window.KartMeetings?.open?.();
}
function close(){
 window.KartMeetings?.close?.();clearMeetingStage();
 if(document.fullscreenElement===$("kartGame"))document.exitFullscreen().catch(()=>{});
 active=false;playing=false;raceId=null;keys.clear();touch.clear();speed=0;pitLimiter=false;inPitLane=false;updatePitHUD();
 $("kartGame").classList.add("hidden");document.body.classList.remove("kart-open");
}
window.addEventListener("keydown",e=>{
 if(!active||["INPUT","TEXTAREA"].includes(document.activeElement?.tagName))return;
 const k=e.key.toLowerCase();
 if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)){
  keys.add(k);e.preventDefault();
 }
 if(k==="c"){setCameraMode(cameraMode==="chase"?"cockpit":"chase");e.preventDefault();}
 if(k==="p"){togglePitLimiter();e.preventDefault();}
 if(k==="f"){toggleFullscreen();e.preventDefault();}
 if(k==="r"){reset();playing=false;message("Kart reset. Start a new timed lap to record a result.");}
 if(k==="escape"){e.preventDefault();close();}
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
$("kartRefresh").addEventListener("click",leaderboard);
window.KartRacing={open,close,isOpen:()=>active,setCameraMode,
 beginMeetingStage,clearMeetingStage,finishMeetingStage,meetingLapUpdate,updateRivals,
 getPose,pitBays:()=>PIT_BAYS,beginPractice:begin};
