import test from 'node:test';
import assert from 'node:assert/strict';
import {planPitBuildings,footprintClearance} from '../public/kart-pit-layout.js';
import {ROAD,PIT,ROAD_HALF_WIDTH,PIT_HALF_WIDTH} from '../public/kart-track.js';
test('every pit building footprint clears the entire circuit and pit lane',()=>{
 const buildings=planPitBuildings();
 assert.equal(buildings.length,12);
 for(const building of buildings){
  assert.ok(building.length<=18,'no long chord across the final corner');
  assert.ok(footprintClearance(building,ROAD)>ROAD_HALF_WIDTH+6);
  assert.ok(footprintClearance(building,PIT)>PIT_HALF_WIDTH+3);
 }
 // Independent test: every racing centreline vertex is outside every expanded
 // oriented building rectangle, including the bridge, descent and T12.
 for(const p of ROAD.samples)for(const b of buildings){
  const dx=p.x-b.x,dz=p.z-b.z,c=Math.cos(b.yaw),s=Math.sin(b.yaw);
  const x=c*dx-s*dz,z=s*dx+c*dz;
  assert.ok(Math.abs(x)>b.width/2+ROAD_HALF_WIDTH||Math.abs(z)>b.length/2+ROAD_HALF_WIDTH);
 }
});
