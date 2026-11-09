/* Immersive first-person games club: separate rooms, live social avatars and furnished lounges. */
import {createClubSocial} from "./club-social.js";
import {sideSkirtingSegments,chairFacing,couchSeatPlan,barSeatPlan,gameSeatPlan,nearestInteraction,blockedBy} from "./club-layout.js";
const $=id=>document.getElementById(id);
const root=$("clubhouse"),canvas=$("clubhouseCanvas"),pressed=new Set();
let THREE=null;
try{THREE=await import("https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js");}
catch(err){console.error(err);$("clubToast").classList.remove("hidden");$("clubToast").querySelector("span").textContent="The 3D engine could not load. Check your connection and refresh.";}
const state={active:false,yaw:0,pitch:0,near:null,locked:false,seated:null,seatReturn:null};
const stations=[
 {id:"mahjong",label:"MAHJONG TABLE",x:-17,z:-11,r:3,enabled:true},
 {id:"poker",label:"POKER TABLE",x:17,z:-11,r:3,enabled:false},
 {id:"blackjack",label:"BLACKJACK TABLE",x:-17,z:9,r:3,enabled:false},
 {id:"slots",label:"SLOT MACHINES",x:18,z:9,r:3,enabled:false},
 {id:"board",label:"NOTICEBOARD",x:-7.6,z:-5,r:2.7},
 {id:"karaoke",label:"KARAOKE STAGE",x:0,z:-13.5,r:4},
 {id:"bar",label:"CLUB BAR",x:6.6,z:-5.8,r:2.5},
 {id:"sofa-left",label:"LOUNGE SEATING",x:-5.3,z:6,r:3},
 {id:"sofa-right",label:"LOUNGE SEATING",x:5.3,z:6,r:3}
];
let scene,camera,renderer,clock,raycaster,social=null,lastPresence=0;
const clickables=[],obstacles=[],seatAnchors=[];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const mat=(c,metalness=0,roughness=.73)=>new THREE.MeshStandardMaterial({color:c,metalness,roughness});
const palette={wall:0x213b37,trim:0xb68c55,dark:0x251e1e,wood:0x62412e,green:0x14513e,cream:0xf1dbad,leather:0x3e594a};
function box(w,h,d,m,x,y,z,parent=scene,solid=false){
 const obj=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
 obj.position.set(x,y,z);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);
 if(solid)obstacles.push({x,z,w,d});
 return obj;
}
function cylinder(r,h,m,x,y,z,parent=scene){
 const obj=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,20),m);
 obj.position.set(x,y,z);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;
}
function sphere(r,m,x,y,z,parent=scene){
 const o=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;
}
function plane(w,h,m,x,y,z,rotation=0,parent=scene){
 const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);o.position.set(x,y,z);o.rotation.y=rotation;parent.add(o);return o;
}
function labelTexture(title,subtitle,accent="#d7b679"){
 const c=document.createElement("canvas");c.width=1024;c.height=328;
 const p=c.getContext("2d");p.fillStyle="#132820";p.fillRect(0,0,1024,328);
 p.strokeStyle=accent;p.lineWidth=12;p.strokeRect(14,14,996,300);
 p.strokeStyle="#f6e4ba";p.lineWidth=2;p.strokeRect(32,32,960,264);
 p.textAlign="center";p.textBaseline="middle";p.fillStyle="#f6e1a6";
 p.font="bold 76px Georgia, serif";
 const fit=(str,max)=>{while(p.measureText(str).width>max&&str.length>4)str=str.slice(0,-2);return str;};
 p.fillText(fit(title,880),512,125);
 p.fillStyle="#c7d6c4";p.font="bold 33px system-ui";p.fillText(fit(subtitle,880),512,239);
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function sign(title,subtitle,x,y,z,width=5,angle=0){
 const material=new THREE.MeshBasicMaterial({map:labelTexture(title,subtitle),side:THREE.DoubleSide});
 return plane(width,width*.32,material,x,y,z,angle);
}
function zoneAt(x,z){return x< -10?(z<0?"mahjong":"blackjack"):x>10?(z<0?"poker":"slots"):"hall";}
function wallX(x,z0,z1,m,height=6){box(.32,height,z1-z0,m,x,height/2,(z0+z1)/2,scene,true);}
function wallZ(z,x0,x1,m,height=6){box(x1-x0,height,.32,m,(x0+x1)/2,height/2,z,scene,true);}
function pointLight(x,y,z,colour=0xffd69a,intensity=17,distance=8){
 const light=new THREE.PointLight(colour,intensity,distance,2);light.position.set(x,y,z);scene.add(light);
 sphere(.1,new THREE.MeshBasicMaterial({color:colour}),x,y,z);
}
function lightFixture(x,z){
 const gold=mat(palette.trim,.7,.25);
 cylinder(.5,.1,gold,x,5.76,z);cylinder(.04,.42,gold,x,5.95,z);
 const shade=new THREE.Mesh(new THREE.ConeGeometry(.7,.45,14,1,true),mat(0xe8cd91,.2,.45));shade.position.set(x,5.52,z);shade.rotation.x=Math.PI;scene.add(shade);
 pointLight(x,5.35,z,0xffdbad,21,10);
}
function carpet(x,z,w,d,colour){
 box(w,.045,d,mat(0xc9a76d),x,.035,z);
 box(w-.17,.055,d-.17,mat(colour),x,.07,z);
}
function plant(x,z){
 const pot=mat(0x75513f),leaf=mat(0x326c4d);
 cylinder(.35,.66,pot,x,.38,z);
 for(let i=0;i<7;i++){
  const a=i*Math.PI*2/7;
  sphere(.31,leaf,x+Math.cos(a)*.25,1.24+(i%3)*.17,z+Math.sin(a)*.25);
 }sphere(.39,leaf,x,1.6,z);
}
function picture(title,x,z,angle=0){
 const frame=mat(0xb78f54,.5,.38);const g=new THREE.Group();g.position.set(x,3,z);g.rotation.y=angle;scene.add(g);
 box(2.35,1.55,.1,frame,0,0,0,g);
 const canvas=document.createElement("canvas");canvas.width=300;canvas.height=190;
 const q=canvas.getContext("2d");q.fillStyle="#193e39";q.fillRect(0,0,300,190);
 q.fillStyle="#a4b8a4";for(let i=0;i<9;i++){q.beginPath();q.arc(30+i*30,60+Math.sin(i)*20,18,0,7);q.fill();}
 q.font="bold 30px Georgia";q.textAlign="center";q.fillStyle="#f9dda1";q.fillText(title,150,151);
 plane(2.18,1.35,new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas)}),0,0,.075,0,g);
}
function couch(x,z,rotation=0,colour=0x405c50,id="sofa"){
 const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;scene.add(g);
 const leather=mat(colour,0,.86),wood=mat(palette.wood),piping=mat(0xc29a67,.65,.3);
 // A padded three-seat Chesterfield-style couch, front facing local +Z.
 box(3.15,.48,1.12,leather,0,.6,0,g);
 box(3.2,.94,.29,leather,0,1.18,-.48,g);
 for(const sx of [-1.42,1.42]){
  box(.32,.72,1.22,leather,sx,.99,.01,g);
  sphere(.2,leather,sx,1.34,.37,g);
 }
 for(const sx of [-.96,0,.96]){
  box(.87,.2,.88,mat(0x5e7b6d),sx,.91,.1,g);
  box(.78,.03,.026,piping,sx,1.0,.53,g);
  box(.7,.32,.2,mat(0x416a59),sx,1.23,-.28,g);
 }
 for(const sx of [-1.15,1.15])for(const zz of [-.33,.35])box(.12,.29,.12,wood,sx,.20,zz,g);
 seatAnchors.push(...couchSeatPlan(x,z,rotation,id));
 return g;
}
function coffee(x,z){
 const wood=mat(0x684936,.15,.45),gold=mat(0xc6a466,.72,.3);
 box(1.8,.12,.9,wood,x,.48,z,scene,true);
 for(const a of [-.7,.7])for(const b of [-.31,.31])box(.09,.41,.09,gold,x+a,.25,z+b);
 cylinder(.13,.08,mat(0xead6ad),x,.59,z);
}
function lounge(x,z,flipped=false){
 carpet(x,z,7.7,6.3,0x24473e);
 // Both sofas face the coffee table, not the wall.
 couch(x,z+1.65,Math.PI,0x4a6556,(flipped?"right":"left")+"-north");
 couch(x,z-1.65,0,0x456052,(flipped?"right":"left")+"-south");
 coffee(x,z);
 for(const shift of [-3.45,3.45]){
  cylinder(.24,.56,mat(0x5c4030),x+shift,.34,z);
  sphere(.24,mat(0xdab67a),x+shift,.73,z);
 }
}
function shelf(x,z){
 const wood=mat(0x4f3529);
 for(let y=.9;y<=3.4;y+=1.1)box(3.7,.12,.63,wood,x,y,z);
 for(let i=0;i<12;i++){
  const cx=x-1.6+(i%6)*.61,cy=1.15+Math.floor(i/6)*1.1;
  cylinder(.105,.52,mat([0x856f36,0x42634c,0x935d4b][i%3],.35,.4),cx,cy,z);
 }
}
function bar(){
 carpet(5.8,-6,7,5.5,0x263b35);
 const wood=mat(0x69432f,.08,.47),stone=mat(0xbfa48a,.2,.38),brass=mat(0xc9a366,.7,.25);
 box(5.5,1.13,1.1,wood,5.5,.58,-7.35,scene,true);
 box(5.9,.17,1.35,stone,5.5,1.23,-7.35);
 for(const seat of barSeatPlan()){
  const g=new THREE.Group();g.position.set(seat.x,0,seat.z);g.rotation.y=seat.yaw;scene.add(g);
  cylinder(.38,.17,mat(0x334f43),0,.77,0,g);
  cylinder(.07,.68,brass,0,.39,0,g);
  cylinder(.27,.055,brass,0,.18,0,g);
  // Stool back is behind the user's sitting position, opposite the bar.
  box(.7,.53,.13,mat(0x334f43),0,1.10,-.34,g);
  for(const side of [-.28,.28])box(.07,.38,.08,brass,side,.98,-.28,g);
  seatAnchors.push(seat);
 }
 shelf(5.5,-9.05);
 sign("THE CLUB BAR","PULL UP A STOOL · CHAT",5.5,4,-9.48,4.3);
}
function stage(){
 carpet(0,-14,12,9,0x472b32);
 box(9,.6,4.3,mat(0x694331),0,.31,-14.5,scene,true);
 box(9,.18,4.45,mat(0xc8a36d,.5,.3),0,.68,-14.5);
 for(const x of [-4,4]){
  cylinder(.19,3.5,mat(0xbb9153,.6,.3),x,2.35,-16.4);
  pointLight(x,4.8,-14.3,x<0?0xefa4c8:0x98cbea,12,8);
 }
 cylinder(.055,1.75,mat(0xc8c8c6,.7,.3),0,1.56,-13.5);
 sphere(.18,mat(0x333239,.7,.25),0,2.49,-13.5);
 for(const x of [-3.55,3.55]){
  box(1.12,2.1,1.1,mat(0x21272a),x,1.7,-12.2);
  cylinder(.4,.09,mat(0x343b3d),x,1.72,-11.63);
 }
 sign("THE GAMES CLUB","KARAOKE · SOCIAL LOUNGE",0,4.6,-18.23,8.2);
 sign("KARAOKE STAGE","ENABLE MIC TO JOIN THE ROOM",0,3.75,-17.55,4.2);
}
function noticeboard(){
 const g=new THREE.Group();g.position.set(-8.45,2.6,-4.9);g.rotation.y=Math.PI/2;scene.add(g);
 box(3.7,2.8,.16,mat(0x85633c),0,0,0,g);
 box(3.42,2.55,.04,mat(0x34453a),0,0,.11,g);
 const c=document.createElement("canvas");c.width=520;c.height=360;const q=c.getContext("2d");
 q.fillStyle="#20392e";q.fillRect(0,0,520,360);q.fillStyle="#e9d6a7";
 q.font="bold 46px Georgia";q.textAlign="center";q.fillText("CLUB NOTICEBOARD",260,62);
 const lines=["WELCOME TO THE CLUBHOUSE","Mahjong tables are open","Poker · Blackjack · Slots coming soon","Chat with friends in the lounges","Karaoke & microphone: opt-in","Be kind · Respect other players"];
 q.font="23px sans-serif";lines.forEach((line,i)=>q.fillText(line,260,120+i*39));
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 plane(3.3,2.4,new THREE.MeshBasicMaterial({map:tex}),0,0,.147,0,g);
}
function gameTable(st){
 const g=new THREE.Group();g.position.set(st.x,0,st.z);scene.add(g);
 const wood=mat(0x613e2b,.2,.4),gold=mat(0xb9945b,.72,.25),felt=mat(st.id==="mahjong"?0x1a694b:st.id==="poker"?0x24506b:0x5f3752),leather=mat(0x454e4a);
 box(3.2,.22,2.15,wood,0,.98,0,g);
 box(3.12,.07,2.07,gold,0,1.11,0,g);
 box(2.95,.055,1.91,felt,0,1.17,0,g);
 for(const x of [-1.25,1.25])for(const z of [-.78,.78])cylinder(.15,.85,wood,x,.54,z,g);
 const chairs=[[-2.18,0],[2.18,0],[0,-1.74],[0,1.74]];
 for(const [x,z] of chairs){
  const chair=new THREE.Group();chair.position.set(x,0,z);
  chair.rotation.y=chairFacing(x,z);g.add(chair);
  cylinder(.34,.18,leather,0,.61,0,chair);
  cylinder(.10,.55,wood,0,.31,0,chair);
  cylinder(.29,.06,gold,0,.15,0,chair);
  // Backrest local -Z faces away from table, seat local +Z faces the centre.
  box(.64,.66,.15,leather,0,.99,-.29,chair);
  box(.56,.1,.06,gold,0,1.27,-.24,chair);
 }
 seatAnchors.push(...gameSeatPlan(st));
 if(st.id==="mahjong"){
  for(let i=0;i<20;i++){
   const x=-1.1+(i%10)*.24,z=-.4+Math.floor(i/10)*.7;
   box(.18,.13,.23,mat(0xeff3e6),x,1.31,z,g);
   box(.16,.014,.21,mat(0x227959),x,1.39,z,g);
  }
 }else{
  for(let i=0;i<5;i++)box(.17,.015,.25,mat(0xe6d7bb),-.57+i*.29,1.22,-.15,g);
 }
 sign(st.id.toUpperCase(),st.enabled?"PRESS E TO PLAY":"COMING SOON",st.x,3.7,st.z-3.25,4.8);
}
function slotFaceTexture(i){
 const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;
 const p=canvas.getContext("2d");
 p.fillStyle="#10191b";p.fillRect(0,0,512,512);
 p.fillStyle="#2e1930";p.fillRect(16,16,480,480);
 p.fillStyle="#f5d18c";p.font="bold 32px Georgia";p.textAlign="center";
 p.fillText(["LUCKY SEVENS","GOLDEN DRAGON","MIDNIGHT JACKPOT","FORTUNE CLUB"][i],256,65);
 p.fillStyle="#080f15";p.fillRect(35,97,442,225);
 for(let k=0;k<3;k++){
  const x=54+k*140;
  const shade=p.createLinearGradient(0,120,0,298);
  shade.addColorStop(0,"#fff0c8");shade.addColorStop(.5,"#fbf8e9");shade.addColorStop(1,"#d6c295");
  p.fillStyle=shade;p.fillRect(x,113,126,186);
  p.fillStyle=["#a73542","#c08d30","#186b5a"][(k+i)%3];
  p.font="bold 110px Georgia";p.fillText(["7","★","♠","7"][(i+k)%4],x+63,250);
 }
 p.strokeStyle="#e1b56a";p.lineWidth=8;p.strokeRect(29,91,454,240);
 p.fillStyle="#c6a066";p.font="bold 26px sans-serif";p.fillText("★  ★  JACKPOT  ★  ★",256,385);
 p.fillStyle="#354d42";p.fillRect(30,411,452,55);
 for(let k=0;k<5;k++){p.beginPath();p.arc(93+k*82,439,18,0,Math.PI*2);p.fillStyle=["#d39a4a","#669a84","#b7797c"][k%3];p.fill();}
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=renderer?.capabilities?.getMaxAnisotropy?.()||1;return tex;
}
function slotMachines(){
 // A deliberately dark, opaque decorated back wall fixes the bright untextured-looking surface.
 const wallMat=new THREE.MeshBasicMaterial({color:0x152a27});
 box(11.4,5.65,.22,wallMat,17.2,2.82,3.15,scene,true);
 const wood=mat(0x39292c,.18,.62),burgundy=mat(0x672b40,.38,.38);
 const brass=mat(0xe0b86d,.75,.24),glass=mat(0x141f25,.28,.2);
 for(let i=0;i<4;i++){
  const x=13.65+i*2.27,z=4.48;
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  // Angled casino cabinet: footplate, lower facia, screen, top canopy, controls.
  box(1.56,.23,1.12,wood,0,.15,0,g);
  box(1.42,1.52,.93,burgundy,0,1.0,-.09,g);
  box(1.58,.1,1.12,brass,0,1.76,0,g);
  box(1.52,1.12,.24,wood,0,2.37,-.24,g);
  box(1.48,.14,.78,brass,0,2.94,-.14,g);
  box(1.39,1.55,.11,glass,0,1.60,.47,g);
  box(1.3,1.47,.045,brass,0,1.65,.535,g);
  const screen=new THREE.Mesh(
   new THREE.PlaneGeometry(1.22,1.37),
   new THREE.MeshBasicMaterial({map:slotFaceTexture(i),toneMapped:false})
  );
  screen.position.set(0,1.65,.57);g.add(screen);
  // Projecting button console, lighted buttons and coin tray.
  const buttonTop=box(1.47,.16,.68,wood,0,.84,.73,g);
  buttonTop.rotation.x=-.16;
  for(let k=0;k<4;k++)sphere(.095,mat([0xc9a862,0x87a8a7,0xbb667c,0xb4b4bf][k],.45,.3),-.49+k*.33,.96,.85,g);
  box(.88,.14,.08,mat(0x101719),0,.43,.56,g);
  box(1.47,.07,.18,brass,0,.35,.51,g);
  for(const side of [-.72,.72]){
   box(.095,2.3,.12,brass,side,1.76,.36,g);
   sphere(.12,brass,side,2.94,.4,g);
  }
  // Individual top marquee instead of large blank rectangular blocks.
  const marquee=new THREE.Mesh(new THREE.PlaneGeometry(1.46,.44),
    new THREE.MeshBasicMaterial({map:labelTexture(["LUCKY 7","DRAGON","JACKPOT","FORTUNE"][i],"SLOTS"),side:THREE.DoubleSide}));
  marquee.position.set(0,2.67,.505);g.add(marquee);
  // Floor plan collision only, so the foreground walkway stays clear.
  obstacles.push({x,z,w:1.5,d:1.16});
 }
 // Feature wall with individual sconces and a framed welcome panel.
 box(10.8,.15,.18,brass,17.2,5.28,3.31);
 sign("THE SLOT LOUNGE","FOUR CLASSIC CABINETS · COMING SOON",17.3,4.38,3.43,7.4);
 for(const x of [12.6,21.6])pointLight(x,3.3,5.8,0xdd9db4,7,4);
}

