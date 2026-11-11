/* Continuous safety glazing ONLY on the main/pit straight.
 * Panels are joined edge-to-edge in shared coordinates, never offset as
 * individual loosely positioned fences. The PIT IN side has an opening.
 */
export function addStraightGlassBarriers(THREE,scene,road,roadHalfWidth){
 const samples=road.samples,n=samples.length;
 const barrier=new THREE.MeshStandardMaterial({color:0xc5c8c8,roughness:.48,metalness:.54,side:THREE.DoubleSide});
 const glass=new THREE.MeshPhysicalMaterial({
  color:0x9bbec5,roughness:.12,metalness:.09,transparent:true,opacity:.34,
  depthWrite:false,side:THREE.DoubleSide
 });
 const steel=new THREE.MeshStandardMaterial({color:0x5a666f,roughness:.31,metalness:.84});
 const baseVertices=[],glassVertices=[],posts=[];
 const from=n-61,to=n-4;
 function tangent(i){
  const a=samples[(i-2+n)%n],b=samples[(i+2)%n];
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
  return {nx:-dz/len,nz:dx/len};
 }
 const point=(i,side,height)=>{
  const p=samples[i],t=tangent(i),offset=side*(roadHalfWidth+.27);
  return [p.x+t.nx*offset,p.y+height,p.z+t.nz*offset];
 };
 const quad=(arr,a,b,c,d)=>arr.push(...a,...b,...c,...b,...d,...c);
 let segments=0;
 for(const side of [-1,1]){
  // The service-lane branch joins the pit-side (+normal) edge near the
  // beginning of this straight; leave it physically clear.
  const first=side===1?from+15:from;
  for(let i=first;i<to;i++){
   const a0=point(i,side,.06),b0=point(i+1,side,.06);
   const a1=point(i,side,.84),b1=point(i+1,side,.84);
   const a2=point(i,side,2.75),b2=point(i+1,side,2.75);
   quad(baseVertices,a0,b0,a1,b1);
   quad(glassVertices,a1,b1,a2,b2);
   segments++;
   if(i===first||i===to-1||(i-first)%5===0){
    const p=point(i,side,1.42);
    posts.push({x:p[0],y:p[1],z:p[2]});
   }
  }
  posts.push((()=>{
   const p=point(to,side,1.42);return {x:p[0],y:p[1],z:p[2]};
  })());
 }
 function surface(vertices,material,castShadow=false){
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,material);
  mesh.castShadow=castShadow;mesh.receiveShadow=true;scene.add(mesh);
 }
 surface(baseVertices,barrier,true);
 surface(glassVertices,glass);
 const postGeo=new THREE.BoxGeometry(.1,2.9,.1);
 const instance=new THREE.InstancedMesh(postGeo,steel,posts.length);
 const dummy=new THREE.Object3D();
 posts.forEach((p,i)=>{
  dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);
  dummy.updateMatrix();instance.setMatrixAt(i,dummy.matrix);
 });
 instance.instanceMatrix.needsUpdate=true;scene.add(instance);
 return {segments,posts:posts.length,from,to};
}
