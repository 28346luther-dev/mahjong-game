/* Velvet Circuit: drivable 3D go-kart time trial and persistent leaderboard. */
const $=id=>document.getElementById(id);
const TAU=Math.PI*2,RX=25,RZ=15,N=8;
const gate=i=>({x:RX*Math.sin(i*TAU/N),z:-RZ*Math.cos(i*TAU/N)});
const format=ms=>ms==null?"--:--.---":String(Math.floor(ms/60000)).padStart(2,"0")+":"+String(Math.floor(ms%60000/1000)).padStart(2,"0")+"."+String(Math.floor(ms%1000)).padStart(3,"0");
let THREE,renderer,scene,camera,clock,kart,active=false,playing=false,busy=false;
let raceId=null,nextGate=1,wasNear=false,requesting=false,speed=0,yaw=Math.PI/2,pos={x:0,z:-15},start=0;
const keys=new Set(),touch=new Set();
const down=k=>keys.has(k)||touch.has(k);
async function api(path,body){
 const r=await fetch("/api/kart/"+path,{method:body?"POST":"GET",credentials:"same-origin",
  headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined,cache:"no-store"});
 const result=await r.json();if(!r.ok)throw Error(result.error||"Race service unavailable");return result;
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
async function leaderboard(){try{standings((await api("leaderboard")).entries);}catch{message("Could not load leaderboard.");}}
function object(geometry,material,x,y,z,parent=scene){
 const o=new THREE.Mesh(geometry,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
}
function box(w,h,d,color,x,y,z,parent=scene){
 return object(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.66}),x,y,z,parent);
}
function column(radius,height,color,x,y,z,parent=scene){
 return object(new THREE.CylinderGeometry(radius,radius,height,14),new THREE.MeshStandardMaterial({color,roughness:.7}),x,y,z,parent);
}
function construct(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x9dc4c4);scene.fog=new THREE.FogExp2(0x9dc4c4,.005);
 scene.add(new THREE.HemisphereLight(0xf9ead2,0x496850,2.2));
 const sun=new THREE.DirectionalLight(0xffddba,2.3);sun.position.set(-18,42,25);scene.add(sun);
 const grass=object(new THREE.PlaneGeometry(210,210),new THREE.MeshStandardMaterial({color:0x49765b,roughness:.97}),0,-.05,0);
 grass.rotation.x=-Math.PI/2;
 const points=[],indices=[];
 for(let i=0;i<=160;i++){
  const a=TAU*i/160;
  for(const d of [-4.2,4.2])points.push((RX+d)*Math.sin(a),.045,-(RZ+d)*Math.cos(a));
 }
 for(let i=0;i<160;i++){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
 const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(points,3));geo.setIndex(indices);geo.computeVertexNormals();
 object(geo,new THREE.MeshStandardMaterial({color:0x343842,side:THREE.DoubleSide,roughness:.91}),0,0,0);
 for(let i=0;i<120;i++){
  const a=(i+.5)*TAU/120,dir=Math.atan2(RX*Math.cos(a),RZ*Math.sin(a));
  for(const d of [-4.55,4.55]){
   const kerb=box(1.2,.40,.37,i%2?0xf6e4d2:0xb43f51,(RX+d)*Math.sin(a),.23,-(RZ+d)*Math.cos(a));
   kerb.rotation.y=dir;
  }
  if(i%4===0){
   const stripe=box(.82,.025,.09,0xe2c68b,RX*Math.sin(a),.079,-RZ*Math.cos(a));stripe.rotation.y=dir;
  }
 }
 for(let i=0;i<8;i++)box(.9,.025,.93,i%2?0xf8e7db:0x26313b,-3.7+i*1.05,.094,-15);
 const turquoise=new THREE.MeshStandardMaterial({color:0x62d8d0,emissive:0x2eada5,emissiveIntensity:.5});
 for(let i=1;i<N;i++){
  const p=gate(i),g=new THREE.Group();g.position.set(p.x,0,p.z);g.rotation.y=i*TAU/N;scene.add(g);
  for(const offset of [-3.2,3.2])object(new THREE.CylinderGeometry(.11,.12,2.3,10),turquoise,offset,1.15,0,g);
  object(new THREE.BoxGeometry(6.6,.17,.2),turquoise,0,2.30,0,g);
 }
 for(let i=0;i<40;i++){
  const a=i*TAU/40,r=i%2?49:38,x=Math.sin(a)*r,z=Math.cos(a)*r;
  column(.24,2.3,0x795841,x,1.1,z);
  object(new THREE.ConeGeometry(1.6,3.8,9),new THREE.MeshStandardMaterial({color:0x396b51}),x,4,z);
 }
 for(const x of [-5,5])column(.14,5.2,0xc7a56e,x,2.6,-20.5);
 box(10.5,1.1,.3,0x58314c,0,4.5,-20.5);
 const canvas=document.createElement("canvas");canvas.width=768;canvas.height=128;
 const ctx=canvas.getContext("2d");ctx.fillStyle="#58314c";ctx.fillRect(0,0,768,128);
 ctx.fillStyle="#f9dcaa";ctx.font="bold 66px Georgia";ctx.textAlign="center";ctx.fillText("VELVET CIRCUIT",384,84);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 object(new THREE.PlaneGeometry(10,1.15),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}),0,4.5,-20.28);
 kart=new THREE.Group();scene.add(kart);
 box(1.23,.35,2.05,0x903450,0,.48,0,kart);
 box(1.04,.17,.8,0xe1b987,0,.68,-.33,kart);
 box(.85,.52,.65,0x402c3b,0,.9,.28,kart);
 for(const x of [-.68,.68])for(const z of [-.7,.7]){
  const wheel=object(new THREE.CylinderGeometry(.27,.27,.18,14),new THREE.MeshStandardMaterial({color:0x1e2229}),x,.3,z,kart);
  wheel.rotation.z=Math.PI/2;
 }
 object(new THREE.SphereGeometry(.31,16,12),new THREE.MeshStandardMaterial({color:0xd9ba93,roughness:.35}),0,1.27,.45,kart);
 box(.85,.09,.22,0xebd09b,0,.46,-1,kart);
}
async function init(){
 if(renderer)return;
 THREE=await import("https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js");
 renderer=new THREE.WebGLRenderer({canvas:$("kartCanvas"),antialias:true,powerPreference:"high-performance"});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;
 camera=new THREE.PerspectiveCamera(63,1,.1,200);clock=new THREE.Clock();
 construct();reset();requestAnimationFrame(frame);
}
function reset(){pos={x:0,z:-15};yaw=Math.PI/2;speed=0;wasNear=false;if(kart){kart.position.set(pos.x,0,pos.z);kart.rotation.y=yaw;}}
function distance(x,z){
 const a=Math.atan2(x/RX,-z/RZ);
 return Math.hypot(x-RX*Math.sin(a),z+RZ*Math.cos(a));
}
async function report(index){
 if(requesting||!raceId)return;requesting=true;
 try{
  const finish=index===N;
  const data=await api(finish?"finish":"checkpoint",finish
   ?{raceId,x:pos.x,z:pos.z}:{raceId,index,x:pos.x,z:pos.z});
  if(!active)return;
  if(finish){
   playing=false;raceId=null;speed=0;
   $("kartTime").textContent=format(data.elapsedMs);
   $("kartBest").textContent="BEST "+format(data.bestMs);
   message((data.personalBest?"🏆 NEW PERSONAL BEST! ":"FINISHED! ")+format(data.elapsedMs)+" · Saved to leaderboard.");
   standings(data.entries);
  }else{nextGate=data.nextCheckpoint;message("Checkpoint "+index+" cleared! Keep going.");}
 }catch(error){message(error.message);}
 finally{requesting=false;wasNear=true;}
}
function update(dt){
 if(!playing)return;
 const forward=Number(down("w")||down("arrowup")),back=Number(down("s")||down("arrowdown"));
 const turn=Number(down("d")||down("arrowright"))-Number(down("a")||down("arrowleft"));
 speed+=forward*9.4*dt;
 speed-=Math.sign(speed)*(1.4+Math.abs(speed)*.22)*dt;
 if(back||down(" "))speed-=Math.sign(speed||1)*17*dt;
 speed=Math.max(-2.6,Math.min(12.6,speed));
 if(!forward&&!back&&Math.abs(speed)<.18)speed=0;
 yaw+=turn*dt*1.43*Math.min(1.2,Math.abs(speed)/5)*(speed>=0?1:-1);
 const x=pos.x+Math.sin(yaw)*speed*dt,z=pos.z+Math.cos(yaw)*speed*dt;
 if(distance(x,z)>4.15)speed*=.35;
 else{pos.x=x;pos.z=z;}
 kart.position.set(pos.x,0,pos.z);kart.rotation.y=yaw;
 const point=gate(nextGate===N?0:nextGate);
 const near=Math.hypot(pos.x-point.x,pos.z-point.z)<3.4;
 if(near&&!wasNear&&!requesting)report(nextGate);
 if(!near)wasNear=false;
 $("kartTime").textContent=format(performance.now()-start);
}
function frame(){
 requestAnimationFrame(frame);if(!active||!renderer)return;
 const dt=Math.min(.05,clock.getDelta());update(dt);
 const w=$("kartCanvas").clientWidth||100,h=$("kartCanvas").clientHeight||100,dpr=renderer.getPixelRatio();
 if(renderer.domElement.width!==Math.round(w*dpr)||renderer.domElement.height!==Math.round(h*dpr)){
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
 }
 camera.position.lerp(new THREE.Vector3(pos.x-Math.sin(yaw)*10,7.6,pos.z-Math.cos(yaw)*10),Math.min(1,dt*4.5));
 camera.lookAt(pos.x,1,pos.z);renderer.render(scene,camera);
 $("kartSpeed").textContent=Math.round(Math.abs(speed)*9)+" km/h";
 $("kartGate").textContent=playing?nextGate+"/8":"READY";
}
async function startRace(){
 if(busy)return;busy=true;$("kartStart").disabled=true;
 try{
  await init();
  const data=await api("start",{});
  raceId=data.raceId;nextGate=1;reset();start=performance.now();playing=true;
  $("kartTime").textContent="00:00.000";
  $("kartStart").textContent="Restart race";
  message("GO! Cross every turquoise checkpoint in order, then return to the finish.");
 }catch(error){message(error.message);}
 finally{busy=false;$("kartStart").disabled=false;}
}
function open(){
 if(active)return;active=true;$("kartGame").classList.remove("hidden");
 document.body.classList.add("kart-open");document.exitPointerLock?.();
 message("Enter the Velvet Circuit: one timed lap, with a leaderboard of best times.");
 leaderboard();init().catch(error=>message("Unable to load race track: "+error.message));
}
function close(){
 active=false;playing=false;raceId=null;keys.clear();touch.clear();speed=0;
 $("kartGame").classList.add("hidden");document.body.classList.remove("kart-open");
}
window.addEventListener("keydown",e=>{
 if(!active||["INPUT","TEXTAREA"].includes(document.activeElement?.tagName))return;
 const k=e.key.toLowerCase();
 if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)){keys.add(k);e.preventDefault();}
 if(k==="r"){reset();playing=false;message("Kart reset. Start another timed lap.");}
 if(k==="escape"){e.preventDefault();close();}
});
window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
window.addEventListener("blur",()=>keys.clear());
document.querySelectorAll("[data-kart-key]").forEach(button=>{
 const k=button.dataset.kartKey;
 button.addEventListener("pointerdown",e=>{e.preventDefault();touch.add(k);button.setPointerCapture?.(e.pointerId);});
 for(const event of ["pointerup","pointercancel","lostpointercapture"])button.addEventListener(event,()=>touch.delete(k));
});
$("kartStart").addEventListener("click",startRace);
$("kartClose").addEventListener("click",close);
$("kartRefresh").addEventListener("click",leaderboard);
window.KartRacing={open,close,isOpen:()=>active};
