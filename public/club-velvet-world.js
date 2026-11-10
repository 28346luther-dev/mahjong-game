/* The Games Club — art-directed 3D environment.
 * A unified burgundy velvet, walnut, aged-brass, warm-ivory palette.
 * Every visual is real three-dimensional geometry; no flat photographic backdrop.
 */
import {sideSkirtingSegments,chairFacing,couchSeatPlan,barSeatPlan,gameSeatPlan} from "./club-layout.js";

export const STATIONS=[
 {id:"mahjong",label:"MAHJONG",x:-17,z:-11,r:2.65,enabled:true},
 {id:"poker",label:"TEXAS HOLD’EM",x:17,z:-11,r:3.25,enabled:true},
 {id:"blackjack",label:"BLACKJACK",x:-17,z:9,r:3.25,enabled:true},
 {id:"slots",label:"SLOT MACHINES",x:17.4,z:8.7,r:4.3,enabled:true},
 {id:"board",label:"NOTICEBOARD",x:-8.5,z:1.75,r:2.15},
 {id:"gokarts",label:"GO-KART PORTAL · VELVET CIRCUIT",x:0,z:16.25,r:2.2,enabled:true},
 {id:"karaoke",label:"KARAOKE STAGE",x:0,z:-13,r:3.8},
 {id:"bar",label:"COCKTAIL BAR",x:5.7,z:-5.4,r:2.4},
 {id:"sofa-left",label:"VELVET LOUNGE",x:-5.2,z:5.8,r:2.7},
 {id:"sofa-right",label:"VELVET LOUNGE",x:5.2,z:5.8,r:2.7}
];

