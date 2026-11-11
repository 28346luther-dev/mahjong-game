/* Formula Vee-inspired club racing single-seater. Original procedural model:
 * exposed narrow open-wheel chassis, thin tapered nose, front wishbones,
 * roll hoop, rear air-cooled engine, side exhaust and instrument cockpit.
 * Uses no Formula One logos or licensed liveries.
 * Local -Z points toward the car's front, +Z toward rear.
 */
export function createFormulaVee(THREE,{color=0x9f2f4b,number=7,driver=true}={}){
 const car=new THREE.Group(),hiddenInCockpit=[];
 const mesh=(geometry,material,x=0,y=0,z=0,parent=car)=>{
  const object=new THREE.Mesh(geometry,material);
  object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;
  parent.add(object);return object;
 };
 const mat=(shade,roughness=.48,metalness=.2)=>new THREE.MeshStandardMaterial({
  color:shade,roughness,metalness,side:THREE.DoubleSide
 });
 const body=new THREE.MeshPhysicalMaterial({color,roughness:.29,metalness:.28,
  clearcoat:1,clearcoatRoughness:.12});
 const cream=mat(0xffe9b7,.41),black=mat(0x1b1e25,.87),carbon=mat(0x282b2f,.59),
  steel=mat(0xa6aeb4,.28,.82),skin=mat(0xd2a482,.77);
 const block=(w,h,d,m,x,y,z,parent)=>mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,parent);
 const tube=(radius,height,m,x,y,z,rotX=0,rotZ=0)=>{
  const object=mesh(new THREE.CylinderGeometry(radius,radius,height,10),m,x,y,z);
  object.rotation.x=rotX;object.rotation.z=rotZ;return object;
 };
 // Slim steel floorpan, raised centre monocoque and tapered classic Vee nose.
 block(1.0,.12,3.34,carbon,0,.43,-.05);
 const tub=mesh(new THREE.BoxGeometry(.88,.44,1.55),body,0,.69,.24);
 tub.scale.set(1,1,1);
 const front=mesh(new THREE.ConeGeometry(.48,2.48,4),body,0,.64,-.94);
 front.rotation.x=-Math.PI/2;
 front.rotation.y=Math.PI/4;
 front.scale.set(.96,.88,1);
 // Smooth upper hood running ahead of the open cockpit, clearly visible from first person.
 const bonnet=mesh(new THREE.SphereGeometry(1,20,12),body,0,.75,-1.05);
 bonnet.scale.set(.43,.19,1.0);
 const tip=mesh(new THREE.SphereGeometry(.24,14,10),body,0,.55,-2.02);
 tip.scale.set(1,.62,1.45);
 block(.82,.035,.85,cream,0,.905,-1.06);
 block(.17,.041,.24,black,0,.932,-1.04);
 // Side pods low and narrow, classic exposed-wheel Formula Vee profile.
 for(const x of [-.55,.55]){
  const side=mesh(new THREE.SphereGeometry(1,16,10),body,x,.52,.32);
  side.scale.set(.22,.16,1.12);
 }
 // Deep open cockpit with padding and race seat.
 const cockpit=mesh(new THREE.CylinderGeometry(.43,.48,.21,18),black,0,.91,.48);
 cockpit.scale.set(1,.25,1.34);
 const seat=mesh(new THREE.SphereGeometry(1,16,12),carbon,0,.89,.82);
 seat.scale.set(.37,.42,.38);
 hiddenInCockpit.push(seat);
 const padding=mesh(new THREE.TorusGeometry(.4,.07,8,20),carbon,0,1.04,.49);
 padding.rotation.x=Math.PI/2;hiddenInCockpit.push(padding);
 // Driver, helmet and shoulder restraints disappear only in cockpit mode.
 if(driver){
  const torso=mesh(new THREE.SphereGeometry(1,16,12),mat(0x353a55,.82),0,1.14,.73);
  torso.scale.set(.42,.48,.32);hiddenInCockpit.push(torso);
  const helmet=mesh(new THREE.SphereGeometry(.3,20,14),cream,0,1.56,.54);
  hiddenInCockpit.push(helmet);
  const visor=mesh(new THREE.SphereGeometry(1,16,8),mat(0x1c2d3b,.12,.5),0,1.57,.32);
  visor.scale.set(.28,.13,.14);hiddenInCockpit.push(visor);
 }
 // Open-wheel axles, hubs and visible slender front & rear suspension wishbones.
 const tire=new THREE.MeshStandardMaterial({color:0x19191c,roughness:1});
 const sidewall=new THREE.MeshStandardMaterial({color:0x303034,roughness:.88});
 for(const x of [-.86,.86]){
  for(const z of [-1.34,1.27]){
   const tyre=mesh(new THREE.CylinderGeometry(.36,.36,.28,22),tire,x,.38,z);
   tyre.rotation.z=Math.PI/2;
   const wheel=mesh(new THREE.CylinderGeometry(.19,.19,.295,20),steel,x,.38,z);
   wheel.rotation.z=Math.PI/2;
   const centre=mesh(new THREE.CylinderGeometry(.10,.10,.305,14),carbon,x,.38,z);
   centre.rotation.z=Math.PI/2;
   for(const dz of [-.27,.25]){
    // diagonally arranged long thin wishbones reaching into wheel hubs
    const xa=x*.62,za=z+(z<0?.40:-.34);
    const start=new THREE.Vector3(xa,.52,za);
    const end=new THREE.Vector3(x,.39,z+dz);
    const dir=end.clone().sub(start),rod=mesh(
     new THREE.CylinderGeometry(.026,.026,dir.length(),8),steel,
     (start.x+end.x)/2,(start.y+end.y)/2,(start.z+end.z)/2);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
   }
  }
 }
 block(1.93,.055,.11,steel,0,.45,-1.34);
 block(1.87,.06,.11,steel,0,.44,1.28);
 // Mechanical engine behind the driver with exposed cylinder heads and exhaust.
 block(.81,.52,.73,carbon,0,.73,1.35);
 for(const x of [-.27,-.1,.1,.27])block(.11,.13,.58,steel,x,1.04,1.35);
 const pipe=tube(.055,1.35,steel,-.51,.61,1.27,Math.PI/2);
 const muffler=mesh(new THREE.CylinderGeometry(.12,.13,.54,12),steel,-.54,.54,1.72);
 muffler.rotation.x=Math.PI/2;
 // Traditional roll hoop, stronger than decorative rear seat headrest.
 const hoop=mesh(new THREE.TorusGeometry(.41,.046,8,22,Math.PI),steel,0,1.29,1.01);
 hoop.rotation.z=0;
 tube(.042,.46,steel,-.41,1.23,1.02);
 tube(.042,.46,steel,.41,1.23,1.02);
 // Original club racing number disc on the nose.
 const circle=mesh(new THREE.CylinderGeometry(.235,.235,.025,26),cream,0,.938,-1.22);
 circle.rotation.x=Math.PI/2;
 // Simple panel gauge and visible steering wheel remain in first person.
 const dash=block(.73,.2,.19,carbon,0,.96,-.08);
 const wheel=mesh(new THREE.TorusGeometry(.22,.036,8,22),black,0,1.04,-.17);
 wheel.rotation.x=.31;
 for(const x of [-.32,.32])block(.07,.06,.17,steel,x,.93,-.11);
 const shadow=mesh(new THREE.CircleGeometry(1.08,30),new THREE.MeshBasicMaterial({
  color:0x14141a,transparent:true,opacity:.2,depthWrite:false}),0,.025,0);
 shadow.rotation.x=-Math.PI/2;
 return {group:car,hiddenInCockpit,hood:bonnet};
}
