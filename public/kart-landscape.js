import {mergeGeometries} from './vendor/utils/BufferGeometryUtils.js';
/* Estimated Piedmont terrain and circuit landmarks. Not LiDAR/survey data. */
import {ROAD,PIT,ROAD_HALF_WIDTH,RUNOFF_WIDTH,projectToRoute,sampleAt,mappedTerrainHeight,geoToWorld} from './kart-track.js';
export function terrainHeight(x,z){return mappedTerrainHeight(x,z)-.45;}
export function addRoadAtlantaLandscape(THREE,scene){
 const bounds=ROAD.samples.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minZ:Math.min(b.minZ,p.z),maxZ:Math.max(b.maxZ,p.z)}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
 const width=bounds.maxX-bounds.minX+650,depth=bounds.maxZ-bounds.minZ+650;
 const geometry=new THREE.PlaneGeometry(width,depth,160,180);geometry.rotateX(-Math.PI/2);geometry.translate((bounds.minX+bounds.maxX)/2,0,(bounds.minZ+bounds.maxZ)/2);
 const pos=geometry.attributes.position,colors=[];
 const color=new THREE.Color();
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),z=pos.getZ(i),road=projectToRoute(x,z),pit=projectToRoute(x,z,PIT);
  let y=terrainHeight(x,z);
  // Exact road clearance at the mesh vertices; terrain holes below protect paving.
  if(road.distance<ROAD_HALF_WIDTH+RUNOFF_WIDTH+7)y=Math.min(y,road.y-.45);
  if(pit.distance<19)y=Math.min(y,pit.y-.45);
  pos.setY(i,y);const variation=(Math.sin(x*.17)*Math.sin(z*.11)+1)*.025;
  color.setHSL(.235+variation,.24,.25+variation);colors.push(color.r,color.g,color.b);
 }
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
 const turf=document.createElement('canvas');turf.width=turf.height=256;const tc=turf.getContext('2d');
 const pixels=tc.createImageData(256,256);let noiseSeed=21;
 for(let i=0;i<pixels.data.length;i+=4){noiseSeed=(Math.imul(noiseSeed,1664525)+1013904223)>>>0;const n=(noiseSeed/4294967296)*55;pixels.data[i]=100+n;pixels.data[i+1]=112+n;pixels.data[i+2]=72+n;pixels.data[i+3]=255;}tc.putImageData(pixels,0,0);
 const grassMap=new THREE.TextureLoader().load('/assets/grass.jpg');grassMap.wrapS=grassMap.wrapT=THREE.RepeatWrapping;grassMap.repeat.set(width/7,depth/7);grassMap.colorSpace=THREE.SRGBColorSpace;grassMap.anisotropy=8;
 const ground=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,map:grassMap,roughness:1}));ground.receiveShadow=true;scene.add(ground);
 // The landmark bridge over the crest after 10B, before downhill T12.
 // Arc position is estimated from the current control polygon, not surveyed.
 const bridgeLocation=geoToWorld(-83.81755,34.14985);
 const bridgePoint=projectToRoute(bridgeLocation.x,bridgeLocation.z);
 const p=sampleAt(bridgePoint.progress),q=sampleAt(bridgePoint.progress+.001);
 const group=new THREE.Group();group.position.set(p.x,p.y,p.z);group.rotation.y=Math.atan2(q.x-p.x,q.z-p.z);scene.add(group);
 const mat=new THREE.MeshStandardMaterial({color:0x99978e,roughness:.9});
 const add=(w,h,d,x,y,z,m=mat)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;group.add(o);return o;};
 add(38,.8,7,0,7.4,0);for(const side of [-1,1]){add(1.2,7.4,6,side*15,3.7,0);add(38,1.1,.2,0,8.3,side*3.35);}
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#153760';ctx.fillRect(0,0,1024,128);ctx.fillStyle='#f4d351';ctx.fillRect(0,112,1024,16);ctx.fillStyle='#fff';ctx.font='bold 66px sans-serif';ctx.textAlign='center';ctx.fillText('ROAD ATLANTA',512,86);
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
 const banner=new THREE.Mesh(new THREE.PlaneGeometry(27,2.6),new THREE.MeshStandardMaterial({map:tex,side:THREE.DoubleSide}));banner.position.set(0,7.7,-3.6);banner.rotation.y=Math.PI;group.add(banner);
 const reverseBanner=banner.clone();reverseBanner.position.z=3.6;reverseBanner.rotation.y=0;group.add(reverseBanner);
 // Broadleaf canopy and tall pine stands in deterministic clusters.
 let seed=2601;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 const trees=[];
 for(let i=0;i<1100;i++){const x=bounds.minX-220+rand()*(width-210),z=bounds.minZ-220+rand()*(depth-210);if(projectToRoute(x,z).distance<32||projectToRoute(x,z,PIT).distance<50)continue;trees.push({x,z,y:terrainHeight(x,z),h:8+rand()*10,r:2.5+rand()*3});}
 const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.4,1,6),new THREE.MeshStandardMaterial({color:0x554b3d,roughness:1}),trees.length);
 // Crossed foliage cards give a fine leaf silhouette instead of faceted balls.
 const leafCanvas=document.createElement('canvas');leafCanvas.width=leafCanvas.height=512;const lc=leafCanvas.getContext('2d');
 for(let i=0;i<25000;i++){const angle=rand()*Math.PI*2,r=Math.sqrt(rand())*(.85+.15*Math.sin(angle*7)),x=256+Math.cos(angle)*r*244,y=256+Math.sin(angle)*r*237;
  const shade=Math.floor(42+rand()*54+(1-y/512)*55);lc.fillStyle=`rgb(${shade*.75},${shade},${shade*.44})`;lc.beginPath();lc.ellipse(x,y,1+rand()*3,1+rand()*2,rand()*Math.PI,0,Math.PI*2);lc.fill();}
 const leafMap=new THREE.CanvasTexture(leafCanvas);leafMap.colorSpace=THREE.SRGBColorSpace;leafMap.anisotropy=4;
 const leafPlanes=[new THREE.PlaneGeometry(2,2),new THREE.PlaneGeometry(2,2).rotateY(Math.PI/2)];
 const crown=new THREE.InstancedMesh(mergeGeometries(leafPlanes),new THREE.MeshStandardMaterial({map:leafMap,alphaTest:.5,side:THREE.DoubleSide,roughness:1}),trees.length*3);
 const dummy=new THREE.Object3D();trees.forEach((t,i)=>{dummy.position.set(t.x,t.y+t.h*.35,t.z);dummy.scale.set(1,t.h*.7,1);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);for(let j=0;j<3;j++){dummy.position.set(t.x+Math.sin(i+j)*t.r*.6,t.y+t.h*(.65+j*.13),t.z+Math.cos(i+j)*t.r*.6);dummy.scale.set(t.r*(1-j*.17),t.h*.26,t.r*(1-j*.17));dummy.rotation.y=i;dummy.updateMatrix();crown.setMatrixAt(i*3+j,dummy.matrix);color.setHSL(.26+rand()*.04,.12,.65+rand()*.25);crown.setColorAt(i*3+j,color);}});
 trunk.castShadow=true;crown.castShadow=true;scene.add(trunk,crown);
 return {ground,bridge:group};
}