function buildRooms(){
 const wall=mat(0x203831,.04,.92),gold=mat(palette.trim,.52,.42),wood=mat(palette.wood);
 // One continuous building, with open walking doorways into four distinct furnished rooms.
 box(46,.27,37,mat(0x55402e),0,-.14,0);
 box(46,.22,37,mat(0x142923),0,6.26,0);
 wallZ(-18.5,-23,23,wall);wallZ(18.5,-23,23,wall);
 wallX(-23,-18.5,18.5,wall);wallX(23,-18.5,18.5,wall);
 // Corridor walls: two door gaps per side (one for each game room).
 for(const x of [-10,10]){
  wallX(x,-18.5,-6.1,wall);wallX(x,-2.35,5.15,wall);wallX(x,9.2,18.5,wall);
 }
 // Separate front/back game rooms.
 wallZ(1.25,-23,-10);wallZ(1.25,10,23);
 // Wide parquet floor paths.
 for(let x=-22;x<=22;x+=2){
  box(.025,.006,37,mat(0x7c5940),x,.007,0);
 }
 for(let z=-18;z<=18;z+=2.2)box(46,.006,.025,mat(0x795540),0,.009,z);
 // Decorative baseboard and crossbeams.
 // Skirting sits tight against actual wall segments; do not span door openings.
 for(const x of [-22.8,22.8])box(.11,.16,36.6,gold,x,.12,0);
 for(const x of [-10.18,10.18])for(const segment of sideSkirtingSegments()){
  box(.075,.16,segment.length,gold,x,.12,segment.center);
 }
 for(const z of [-18.27,18.27])box(45.5,.16,.1,gold,0,.12,z);
 for(const z of [1.25])for(const x of [-16.5,16.5])box(12.8,.14,.06,gold,x,.12,z);
 for(const x of [-8.5,8.5]){
  box(.42,5.7,.42,wood,x,2.85,-17.8);
  box(.62,.16,.62,gold,x,5.5,-17.8);
 }
 // No columns in front of the central Games Club sign.
 scene.add(new THREE.HemisphereLight(0xcfe9e1,0x29221c,1.6));
 const directional=new THREE.DirectionalLight(0xffe4b7,1.45);
 directional.position.set(7,12,9);scene.add(directional);
 for(const [x,z] of [[0,10],[0,1],[0,-7],[0,-14],[-17,-12],[17,-12],[-17,9],[17,9]])lightFixture(x,z);
 for(const x of [-21,-11,11,21])for(const z of [-16,16])plant(x,z);
 carpet(-17,-11,10,10,0x203d39);carpet(17,-11,10,10,0x243f53);
 carpet(-17,9,10,10,0x41343b);carpet(17,9,10,10,0x503444);
 gameTable(stations[0]);gameTable(stations[1]);gameTable(stations[2]);slotMachines();
 sign("MAHJONG ROOM","ENTER THROUGH THE ARCH", -16.5,4.5,-18.25,6);
 sign("POKER ROOM","SOCIAL TABLES",16.5,4.5,-18.25,6);
 sign("BLACKJACK","TABLES COMING SOON",-16.5,4.5,18.25,6,Math.PI);
 sign("SLOTS LOUNGE","MACHINES COMING SOON",16.5,4.5,18.25,6,Math.PI);
 stage();bar();noticeboard();
 lounge(-5.3,6);lounge(5.3,6,true);
 picture("GAMES NIGHT",-9.73,12,Math.PI/2);
 picture("OUR CLUB",9.73,12,-Math.PI/2);
 for(const [x,z] of [[-8,15],[8,15],[-8,-9],[8,-9]])plant(x,z);
 // Welcome mat at the entrance facing the central hall.
 carpet(0,14,5,3,0x294f3d);
 sign("WELCOME","EXPLORE · PLAY · CONNECT",0,4.45,18.24,5.7,Math.PI);
}
function showToast(message){
 const toast=$("clubToast");toast.querySelector("span").textContent=message;toast.classList.remove("hidden");
}
function seat(st){
 if(state.seated){state.seated=null;showToast("You stood up.");return;}
 state.seated=st.id;
 camera.position.set(st.x,1.2,st.z+2.8);state.yaw=Math.PI;state.pitch=-.08;
 social?.seatedChat();showToast("Sitting in the lounge. Press E to stand, or chat with friends.");
}
function interact(st){
 if(state.seated){seat(st||{id:"lounge"});return;}
 if(!st)return;
 if(st.id==="mahjong"){window.MahjongClubhouse.enterMahjong();return;}
 if(["poker","blackjack","slots"].includes(st.id)){showToast(st.label+" is coming soon. Mahjong is playable now.");return;}
 if(st.id==="board"){$("clubNotice").classList.toggle("hidden");return;}
 if(st.id==="karaoke"){$("clubSocialPanel").classList.add("open");showToast("Welcome to the karaoke stage! Enable your mic to talk to others in this room.");return;}
 if(st.id==="bar"){showToast("Welcome to the club bar! Take a seat in the lounge and chat.");return;}
 if(st.id.startsWith("sofa"))seat(st);
}
function nearest(){
 let best=null,distance=Infinity;
 for(const st of stations){const d=Math.hypot(camera.position.x-st.x,camera.position.z-st.z);if(d<st.r&&d<distance){best=st;distance=d;}}
 state.near=best;
 const prompt=$("clubPrompt");
 prompt.textContent=state.seated?"Press E to stand · Open chat to talk":best?"Press E · "+best.label:"WASD to walk · Mouse to look · E to interact";
 prompt.classList.toggle("near",!!best||!!state.seated);
 const zone=zoneAt(camera.position.x,camera.position.z);
 $("clubZone").textContent=({hall:"MAIN HALL",mahjong:"MAHJONG ROOM",poker:"POKER ROOM",blackjack:"BLACKJACK ROOM",slots:"SLOTS ROOM"})[zone];
}
function collides(x,z){
 if(Math.abs(x)>22.35||Math.abs(z)>17.85)return true;
 return obstacles.some(o=>Math.abs(x-o.x)<o.w/2+.36&&Math.abs(z-o.z)<o.d/2+.36);
}
function move(dt){
 if(!state.active)return;
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
 camera.rotation.order="YXZ";camera.rotation.y=state.yaw;camera.rotation.x=state.pitch;
 nearest();
 const now=performance.now();
 if(now-lastPresence>170){lastPresence=now;social?.move(camera.position.x,camera.position.z,state.yaw);}
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
function hitStation(){
 raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
 const hit=raycaster.intersectObjects(clickables,false)[0];
 if(hit&&hit.distance<4)return hit.object.userData.station;
 return state.near;
}
function initAudio(){
 if(audioCtx)return;
 audioCtx=new (window.AudioContext||window.webkitAudioContext)();
 musicGain=audioCtx.createGain();musicGain.gain.value=.09;musicGain.connect(audioCtx.destination);
}
function musicNote(hz,start,length){
 const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
 osc.type="sine";osc.frequency.setValueAtTime(hz,start);
 gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.14,start+.08);
 gain.gain.exponentialRampToValueAtTime(.0001,start+length);
 osc.connect(gain).connect(musicGain);osc.start(start);osc.stop(start+length+.03);
}
let beat=0;
function playMusicBar(){
 if(!audioCtx||audioCtx.state!=="running")return;
 const chords=[[174.61,220,261.63],[196,246.94,293.66],[164.81,207.65,261.63],[174.61,220,293.66]];
 const now=audioCtx.currentTime+.03,notes=chords[Math.floor(beat/4)%chords.length];
 musicNote(notes[beat%3],now,.74);if(beat%4===0)musicNote(notes[0]/2,now,2);
 beat++;
}
function musicToggle(){
 const button=$("clubMusic");
 if(musicTimer){clearInterval(musicTimer);musicTimer=null;musicGain.gain.value=0;button.textContent="♫ Play lounge music";button.setAttribute("aria-pressed","false");return;}
 try{initAudio();audioCtx.resume();musicGain.gain.value=.09;playMusicBar();musicTimer=setInterval(playMusicBar,930);
  button.textContent="♫ Mute music";button.setAttribute("aria-pressed","true");}
 catch(err){showToast("Audio isn't supported on this device.");}
}
function buildWorld(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x12252a);scene.fog=new THREE.FogExp2(0x12252a,.011);
 camera=new THREE.PerspectiveCamera(73,1,.1,115);camera.position.set(0,1.7,12.3);
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.17;
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 clock=new THREE.Clock();raycaster=new THREE.Raycaster();buildRooms();
 social=createClubSocial(THREE,scene,camera,zoneAt);
}
window.addEventListener("keydown",e=>{
 if(!state.active||["INPUT","TEXTAREA"].includes(document.activeElement?.tagName))return;
 const k=e.key.toLowerCase();
 if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","shift"].includes(k)){
  e.preventDefault();pressed.add(k);
 }
 if(k==="e"&&!e.repeat){e.preventDefault();interact(state.near);}
 if(k==="enter"&&!e.repeat){$("clubChatToggle").click();}
});
window.addEventListener("keyup",e=>pressed.delete(e.key.toLowerCase()));
window.addEventListener("blur",()=>pressed.clear());
document.addEventListener("pointerlockchange",()=>state.locked=document.pointerLockElement===canvas);
document.addEventListener("mousemove",e=>{if(state.active&&state.locked)look(e.movementX,e.movementY);});
canvas.addEventListener("click",()=>{
 if(!state.active)return;
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
$("clubInteract").onclick=()=>interact(state.near);
$("enterMahjong").onclick=()=>window.MahjongClubhouse.enterMahjong();
$("clubToastClose").onclick=()=>$("clubToast").classList.add("hidden");
$("clubNoticeClose").onclick=()=>$("clubNotice").classList.add("hidden");
$("clubMusic").onclick=musicToggle;
$("clubReturn").onclick=()=>window.MahjongClubhouse.returnToLobby();
window.MahjongClubhouse={
 showLobby(){
  if(!$("authScreen").classList.contains("hidden"))return;
  $("home").classList.add("hidden");$("room").classList.add("hidden");root.classList.remove("hidden");
  $("clubReturn").classList.add("hidden");state.active=true;social?.start();
 },
 enterMahjong(){
  state.active=false;state.seated=null;pressed.clear();social?.stop();
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
