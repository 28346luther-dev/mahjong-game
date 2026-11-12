import test from 'node:test';
import assert from 'node:assert/strict';
import {GTDynamics,wheelSurface} from '../public/kart-vehicle-dynamics.js';
import {ROAD,raceStart,ROAD_HALF_WIDTH,projectToRoute,sampleAt,mappedTerrainHeight} from '../public/kart-track.js';
test('mapped centreline is closed, finite, full length and terrain follows geographic grid',()=>{
 assert.ok(ROAD.length>4050&&ROAD.length<4130);
 for(const p of ROAD.samples)assert.ok(Number.isFinite(p.x+p.y+p.z));
 const p=sampleAt(.3);assert.ok(Math.abs(projectToRoute(p.x,p.z).y-p.y)<.01);
 assert.ok(Math.abs(mappedTerrainHeight(p.x,p.z)-p.y)<1);
});
test('GT3 suspension settles, steering saturates and turns right for D input',()=>{
 const p=raceStart(),d=new GTDynamics();d.reset(p.y);
 for(let i=0;i<240;i++)d.step(1/120,{...p,y:p.y,speed:0,steer:0,brake:false,isPit:true});
 assert.ok(Math.abs(d.heave)<.01);assert.ok(Math.abs(d.roll)<.01);
 let yaw=0;for(let i=0;i<120;i++)yaw+=d.step(1/120,{...p,speed:70,steer:1,brake:false,isPit:true}).yawDelta;
 assert.ok(yaw<0&&yaw>-.25,'lateral acceleration limited at high speed');
 assert.ok(Number.isFinite(d.heave+d.roll+d.pitch));
});
test('kerb wheel contact is raised and lower grip than tarmac',()=>{
 const p=sampleAt(.35),n=projectToRoute(p.x,p.z);
 const road=wheelSurface(p.x,p.z),k=wheelSurface(p.x+n.normalX*(ROAD_HALF_WIDTH+.6),p.z+n.normalZ*(ROAD_HALF_WIDTH+.6));
 assert.equal(k.kerb,true);assert.ok(k.mu<road.mu);assert.ok(k.height>n.y);
});
test('one-sided kerb contacts produce bounded chassis motion and fixed-step consistency',()=>{
 const p=sampleAt(.35),n=projectToRoute(p.x,p.z),q=sampleAt(.351),yaw=Math.atan2(q.x-p.x,q.z-p.z);
 const input={x:p.x+n.normalX*(ROAD_HALF_WIDTH-.4),z:p.z+n.normalZ*(ROAD_HALF_WIDTH-.4),y:p.y,yaw,speed:25,steer:0,brake:false,isPit:false};
 const a=new GTDynamics(),b=new GTDynamics();a.reset(p.y);b.reset(p.y);
 for(let i=0;i<120;i++)a.step(1/120,input);
 for(let i=0;i<60;i++)b.step(1/60,input);
 assert.equal(a.kerb,true);assert.ok(Math.abs(a.roll)>.001);
 assert.ok(Math.abs(a.roll)<.16&&Math.abs(a.heave)<.18);
 assert.ok(Math.abs(a.roll-b.roll)<1e-6);assert.ok(Math.abs(a.heave-b.heave)<1e-6);
});
