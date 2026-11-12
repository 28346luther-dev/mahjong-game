import {GLTFLoader} from './vendor/loaders/GLTFLoader.js';
import {DRACOLoader} from './vendor/loaders/DRACOLoader.js';
let detailedTemplate=null;
export async function prepareGTCar(){
 if(detailedTemplate)return;
 const draco=new DRACOLoader();draco.setDecoderPath('/vendor/draco/');draco.setWorkerLimit(2);
 const loader=new GLTFLoader();loader.setDRACOLoader(draco);
 try{const gltf=await loader.loadAsync('/assets/gt-coupe.glb');detailedTemplate=gltf.scene;}finally{draco.dispose();}
}
function detailedCar(THREE,color){
 const group=detailedTemplate.clone(true),hiddenInCockpit=[],wheels=[];
 group.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
  if(o.name==='body')o.material=new THREE.MeshPhysicalMaterial({color,metalness:.65,roughness:.26,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:.7});
  else if(o.name==='glass')o.material=new THREE.MeshPhysicalMaterial({color:0x293c43,metalness:.1,roughness:.08,transparent:true,opacity:.57,envMapIntensity:1});
  if(['body','glass'].includes(o.name))hiddenInCockpit.push(o);
 });
 for(const name of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr']){const wheel=group.getObjectByName(name);if(wheel)wheels.push({group:wheel,front:name.includes('_f')});}
 const roof=new THREE.Mesh(new THREE.SphereGeometry(1,40,20,0,Math.PI*2,0,Math.PI/2),new THREE.MeshPhysicalMaterial({color,metalness:.65,roughness:.28,clearcoat:1,envMapIntensity:.7}));
 roof.scale.set(.68,.14,.68);roof.position.set(0,1.14,.02);roof.castShadow=true;group.add(roof);hiddenInCockpit.push(roof);
 const carbon=new THREE.MeshStandardMaterial({color:0x11151a,metalness:.35,roughness:.58});
 const add=(w,h,d,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),carbon);m.position.set(x,y,z);m.castShadow=true;group.add(m);return m;};
 const wing=add(1.99,.065,.42,0,1.24,1.89);wing.rotation.x=-.06;
 for(const side of [-1,1]){add(.045,.27,.46,side*.99,1.29,1.89);add(.065,.55,.11,side*.67,.98,1.86);add(.08,.1,2.7,side*.96,.22,.1);}
 add(1.96,.045,.36,0,.18,-2.05);
 for(let i=-3;i<=3;i++)add(.025,.14,.52,i*.24,.22,2.04);
 return {group,hiddenInCockpit,wheels,animate(speed,steer,dt){for(const w of wheels){w.group.rotation.x+=speed*dt/.34;if(w.front)w.group.rotation.y=steer;}}};
}
/* Original GT3-style endurance coupe. Metres; -Z forward. No licensed marque. */
export function createGTCar(THREE,{color=0xff4c0a,number=7}={}){
 if(detailedTemplate)return detailedCar(THREE,color);
 const group=new THREE.Group(),hiddenInCockpit=[],wheels=[];
 const paint=new THREE.MeshPhysicalMaterial({color,metalness:.5,roughness:.25,clearcoat:1,clearcoatRoughness:.13});
 const carbon=new THREE.MeshStandardMaterial({color:0x14191d,roughness:.65,metalness:.3});
 const glass=new THREE.MeshPhysicalMaterial({color:0x6a8997,metalness:.35,roughness:.08,transparent:true,opacity:.38,side:THREE.DoubleSide});
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
 const body=loft([[-2.37,.74,.27,.43,.58],[-2.25,.96,.26,.57,.72],[-1.85,1,.29,.68,.85],[-1.3,1.02,.3,.73,.89],[-.75,.94,.3,.71,.87],[0,.93,.3,.73,.87],[.85,.98,.31,.77,.89],[1.4,1.04,.3,.78,.88],[2.05,1.01,.32,.72,.81],[2.27,.86,.38,.65,.7]],paint);
 const canopy=loft([[-.85,.71,.79,.87,.91],[-.38,.72,.86,1.12,1.38],[.12,.71,.88,1.17,1.48],[.65,.68,.89,1.15,1.45],[1.22,.63,.88,1.02,1.13]],glass);
 hiddenInCockpit.push(canopy);
 const roof=loft([[-.31,.65,1.34,1.37,1.42],[.12,.67,1.4,1.43,1.5],[.65,.63,1.36,1.4,1.47]],paint);hiddenInCockpit.push(roof);
 // Splitter, diffuser fins, swan-neck wing, vents and side skirts.
 box(2.13,.055,.58,carbon,0,.22,-2.17);box(1.82,.12,.55,carbon,0,.3,2.1);
 for(let i=-3;i<=3;i++)box(.025,.22,.65,carbon,i*.24,.29,2.06);
 const wing=box(2.12,.07,.43,carbon,0,1.52,1.96);wing.rotation.x=-.08;
 for(const s of [-1,1]){
  box(.045,.3,.52,carbon,s*1.07,1.54,1.96);const support=box(.06,.65,.09,alloy,s*.68,1.23,1.85);support.rotation.x=-.24;
  box(.12,.14,3.2,carbon,s*1.01,.25,0);
  box(.21,.14,.35,paint,s*.98,1.1,-.53);box(.2,.04,.09,carbon,s*.86,1.07,-.52);
  const light=box(.52,.07,.07,led,s*.66,.63,-2.265);light.rotation.z=s*.1;
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
   box(.09,.21,.11,paint,s*.1,.07,-.17,wheelGroup);wheels.push({group:wheelGroup,front:axle<0,side:s});
  }
  const intake=box(.15,.23,.47,carbon,s*.94,.57,.82);intake.rotation.y=s*.12;
 }
 box(1.45,.20,.05,carbon,0,.44,-2.34);
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
 return {group,hiddenInCockpit,hood:body,wheels,animate(speed,steer,dt){for(const w of wheels){w.group.rotation.x+=speed*dt/.36;if(w.front)w.group.rotation.y=steer;}}};
}
