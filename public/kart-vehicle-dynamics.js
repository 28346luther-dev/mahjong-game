/* SI-unit GT chassis: Cannon rigid body, four spring/damper wheel contacts,
 * and a saturated single-track tyre model. Parameters are representative,
 * not a manufacturer's homologation or telemetry data. */
import {World,Body,Vec3,Box} from './vendor/cannon-es.js';
import {ROAD,ROAD_HALF_WIDTH,projectToRoute,bankRise} from './kart-track.js';
export const GT={mass:1320,wheelbase:2.68,track:1.94,cgHeight:.48,spring:72000,damper:6100,mu:1.35};
export function wheelSurface(x,z,isPit=false){
 const p=projectToRoute(x,z),lat=(x-p.x)*p.normalX+(z-p.z)*p.normalZ;
 const edge=Math.abs(lat)-ROAD_HALF_WIDTH;
 // Smooth crown plus a 0.65m repeating rumble profile, fades at both edges.
 const kerb=!isPit&&edge>-.12&&edge<1.65;
 const crown=kerb?Math.sin(Math.PI*Math.max(0,(edge+.12)/1.77)):.0;
 const height=kerb?crown*(.035+.018*(1-Math.cos(p.progress*ROAD.length/0.65*Math.PI*2))):0;
 return {height:p.y+bankRise(p.progress,lat)+height,baseHeight:p.y+bankRise(p.progress,lat),kerb,mu:edge>2.35?.55:kerb?1.08:GT.mu};
}
export class GTDynamics{
 constructor(){
  this.world=new World({gravity:new Vec3(0,-9.81,0)});
  this.body=new Body({mass:GT.mass,shape:new Box(new Vec3(.95,.25,2.1)),linearDamping:.03,angularDamping:.35});
  this.body.linearFactor.set(0,1,0);this.body.angularFactor.set(1,0,1);
  this.world.addBody(this.body);this.reset(0);
 }
 reset(height){this.body.position.set(0,height+GT.cgHeight,0);this.body.velocity.setZero();this.body.angularVelocity.setZero();this.body.quaternion.set(0,0,0,1);this.lateral=0;this.yawRate=0;this.steer=0;this.accumulator=0;this.roll=0;this.pitch=0;this.heave=0;this.kerb=false;}
 step(dt,{x,z,y,yaw,speed,steer,brake,isPit}){
  const h=1/120;this.accumulator+=Math.min(dt,.05);
  let yawDelta=0,sideDistance=0;
  while(this.accumulator>=h){
   this.accumulator-=h;
   this.steer+=(steer*.48/(1+Math.abs(speed)/38)-this.steer)*(1-Math.exp(-h*9));
   let grip=GT.mu;this.kerb=false;
   for(const side of [-1,1])for(const axle of [-1,1]){
    const localX=side*GT.track/2,localZ=axle*GT.wheelbase/2;
    const wx=x+Math.cos(yaw)*localX+Math.sin(yaw)*localZ;
    const wz=z-Math.sin(yaw)*localX+Math.cos(yaw)*localZ;
    const surface=isPit?{height:y,kerb:false,mu:GT.mu}:wheelSurface(wx,wz);
    this.kerb ||= surface.kerb;grip=Math.min(grip,surface.mu);
    const r=this.body.quaternion.vmult(new Vec3(localX,0,localZ));
    const verticalVelocity=this.body.velocity.y+this.body.angularVelocity.z*r.x-this.body.angularVelocity.x*r.z;
    const roadInput=isPit?y:y+surface.height-surface.baseHeight;
    const compression=roadInput+GT.cgHeight-this.body.position.y-r.y;
    const force=Math.max(0,Math.min(18000,GT.mass*9.81/4+GT.spring*compression-GT.damper*verticalVelocity));
    this.body.applyForce(new Vec3(0,force,0),r);
   }
   const v=Math.abs(speed),limit=grip*9.81*(brake?.72:1);
   const target=-Math.tan(this.steer)*speed/GT.wheelbase;
   const saturated=Math.max(-limit/Math.max(v,2),Math.min(limit/Math.max(v,2),target));
   this.yawRate+=(saturated-this.yawRate)*(1-Math.exp(-h*7));
   // Side-slip builds under saturated steering and relaxes through tyre forces.
   const slipTarget=(target-saturated)*Math.min(v,40)*.10;
   this.lateral+=(slipTarget-this.lateral)*(1-Math.exp(-h*4*grip));
   this.body.torque.z+=-this.yawRate*speed*GT.mass*GT.cgHeight;
   this.body.torque.x+=(brake?-.65:.08)*GT.mass*GT.cgHeight;
   this.world.step(h);yawDelta+=this.yawRate*h;sideDistance+=this.lateral*h;
  }
  const q=this.body.quaternion,euler=new Vec3();q.toEuler(euler,'YZX');
  this.roll=Math.max(-.16,Math.min(.16,euler.z));this.pitch=Math.max(-.12,Math.min(.12,euler.x));
  this.heave=Math.max(-.12,Math.min(.18,this.body.position.y-GT.cgHeight-y));
  return {yawDelta,sideDistance,heave:this.heave,roll:this.roll,pitch:this.pitch,kerb:this.kerb};
 }
}
