import {getGTCar} from './kart-cars.js';
import {GLTFLoader} from './vendor/loaders/GLTFLoader.js';
import {DRACOLoader} from './vendor/loaders/DRACOLoader.js';
let detailedTemplate=null,preparing=null;
const sharedResources=new Set();
export function prepareGTCar(){
 if(!preparing)preparing=(async()=>{
  const draco=new DRACOLoader();draco.setDecoderPath('/vendor/draco/');draco.setWorkerLimit(2);
  const loader=new GLTFLoader();loader.setDRACOLoader(draco);
  try{
   const gltf=await loader.loadAsync('/assets/gt-coupe.glb');detailedTemplate=gltf.scene;
   detailedTemplate.traverse(o=>{if(!o.isMesh)return;sharedResources.add(o.geometry);for(const mat of Array.isArray(o.material)?o.material:[o.material]){sharedResources.add(mat);for(const value of Object.values(mat))if(value?.isTexture)sharedResources.add(value);}});
  }catch{ /* Local procedural coupes remain available if the detailed asset fails. */ }
  finally{draco.dispose();}
 })();
 return preparing;
}
export function disposeGTCar(car){
 if(!car?.group)return;
 const owned=new Set();
 car.group.traverse(o=>{
  if(!o.isMesh)return;owned.add(o.geometry);
  for(const mat of Array.isArray(o.material)?o.material:[o.material]){owned.add(mat);for(const value of Object.values(mat))if(value?.isTexture)owned.add(value);}
 });
 for(const resource of owned)if(!sharedResources.has(resource))resource.dispose();
}
function detailedCar(THREE,color){
 const group=new THREE.Group(),exterior=detailedTemplate.clone(true),hiddenInCockpit=[],wheels=[];
 group.add(exterior);
 const carbon=new THREE.MeshStandardMaterial({color:0x11151a,metalness:.35,roughness:.58});
 // The asset is already Y-up / -Z-forward. Preserve its authored transforms.
 group.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
  if(o.name==='body')o.material=new THREE.MeshPhysicalMaterial({color,metalness:.65,roughness:.26,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:.7});
  else if(o.name==='glass')o.material=new THREE.MeshPhysicalMaterial({color:0x293c43,metalness:.1,roughness:.08,transparent:true,opacity:.57,envMapIntensity:1});
  if(/glass|interior|leather|carpet|wipers/i.test(o.name))hiddenInCockpit.push(o);
 });
 for(const name of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr']){
  const wheel=exterior.getObjectByName(name);if(!wheel)continue;
  // Steer about vehicle Y, spin about axle X, then apply the authored basis.
  const pivot=new THREE.Group();pivot.position.copy(wheel.position);
  wheel.parent.add(pivot);wheel.position.set(0,0,0);pivot.add(wheel);
  // Measure the loaded tyre in its authored orientation; do not assume a
  // radius from the suspension's unrelated chassis dimensions.
  group.updateMatrixWorld(true);
  let tyre=null;wheel.traverse(o=>{if(!tyre&&/^tire(?:_|$)/.test(o.name))tyre=o;});
  tyre ||= wheel;
  const inverse=group.matrixWorld.clone().invert(),bounds=new THREE.Box3(),point=new THREE.Vector3();
  tyre.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position;
   const transform=inverse.clone().multiply(mesh.matrixWorld);
   for(let i=0;i<positions.count;i++)bounds.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(transform));
  });
  const radius=(bounds.max.y-bounds.min.y)/2;
  wheels.push({group:pivot,mesh:wheel,basis:wheel.quaternion.clone(),front:name.includes('_f'),spin:0,restY:pivot.position.y,radius,tyre});
 }

 const add=(w,h,d,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),carbon);m.position.set(x,y,z);m.castShadow=true;exterior.add(m);return m;};
 // The source road car is a spider. Fit a continuous hardtop, side glazing,
 // rear screen and structural pillars so the race car has a closed silhouette.
 const roofPaint=new THREE.MeshPhysicalMaterial({color,metalness:.65,roughness:.26,clearcoat:1,side:THREE.DoubleSide});
 const windowMat=new THREE.MeshPhysicalMaterial({color:0x152b38,metalness:.25,roughness:.16,transparent:true,opacity:.88,side:THREE.DoubleSide});
 const panel=(name,points,mat)=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,mat);mesh.name=name;mesh.castShadow=true;group.add(mesh);hiddenInCockpit.push(mesh);return mesh;
 };
 const sections=[[-.67,.64,1.24],[-.28,.69,1.32],[.28,.69,1.34],[.69,.61,1.28],[.99,.51,1.08]],vertices=[],indices=[];
 for(const [z,w,y] of sections)for(const [fraction,rise] of [[-1,-.035],[-.7,.025],[0,.05],[.7,.025],[1,-.035]])vertices.push(w*fraction,y+rise,z);
 for(let i=0;i<sections.length-1;i++)for(let j=0;j<4;j++){const a=i*5+j,b=a+5;indices.push(a,b,a+1,a+1,b,b+1);}
 const roofGeometry=new THREE.BufferGeometry();roofGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));roofGeometry.setIndex(indices);roofGeometry.computeVertexNormals();
 const roof=new THREE.Mesh(roofGeometry,roofPaint);roof.name='gt3-hardtop';roof.castShadow=true;group.add(roof);hiddenInCockpit.push(roof);
 for(const side of [-1,1]){
  panel('side-window',[[side*.65,1.21,-.64],[side*.63,1.25,.66],[side*.79,.86,.86],[side*.82,.86,-.99]],windowMat);
  panel('rear-pillar',[[side*.63,1.25,.57],[side*.50,1.05,1.02],[side*.82,.85,1.08],[side*.79,.86,.72]],roofPaint);
  const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.028,.028,1,8),roofPaint);
  const start=new THREE.Vector3(side*.82,.86,-.99),end=new THREE.Vector3(side*.64,1.23,-.65),direction=end.clone().sub(start);
  pillar.position.copy(start).add(end).multiplyScalar(.5);pillar.scale.y=direction.length();pillar.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());pillar.name='front-pillar';group.add(pillar);hiddenInCockpit.push(pillar);
 }
 panel('rear-window',[[-.59,1.25,.70],[.59,1.25,.70],[.49,1.04,1.02],[-.49,1.04,1.02]],windowMat);
 const wing=add(1.99,.065,.42,0,1.24,1.89);wing.rotation.x=-.06;
 for(const side of [-1,1]){add(.045,.27,.46,side*.99,1.29,1.89);add(.065,.55,.11,side*.67,.98,1.86);add(.08,.1,2.7,side*.96,.22,.1);}
 add(1.96,.045,.36,0,.18,-2.05);
 for(let i=-3;i<=3;i++)add(.025,.14,.52,i*.24,.22,2.04);
 const spinAxis=new THREE.Vector3(1,0,0),spinRotation=new THREE.Quaternion();
 return {group,hiddenInCockpit,wheels,animate(speed,steer,dt){
  for(const w of wheels){w.spin=(w.spin-speed*dt/w.radius)%(Math.PI*2);
   w.group.rotation.y=w.front?steer:0;
   w.mesh.quaternion.copy(spinRotation.setFromAxisAngle(spinAxis,w.spin)).multiply(w.basis);
  }
 }};
}
/* Original GT3-style endurance coupe. Metres; -Z forward. No licensed marque. */
export function createGTCar(THREE,{carId='apex',color,number=7}={}){
 const design=getGTCar(carId);color??=design.color;
 if(detailedTemplate&&design.id==='apex'){const car=detailedCar(THREE,color);car.carId=design.id;car.group.userData.carId=design.id;return car;}
 const group=new THREE.Group(),hiddenInCockpit=[],wheels=[];
 const paint=new THREE.MeshPhysicalMaterial({color,metalness:.5,roughness:.25,clearcoat:1,clearcoatRoughness:.13});
 const carbon=new THREE.MeshStandardMaterial({color:0x14191d,roughness:.65,metalness:.3});
 const rubber=new THREE.MeshStandardMaterial({color:0x151516,roughness:.93});
 const alloy=new THREE.MeshStandardMaterial({color:0x9a9a93,metalness:.9,roughness:.27});
 const led=new THREE.MeshStandardMaterial({color:0xebf5ff,emissive:0xcce8ff,emissiveIntensity:2});
 const tail=new THREE.MeshStandardMaterial({color:0xdd1026,emissive:0xff1020,emissiveIntensity:1.5});
 function mesh(geo,mat,x=0,y=0,z=0,parent=group){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 const box=(w,h,d,mat,x,y,z,parent)=>mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z,parent);
 // Smooth longitudinal loft: each cross section has distinct sill, shoulder,
 // bonnet and centre heights. Wheel arches are separate curved quarter panels.
 function loft(sections,mat){
  const vertices=[],indices=[],steps=32;
  for(const [z,w,bottom,shoulder,top] of sections)for(let j=0;j<=steps;j++){
   const a=j/steps*Math.PI*2,x=Math.cos(a)*w;
   const y=Math.sin(a)>=0?shoulder+(top-shoulder)*Math.pow(Math.sin(a),.55):shoulder+(shoulder-bottom)*Math.sin(a);
   vertices.push(x,y,z);
  }
  for(let i=0;i<sections.length-1;i++)for(let j=0;j<steps;j++){const a=i*(steps+1)+j,b=a+steps+1;indices.push(a,a+1,b,a+1,b+1,b);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,mat);
 }
 const bodySections=[[-2.37,.74,.27,.43,.58],[-2.25,.96,.26,.57,.72],[-1.85,1,.29,.68,.85],[-1.3,1.02,.3,.73,.89],[-.75,.94,.3,.71,.87],[0,.93,.3,.73,.87],[.85,.98,.31,.77,.89],[1.4,1.04,.3,.78,.88],[2.05,1.01,.32,.72,.81],[2.27,.86,.38,.65,.7]];
 if(design.id==='falcon')for(const section of bodySections){if(section[0]<-.7){section[3]+=.04;section[4]+=.08;}if(section[0]>1.3)section[4]-=.05;}
 if(design.id==='nova')for(const section of bodySections){if(section[0]<-1.3){section[1]*=.92;section[3]-=.05;section[4]-=.06;}if(section[0]>.8)section[4]+=.07;}
 const body=loft(bodySections,paint);
 const cabinShift=design.id==='falcon'?.22:design.id==='nova'?-.13:0;
 // A solid, closed cabin shell with inset dark glazing. The old transparent
 // loft left a floating roof and exposed the cockpit through its open ends.
 const cabinSections=[[-.98,.75,.88,.90,.70],[-.42,.77,.89,1.42,.58],[.65,.77,.90,1.44,.56],[1.20,.70,.91,.96,.66]];
 const cabinVertices=[],cabinIndices=[];
 for(const [z,w,base,top,rw] of cabinSections)cabinVertices.push(-w,base,z+cabinShift,w,base,z+cabinShift,rw,top,z+cabinShift,-rw,top,z+cabinShift);
 for(let i=0;i<3;i++)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4;cabinIndices.push(a,b,a+4,b,b+4,a+4);}
 cabinIndices.push(0,3,2,0,2,1,12,13,14,12,14,15);
 const cabinGeometry=new THREE.BufferGeometry();cabinGeometry.setAttribute('position',new THREE.Float32BufferAttribute(cabinVertices,3));cabinGeometry.setIndex(cabinIndices);cabinGeometry.computeVertexNormals();
 const roof=mesh(cabinGeometry,paint);roof.name='gt3-hardtop';hiddenInCockpit.push(roof);
 const windowMat=new THREE.MeshPhysicalMaterial({color:0x142938,metalness:.45,roughness:.14,side:THREE.DoubleSide});
 const windowPanel=(name,points)=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(([x,y,z])=>[x,y,z+cabinShift]),3));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();
  const pane=mesh(geometry,windowMat);pane.name=name;hiddenInCockpit.push(pane);
 };
 windowPanel('windshield',[[-.65,.978,-.91],[.65,.978,-.91],[.54,1.374,-.49],[-.54,1.374,-.49]]);
 for(const side of [-1,1])windowPanel('side-window',[[side*.595,1.38,-.39],[side*.58,1.40,.59],[side*.756,.98,.94],[side*.76,.97,-.82]]);
 windowPanel('rear-window',[[-.53,1.416,.69],[.53,1.416,.69],[.64,1.03,1.13],[-.64,1.03,1.13]]);
 // Splitter, diffuser fins, swan-neck wing, vents and side skirts.
 box(2.13,.055,.58,carbon,0,.22,-2.17);box(1.82,.12,.55,carbon,0,.3,2.1);
 for(let i=-3;i<=3;i++)box(.025,.22,.65,carbon,i*.24,.29,2.06);
 const wing=box(2.12,.07,.43,carbon,0,1.52,1.96);wing.rotation.x=-.08;
 for(const s of [-1,1]){
  box(.045,.3,.52,carbon,s*1.07,1.54,1.96);const support=box(.06,.65,.09,alloy,s*.68,1.23,1.85);support.rotation.x=-.24;
  box(.12,.14,3.2,carbon,s*1.01,.25,0);
  box(.21,.14,.35,paint,s*.98,1.1,-.53);box(.2,.04,.09,carbon,s*.86,1.07,-.52);
  if(design.id==='nova'){
   const light=mesh(new THREE.CylinderGeometry(.145,.145,.06,32),led,s*.65,.64,-2.18);light.rotation.x=Math.PI/2;
  }else{
   const light=box(design.id==='falcon'?.57:.52,.07,.07,led,s*.66,design.id==='falcon'?.70:.63,-2.265);light.rotation.z=s*.1;
  }
  box(.65,.045,.05,tail,s*.57,.7,2.24);
  for(let j=0;j<5;j++)box(.3,.015,.045,carbon,s*.76,.895,-1.45+j*.08);
  // Open wheel apertures with thin curved arches, rather than covered tyres.
  for(const axle of [-1.34,1.34]){
   const arch=mesh(new THREE.TorusGeometry(.47,.055,8,32,Math.PI),paint,s*1.01,.42,axle);arch.rotation.y=Math.PI/2;
   const wheelGroup=new THREE.Group();wheelGroup.position.set(s*1.025,.39,axle);group.add(wheelGroup);
   const tyre=mesh(new THREE.CylinderGeometry(.36,.36,.29,48),rubber,0,0,0,wheelGroup);tyre.rotation.z=Math.PI/2;
   const rim=mesh(new THREE.CylinderGeometry(.265,.265,.30,40),carbon,0,0,0,wheelGroup);rim.rotation.z=Math.PI/2;
   for(let j=0;j<10;j++){const angle=j*Math.PI/5;const spoke=box(.025,.035,.48,alloy,s*.16,0,0,wheelGroup);spoke.rotation.x=angle;}
   const hub=mesh(new THREE.CylinderGeometry(.065,.065,.34,16),alloy,0,0,0,wheelGroup);hub.rotation.z=Math.PI/2;
   box(.09,.21,.11,paint,s*.1,.07,-.17,wheelGroup);const pivot=new THREE.Group();pivot.position.copy(wheelGroup.position);group.add(pivot);wheelGroup.position.set(0,0,0);pivot.add(wheelGroup);wheels.push({group:pivot,mesh:wheelGroup,front:axle<0,side:s,radius:.36,restY:pivot.position.y,tyre});
  }
  const intake=box(.15,.23,.47,carbon,s*.94,.57,.82);intake.rotation.y=s*.12;
 }
 box(design.id==='falcon'?1.65:1.45,design.id==='falcon'?.29:.20,.05,carbon,0,.44,-2.34);
 if(design.id==='falcon')for(const x of [-.6,-.3,0,.3,.6])box(.025,.25,.06,alloy,x,.44,-2.38);
 // Cockpit: roll cage, bucket seat, dash, steering wheel and digital display.
 const seat=box(.5,.67,.45,carbon,-.34,.84,.4);hiddenInCockpit.push(seat);
 const dash=box(1.36,.2,.36,carbon,0,.98,-.51);
 const steering=mesh(new THREE.TorusGeometry(.17,.024,10,28),carbon,-.34,1.03,-.3);steering.rotation.x=.28;
 box(.22,.12,.025,carbon,-.34,1.12,-.5);
 for(const side of [-1,1]){const pillar=box(.055,.76,.055,alloy,side*.71,1.05,-.4);pillar.rotation.x=-.55;hiddenInCockpit.push(pillar);}
 // Original race livery and number plates generated at runtime, no hotlinks.
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#e9e7de';ctx.fillRect(0,0,512,256);ctx.fillStyle='#17232a';ctx.font='bold 170px sans-serif';ctx.textAlign='center';ctx.fillText(String(number).padStart(2,'0'),256,195);
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
 for(const side of [-1,1]){const plate=mesh(new THREE.PlaneGeometry(.8,.4),new THREE.MeshStandardMaterial({map:tex,roughness:.5}),side*.949,.65,0);plate.rotation.y=side*Math.PI/2;}
 box(.12,.014,1.15,carbon,-.19,.902,-1.34);box(.12,.014,1.15,carbon,.19,.902,-1.34);
 group.userData.carId=design.id;
 return {carId:design.id,group,hiddenInCockpit,hood:body,wheels,animate(speed,steer,dt){for(const w of wheels){w.mesh.rotation.x-=speed*dt/.36;if(w.front)w.group.rotation.y=steer;}}};
}
