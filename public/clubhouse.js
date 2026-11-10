/* Premium velvet & brass Games Club — world geometry lives in club-velvet-world.js. */
import {createClubSocial} from "./club-social.js";
import {buildVelvetClub,STATIONS} from "./club-velvet-world.js";
import {nearestInteraction,blockedBy} from "./club-layout.js";

const $=id=>document.getElementById(id);
const root=$("clubhouse"),canvas=$("clubhouseCanvas"),pressed=new Set();
let THREE=null;
try{THREE=await import("https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js");}
catch(err){console.error(err);$("clubToast").classList.remove("hidden");$("clubToast").querySelector("span").textContent="The 3D engine could not load. Check your connection and refresh.";}
const state={active:false,yaw:0,pitch:0,near:null,locked:false,seated:null,seatReturn:null,avatarYaw:Math.PI};
const stations=STATIONS;
let scene,camera,renderer,clock,raycaster,social=null,lastPresence=0,toastTimeout=null;
let obstacles=[],seatAnchors=[];
const clickables=[];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function zoneAt(x,z){return x < -10 ? (z<0?"mahjong":"blackjack"):x>10?(z<0?"poker":"slots"):"hall";}
function showToast(message){
 const toast=$("clubToast");toast.querySelector("span").textContent=message;toast.classList.remove("hidden");
 clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.classList.add("hidden"),4500);
}
function standUp(){
 if(!state.seated)return;
 const previous=state.seatReturn;
 state.seated=null;state.seatReturn=null;
 // Return to the safe standing spot where E was originally pressed.
 if(previous){
  camera.position.set(previous.x,previous.y,previous.z);
  state.yaw=previous.yaw;state.pitch=previous.pitch;
 }else camera.position.y=1.7;
 pressed.clear();showToast("You stood up. Walk around or press E to sit again.");
}
function sitIn(anchor){
 if(state.seated){standUp();return;}
 state.seatReturn={x:camera.position.x,y:1.7,z:camera.position.z,yaw:state.yaw,pitch:state.pitch};
 state.seated=anchor;
 camera.position.set(anchor.x,anchor.eyeY,anchor.z);
 state.yaw=anchor.yaw;state.pitch=-.07;
 pressed.clear();social?.seatedChat();
 showToast("You are seated at the "+(anchor.kind==="stool"?"bar":anchor.kind==="table"?"table":"lounge")+". Press E to stand.");
}
function interact(st){
 if(state.seated){standUp();return;}
 if(!st)return;
 if(st.kind&&["sofa","stool","table"].includes(st.kind)){
   const game=st.id.startsWith("poker-")?"poker":st.id.startsWith("blackjack-")?"blackjack":null;
   if(game){window.SalonGames?.open(game);return;}
   sitIn(st);return;
 }
 if(st.id==="mahjong"){window.MahjongClubhouse.enterMahjong();return;}
 if(["poker","blackjack","slots"].includes(st.id)){
   window.SalonGames?.open(st.id);return;
 }
 if(st.id==="board"){$("clubNotice").classList.toggle("hidden");return;}
 if(st.id==="karaoke"){$("clubSocialPanel").classList.add("open");showToast("Welcome to the karaoke stage! Enable your mic to talk to others in this room.");return;}
 if(st.id==="bar"){showToast("The bar is open! Walk up to any stool and press E to sit.");return;}
 if(st.id.startsWith("sofa")){showToast("Move closer to a sofa cushion and press E to sit.");return;}
}
function nearest(){
 const selected=nearestInteraction(camera.position.x,camera.position.z,seatAnchors,stations);
 state.near=selected;
 const prompt=$("clubPrompt");
 prompt.textContent=state.seated?"Press E to stand · Chat with friends":
  selected?.kind?"Press E to sit · "+selected.label:
  selected?"Press E · "+selected.label:"WASD to walk · Mouse to look · E to interact";
 prompt.classList.toggle("near",!!selected||!!state.seated);
 const zone=zoneAt(camera.position.x,camera.position.z);
 $("clubZone").textContent=({hall:"MAIN HALL",mahjong:"MAHJONG ROOM",poker:"POKER ROOM",blackjack:"BLACKJACK ROOM",slots:"SLOTS ROOM"})[zone];
}
function collides(x,z){
 if(Math.abs(x)>22.35||Math.abs(z)>17.85)return true;
 return blockedBy(x,z,obstacles,.34);
}
function move(dt){
 if(!state.active||window.SalonGames?.isOpen())return;
 const oldX=camera.position.x,oldZ=camera.position.z;
 const dx=Number(pressed.has("d")||pressed.has("arrowright"))-Number(pressed.has("a")||pressed.has("arrowleft"));
 const dz=Number(pressed.has("w")||pressed.has("arrowup"))-Number(pressed.has("s")||pressed.has("arrowdown"));
 const length=Math.hypot(dx,dz);
 if(length&&!state.seated){
  const speed=(pressed.has("shift")?6.6:4.3)*dt/length;
  const nx=camera.position.x+Math.cos(state.yaw)*dx*speed-Math.sin(state.yaw)*dz*speed;
  const nz=camera.position.z-Math.sin(state.yaw)*dx*speed-Math.cos(state.yaw)*dz*speed;
  if(!collides(nx,camera.position.z))camera.position.x=nx;
  if(!collides(camera.position.x,nz))camera.position.z=nz;
 }
 // Character face direction tracks the actual movement vector, not camera yaw.
 const movedX=camera.position.x-oldX,movedZ=camera.position.z-oldZ;
 if(Math.hypot(movedX,movedZ)>.001)state.avatarYaw=Math.atan2(movedX,movedZ);
 camera.rotation.order="YXZ";camera.rotation.y=state.yaw;camera.rotation.x=state.pitch;
 nearest();
 const now=performance.now();
 if(now-lastPresence>170){lastPresence=now;social?.move(camera.position.x,camera.position.z,state.avatarYaw);}
}
function resize(){
 if(!renderer)return;
 const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),dpr=renderer.getPixelRatio();
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
 }
}
function frame(){
 requestAnimationFrame(frame);
 const dt=Math.min(.05,clock?.getDelta()||.016);
 if(!renderer||!state.active)return;
 resize();move(dt);social?.update(dt);renderer.render(scene,camera);
}
function look(dx,dy){state.yaw-=dx*.0024;state.pitch=clamp(state.pitch-dy*.0024,-1.18,1.18);}
// The previous generated note loop has been removed; silence is the default.
// A properly produced, legally licensed soundtrack can be added as a separate asset.
function buildWorld(){
 scene=new THREE.Scene();
 scene.background=new THREE.Color(0x281d29);
 scene.fog=new THREE.FogExp2(0x281d29,.006);
 camera=new THREE.PerspectiveCamera(72,1,.1,120);
 camera.position.set(0,1.7,13.7);
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.45;
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));
 renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 clock=new THREE.Clock();
 raycaster=new THREE.Raycaster();
 const venue=buildVelvetClub(THREE,scene);
 obstacles=venue.obstacles;seatAnchors=venue.seats;
 social=createClubSocial(THREE,scene,camera,zoneAt);
}
window.addEventListener("keydown",e=>{
 if(!state.active||window.SalonGames?.isOpen()||["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
 const k=e.key.toLowerCase();
 if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","shift"].includes(k)){
  e.preventDefault();pressed.add(k);
 }
 if(k==="e"&&!e.repeat){e.preventDefault();if(state.seated)standUp();else interact(state.near);}
 if(k==="enter"&&!e.repeat){$("clubChatToggle").click();}
});
window.addEventListener("keyup",e=>pressed.delete(e.key.toLowerCase()));
window.addEventListener("blur",()=>pressed.clear());
document.addEventListener("pointerlockchange",()=>state.locked=document.pointerLockElement===canvas);
document.addEventListener("mousemove",e=>{if(state.active&&state.locked)look(e.movementX,e.movementY);});
canvas.addEventListener("click",()=>{
 if(!state.active)return;
 if(state.seated){standUp();return;}
 if(state.near){interact(state.near);return;}
 if(!state.locked&&!('ontouchstart' in window)&&canvas.requestPointerLock)canvas.requestPointerLock();
});
let touch=null;
canvas.addEventListener("touchstart",e=>{if(e.touches.length===1)touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
canvas.addEventListener("touchmove",e=>{
 if(!state.active||!touch||e.touches.length!==1)return;
 const p=e.touches[0];look(p.clientX-touch.x,p.clientY-touch.y);touch={x:p.clientX,y:p.clientY};e.preventDefault();
},{passive:false});
canvas.addEventListener("touchend",()=>touch=null);
document.querySelectorAll("[data-move]").forEach(b=>{
 const key=b.dataset.move;b.addEventListener("pointerdown",e=>{e.preventDefault();pressed.add(key);b.setPointerCapture?.(e.pointerId);});
 const up=()=>pressed.delete(key);b.addEventListener("pointerup",up);b.addEventListener("pointercancel",up);b.addEventListener("lostpointercapture",up);
});
$("clubInteract").onclick=()=>state.seated?standUp():interact(state.near);
$("enterMahjong").onclick=()=>window.MahjongClubhouse.enterMahjong();
$("clubToastClose").onclick=()=>$("clubToast").classList.add("hidden");
$("clubNoticeClose").onclick=()=>$("clubNotice").classList.add("hidden");

$("clubReturn").onclick=()=>window.MahjongClubhouse.returnToLobby();
window.MahjongClubhouse={
 showLobby(){
  if(!$("authScreen").classList.contains("hidden"))return;
  $("home").classList.add("hidden");$("room").classList.add("hidden");root.classList.remove("hidden");
  $("clubReturn").classList.add("hidden");state.active=true;social?.start();window.SalonProfile?.load();
 },
 enterMahjong(){
  state.active=false;state.seated=null;state.seatReturn=null;pressed.clear();social?.stop();
  if(document.pointerLockElement===canvas)document.exitPointerLock();
  root.classList.add("hidden");$("home").classList.remove("hidden");
  $("room").classList.add("hidden");$("clubReturn").classList.remove("hidden");
 },
 returnToLobby(){
  if(!$("room").classList.contains("hidden")){
   if(!confirm("Leave this Mahjong room and return to the clubhouse?"))return;
   window.MahjongClubhouse.disconnect?.();
  }
  $("room").classList.add("hidden");$("home").classList.add("hidden");
  history.replaceState({},"",location.pathname);window.MahjongClubhouse.showLobby();
 },
 disconnect:null
};
if(THREE){try{buildWorld();frame();}catch(err){console.error(err);showToast("Could not initialise 3D on this device.");}}
if($("authScreen").classList.contains("hidden")){
 if(new URLSearchParams(location.search).get("room"))window.MahjongClubhouse.enterMahjong();
 else window.MahjongClubhouse.showLobby();
}
