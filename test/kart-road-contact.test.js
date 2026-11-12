import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry,Float32BufferAttribute} from '../public/vendor/three.module.js';
import {clearPitGrass} from '../public/kart-road-contact.js';
import {PIT,sampleAt,projectToRoute} from '../public/kart-track.js';
test('grass triangles crossing the middle of pit entry clear the entire asphalt',()=>{
 const point=sampleAt(.08,PIT),q=projectToRoute(point.x,point.z,PIT);
 const nx=q.normalX,nz=q.normalZ,tx=nz,tz=-nx;
 const positions=[];
 for(const [across,along] of [[-20,-12],[20,-12],[0,24]])positions.push(point.x+nx*across+tx*along,point.y+3,point.z+nz*across+tz*along);
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
 clearPitGrass(geometry);
 for(let i=0;i<3;i++)assert.ok(geometry.attributes.position.getY(i)<point.y-.25);
});
test('pit merge elevation agrees with its adjacent racing surface',()=>{
 for(const p of PIT.samples){
  const road=projectToRoute(p.x,p.z);
  assert.ok(Math.abs(p.y-road.y)<1e-8,'no buried pit road at the merge');
 }
});
