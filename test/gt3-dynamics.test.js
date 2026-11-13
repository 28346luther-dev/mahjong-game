import test from 'node:test';
import assert from 'node:assert/strict';
import {GT,GTDynamics,wheelSurface} from '../public/kart-vehicle-dynamics.js';
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
 assert.ok(yaw<0&&yaw>-.30,'lateral acceleration limited at high speed');
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
test('suspension stays road-relative on long climbs and descents',()=>{
 const d=new GTDynamics();d.reset(40);
 for(let i=0;i<1200;i++){
  const y=40+30*Math.sin(i/120);
  d.step(1/120,{x:0,z:0,y,yaw:0,speed:30,steer:0,brake:false,isPit:true});
  assert.ok(Math.abs(d.body.position.y-(y+GT.cgHeight))<.01,'chassis follows road elevation');
  assert.ok(Math.abs(d.heave)<.01,'no floating at suspension clamp');
 }
});
test('steering responds within 100ms, centres on release and mirrors left/right',()=>{
 const run=steer=>{
  const d=new GTDynamics();d.reset(0);let yaw=0;
  for(let i=0;i<12;i++)yaw+=d.step(1/120,{x:0,z:0,y:0,yaw:0,speed:20,steer,brake:false,isPit:true}).yawDelta;
  return {d,yaw};
 };
 const right=run(1),left=run(-1);
 assert.ok(right.d.steer>.25,'front wheels respond promptly');
 assert.ok(right.yaw<-.02,'heading responds promptly');
 assert.ok(Math.abs(right.yaw+left.yaw)<1e-10);
 for(let i=0;i<60;i++)right.d.step(1/120,{x:0,z:0,y:0,yaw:0,speed:20,steer:0,brake:false,isPit:true});
 assert.ok(Math.abs(right.d.steer)<1e-5,'no persistent left steering');
 assert.ok(Math.abs(right.d.yawRate)<.001,'no persistent yaw');
});
test('saturated steering rotates the nose without inventing sideways drift',()=>{
 for(const speed of [10,30,50,82])for(const steer of [-1,1]){
  const d=new GTDynamics();d.reset(0);let turn=0,side=0;
  for(let i=0;i<240;i++){
   const step=d.step(1/120,{x:0,z:0,y:0,yaw:turn,speed,steer,brake:false,isPit:true});
   turn+=step.yawDelta;side+=step.sideDistance;
  }
  assert.ok(turn*steer<-.1,'car must turn even when tyre grip saturates');
  assert.ok(Math.abs(side)<.001,'cannot skate sideways instead of turning');
  assert.ok(Math.abs(d.heave)<=.025&&Math.abs(d.roll)<=.045);
 }
});
test('assisted cornering turns tighter at medium speed and retains grip under braking',()=>{
 const turn=brake=>{
  const d=new GTDynamics();d.reset(0);let yaw=0;
  for(let i=0;i<120;i++)yaw+=d.step(1/120,{x:0,z:0,y:0,yaw,speed:30,steer:1,brake,isPit:true}).yawDelta;
  return Math.abs(yaw);
 };
 assert.ok(turn(false)>.5,'90-degree corners should not need huge radii at 108km/h');
 assert.ok(turn(true)/turn(false)>.94,'braking must retain steering authority');
});
test('strong brakes shorten 100km/h stops and never reverse the car',async()=>{
 const {brakeSpeed}=await import('../public/kart-vehicle-dynamics.js');
 let speed=100/3.6,distance=0,time=0;
 while(speed>0){speed=brakeSpeed(speed,1/120);distance+=speed/120;time+=1/120;}
 assert.ok(time<1.5&&distance<20);
 assert.equal(brakeSpeed(.1,1/60),0);assert.equal(brakeSpeed(-.1,1/60),0);
});
test('clipping an apex kerb retains cornering grip instead of sudden whole-car understeer',()=>{
 const p=sampleAt(.35),q=sampleAt(.351),projection=projectToRoute(p.x,p.z),yaw=Math.atan2(q.x-p.x,q.z-p.z);
 const turn=lateral=>{
  const d=new GTDynamics();d.reset(p.y);let angle=0;
  for(let i=0;i<120;i++)angle+=d.step(1/120,{x:p.x+projection.normalX*lateral,z:p.z+projection.normalZ*lateral,y:p.y,yaw,speed:30,steer:1,brake:false,isPit:false}).yawDelta;
  return Math.abs(angle);
 };
 assert.ok(turn(ROAD_HALF_WIDTH-.4)/turn(0)>.9);
});