export function buildVelvetClub(THREE,scene){
 const obstacles=[],seats=[],animated=[];
 const C={wine:0x78283e,merlot:0x562037,velvet:0x9a3c56,rose:0xb85468,
  walnut:0x39281e,darkWalnut:0x241b1b,brass:0xc09a60,lightBrass:0xe1bf84,
  wall:0x352631,wallPanel:0x402c37,cream:0xe7d6b9,black:0x1c1a21,
  felt:0x174d3f,green:0x1c4f43};
 const standard=(color,metalness=0,roughness=.72)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
 const velvet=(color=C.velvet)=>new THREE.MeshPhysicalMaterial({color,roughness:.94,metalness:0,
  sheen:1,sheenColor:new THREE.Color(0xd06c7e),sheenRoughness:.63,clearcoat:0});
 const brass=standard(C.brass,.68,.32),bright=standard(C.lightBrass,.75,.26);
 const walnut=standard(C.walnut,.13,.5),darkWalnut=standard(C.darkWalnut,.14,.54);
 const wall=standard(C.wall,.04,.9),panel=standard(C.wallPanel,.04,.86);
 const cream=standard(C.cream,.05,.81),felt=standard(C.felt,.03,.84);
 const red=velvet(C.wine),rose=velvet(C.velvet),deep=velvet(C.merlot);
 const shadowify=o=>{o.castShadow=true;o.receiveShadow=true;return o;};
 const geomCache=new Map();
 function roundedGeometry(w,h,d,r=.12){
  const radius=Math.max(.008,Math.min(r,w/3,h/3,d/3)),key=[w,h,d,radius].join("/");
  if(geomCache.has(key))return geomCache.get(key);
  const shape=new THREE.Shape(),x=-w/2,y=-h/2;
  shape.moveTo(x+radius,y);
  shape.lineTo(x+w-radius,y);
  shape.quadraticCurveTo(x+w,y,x+w,y+radius);
  shape.lineTo(x+w,y+h-radius);
  shape.quadraticCurveTo(x+w,y+h,x+w-radius,y+h);
  shape.lineTo(x+radius,y+h);
  shape.quadraticCurveTo(x,y+h,x,y+h-radius);
  shape.lineTo(x,y+radius);
  shape.quadraticCurveTo(x,y,x+radius,y);
  const bevel=Math.min(radius*.46,d*.2);
  const geo=new THREE.ExtrudeGeometry(shape,{
   depth:d-2*bevel,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,
   bevelSegments:3,steps:1,curveSegments:5
  });
  geo.translate(0,0,-d/2+bevel);
  geo.computeVertexNormals();geomCache.set(key,geo);
  return geo;
 }
 function soft(w,h,d,m,x,y,z,parent=scene,r=.12){
  const o=shadowify(new THREE.Mesh(roundedGeometry(w,h,d,r),m));o.position.set(x,y,z);parent.add(o);return o;
 }
 function block(w,h,d,m,x,y,z,parent=scene,solid=false){
  const o=shadowify(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m));
  o.position.set(x,y,z);parent.add(o);
  if(solid)obstacles.push({x,z,w,d});
  return o;
 }
 function column(radius,height,m,x,y,z,parent=scene,edges=24){
  const o=shadowify(new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,edges),m));
  o.position.set(x,y,z);parent.add(o);return o;
 }
 function ball(radius,m,x,y,z,parent=scene){
  const o=shadowify(new THREE.Mesh(new THREE.SphereGeometry(radius,16,12),m));
  o.position.set(x,y,z);parent.add(o);return o;
 }
 function torus(radius,tube,m,x,y,z,parent=scene){
  const o=shadowify(new THREE.Mesh(new THREE.TorusGeometry(radius,tube,9,28),m));
  o.position.set(x,y,z);parent.add(o);return o;
 }
 function framedText(title,subtitle,x,y,z,w=4.4,rotation=0,accent="#f1dca9"){
  const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=318;
  const q=canvas.getContext("2d");const shade=q.createLinearGradient(0,0,1024,318);
  shade.addColorStop(0,"#2b1825");shade.addColorStop(.5,"#432338");shade.addColorStop(1,"#231a23");
  q.fillStyle=shade;q.fillRect(0,0,1024,318);
  q.strokeStyle=accent;q.lineWidth=10;q.strokeRect(15,15,994,288);
  q.strokeStyle="#be9a64";q.lineWidth=2;q.strokeRect(36,36,952,246);
  q.textAlign="center";q.textBaseline="middle";q.fillStyle="#f5dcaa";
  const fit=(str,max)=>{let size=title.length>18?58:75;while(size>32){q.font="bold "+size+"px Georgia,serif";if(q.measureText(str).width<max)break;size-=2;}return size;};
  fit(title,900);q.fillText(title,512,126);
  q.fillStyle="#e1cbb2";q.font="bold 29px system-ui";q.fillText(subtitle,512,239,920);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rotation;scene.add(g);
  soft(w+.14,w*.31+.14,.08,brass,0,0,-.045,g,.06);
  const front=new THREE.Mesh(new THREE.PlaneGeometry(w,w*318/1024),
   new THREE.MeshBasicMaterial({map:texture,side:THREE.FrontSide}));
  front.position.z=.025;g.add(front);return g;
 }
 function rug(x,z,w,d,colour=C.merlot){
  block(w,.026,d,brass,x,.023,z);
  block(w-.22,.035,d-.22,velvet(colour),x,.047,z);
  block(w-.41,.015,d-.41,standard(0x652d44),x,.074,z);
  for(const sx of [-w/2+.3,w/2-.3])
   for(const sz of [-d/2+.3,d/2-.3])ball(.065,bright,x+sx,.085,z+sz);
 }
 function lamp(x,z,height=4.6){
  column(.035,.75,brass,x,height+.25,z);
  column(.34,.13,bright,x,height-.18,z);
  const globe=new THREE.Mesh(new THREE.SphereGeometry(.36,16,14),
   new THREE.MeshStandardMaterial({color:0xffdfb8,emissive:0xffc788,emissiveIntensity:.45,roughness:.45}));
  globe.position.set(x,height-.48,z);scene.add(globe);
  const light=new THREE.PointLight(0xffd5ac,18,10,2);
  light.position.set(x,height-.55,z);scene.add(light);
  for(let k=0;k<7;k++){
   const a=k*2*Math.PI/7;
   ball(.045,bright,x+Math.cos(a)*.42,height-.26,z+Math.sin(a)*.42);
  }
 }
 function sconce(x,y,z,rotation=0){
  const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rotation;scene.add(g);
  soft(.27,.68,.17,brass,0,0,-.12,g);
  column(.11,.65,bright,0,0,.16,g);
  const light=new THREE.PointLight(0xffd4a9,4.6,3,2);light.position.set(0,.21,.38);g.add(light);
  ball(.17,cream,0,.25,.20,g);
 }
 function picture(label,x,z,rotation=0){
  const g=new THREE.Group();g.position.set(x,3.65,z);g.rotation.y=rotation;scene.add(g);
  soft(2.1,1.6,.11,brass,0,0,0,g);
  soft(1.91,1.43,.03,darkWalnut,0,0,.08,g);
  const canvas=document.createElement("canvas");canvas.width=380;canvas.height=280;const q=canvas.getContext("2d");
  const grad=q.createLinearGradient(0,0,380,280);
  grad.addColorStop(0,"#74344a");grad.addColorStop(.5,"#382538");grad.addColorStop(1,"#a77a58");
  q.fillStyle=grad;q.fillRect(0,0,380,280);
  q.strokeStyle="#e9c68c";q.lineWidth=5;
  for(let k=0;k<7;k++){q.beginPath();q.arc(190,145,k*20+15,Math.PI*.2,Math.PI*.9);q.stroke();}
  q.fillStyle="#f7dea8";q.font="bold 29px Georgia";q.textAlign="center";q.fillText(label,190,245);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const face=new THREE.Mesh(new THREE.PlaneGeometry(1.82,1.34),
   new THREE.MeshBasicMaterial({map:tex,side:THREE.FrontSide}));face.position.z=.102;g.add(face);
 }
 function planter(x,z){
  column(.37,.68,walnut,x,.4,z);
  column(.4,.07,bright,x,.75,z);
  for(let k=0;k<7;k++){
   const a=k*2*Math.PI/7;
   const stem=new THREE.Group();stem.position.set(x+Math.cos(a)*.1,.9,z+Math.sin(a)*.1);scene.add(stem);
   const leaf=new THREE.Mesh(new THREE.SphereGeometry(.38,10,9),standard(0x456b50,.03,.92));
   leaf.scale.set(.48,1.55,.55);leaf.rotation.z=Math.cos(a)*.45;leaf.rotation.x=Math.sin(a)*.45;
   leaf.position.set(Math.cos(a)*.29,.36,Math.sin(a)*.29);stem.add(leaf);
  }
 }
 function sofa(x,z,rotation,id){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;scene.add(g);
  // Deep-buttoned burgundy Chesterfield shape, rounded arms and individual seat cushions.
  soft(3.27,.37,1.07,red,0,.62,0,g,.17);
  soft(3.25,.95,.30,deep,0,1.16,-.45,g,.14);
  for(const side of [-1,1]){
   soft(.37,.77,1.20,red,side*1.52,.94,.02,g,.14);
   ball(.20,rose,side*1.52,1.33,.47,g);
   for(const zz of [-.37,.41])column(.075,.28,brass,side*1.17,.23,zz,g,12);
  }
  for(const localX of [-1.02,0,1.02]){
   soft(.96,.19,.82,rose,localX,.94,.13,g,.10);
   soft(.87,.08,.18,red,localX,1.21,-.265,g,.06);
   for(const dz of [-.25,.02])for(const dx of [-.25,0,.25])
    ball(.031,brass,localX+dx,1.15,dz-.33,g);
  }
  // Brass studs and welt along the arms.
  for(const sx of [-1.38,1.38])for(let j=0;j<5;j++)ball(.025,bright,sx,1.05-j*.105,.49,g);
  seats.push(...couchSeatPlan(x,z,rotation,id));
 }
 function coffeeTable(x,z){
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  // Oval walnut top replaces the square slab; two brass conical feet.
  const top=new THREE.Mesh(new THREE.CylinderGeometry(.76,.76,.10,40),walnut);
  top.scale.set(1.57,1,.79);top.position.y=.49;top.receiveShadow=true;g.add(top);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.80,.042,8,50),brass);
  rim.rotation.x=Math.PI/2;rim.scale.set(1.5,.8,1);rim.position.y=.55;g.add(rim);
  for(const sx of [-.65,.65])column(.16,.43,brass,sx,.24,0,g);
  column(.22,.05,brass,0,.57,0,g);ball(.14,cream,0,.68,0,g);
  // Use a smaller footprint to keep the walk-around aisle.
  obstacles.push({x,z,w:1.5,d:.70});
 }
 function lounge(x,z,prefix){
  rug(x,z,7.1,6.2,C.merlot);
  sofa(x,z+1.62,Math.PI,prefix+"-north");
  sofa(x,z-1.62,0,prefix+"-south");
  coffeeTable(x,z);
  for(const side of [-3.2,3.2]){
   column(.27,.53,walnut,x+side,.3,z);
   ball(.20,cream,x+side,.67,z);
  }
 }
 function chair(x,z,yaw,parent=scene){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=yaw;parent.add(g);
  soft(.65,.19,.61,rose,0,.59,.04,g,.09);
  soft(.66,.83,.18,deep,0,1.02,-.29,g,.11);
  soft(.56,.55,.08,red,0,1.04,-.19,g,.055);
  for(const sx of [-.25,.25])for(const zz of [-.2,.25])column(.035,.53,brass,sx,.29,zz,g,8);
  for(const sx of [-.18,.18])for(const yy of [.9,1.12])ball(.025,bright,sx,yy,-.14,g);
 }
 function table(st){
  const g=new THREE.Group();g.position.set(st.x,0,st.z);scene.add(g);
  rug(st.x,st.z,8.7,8.4,st.id==="mahjong"?0x3d2942:0x513045);
  const color=st.id==="mahjong"?felt:standard(0x25433e,0,.83);
  soft(3.75,.24,2.50,walnut,0,1.02,0,g,.19);
  soft(3.54,.09,2.30,brass,0,1.18,0,g,.05);
  soft(3.38,.045,2.15,color,0,1.24,0,g,.03);
  for(const sx of [-1.42,1.42])for(const sz of [-.98,.98]){
   column(.13,.84,walnut,sx,.5,sz,g);
   column(.06,.24,brass,sx,.28,sz,g);
  }
  for(const [x,z] of [[-2.18,0],[2.18,0],[0,-1.74],[0,1.74]])chair(x,z,chairFacing(x,z),g);
  seats.push(...gameSeatPlan(st));
  if(st.id==="mahjong"){
   for(let k=0;k<18;k++){
    const xx=-1.24+(k%9)*.29,zz=-.47+Math.floor(k/9)*.86;
    soft(.19,.12,.23,cream,xx,1.37,zz,g,.022);
    block(.13,.008,.17,felt,xx,1.436,zz,g);
   }
  }else{
   for(let k=0;k<5;k++)soft(.19,.018,.31,cream,-.68+k*.33,1.32,-.14,g,.018);
   for(let k=0;k<3;k++)column(.14,.035,standard(k%2?0xa83547:0xefcf85),.5+k*.19,1.32,.5,g);
  }
  // Room signs belong to roomShell. Duplicating them above the table caused
  // overlapping, illegible labels and visual z-fighting.
 }
 function bottles(x,z){
  for(let k=0;k<12;k++){
   const xx=x-1.7+(k%6)*.65,yy=1.55+Math.floor(k/6)*.94;
   column(.12,.43,standard([0x3d674b,0x693e3b,0xb3945d,0x47646b][k%4],.24,.3),xx,yy,z);
   column(.06,.15,brass,xx,yy+.28,z);
  }
 }
 function bar(){
  rug(5.7,-6.6,7.6,5.9,0x482a3b);
  soft(5.86,1.14,1.18,walnut,5.55,.61,-7.52,scene,.17);
  soft(6.12,.14,1.32,standard(0xb4a08b,.15,.35),5.55,1.21,-7.52,scene,.11);
  for(let k=0;k<11;k++){
   const xx=3.1+k*.48;
   soft(.055,.79,.038,brass,xx,.65,-6.913,scene,.013);
  }
  obstacles.push({x:5.55,z:-7.52,w:5.86,d:1.18});
  for(const seat of barSeatPlan()){
   const g=new THREE.Group();g.position.set(seat.x,0,seat.z);g.rotation.y=seat.yaw;scene.add(g);
   column(.08,.77,brass,0,.39,0,g);
   column(.31,.08,brass,0,.09,0,g);
   soft(.70,.17,.68,rose,0,.79,0,g,.08);
   soft(.70,.51,.16,deep,0,1.11,-.32,g,.09);
   torus(.29,.045,bright,0,.38,0,g).rotation.x=Math.PI/2;
   seats.push(seat);
  }
  // Full-height walnut backboard and upright framing physically support every shelf.
  soft(4.38,3.6,.16,darkWalnut,5.56,2.42,-9.51,scene,.07);
  for(const sx of [3.45,7.68])soft(.17,3.62,.64,walnut,sx,2.42,-9.24,scene,.05);
  for(const y of [1.32,2.37,3.42]){
   soft(4.16,.13,.52,walnut,5.56,y,-9.25,scene,.04);
   soft(4.20,.035,.55,brass,5.56,y+.09,-9.25,scene,.02);
  }
  bottles(5.56,-9.19);
  framedText("THE VELVET BAR","SIT · TALK · UNWIND",5.6,4.75,-9.6,4.8,0);
  for(const xx of [3.12,7.95])sconce(xx,3.1,-9.44);
 }
 function slots(){
  rug(17,9,10.3,11.2,0x492538);
  // Slot cabinets are truly shaped 3D objects, with curved crowns and controls.
  const machineColors=[0x61223a,0x78283e,0x52223c,0x852f47];
  for(let i=0;i<4;i++){
   const x=13.5+i*2.26,z=6.45;
   const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
   soft(1.65,2.42,1.20,velvet(machineColors[i]),0,1.30,0,g,.18);
   soft(1.82,.26,1.32,brass,0,2.63,0,g,.095);
   soft(1.66,.62,.31,walnut,0,2.95,-.24,g,.11);
   soft(1.43,1.25,.07,brass,0,1.86,.64,g,.06);
   soft(1.29,1.11,.045,standard(0x13131d,.22,.32),0,1.86,.685,g,.035);
   const canvas=document.createElement("canvas");canvas.width=480;canvas.height=420;
   const q=canvas.getContext("2d");q.fillStyle="#1d1824";q.fillRect(0,0,480,420);
   q.fillStyle="#f8dd9e";q.textAlign="center";q.font="bold 31px Georgia";
   q.fillText(["ROYAL 7","RUBY STAR","GOLD RUSH","NIGHT CLUB"][i],240,58);
   for(let n=0;n<3;n++){
    q.fillStyle="#f7ead4";q.fillRect(21+n*151,91,138,209);
    q.fillStyle=["#972e40","#be8c39","#23564b"][(i+n)%3];
    q.font="bold 116px Georgia";q.fillText(["7","★","♠","7"][(i+n)%4],90+n*151,235);
   }
   q.fillStyle="#eec985";q.font="bold 26px Georgia";q.fillText("J A C K P O T",240,354);
   const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
   const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.26,1.07),
    new THREE.MeshBasicMaterial({map:tex,side:THREE.FrontSide}));
   screen.position.set(0,1.86,.717);g.add(screen);
   const controls=soft(1.48,.17,.63,walnut,0,.94,.73,g,.07);controls.rotation.x=-.1;
   for(let n=0;n<4;n++)ball(.086,standard([0xc7955f,0x9e4e60,0x7c8f75,0xd4d6c7][n],.32,.3),-.53+n*.35,1.04,.94,g);
   soft(.91,.12,.08,standard(0x12131b),0,.48,.66,g,.02);
   // Marquee rests against its cabinet crown rather than floating above it.
   framedText(["ROYAL SEVEN","RUBY STAR","GOLD RUSH","NIGHT CLUB"][i],"SLOTS",x,3.26,z+.44,1.58,0);
   obstacles.push({x,z,w:1.68,d:1.2});
  }
  framedText("THE SLOT SALON","FREE-PLAY ARCADE",17,4.35,1.47,5.5,0);
  // Extra velvet lounge in the slot room is not a duplicate gameplay station.
  sofa(17,13.3,Math.PI,"slots-settee");
  planter(12,13.8);planter(22,13.8);
 }
 function stage(){
  rug(0,-13.6,10.1,8.9,0x602d48);
  // Low rounded walnut platform, velvet drape, brass edge.
  soft(9.1,.56,4.4,walnut,0,.30,-14.55,scene,.14);
  soft(9.15,.11,4.46,brass,0,.62,-14.55,scene,.06);
  soft(8.9,.05,4.24,deep,0,.71,-14.55,scene,.05);
  obstacles.push({x:0,z:-14.55,w:9.1,d:4.4});
  for(const x of [-4.14,4.14]){
   column(.13,4.0,brass,x,3.0,-17.38);
   ball(.16,bright,x,5.05,-17.38);
  }
  const curtain=velvet(C.wine);
  for(let x=-3.9;x<=3.9;x+=.37){
   const fold=soft(.37,4.3,.25,curtain,x,3.86,-17.89,scene,.10);
   fold.rotation.y=.11*Math.sin(x*2.8);
  }
  for(const x of [-3.5,3.5]){
   soft(1.15,1.92,1.1,darkWalnut,x,1.85,-12.18,scene,.13);
   column(.42,.08,standard(0x24202a),x,1.72,-11.59);
  }
  column(.052,1.8,bright,0,1.58,-13.35);
  ball(.17,standard(0x24222b,.32,.42),0,2.49,-13.35);
  column(.35,.055,bright,0,.76,-13.35);
  for(const x of [-3.8,3.8]){
   const light=new THREE.SpotLight(x<0?0xffc2a1:0xffd7bf,26,21,.55,.7,1.5);
   light.position.set(x,5.8,-10.8);light.target.position.set(x*.15,1.1,-14);
   scene.add(light,light.target);
  }
  // Sign sits INSIDE room, front-facing (not double-sided/mirrored).
  framedText("THE GAMES CLUB","A PRIVATE WORLD OF GAMES & FRIENDS",0,5.05,-17.62,8.25,0);
 }
 function board(){
  const g=new THREE.Group();g.position.set(-9.69,3.05,1.75);g.rotation.y=Math.PI/2;scene.add(g);
  soft(3.18,2.5,.16,walnut,0,0,0,g,.10);
  soft(2.98,2.30,.08,brass,0,0,.1,g,.06);
  const canvas=document.createElement("canvas");canvas.width=560;canvas.height=420;
  const q=canvas.getContext("2d");q.fillStyle="#45283a";q.fillRect(0,0,560,420);
  q.fillStyle="#f5dab0";q.textAlign="center";q.font="bold 42px Georgia";q.fillText("NOTICEBOARD",280,77);
  q.fillStyle="#d9cbb6";q.font="25px system-ui";
  ["MAHJONG TABLES OPEN","TEXAS HOLD’EM · SANA COINS","BLACKJACK & SLOTS OPEN","KARAOKE · OPT-IN VOICE","LOUNGE · CHAT · FRIENDS","BE KIND TO OTHER VISITORS"].forEach((line,i)=>q.fillText(line,280,135+i*43));
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const front=new THREE.Mesh(new THREE.PlaneGeometry(2.75,2.06),
   new THREE.MeshBasicMaterial({map:tex,side:THREE.FrontSide}));
  front.position.z=.15;g.add(front);
 }
 function goKartPortal(){
  // A physical racing-themed portal built against the north hall wall.
  // The wall remains solid; E transports the visitor to a separate racing scene.
  const g=new THREE.Group();g.position.set(0,0,17.87);g.rotation.y=Math.PI;scene.add(g);
  const glow=new THREE.MeshBasicMaterial({color:0x32d6c4});
  soft(4.35,4.1,.28,walnut,0,2.12,-.08,g,.13);
  soft(3.82,3.62,.09,brass,0,2.08,.12,g,.10);
  soft(3.53,3.3,.06,standard(0x172b36,.42,.33),0,2.05,.20,g,.09);
  // Neon racetrack loops give the door visible depth even when not entered.
  for(const r of [1.2,1.0,.78]){
   const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.055,10,52),glow);
   ring.scale.set(1,.98,1);ring.position.set(0,2.05,.29);g.add(ring);
  }
  const kartSign=soft(1.1,.22,.18,bright,0,.52,.29,g,.06);
  for(let i=0;i<12;i++){
   const x=-1.55+i*.282;
   soft(.14,.05,.11,i%2?cream:standard(0x201a29),x,.37,.33,g,.014);
  }
  for(const side of [-2.28,2.28]){
   soft(.20,4.15,.34,brass,side,2.08,.03,g,.045);
   ball(.21,standard(0x50cabb,.2,.3),side,4.08,.16,g);
  }
  const light=new THREE.PointLight(0x42d8c4,8,6,2);
  light.position.set(0,2,.75);g.add(light);
  // Keep interaction approach clear of decorative railings.
 }
 function roomShell(){
  const ceiling=standard(0x352a32,.04,.84),floor=standard(0x4b352e,.08,.71);
  block(46,.24,37,floor,0,-.16,0);
  block(46,.23,37,ceiling,0,6.16,0);
  // Wood plank texture is geometry-accurate and subtly visible, not harsh grid lines.
  const seam=standard(0x654c3f,.03,.89);
  for(let x=-22;x<=22;x+=1.5)block(.014,.005,37,seam,x,.006,0);
  for(let z=-17.8;z<=17.8;z+=4)block(46,.005,.014,standard(0x49352f),0,.008,z);
  const wallX=(x,a,b)=>{block(.34,6,b-a,wall,x,3,(a+b)/2,scene,true);};
  const wallZ=(z,a,b)=>{block(b-a,6,.34,wall,(a+b)/2,3,z,scene,true);};
  wallZ(-18.5,-23,23);wallZ(18.5,-23,23);
  wallX(-23,-18.5,18.5);wallX(23,-18.5,18.5);
  // Doorways are open voids, not painted flat wall sections.
  for(const x of [-10,10]){
   wallX(x,-18.5,-6.1);wallX(x,-2.35,5.15);wallX(x,9.2,18.5);
  }
  wallZ(1.25,-23,-10);wallZ(1.25,10,23);
  // Wainscoting + decorative pilasters on actual wall sections only.
  for(const x of [-22.73,22.73]){
   for(let z=-17.2;z<=17.2;z+=3.7){
    soft(.1,3.1,2.6,panel,x,1.94,z,scene,.025);
    block(.18,.065,2.8,brass,x,3.44,z);
   }
  }
  for(const x of [-9.75,9.75]){
   for(const section of sideSkirtingSegments()){
    block(.10,.15,section.length,walnut,x,.13,section.center);
    block(.085,.045,section.length,brass,x,.23,section.center);
    // Narrow vertical velvet-red framed wall panels, with noninteractive archways untouched.
    const count=Math.max(1,Math.floor(section.length/3));
    for(let n=0;n<count;n++){
     const z=section.start+(n+.5)*section.length/count;
     soft(.08,2.45,Math.min(1.9,section.length/count-.35),panel,x,3.04,z,scene,.024);
    }
   }
  }
  // Door jambs frame openings, but never create a collision volume inside the passage.
  for(const x of [-10,10]){
   for(const [a,b] of [[-6.1,-2.35],[5.15,9.2]]){
    for(const z of [a,b]){
     soft(.54,5.4,.46,walnut,x,2.7,z,scene,.09);
     soft(.60,.13,.52,brass,x,5.35,z,scene,.04);
    }
    block(.55,.18,b-a,brass,x,5.55,(a+b)/2);
    // Open sightlines below 5.4 m preserve doorway navigation.
   }
  }
  // Crown moulding and upper trim — never crosses through doors at human height.
  for(const z of [-18.18,18.18]){
   block(45.55,.10,.19,walnut,0,5.75,z);
   block(45.55,.04,.21,brass,0,5.66,z);
  }
  for(const x of [-22.8,22.8])block(.19,.13,36.3,walnut,x,5.75,0);
  // Coffered ceiling with warm spot accents, instead of a featureless black roof.
  for(const x of [-18,-9,0,9,18]){
   block(.13,.19,36,walnut,x,5.94,0);
  }
  for(const z of [-14,-7,0,7,14]){
   block(44,.19,.13,walnut,0,5.94,z);
  }
  // Warm lighting. Fill light prevents all-black corners without washing materials white.
  scene.add(new THREE.HemisphereLight(0xffe7d0,0x493044,2.05));
  const key=new THREE.DirectionalLight(0xffdbb9,1.05);key.position.set(6,11,9);scene.add(key);
  for(const [x,z] of [[0,13],[0,5],[0,-5],[0,-12],[-17,-11],[17,-11],[-17,9],[17,9]])lamp(x,z);
  for(const [x,z] of [[-21,-16],[-21,16],[21,-16],[21,16],[-11,16],[11,16]])
   planter(x,z);
  for(const [x,z] of [[-9.73,12],[9.73,12]])picture("MEMBERS CLUB",x,z,x<0?Math.PI/2:-Math.PI/2);
  // Doors identify their actual rooms from INSIDE rather than mirrored backwards.
  framedText("MAHJONG SALON","PRIVATE GAME TABLES",-17,4.6,-18.23,5.6,0);
  framedText("TEXAS HOLD’EM","SANA COINS · PLAY FOR FUN",17,4.6,-18.23,5.6,0);
  framedText("BLACKJACK","HIT · STAND · PLAY",-17,4.6,18.22,5.4,Math.PI);
  framedText("SLOT SALON","FREE SPINS · FUN POINTS",17,4.6,18.22,5.4,Math.PI);
  // Entrance welcome plaque faces the incoming player (negative Z).
  // At this end of the main hall the go-kart portal replaces the old welcome
  // sign. Both cannot occupy the same solid wall.
  framedText("GO-KART PORTAL","ENTER VELVET CIRCUIT · PRESS E",0,4.88,18.13,5.4,Math.PI);
 }
 roomShell();
 goKartPortal();stage();bar();board();
 lounge(-5.15,6,"west");lounge(5.15,6,"east");
 for(const st of STATIONS.filter(st=>["mahjong","poker","blackjack"].includes(st.id)))table(st);
 slots();
 // Extra tables beside the main entrance create warm, occupied sightlines.
 for(const x of [-8.7,8.7]){
  column(.35,.65,walnut,x,.34,14.3);
  ball(.19,cream,x,.72,14.3);
 }
 return {obstacles,seats,stations:STATIONS,animated,palette:C};
}
