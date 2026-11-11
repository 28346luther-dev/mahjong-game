/* Trackside pit architecture inspired by modern circuits: not an exact copy of
 * any real venue. Long glazed hospitality level, garage roll-up doors, bays,
 * raised pit-wall fencing, lane markings and safe outboard signs. */
export function addPitComplex(THREE,scene,PIT,bays){
 const mat=(color,roughness=.65,metalness=0,transparent=false,opacity=1)=>
  new THREE.MeshStandardMaterial({color,roughness,metalness,transparent,opacity,side:THREE.DoubleSide});
 const concrete=mat(0xc9c9c6,.85),white=mat(0xe6e7e7,.57),
  steel=mat(0x66717b,.32,.72),window=mat(0x204151,.22,.65,true,.77),
  glass=mat(0x76939d,.2,.54,true,.48),red=mat(0xc03944,.52),asphalt=mat(0x444c50,.92),
  yellow=mat(0xeacf63,.55),stripe=mat(0xf7f0da,.55);
 function item(g,m,x,y,z,parent=scene){
  const object=new THREE.Mesh(g,m);object.position.set(x,y,z);
  object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
 }
 function block(w,h,d,m,x,y,z,parent=scene){return item(new THREE.BoxGeometry(w,h,d),m,x,y,z,parent);}
 // Continuous two-storey facility set BACK from the pit boxes, parallel to pit road.
 // The pit lane is the asphalt in front, with no barriers across its entrance.
 const centreX=-24,frontZ=-6;
 block(97,3.3,8,concrete,centreX,1.85,frontZ+4.3);
 block(100,.45,9.1,white,centreX,3.7,frontZ+4.3);
 block(98,3.65,7.3,window,centreX,5.87,frontZ+4.1);
 block(101,.55,9.4,steel,centreX,7.99,frontZ+4.3);
 block(99,.25,3.5,concrete,centreX,3.86,frontZ-1);
 // Glass balustrade and slim metal railing on the hospitality terrace.
 for(let x=centreX-48;x<=centreX+48;x+=3.5){
  block(.11,1.35,.1,steel,x,4.63,frontZ-2.6);
  block(.10,3.4,7.1,steel,x,5.85,frontZ+4.1);
  block(.1,.18,1.3,steel,x,7.63,frontZ-2.85);
 }
 block(97,.09,.12,steel,centreX,5.32,frontZ-2.85);
 for(let x=centreX-47;x<=centreX+47;x+=6.2){
  block(6.0,1.28,.035,glass,x,4.68,frontZ-2.8);
 }
 // Slanted continuous curtain glass facade between dark mullions.
 const tilted=new THREE.Group();tilted.position.set(centreX,5.9,frontZ-2.7);
 tilted.rotation.x=-.16;scene.add(tilted);
 block(96,2.75,.1,glass,0,0,0,tilted);
 for(let x=-46;x<=46;x+=4.2)block(.10,2.9,.22,steel,x,0,0,tilted);
 block(96,.1,.22,steel,0,-1.38,0,tilted);block(96,.1,.22,steel,0,1.38,0,tilted);
 // Eight roll-up doors and bay numbers, inspired by the provided pit-building photo.
 for(let i=0;i<8;i++){
  const x=centreX-42+i*12;
  block(10.5,2.75,.15,steel,x,1.55,frontZ-.12);
  for(let l=0;l<10;l++)block(9.7,.027,.045,l%3===0?white:concrete,x,.36+l*.25,frontZ-.23);
  block(3,.65,.055,red,x,3.1,frontZ-.20);
  const canopy=block(11.3,.14,1.7,steel,x,3.43,frontZ-1.25);
  canopy.rotation.x=-.09;
  // Reflective yellow bay guides and garage stops.
  for(const side of [-5.4,5.4])block(.13,.026,4,yellow,x+side,.055,frontZ-4.1);
 }
 // Kerb-separated pit lane with solid red safety boundary, blue timing line,
 // and each pit box outlined on the tarmac. No sign blocks the driving path.
 for(let i=1;i<PIT.samples.length-1;i+=2){
  const p=PIT.samples[i],next=PIT.samples[Math.min(PIT.samples.length-1,i+1)];
  const yaw=Math.atan2(next.x-p.x,next.z-p.z);
  const redEdge=block(.13,.019,1.7,red,p.x,p.y+.08,p.z-2.25);
  redEdge.rotation.y=yaw;
  if(i%6===1){
   const mark=block(.10,.017,1.15,stripe,p.x,p.y+.08,p.z+1.65);
   mark.rotation.y=yaw;
  }
 }
 for(const bay of bays){
  const {x,z,y,index}=bay,signX=x,signZ=z+2.8;
  const floor=block(5.2,.018,3.5,mat(index%2?0x535857:0x5d5f5a,.93),x,y+.075,z);
  for(const dx of [-2.6,2.6])block(.1,.025,3.45,yellow,x+dx,y+.094,z);
  block(5.1,.025,.1,yellow,x,y+.094,z+1.72);
  block(.85,.05,1.45,red,x,y+.101,z-1.15);
  const tire= item(new THREE.TorusGeometry(.28,.11,8,16),mat(0x23282c,.95),x+1.7,y+.25,z+1.06);
  tire.rotation.x=Math.PI/2;
  // Bay number on an outboard upright, nowhere near driving centerline.
  const pole=block(.1,2.8,.1,steel,signX+2.75,y+1.45,signZ);
  const label=block(1.7,.8,.13,red,signX+2.75,y+2.65,signZ);
 }
 function roadsideSign(sample,label,side=1){
  const p=sample,signZ=p.z+side*5.6;
  // Billboard is OUTSIDE the kerb/gravel and lateral to the pit driving lane.
  const pole=block(.13,2.75,.13,steel,p.x,p.y+1.4,signZ);
  const panel=block(4.25,1.15,.18,steel,p.x,p.y+2.93,signZ);
  const canvas=document.createElement("canvas");canvas.width=640;canvas.height=180;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#20363f";ctx.fillRect(0,0,640,180);
  ctx.fillStyle="#f6dba5";ctx.font="bold 75px system-ui";ctx.textAlign="center";
  ctx.fillText(label,320,120);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  item(new THREE.PlaneGeometry(4.1,1.12),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}),
   p.x,p.y+2.93,signZ-.115);
 }
 roadsideSign(PIT.samples[4],"PIT ENTRY 40",1);
 roadsideSign(PIT.samples[PIT.samples.length-7],"PIT EXIT",1);
 // Pit separating wall and protective catch fence between main racing straight
 // and pit lane, with a clean opening at each end.
 const fence=mat(0x89949b,.36,.73,true,.55);
 for(let i=10;i<PIT.samples.length-10;i+=4){
  const p=PIT.samples[i],next=PIT.samples[Math.min(i+1,PIT.samples.length-1)];
  const yaw=Math.atan2(next.x-p.x,next.z-p.z);
  const base=block(.19,.72,2.65,white,p.x,p.y+.36,p.z-3.7);
  base.rotation.y=yaw;
  const post=block(.10,2.1,.1,steel,p.x,p.y+1.55,p.z-3.7);
  const mesh=block(.06,1.3,2.6,fence,p.x,p.y+1.52,p.z-3.7);
  mesh.rotation.y=yaw;
 }
 return {pitBuilding:true,bays:bays.length};
}
