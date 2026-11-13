// Timestamped snapshot playback. Render slightly behind the server so normal
// packet jitter interpolates between positions instead of stopping at each one.
export class RivalMotion {
 constructor(){this.frames=[];}
 push(frame){
  if(!Number.isFinite(frame.t+frame.x+frame.z+frame.yaw))return false;
  const last=this.frames.at(-1);
  if(last&&frame.t<=last.t)return false;
  if(last&&(frame.t-last.t>1500||Math.hypot(frame.x-last.x,frame.z-last.z)>150))this.frames=[];
  this.frames.push({...frame});if(this.frames.length>24)this.frames.shift();return true;
 }
 sample(time){
  const frames=this.frames;if(!frames.length)return null;
  if(time<=frames[0].t)return {...frames[0]};
  for(let i=1;i<frames.length;i++){
   const a=frames[i-1],b=frames[i];
   if(time<=b.t){const f=(time-a.t)/(b.t-a.t),turn=Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw));
    return {...b,x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,yaw:a.yaw+turn*f};}
  }
  const b=frames.at(-1),a=frames.at(-2);if(!a)return {...b};
  const dt=b.t-a.t,extra=Math.min(150,Math.max(0,time-b.t));
  const vx=(b.x-a.x)/dt,vz=(b.z-a.z)/dt;
  const scale=Math.min(1,105/(Math.hypot(vx,vz)*1000||1));
  return {...b,x:b.x+vx*extra*scale,z:b.z+vz*extra*scale};
 }
}
