// Shared player avatars, chat bubbles, room-scoped voice via WebRTC.
// Browser microphone access is opt-in and only available in secure contexts.
export function createClubSocial(THREE,scene,camera,zoneAt){
 const peers=new Map(),calls=new Map(),iceQueue=new Map(),signalQueue=new Map();
 const history=document.getElementById("clubChatHistory");
 const count=document.getElementById("clubPlayerCount");
 const form=document.getElementById("clubChatForm"),input=document.getElementById("clubChatInput");
 const micButton=document.getElementById("clubMic");
 const chatToggle=document.getElementById("clubChatToggle");
 const pane=document.getElementById("clubSocialPanel");
 let socket=null,selfId="",stream=null,micEnabled=false,active=false,lastSend=0,reconnectHandle=null,iceCache=null,icePromise=null;
 const color=(id)=>new THREE.Color().setHSL((Array.from(id).reduce((n,c)=>n+c.charCodeAt(0),0)%360)/360,.38,.57);
 const send=(data)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(data));};
 function textSprite(text,bg="#14372d",fg="#f7e4be",maxWidth=280){
  const canvas=document.createElement("canvas");canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext("2d");ctx.clearRect(0,0,512,128);
  ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(7,11,498,106,22);ctx.fill();
  ctx.strokeStyle="#cba86c";ctx.lineWidth=4;ctx.stroke();
  ctx.fillStyle=fg;ctx.font="bold 29px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";
  const clipped=String(text).slice(0,82);const words=clipped.split(" ");
  let line="",lines=[];for(const word of words){const next=(line?line+" ":"")+word;if(ctx.measureText(next).width>455&&line){lines.push(line);line=word;}else line=next;}
  lines.push(line);if(lines.length>2)lines=[lines[0],lines[1].slice(0,23)+"…"];
  lines.forEach((s,i)=>ctx.fillText(s,256,lines.length>1?45+i*42:64,455));
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));
  sprite.scale.set(2.6,.65,1);sprite.userData.texture=tex;return sprite;
 }
 function makeAvatar(p){
  const g=new THREE.Group();
  const sum=Array.from(p.id).reduce((n,c)=>n+c.charCodeAt(0),0);
  const coats=[0x742940,0x923a52,0x552c48,0x9b5360,0x4b394c];
  const coat=new THREE.MeshPhysicalMaterial({color:coats[sum%coats.length],roughness:.84,sheen:1,sheenColor:0xb85b6c});
  const skin=new THREE.MeshStandardMaterial({color:0xc98a6f,roughness:.83});
  const trim=new THREE.MeshStandardMaterial({color:0xd0b17c,metalness:.45,roughness:.45});
  const trousers=new THREE.MeshStandardMaterial({color:0x2d2831,roughness:.85});
  const hairMat=new THREE.MeshStandardMaterial({color:sum%3===0?0x654336:0x2d2429,roughness:.91});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.31,.72,7,14),coat);
  body.position.y=1.20;body.scale.set(.95,1,0.78);g.add(body);
  const collar=new THREE.Mesh(new THREE.TorusGeometry(.19,.038,8,18),trim);
  collar.rotation.x=Math.PI/2;collar.position.y=1.73;g.add(collar);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.235,22,16),skin);head.position.y=1.93;g.add(head);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.246,22,14,0,Math.PI*2,0,1.32),hairMat);
  hair.position.y=2.013;g.add(hair);
  for(const sx of [-1,1]){
   const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.106,.59,5,10),coat);
   arm.position.set(sx*.39,1.26,0);arm.rotation.z=sx*.16;g.add(arm);
   const hand=new THREE.Mesh(new THREE.SphereGeometry(.10,12,9),skin);
   hand.position.set(sx*.46,.91,0);g.add(hand);
   const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.48,5,10),trousers);
   leg.position.set(sx*.16,.48,0);g.add(leg);
   const shoe=new THREE.Mesh(new THREE.SphereGeometry(.16,10,10),trousers);
   shoe.scale.set(1,.55,1.45);shoe.position.set(sx*.16,.10,.10);g.add(shoe);
  }
  const tag=textSprite(p.name,"#402539","#f5ddb5");
  tag.position.y=2.67;tag.scale.set(1.7,.43,1);g.add(tag);
  g.position.set(p.x,0,p.z);g.rotation.y=p.yaw||0;scene.add(g);
  const info={...p,group:g,tag,bubble:null,bubbleUntil:0,targetX:p.x,targetZ:p.z,targetYaw:p.yaw||0};
  peers.set(p.id,info);return info;
 }
 function remove(id){
  const p=peers.get(id);if(!p)return;
  if(p.bubble){p.group.remove(p.bubble);p.bubble.material.map.dispose();p.bubble.material.dispose();}
  p.tag.material.map.dispose();p.tag.material.dispose();
  scene.remove(p.group);peers.delete(id);closePeer(id);refreshCount();
 }
 function refreshCount(){if(count)count.textContent=(peers.size+1)+" online";}
 function append(name,msg,system=false){
  if(!history)return;
  const row=document.createElement("div");row.className=system?"club-chat-system":"club-chat-line";
  if(system)row.textContent=msg;
  else{const b=document.createElement("b");b.textContent=name+": ";row.append(b,document.createTextNode(msg));}
  history.append(row);while(history.children.length>45)history.firstChild.remove();history.scrollTop=history.scrollHeight;
 }
 function bubble(p,text){
  if(!p)return;
  if(p.bubble){p.group.remove(p.bubble);p.bubble.material.map.dispose();p.bubble.material.dispose();}
  p.bubble=textSprite(text);p.bubble.position.y=3.28;p.group.add(p.bubble);p.bubbleUntil=performance.now()+6500;
 }
 function closePeer(id){
  const pc=calls.get(id);if(pc){pc.onicecandidate=null;pc.ontrack=null;pc.onconnectionstatechange=null;pc.close();calls.delete(id);}
  iceQueue.delete(id);signalQueue.delete(id);
  const el=document.getElementById("voice-"+id);if(el){el.pause();el.srcObject=null;el.remove();}
 }
 function stopAllCalls(){for(const id of [...calls.keys()])closePeer(id);}
 function voiceNote(msg){const el=document.querySelector(".club-voice-note");if(el)el.textContent=msg;}
 function updateMicButton(){
  micButton.textContent=micEnabled?"🎤 Mic on · click to mute":"🎙 Enable microphone";
  micButton.setAttribute("aria-pressed",String(micEnabled));
 }
 async function getIce(){
  if(iceCache)return iceCache;
  if(icePromise)return icePromise;
  icePromise=(async()=>{
   try{
    const res=await fetch("/api/rtc/ice",{credentials:"same-origin",cache:"no-store"});
    if(!res.ok)throw Error("ICE configuration unavailable");
    const payload=await res.json();
    if(!Array.isArray(payload.iceServers)||!payload.iceServers.length)throw Error("No ICE servers");
    iceCache=payload;
   }catch(error){
    iceCache={relayAvailable:false,iceServers:[{urls:"stun:stun.cloudflare.com:3478"}]};
   }
   if(!iceCache.relayAvailable)voiceNote("TURN relay unavailable. Some networks may block voice; check Cloudflare Worker TURN secrets.");
   else voiceNote("Microphone on. Private room voice uses Cloudflare TURN when direct audio is blocked.");
   return iceCache;
  })();
  return icePromise;
 }
 async function ensureCall(p,initiator){
  if(!micEnabled||!stream||!p?.voice||p.zone!==zoneAt(camera.position.x,camera.position.z))return null;
  const existing=calls.get(p.id);
  if(existing&&existing.signalingState!=="closed")return existing;
  const config=await getIce();
  if(!micEnabled||!stream||!peers.has(p.id)||p.zone!==zoneAt(camera.position.x,camera.position.z))return null;
  const pc=new RTCPeerConnection({iceServers:config.iceServers});
  calls.set(p.id,pc);
  for(const track of stream.getAudioTracks())pc.addTrack(track,stream);
  pc.onicecandidate=e=>{
   if(e.candidate)send({type:"signal",to:p.id,kind:"ice",payload:e.candidate.toJSON()});
  };
  pc.ontrack=e=>{
   let audio=document.getElementById("voice-"+p.id);
   if(!audio){
    audio=document.createElement("audio");audio.id="voice-"+p.id;
    audio.autoplay=true;audio.playsInline=true;
    document.getElementById("clubAudioStreams").append(audio);
   }
   audio.srcObject=e.streams[0]||new MediaStream([e.track]);
   audio.play().catch(()=>voiceNote("Tap Enable microphone to allow room audio playback."));
  };
  pc.onconnectionstatechange=()=>{
   if(calls.get(p.id)!==pc)return;
   if(pc.connectionState==="connected")voiceNote("Voice connected to "+p.name+". Only people in your room can hear you.");
   if(["failed","closed"].includes(pc.connectionState)){
    closePeer(p.id);
    voiceNote("Voice connection failed. TURN relay may be unavailable; toggle microphone to retry.");
   }
  };
  if(initiator){
   const offer=await pc.createOffer();
   await pc.setLocalDescription(offer);
   send({type:"signal",to:p.id,kind:"offer",payload:pc.localDescription.toJSON()});
  }
  return pc;
 }
 async function flushIce(id,pc){
  if(!pc?.remoteDescription)return;
  const list=iceQueue.get(id)||[];iceQueue.delete(id);
  for(const c of list)try{await pc.addIceCandidate(new RTCIceCandidate(c));}catch{}
 }
 function handleSignal(data){
  if(!micEnabled||!stream)return;
  const p=peers.get(data.from);
  if(!p||!p.voice||p.zone!==zoneAt(camera.position.x,camera.position.z))return;
  const previous=signalQueue.get(p.id)||Promise.resolve();
  const next=previous.then(async()=>{
   if(!micEnabled||!stream)return;
   let pc=calls.get(p.id);
   if(data.kind==="ice"){
    if(pc?.remoteDescription)await pc.addIceCandidate(new RTCIceCandidate(data.payload));
    else{
     const arr=iceQueue.get(p.id)||[];
     if(arr.length<75){arr.push(data.payload);iceQueue.set(p.id,arr);}
    }
   }else if(data.kind==="offer"){
    if(pc)closePeer(p.id);
    pc=await ensureCall(p,false);if(!pc)return;
    await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
    await flushIce(p.id,pc);
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    send({type:"signal",to:p.id,kind:"answer",payload:pc.localDescription.toJSON()});
   }else if(data.kind==="answer"&&pc){
    await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
    await flushIce(p.id,pc);
   }
  }).catch(e=>{console.warn("Voice signalling",e);voiceNote("Voice connection issue. Toggle your microphone to retry.");});
  signalQueue.set(p.id,next);
 }
 function handle(data){
  if(data.type==="welcome"){
   selfId=data.id;for(const p of peers.keys())remove(p);
   for(const p of data.peers||[])if(p.id!==selfId)makeAvatar(p);
   refreshCount();append("","Connected to the social clubhouse",true);
   if(micEnabled)send({type:"voice",enabled:true});
  }
  if(data.type==="join"&&data.peer?.id!==selfId){if(!peers.has(data.peer.id))makeAvatar(data.peer);refreshCount();append("",data.peer.name+" entered the club",true);}
  if(data.type==="leave"){const p=peers.get(data.id);if(p)append("",p.name+" left",true);remove(data.id);}
  if(data.type==="move"){const p=peers.get(data.id);if(p){p.targetX=data.x;p.targetZ=data.z;p.targetYaw=data.yaw;p.zone=data.zone;if(p.zone!==zoneAt(camera.position.x,camera.position.z))closePeer(p.id);}}
  if(data.type==="chat"){append(data.name,data.text);bubble(peers.get(data.id),data.text);}
  if(data.type==="voice"){const p=peers.get(data.id);if(p){p.voice=data.enabled;if(!p.voice)closePeer(p.id);else if(micEnabled&&selfId<p.id)ensureCall(p,true).catch(console.warn);}}
  if(data.type==="profile"){
   const p=peers.get(data.id);
   if(p){
    p.name=data.name;p.color=data.color;p.hair=data.hair;
    updateAvatar(p);
   }
  }
  if(data.type==="signal")handleSignal(data);
 }
 function connect(){
  if(!active||socket&&[WebSocket.CONNECTING,WebSocket.OPEN].includes(socket.readyState))return;
  socket=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host+"/club/ws");
  socket.onmessage=e=>{try{handle(JSON.parse(e.data));}catch(err){console.warn("Club message",err);}};
  socket.onclose=()=>{
   for(const id of [...peers.keys()])remove(id);
   socket=null;stopAllCalls();if(active)reconnectHandle=setTimeout(connect,2500);
  };
  socket.onerror=()=>append("","Social connection interrupted",true);
 }
 form.addEventListener("submit",e=>{
  e.preventDefault();const msg=input.value.trim().slice(0,180);
  if(!msg)return;
  if(!socket||socket.readyState!==WebSocket.OPEN){append("","Chat is reconnecting",true);return;}
  if(Date.now()-lastSend<850)return;
  lastSend=Date.now();send({type:"chat",text:msg});
  append("You",msg);input.value="";
 });
 chatToggle.addEventListener("click",()=>{
  const open=pane.classList.toggle("open");
  chatToggle.setAttribute("aria-expanded",String(open));
  if(open)input.focus();
 });
 micButton.addEventListener("click",async()=>{
  if(micEnabled){stopMic();return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){append("","Microphone voice is unavailable in this browser",true);return;}
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   micEnabled=true;updateMicButton();await getIce();send({type:"voice",enabled:true});
   for(const p of peers.values())if(p.voice&&selfId<p.id)ensureCall(p,true).catch(console.warn);
   append("","Microphone enabled. Cloudflare TURN will relay audio if needed.",true);
  }catch(err){append("","Microphone permission denied or unavailable",true);}
 });
 function stopMic(){
  micEnabled=false;send({type:"voice",enabled:false});stopAllCalls();
  stream?.getTracks().forEach(t=>t.stop());stream=null;iceCache=null;icePromise=null;updateMicButton();voiceNote("Voice is optional and shared only with consenting players in your room.");
 }
 return {
  start(){active=true;connect();},
  stop(){active=false;clearTimeout(reconnectHandle);stopMic();socket?.close();socket=null;for(const id of [...peers.keys()])remove(id);},
  move(x,z,yaw){
   if(!active)return;const zone=zoneAt(x,z);send({type:"move",x,z,yaw});
   for(const p of peers.values())if(p.zone!==zone)closePeer(p.id);
  },
  update(dt){
   for(const p of peers.values()){
    p.group.position.x=THREE.MathUtils.damp(p.group.position.x,p.targetX,9,dt);
    p.group.position.z=THREE.MathUtils.damp(p.group.position.z,p.targetZ,9,dt);
    p.group.rotation.y=THREE.MathUtils.damp(p.group.rotation.y,p.targetYaw,8,dt);
    if(p.bubble&&performance.now()>p.bubbleUntil){
     p.group.remove(p.bubble);p.bubble.material.map.dispose();p.bubble.material.dispose();p.bubble=null;
    }
   }
  },
  seatedChat(){pane.classList.add("open");chatToggle.setAttribute("aria-expanded","true");input.focus();},
  isVoiceEnabled:()=>micEnabled
 };
}
