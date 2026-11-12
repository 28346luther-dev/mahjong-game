/* Original GT endurance racing coupe for Road Atlanta-inspired sessions.
 * Smooth closed body, flared wheel arches, diffuser, roll cage and rear wing.
 * Local -Z is forward, +Z rear; no licensed car or team design.
 */
export function createGTCar(THREE,{color=0xb82846,number=7}={}){
 const group=new THREE.Group(),hiddenInCockpit=[];
 const paint=new THREE.MeshPhysicalMaterial({color,metalness:.24,roughness:.21,
  clearcoat:1,clearcoatRoughness:.09});
 const glass=new THREE.MeshPhysicalMaterial({color:0x1a313c,metalness:.42,roughness:.12,
  transparent:true,opacity:.88,side:THREE.DoubleSide});
 const rubber=new THREE.MeshStandardMaterial({color:0x15171a,roughness:.98});
 const carbon=new THREE.MeshStandardMaterial({color:0x22262c,metalness:.2,roughness:.62});
 const metal=new THREE.MeshStandardMaterial({color:0x9babb4,metalness:.88,roughness:.29});
 const lights=new THREE.MeshStandardMaterial({color:0xf2f8ed,emissive:0xd1ddcb,emissiveIntensity:.65});
 const redlight=new THREE.MeshStandardMaterial({color:0xc6263b,emissive:0x9c1d2a,emissiveIntensity:.55});
 const mk=(geo,mat,x=0,y=0,z=0,parent=group)=>{
  const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);
  m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
 };
 const box=(w,h,d,m,x,y,z,parent)=>mk(new THREE.BoxGeometry(w,h,d),m,x,y,z,parent);
 const shell=mk(new THREE.BoxGeometry(1.93,.32,4.25),paint,0,.55,-.10);
 const hood=mk(new THREE.SphereGeometry(1,32,20),paint,0,.74,-1.23);
 hood.scale.set(.92,.22,1.05);
 const front=mk(new THREE.SphereGeometry(1,32,20),paint,0,.60,-1.96);
 front.scale.set(.94,.27,.33);
 const roof=mk(new THREE.SphereGeometry(1,28,20),paint,0,1.37,.29);
 roof.scale.set(.76,.32,1.05);
 const windshield=mk(new THREE.SphereGeometry(1,28,18),glass,0,1.19,-.31);
 windshield.scale.set(.79,.38,.46);
 const rearGlass=mk(new THREE.SphereGeometry(1,28,18),glass,0,1.21,.86);
 rearGlass.scale.set(.71,.27,.40);
 for(const side of [-1,1]){
  const skirt=box(.11,.17,3.2,carbon,side*1.02,.36,-.1);
  const archFront=mk(new THREE.SphereGeometry(1,24,12),paint,side*.87,.57,-1.25);
  archFront.scale.set(.34,.40,.66);
  const archRear=mk(new THREE.SphereGeometry(1,24,12),paint,side*.87,.58,1.25);
  archRear.scale.set(.36,.40,.64);
  for(const z of [-1.35,1.33]){
   const wheel=mk(new THREE.CylinderGeometry(.41,.41,.29,40),rubber,side*1.01,.40,z);
   wheel.rotation.z=Math.PI/2;
   const rim=mk(new THREE.CylinderGeometry(.22,.22,.31,32),metal,side*1.01,.40,z);
   rim.rotation.z=Math.PI/2;
   const hub=mk(new THREE.CylinderGeometry(.08,.08,.325,20),carbon,side*1.01,.40,z);
   hub.rotation.z=Math.PI/2;
  }
  const lamp=mk(new THREE.SphereGeometry(.17,14,12),lights,side*.71,.74,-2.13);
  lamp.scale.set(1,.55,.45);
  const tail=box(.41,.12,.08,redlight,side*.68,.73,2.00);
  // Side windows and door cutlines
  const window=box(.025,.38,1.02,glass,side*.78,1.19,.25);
  hiddenInCockpit.push(window);
 }
 const splitter=box(2.05,.06,.47,carbon,0,.30,-2.12);
 const diffuser=box(1.85,.09,.62,carbon,0,.32,2.02);
 const wing=box(2.15,.12,.51,carbon,0,1.35,1.87);
 for(const side of [-.72,.72])box(.12,.64,.12,metal,side,1.03,1.83);
 // Rear cockpit furniture is excluded only from first-person view.
 const cockpit=box(.78,.8,.54,carbon,0,1.04,.43);
 hiddenInCockpit.push(cockpit);
 const dash=box(1.35,.23,.35,carbon,0,1.00,-.55);
 const windshieldFrame=box(1.7,.08,.08,carbon,0,1.5,-.65);
 hiddenInCockpit.push(windshieldFrame);
 // The roof is hidden in cockpit view; bonnet remains permanently visible.
 hiddenInCockpit.push(roof,rearGlass);
 return {group,hiddenInCockpit,hood};
}
