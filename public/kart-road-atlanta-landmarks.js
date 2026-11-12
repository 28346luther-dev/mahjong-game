/* Road Atlanta landmark pass. Positions follow the reconstructed circuit, not surveyed coordinates.
 * Turn 11's pedestrian bridge spans the road at the crest before the downhill T12.
 * Native procedural geometry avoids fragile external image/model dependencies. */
export function addRoadAtlantaLandmarks(THREE,scene,road,halfWidth){
 const samples=road.samples;
 const mat=(color,metalness=0,roughness=.85)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
 const concrete=mat(0xa7aaa6),steel=mat(0x6e7475,.72,.38),
  rail=mat(0xd3d5d0,.48,.48),clay=mat(0x8c5035),dark=mat(0x252e32);
 function block(w,h,d,m,x,y,z,parent=scene){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
  mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
 }
 // Bridge at the final crest, approaching Turn 12 after the 10A/10B complex.
 const i=Math.round(samples.length*.91)%samples.length;
 const p=samples[i],a=samples[(i-3+samples.length)%samples.length],
  b=samples[(i+3)%samples.length];
 const yaw=Math.atan2(b.x-a.x,b.z-a.z);
 const bridge=new THREE.Group();
 bridge.position.set(p.x,p.y,p.z);bridge.rotation.y=yaw;scene.add(bridge);
 const span=halfWidth*2+16,deckY=7.1;
 block(span,.6,4.7,concrete,0,deckY,0,bridge);
 for(const side of [-1,1]){
  const x=side*(halfWidth+6.2);
  block(1.15,deckY,2.8,concrete,x,deckY/2,0,bridge);
  block(span/2,.12,.14,rail,side*span/4,deckY+1.6,-2.12,bridge);
  block(span/2,.12,.14,rail,side*span/4,deckY+1.6,2.12,bridge);
 }
 for(let j=0;j<9;j++){
  const x=-span/2+j*span/8;
  for(const z of [-2.1,2.1])block(.12,1.25,.12,steel,x,deckY+1.02,z,bridge);
 }
 // Realistic red-clay cuttings beside the undulating track, not across the tarmac.
 for(const fraction of [.16,.22,.31,.38,.72,.82]){
  const n=Math.round(fraction*samples.length)%samples.length;
  const q=samples[n],prev=samples[(n-2+samples.length)%samples.length],
   next=samples[(n+2)%samples.length];
  const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1;
  for(const side of [-1,1]){
   const nx=-dz/len*side,nz=dx/len*side;
   const cutting=block(12,2.5,32,clay,q.x+nx*(halfWidth+23),q.y-1.1,q.z+nz*(halfWidth+23));
   cutting.rotation.y=Math.atan2(dx,dz);
  }
 }
 // Dark-backed distance boards on the long back straight.
 for(const [fraction,label] of [[.73,"300"],[.76,"200"],[.79,"100"]]){
  const n=Math.round(fraction*samples.length)%samples.length;
  const q=samples[n],next=samples[(n+2)%samples.length];
  const dx=next.x-q.x,dz=next.z-q.z,len=Math.hypot(dx,dz)||1;
  const x=q.x-dz/len*(halfWidth+5),z=q.z+dx/len*(halfWidth+5);
  block(.15,2,.15,steel,x,q.y+1,z);
  const panel=block(2.2,1.1,.16,rail,x,q.y+2.25,z);
  panel.rotation.y=Math.atan2(dx,dz);
  const canvas=document.createElement("canvas");canvas.width=256;canvas.height=128;
  const ctx=canvas.getContext("2d");ctx.fillStyle="#f4f4eb";ctx.fillRect(0,0,256,128);
  ctx.fillStyle="#141b1d";ctx.font="bold 82px sans-serif";ctx.textAlign="center";
  ctx.fillText(label,128,92);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.15,1.07),
   new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
  sign.position.set(x,q.y+2.25,z);sign.rotation.y=panel.rotation.y;scene.add(sign);
 }
 return {bridge:true,landmarks:true,source:"approximate reconstructed track"};
}
