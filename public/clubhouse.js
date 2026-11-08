/* First-person 3D social clubhouse. Real WebGL geometry, not isometric canvas. */
const root=document.getElementById("clubhouse"),canvas=document.getElementById("clubhouseCanvas");
const $=id=>document.getElementById(id);
let THREE=null;
try{THREE=await import("https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js");}
catch(err){console.error(err);$("clubToast").classList.remove("hidden");$("clubToast").querySelector("span").textContent="3D engine couldn't load. Refresh with an internet connection.";}
const stations=[
  {id:"mahjong",label:"MAHJONG",x:-5.7,z:-2.9,colour:0x176c50,enabled:true},
  {id:"poker",label:"POKER",x:5.6,z:-3.1,colour:0x2c5975,enabled:false},
  {id:"blackjack",label:"BLACKJACK",x:5.6,z:4.7,colour:0x74415c,enabled:false},
  {id:"slots",label:"SLOT MACHINES",x:-8.2,z:5,colour:0x9b3658,enabled:false}
];
const pressed=new Set(),state={active:false,yaw:0,pitch:0,near:null,locked:false};
let scene,camera,renderer,clock,raycaster;const clickables=[];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function mat(c,metalness=0,roughness=.7){return new THREE.MeshStandardMaterial({color:c,metalness,roughness});}
function box(w,h,d,m,x,y,z,parent=scene){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function cylinder(r,height,m,x,y,z,parent=scene){
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,height,24),m);
 mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function signTexture(title,subtitle){
 const c=document.createElement("canvas");c.width=512;c.height=220;const g=c.getContext("2d");
 g.fillStyle="#183b33";g.fillRect(0,0,512,220);g.strokeStyle="#d1ad66";g.lineWidth=10;g.strokeRect(9,9,494,202);
 g.strokeStyle="#fff0c2";g.lineWidth=2;g.strokeRect(21,21,470,178);g.textAlign="center";
 g.font="bold 48px Georgia";g.fillStyle="#f6dc99";g.fillText(title,256,99);
 g.font="bold 23px sans-serif";g.fillStyle="#eee4ce";g.fillText(subtitle,256,158);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function sign(title,subtitle,x,y,z,w=3){
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,w*220/512),new THREE.MeshBasicMaterial({map:signTexture(title,subtitle),side:THREE.DoubleSide}));
 mesh.position.set(x,y,z);scene.add(mesh);return mesh;
}
function register(group,station){group.traverse(m=>{if(m.isMesh){m.userData.station=station;clickables.push(m);}});}
function buildWorld(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x10262b);scene.fog=new THREE.FogExp2(0x10262b,.016);
 camera=new THREE.PerspectiveCamera(72,1,.1,90);camera.position.set(0,1.7,8.7);
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.shadowMap.enabled=true;
 clock=new THREE.Clock();raycaster=new THREE.Raycaster();
 const felt=mat(0x165743),wall=mat(0x24483e),gold=mat(0xc49a53,.7,.3),timber=mat(0x523b2b,.12,.6);
 box(25,.28,23,felt,0,-.16,0);box(25,7,.5,wall,0,3.5,-11.75);
 box(.5,7,23,wall,-12.45,3.5,0);box(.5,7,23,wall,12.45,3.5,0);
 box(25,.25,23,mat(0x1b2f2d),0,7.05,0);
 for(let i=-12;i<=12;i++){
  box(.018,.005,23,mat(0x28765a),i,.002,0);
  if(i<=11)box(25,.005,.018,mat(0x28765a),0,.002,i);
 }
 for(const z of [-11.43,11.43])box(25,.12,.12,gold,0,1.3,z);
 for(const x of [-12.19,12.19])box(.12,.12,23,gold,x,1.3,0);
 for(let x=-10;x<=10;x+=5){box(.55,6,.55,timber,x,3,-11.4);box(.72,.14,.72,gold,x,5.8,-11.4);}
 for(const z of [-8,0,8])for(const x of [-12.2,12.2])box(.48,6,.48,timber,x,3,z);
 scene.add(new THREE.HemisphereLight(0xeaf3ff,0x34422d,1.2));
 const sun=new THREE.DirectionalLight(0xffe7bd,1.7);sun.position.set(0,9,3);scene.add(sun);
 for(const [x,z] of [[-6,-4],[6,-4],[0,5],[0,-9]]){
  cylinder(.7,.16,gold,x,5.6,z);
  const lamp=new THREE.PointLight(0xffd08b,23,9,2);lamp.position.set(x,5.4,z);scene.add(lamp);
 }
 sign("THE GAMES CLUB","MAHJONG · POKER · BLACKJACK",0,4.25,-11.46,7);
 for(const [x,z] of [[-11,8],[11,8],[-11,-9],[11,-9]]){
   cylinder(.32,1.2,timber,x,.65,z);
   const leaves=new THREE.Mesh(new THREE.SphereGeometry(.65,10,8),mat(0x3a845a));leaves.position.set(x,1.55,z);scene.add(leaves);
 }
 stations.forEach(st=>st.id==="slots"?slots(st):table(st));
}
function table(st){
 const g=new THREE.Group();g.position.set(st.x,0,st.z);scene.add(g);
 const wood=mat(0x523621),gold=mat(0xd9b774,.7,.35),cloth=mat(st.colour),chair=mat(0x3d443f);
 box(2.35,.2,1.65,wood,0,.97,0,g);
 box(2.26,.07,1.58,gold,0,1.1,0,g);
 box(2.1,.04,1.43,cloth,0,1.15,0,g);
 for(const x of [-.88,.88])for(const z of [-.58,.58])cylinder(.12,.9,wood,x,.5,z,g);
 for(const [x,z] of [[-1.65,0],[1.65,0],[0,-1.17],[0,1.17]]){
  box(.55,.13,.55,chair,x,.51,z,g);cylinder(.11,.47,wood,x,.24,z,g);
 }
 if(st.id==="mahjong"){
  for(let i=0;i<12;i++){
   const x=-.8+(i%6)*.32,z=-.34+Math.floor(i/6)*.7;
   box(.23,.13,.25,mat(0x17704f),x,1.26,z,g);
   box(.19,.02,.21,mat(0xf1e7d5),x,1.34,z,g);
  }
 }else{
  for(let i=0;i<4;i++)box(.19,.01,.29,mat(0xf9eacf),-.45+i*.3,1.19,-.1,g);
 }
 const banner=new THREE.Mesh(new THREE.PlaneGeometry(2.7,1.13),new THREE.MeshBasicMaterial({map:signTexture(st.label,st.enabled?"PRESS E TO PLAY":"COMING SOON"),side:THREE.DoubleSide}));
 banner.position.set(0,2.5,-1);g.add(banner);register(g,st);
}
function slots(st){
 const g=new THREE.Group();g.position.set(st.x,0,st.z);scene.add(g);
 const red=mat(0x762d4e,.45,.4),gold=mat(0xe5bd71,.75,.25),screen=mat(0xf1e5bd);
 for(let i=0;i<3;i++){
  const x=(i-1)*.78;
  box(.67,1.75,.62,red,x,.89,0,g);
  box(.7,.21,.68,gold,x,1.82,0,g);
  box(.56,.82,.045,screen,x,1.18,.34,g);
  const icon=new THREE.Mesh(new THREE.PlaneGeometry(.55,.42),new THREE.MeshBasicMaterial({map:signTexture(i===1?"★":"777","")}));
  icon.position.set(x,1.28,.37);g.add(icon);
 }
 const banner=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.08),new THREE.MeshBasicMaterial({map:signTexture("SLOTS","COMING SOON"),side:THREE.DoubleSide}));
 banner.position.set(0,2.6,0);g.add(banner);register(g,st);
}
function toast(msg){$("clubToast").querySelector("span").textContent=msg;$("clubToast").classList.remove("hidden");}
function interact(st){
 if(!st)return;
 if(st.id==="mahjong")window.MahjongClubhouse.enterMahjong();
 else toast(st.label+" is coming soon. Mahjong is playable now.");
}
function nearest(){
 let selected=null,distance=2.9;
 for(const st of stations){
  const d=Math.hypot(camera.position.x-st.x,camera.position.z-st.z);
  if(d<distance){distance=d;selected=st;}
 }
 state.near=selected;
 $("clubPrompt").textContent=selected?"Press E · "+selected.label+(selected.enabled?" — Enter game":" — Coming soon"):"WASD to walk · Mouse to look · E to interact";
 $("clubPrompt").classList.toggle("near",!!selected);
}
function move(dt){
 if(!state.active)return;
 const dx=Number(pressed.has("d")||pressed.has("arrowright"))-Number(pressed.has("a")||pressed.has("arrowleft"));
 const dz=Number(pressed.has("w")||pressed.has("arrowup"))-Number(pressed.has("s")||pressed.has("arrowdown"));
 const length=Math.hypot(dx,dz);
 if(length){
  const speed=(pressed.has("shift")?6:3.6)*dt/length;
  const nx=camera.position.x+Math.cos(state.yaw)*dx*speed-Math.sin(state.yaw)*dz*speed;
  const nz=camera.position.z-Math.sin(state.yaw)*dx*speed-Math.cos(state.yaw)*dz*speed;
  function valid(x,z){
   if(Math.abs(x)>11.6||Math.abs(z)>10.65)return false;
   for(const s of stations){
    if(s.id==="slots"?Math.abs(x-s.x)<1.5&&Math.abs(z-s.z)<1.0:Math.abs(x-s.x)<1.4&&Math.abs(z-s.z)<1.15)return false;
   }return true;
  }
  if(valid(nx,camera.position.z))camera.position.x=nx;
  if(valid(camera.position.x,nz))camera.position.z=nz;
 }
 camera.rotation.order="YXZ";camera.rotation.y=state.yaw;camera.rotation.x=state.pitch;
 nearest();
}
function resize(){
 if(!renderer)return;
 const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
 const pixelRatio=renderer.getPixelRatio();
 if(canvas.width!==Math.round(w*pixelRatio)||canvas.height!==Math.round(h*pixelRatio)){
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
 }
}
function frame(){
 requestAnimationFrame(frame);
 const dt=Math.min(.05,clock?.getDelta()||.016);
 if(!renderer||!state.active)return;
 resize();move(dt);renderer.render(scene,camera);
}
function look(dx,dy){state.yaw-=dx*.0026;state.pitch=clamp(state.pitch-dy*.0026,-1.25,1.25);}
function interactRay(){
 if(!raycaster)return;
 raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
 const hit=raycaster.intersectObjects(clickables,false)[0];
 if(hit&&hit.distance<4)interact(hit.object.userData.station);
 else interact(state.near);
}
window.addEventListener("keydown",e=>{
 if(!state.active||["INPUT","TEXTAREA"].includes(document.activeElement?.tagName))return;
 const k=e.key.toLowerCase();
 if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","shift"].includes(k)){e.preventDefault();pressed.add(k);}
 if(k==="e"&&!e.repeat){e.preventDefault();interact(state.near);}
});
window.addEventListener("keyup",e=>pressed.delete(e.key.toLowerCase()));
window.addEventListener("blur",()=>pressed.clear());
document.addEventListener("pointerlockchange",()=>state.locked=document.pointerLockElement===canvas);
document.addEventListener("mousemove",e=>{if(state.active&&state.locked)look(e.movementX,e.movementY);});
canvas.addEventListener("click",()=>{
 if(!state.active)return;
 if(state.locked)interactRay();
 else if(!("ontouchstart" in window)&&canvas.requestPointerLock)canvas.requestPointerLock();
 else interactRay();
});
let touch=null;
canvas.addEventListener("touchstart",e=>{if(e.touches.length===1)touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
canvas.addEventListener("touchmove",e=>{if(!state.active||!touch||e.touches.length!==1)return;const p=e.touches[0];look(p.clientX-touch.x,p.clientY-touch.y);touch={x:p.clientX,y:p.clientY};e.preventDefault();},{passive:false});
canvas.addEventListener("touchend",()=>touch=null);
document.querySelectorAll("[data-move]").forEach(b=>{
 const key=b.dataset.move;
 b.addEventListener("pointerdown",e=>{e.preventDefault();pressed.add(key);b.setPointerCapture?.(e.pointerId);});
 const up=()=>pressed.delete(key);
 b.addEventListener("pointerup",up);b.addEventListener("pointercancel",up);b.addEventListener("lostpointercapture",up);
});
$("clubInteract").onclick=()=>interact(state.near);
$("enterMahjong").onclick=()=>window.MahjongClubhouse.enterMahjong();
$("clubToastClose").onclick=()=>$("clubToast").classList.add("hidden");
$("clubReturn").onclick=()=>window.MahjongClubhouse.returnToLobby();
window.MahjongClubhouse={
 showLobby(){
  if(!$("authScreen").classList.contains("hidden"))return;
  $("home").classList.add("hidden");$("room").classList.add("hidden");root.classList.remove("hidden");
  $("clubReturn").classList.add("hidden");state.active=true;
 },
 enterMahjong(){
  state.active=false;pressed.clear();
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
if(THREE){try{buildWorld();frame();}catch(err){console.error(err);toast("Could not initialise 3D on this device.");}}
if($("authScreen").classList.contains("hidden")){
 if(new URLSearchParams(location.search).get("room"))window.MahjongClubhouse.enterMahjong();
 else window.MahjongClubhouse.showLobby();
}
