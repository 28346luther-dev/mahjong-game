import {ROAD,PIT,ROAD_HALF_WIDTH,PIT_HALF_WIDTH,RUNOFF_WIDTH,TRACK_SCALE,projectToRoute,raceStart} from "./kart-track.js";
const $=id=>document.getElementById(id);
const format=ms=>ms==null?"--:--.---":String(Math.floor(ms/60000)).padStart(2,"0")+":"+String(Math.floor(ms%60000/1000)).padStart(2,"0")+"."+String(Math.floor(ms%1000)).padStart(3,"0");
let THREE,renderer,scene,camera,clock,kart,active=false,playing=false,busy=false,raceId=null,reportedFinish=false;
let speed=0,yaw=0,pos={x:0,y:0,z:0},started=0,progress=0,sendAt=0,telemetryPending=false,lastStatusAt=0;
const keys=new Set(),touch=new Set(),down=k=>keys.has(k)||touch.has(k);
async function api(path,body){
 const r=await fetch("/api/kart/"+path,{method:body?"POST":"GET",credentials:"same-origin",
  headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined,cache:"no-store"});
 const result=await r.json();if(!r.ok)throw Error(result.error||"Race service unavailable");
 return result;
}
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
 try{standings((await api("leaderboard")).entries);}catch{message("Could not load leaderboard.");}
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
   verts.push(p.x+dir.nx*offset,p.y+raise,p.z+dir.nz*offset);
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
 for(let i=0;i<ROAD.samples.length;i+=3){
  const p=ROAD.samples[i],d=tangent(ROAD,i),alt=Math.floor(i/3)%2;
  for(const side of [-1,1]){
   const off=side*(ROAD_HALF_WIDTH-.28);
   const kerb=box(.62,.11,.98,alt?0xf8e9d2:0xc74552,
    p.x+d.nx*off,p.y+.1,p.z+d.nz*off);
   kerb.rotation.y=Math.atan2(d.tx,d.tz);
  }
 }
 for(let i=0;i<ROAD.samples.length;i+=20){
  const p=ROAD.samples[i],d=tangent(ROAD,i);
  const dash=box(.11,.025,1.28,0xe1cf9e,p.x,p.y+.056,p.z);
  dash.rotation.y=Math.atan2(d.tx,d.tz);
 }
 // Checkerboard squares alternate across the track WIDTH and along the road direction.
 // The line is perpendicular to travel, not a vertical series of blocks along the straight.
 for(let row=0;row<2;row++){
  const point=ROAD.samples[(row+ROAD.samples.length-1)%ROAD.samples.length],d=tangent(ROAD,0);
  for(let col=0;col<12;col++){
   const lateral=-ROAD_HALF_WIDTH+(col+.5)*ROAD_HALF_WIDTH*2/12;
   const tile=box(ROAD_HALF_WIDTH*2/12-.025,.025,.62,(row+col)%2?0x232a32:0xfff6e8,
    point.x+d.nx*lateral,point.y+.09,point.z+d.nz*lateral);
   tile.rotation.y=Math.atan2(d.tx,d.tz);
  }
 }
 // Pit lane: visibly separated from the main straight, complete with garages and pit wall.
 for(let i=8;i<PIT.samples.length-10;i+=4){
  const p=PIT.samples[i],d=tangent(PIT,Math.min(PIT.samples.length-2,i));
  const stripe=box(.13,.02,.85,0xe9c775,p.x+d.nx*2.2,p.y+.06,p.z+d.nz*2.2);
  stripe.rotation.y=Math.atan2(d.tx,d.tz);
 }
 for(let i=0;i<5;i++){
  const x=(-32+i*9)*TRACK_SCALE,z=-1.2*TRACK_SCALE;
  box(8.4,2.7,3.8,0x554356,x,1.35,z);
  box(7.5,1.7,.08,0x202b34,x,1.26,z-1.98);
  box(8.7,.34,4.1,0xdac6a0,x,2.8,z);
  box(7.2,.12,.3,0xe4bc78,x,2.46,z-2.09);
  const roof=box(8.5,.2,1.4,0x8a304b,x,3.05,z-1.3);roof.rotation.x=-.1;
 }
 for(let i=0;i<12;i++){
  const p=PIT.samples[Math.min(PIT.samples.length-2,5+i*5)];
  const d=tangent(PIT,Math.min(PIT.samples.length-2,5+i*5));
  const wall=box(.18,.52,1.65,i%2?0xf4e5d4:0xc84955,
   p.x+d.nx*3,p.y+.26,p.z+d.nz*3);
  wall.rotation.y=Math.atan2(d.tx,d.tz);
 }
 // Trees ring the track, but avoid the asphalt and pit lane.
 let seeded=109023;
 const rnd=()=>{seeded=(1664525*seeded+1013904223)>>>0;return seeded/4294967296;};
 for(let i=0;i<190;i++){
  const x=(rnd()-.5)*380,z=(rnd()-.5)*270;
  if(projectToRoute(x,z,ROAD).distance<10||projectToRoute(x,z,PIT).distance<11)continue;
  const h=2.4+rnd()*2.7;
  post(.19,h*.55,0x70523c,x,h*.24,z);
  const crown=object(new THREE.ConeGeometry(.9+rnd()*.65,h,8),material(rnd()>.5?0x3a6650:0x477e55),
   x,h*.74,z);
  crown.rotation.y=rnd()*Math.PI;
 }
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
 box(1.4,.36,2.3,0x97384b,0,.62,0,kart);
 box(1.1,.2,.87,0xe5be87,0,.82,-.5,kart);
 box(.9,.58,.8,0x4c2d3b,0,1.03,.3,kart);
 for(const x of [-.77,.77])for(const z of [-.84,.84]){
  const wheel=object(new THREE.CylinderGeometry(.31,.31,.22,16),material(0x171e23),x,.4,z,kart);
  wheel.rotation.z=Math.PI/2;
 }
 object(new THREE.SphereGeometry(.32,18,12),material(0xe5c292,.35),0,1.5,.49,kart);
 box(.93,.1,.24,0xf0d6a8,0,.62,-1.12,kart);
}
function construct(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0xa2c6d0);scene.fog=new THREE.FogExp2(0xa2c6d0,.0034);
 scene.add(new THREE.HemisphereLight(0xfff2dc,0x527c5e,2));
 const sun=new THREE.DirectionalLight(0xffedca,2.6);sun.position.set(-20,65,30);scene.add(sun);
 track();kartModel();
}
async function init(){
 if(renderer)return;
 THREE=await import("https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js");
 renderer=new THREE.WebGLRenderer({canvas:$("kartCanvas"),antialias:true,powerPreference:"high-performance"});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;
 camera=new THREE.PerspectiveCamera(64,1,.1,410);clock=new THREE.Clock();
 construct();reset();requestAnimationFrame(frame);
}
function reset(){
 const start=raceStart();pos={x:start.x,y:start.y,z:start.z};yaw=start.yaw;
 speed=0;progress=0;reportedFinish=false;
 if(kart){kart.position.set(pos.x,pos.y,pos.z);kart.rotation.y=yaw+Math.PI;}
}
function positionOnTrack(x,z){
 const road=projectToRoute(x,z,ROAD),pit=projectToRoute(x,z,PIT);
 if(pit.distance<PIT_HALF_WIDTH&&pit.distance<road.distance)return {...pit,isPit:true};
 return {...road,isPit:false};
}
async function transmit(){
 if(telemetryPending||!raceId||!playing)return;
 telemetryPending=true;
 const current=raceId,position={x:pos.x,z:pos.z};
 try{
  const result=await api("sample",{raceId:current,...position});
  if(!active||raceId!==current)return;
  progress=result.progress;
  $("kartProgress").textContent=progress+"%";
  if(result.readyToFinish&&!reportedFinish){
   reportedFinish=true;
   const finish=await api("finish",{raceId:current,...position});
   if(raceId!==current)return;
   playing=false;raceId=null;speed=0;
   $("kartTime").textContent=format(finish.elapsedMs);
   $("kartBest").textContent="BEST "+format(finish.bestMs);
   message((finish.personalBest?"🏆 NEW PERSONAL BEST! ":"FINISHED! ")+format(finish.elapsedMs)+" · Saved to leaderboard.");
   standings(finish.entries);
  }
 }catch(error){
  if(raceId===current){playing=false;message(error.message+" Restart the lap to try again.");}
 }finally{telemetryPending=false;}
}
function update(dt){
 if(!playing)return;
 const accelerate=down("w")||down("arrowup");
 const brake=down("s")||down("arrowdown")||down(" ");
 const steer=Number(down("d")||down("arrowright"))-Number(down("a")||down("arrowleft"));
 speed+=Number(accelerate)*16*dt;
 speed-=Math.sign(speed)*(0.9+Math.abs(speed)*.08)*dt;
 if(brake)speed-=Math.sign(speed||1)*42*dt;
 speed=Math.max(-4,Math.min(29,speed));
 if(!accelerate&&!brake&&Math.abs(speed)<.15)speed=0;
 // In this coordinate system positive yaw steers world-left, so D decreases yaw.
 // Higher speed increases the turning radius; brake before the chicanes.
 const steeringRate=2.25/(1+Math.abs(speed)/15);
 yaw-=steer*dt*steeringRate*Math.min(1,Math.abs(speed)/3)*(speed>=0?1:-1);
 const x=pos.x+Math.sin(yaw)*speed*dt,z=pos.z+Math.cos(yaw)*speed*dt;
 const projected=positionOnTrack(x,z);
 const onRunoff=projected.distance>ROAD_HALF_WIDTH-.2&&!projected.isPit;
 if(onRunoff){
  speed*=Math.max(.65,1-1.7*dt);
  if(projected.distance>ROAD_HALF_WIDTH+RUNOFF_WIDTH) speed*=.35;
  else{pos.x=x;pos.z=z;pos.y=projected.y;}
 }else{pos.x=x;pos.z=z;pos.y=projected.y;}
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
 const target=new THREE.Vector3(pos.x-Math.sin(yaw)*11,pos.y+7.3,pos.z-Math.cos(yaw)*11);
 camera.position.lerp(target,Math.min(1,dt*4.5));
 camera.lookAt(pos.x,pos.y+1.1,pos.z);
 renderer.render(scene,camera);
 $("kartSpeed").textContent=Math.round(Math.abs(speed)*3.6)+" km/h";
}
async function begin(){
 if(busy)return;busy=true;$("kartStart").disabled=true;
 try{
  await init();
  const result=await api("start",{});
  raceId=result.raceId;reset();started=performance.now();sendAt=performance.now();playing=true;
  $("kartTime").textContent="00:00.000";
  $("kartProgress").textContent="0%";
  $("kartStart").textContent="Restart lap";
  if(result.bestMs)$("kartBest").textContent="BEST "+format(result.bestMs);
  message("GO! Follow the road around the chicanes and hills. Complete a full lap to set your time.");
 }catch(error){message(error.message);}
 finally{busy=false;$("kartStart").disabled=false;}
}
function open(){
 if(active)return;active=true;$("kartGame").classList.remove("hidden");
 document.body.classList.add("kart-open");document.exitPointerLock?.();
 message("Race the redesigned Velvet Circuit — corners, chicanes, hills and a pit lane.");
 leaderboard();init().catch(error=>message("Track unavailable: "+error.message));
}
function close(){
 active=false;playing=false;raceId=null;keys.clear();touch.clear();speed=0;
 $("kartGame").classList.add("hidden");document.body.classList.remove("kart-open");
}
window.addEventListener("keydown",e=>{
 if(!active||["INPUT","TEXTAREA"].includes(document.activeElement?.tagName))return;
 const k=e.key.toLowerCase();
 if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)){
  keys.add(k);e.preventDefault();
 }
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
$("kartStart").addEventListener("click",begin);
$("kartClose").addEventListener("click",close);
$("kartRefresh").addEventListener("click",leaderboard);
window.KartRacing={open,close,isOpen:()=>active};
