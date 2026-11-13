/* SI-unit GT chassis: Cannon rigid body, four spring/damper wheel contacts,
 * and a saturated single-track tyre model. Parameters are representative,
 * not a manufacturer's homologation or telemetry data. */
import {World,Body,Vec3,Box} from './vendor/cannon-es.js';
import {ROAD,PIT,PIT_HALF_WIDTH,ROAD_HALF_WIDTH,projectToRoute,bankRise} from './kart-track.js';
export const GT={mass:1320,wheelbase:2.68,track:1.94,cgHeight:.48,spring:72000,damper:6100,mu:1.85,brakeDeceleration:20};
export function wheelSurface(x,z,isPit=false){
 const p=projectToRoute(x,z),lat=(x-p.x)*p.normalX+(z-p.z)*p.normalZ;
 const pit=projectToRoute(x,z,PIT);
 if(pit.distance<=PIT_HALF_WIDTH){
  const height=Math.max(p.y+bankRise(p.progress,lat),pit.y+.043);
  return {height,baseHeight:height,kerb:false,mu:GT.mu};
 }
 const edge=Math.abs(lat)-ROAD_HALF_WIDTH;
 // Smooth crown plus a 0.65m repeating rumble profile, fades at both edges.
 const kerb=!isPit&&edge>-.12&&edge<1.65;
 const crown=kerb?Math.sin(Math.PI*Math.max(0,(edge+.12)/1.77)):.0;
 const height=kerb?crown*(.035+.018*(1-Math.cos(p.progress*ROAD.length/0.65*Math.PI*2))):0;
 return {height:p.y+bankRise(p.progress,lat)+height,baseHeight:p.y+bankRise(p.progress,lat),kerb,mu:edge>2.35?.55:kerb?GT.mu*.94:GT.mu};
}
export class GTDynamics{
 constructor(){
  this.world=new World({gravity:new Vec3(0,-9.81,0)});
  this.body=new Body({mass:GT.mass,shape:new Box(new Vec3(.95,.25,2.1)),linearDamping:.03,angularDamping:.35});
  this.body.linearFactor.set(0,1,0);this.body.angularFactor.set(1,0,1);
  this.world.addBody(this.body);this.reset(0);
 }
 reset(height){this.body.position.set(0,height+GT.cgHeight,0);this.body.velocity.setZero();this.body.angularVelocity.setZero();this.body.quaternion.set(0,0,0,1);this.lateral=0;this.yawRate=0;this.steer=0;this.accumulator=0;this.roll=0;this.pitch=0;this.heave=0;this.kerb=false;this.roadHeight=height;}
 step(dt,{x,z,y,yaw,speed,steer,brake,isPit}){
  // Work in a road-relative vertical frame: a descent must not leave the
  // chassis hanging at the previous world height (or force springs to catch up).
  this.body.position.y+=y-this.roadHeight;this.roadHeight=y;
  const contacts=[];
  for(const side of [-1,1])for(const axle of [-1,1]){
   const localX=side*GT.track/2,localZ=axle*GT.wheelbase/2;
   const wx=x-Math.cos(yaw)*localX-Math.sin(yaw)*localZ;
   const wz=z+Math.sin(yaw)*localX-Math.cos(yaw)*localZ;
   contacts.push({localX,localZ,surface:isPit?{height:y,baseHeight:y,kerb:false,mu:GT.mu}:wheelSurface(wx,wz)});
  }
  const h=1/120;this.accumulator+=Math.min(dt,.05);
  let yawDelta=0,sideDistance=0;
  while(this.accumulator>=h){
   this.accumulator-=h;
   this.steer+=(steer*.62/(1+Math.abs(speed)/55)-this.steer)*(1-Math.exp(-h*24));
   let grip=0;this.kerb=false;
   for(const {localX,localZ,surface} of contacts){
    this.kerb ||= surface.kerb;grip+=surface.mu/contacts.length;
    const r=this.body.quaternion.vmult(new Vec3(localX,0,localZ));
    const verticalVelocity=this.body.velocity.y+this.body.angularVelocity.z*r.x-this.body.angularVelocity.x*r.z;
    const roadInput=isPit?y:y+surface.height-surface.baseHeight;
    const compression=roadInput+GT.cgHeight-this.body.position.y-r.y;
    const force=Math.max(0,Math.min(18000,GT.mass*9.81/4+GT.spring*compression-GT.damper*verticalVelocity));
    this.body.applyForce(new Vec3(0,force,0),r);
   }
   const v=Math.abs(speed),limit=grip*9.81*(brake?.96:1);
   const target=-Math.tan(this.steer)*speed/GT.wheelbase;
   const saturated=Math.max(-limit/Math.max(v,2),Math.min(limit/Math.max(v,2),target));
   this.yawRate+=(saturated-this.yawRate)*(1-Math.exp(-h*18));
   // Excess steering produces understeer through the yaw-rate limit above.
   // It must not invent sideways velocity: that made the whole car skate
   // into corners while its nose barely rotated, especially at racing speed.
   this.lateral*=Math.exp(-h*12);
   this.body.torque.z+=-this.yawRate*speed*GT.mass*GT.cgHeight;
   this.body.torque.x+=(brake?-.65:.08)*GT.mass*GT.cgHeight;
   this.world.step(h);yawDelta+=this.yawRate*h;sideDistance+=this.lateral*h;
  }
  const q=this.body.quaternion,euler=new Vec3();q.toEuler(euler,'YZX');
  this.roll=Math.max(-.045,Math.min(.045,euler.z));this.pitch=Math.max(-.035,Math.min(.035,euler.x));
  this.heave=Math.max(-.025,Math.min(.025,this.body.position.y-GT.cgHeight-y));
  return {yawDelta,sideDistance,heave:this.heave,roll:this.roll,pitch:this.pitch,kerb:this.kerb};
 }
}

export function brakeSpeed(speed,dt){const remaining=Math.max(0,Math.abs(speed)-GT.brakeDeceleration*Math.max(0,dt));return remaining===0?0:Math.sign(speed)*remaining;}
