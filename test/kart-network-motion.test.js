import test from 'node:test';
import assert from 'node:assert/strict';
import {RivalMotion} from '../public/kart-network-motion.js';
test('10Hz snapshots interpolate smoothly at display refresh rate and ignore stale packets',()=>{
 const motion=new RivalMotion();
 motion.push({t:1000,x:0,z:0,yaw:3.1,speed:30});
 motion.push({t:1100,x:3,z:0,yaw:-3.1,speed:30});
 assert.equal(motion.push({t:1050,x:-100,z:0,yaw:0}),false);
 let last=0;
 for(let t=1000;t<=1100;t+=1000/60){
  const p=motion.sample(t);assert.ok(p.x>=last&&p.x-last<=.501);last=p.x;
  assert.ok(Math.abs(p.yaw)>3,'heading takes shortest path across pi');
 }
 assert.equal(motion.sample(1050).x,1.5);
});
test('brief missing packets extrapolate, but lost peers cannot fly indefinitely',()=>{
 const motion=new RivalMotion();
 motion.push({t:1000,x:0,z:0,yaw:0});motion.push({t:1100,x:0,z:5,yaw:0});
 assert.equal(motion.sample(1200).z,10);
 assert.equal(motion.sample(5000).z,12.5);
 motion.push({t:6000,x:200,z:100,yaw:1});assert.equal(motion.frames.length,1);
 assert.equal(motion.sample(5900).x,200);
});
