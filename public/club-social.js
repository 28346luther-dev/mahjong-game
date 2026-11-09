// Shared player avatars, chat bubbles, room-scoped voice via WebRTC.
// Browser microphone access is opt-in and only available in secure contexts.
export function createClubSocial(THREE,scene,camera,zoneAt){
 const peers=new Map(),calls=new Map();
 const history=document.getElementById("clubChatHistory");
 const count=document.getElementById("clubPlayerCount");
 const form=document.getElementById("clubChatForm"),input=document.getElementById("clubChatInput");
 const micButton=document.getElementById("clubMic");
 const chatToggle=document.getElementById("clubChatToggle");
 const pane=document.getElementById("clubSocialPanel");
 let socket=null,selfId="",stream=null,micEnabled=false,active=false,lastSend=0,reconnectHandle=null;
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
  const g=new THREE.Group(),fabric=new THREE.MeshStandardMaterial({color:color(p.id),roughness:.82}),skin=new THREE.MeshStandardMaterial({color:0xd5a076});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.28,.83,4,8),fabric);body.position.y=1.08;g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.25,14,10),skin);head.position.y=1.89;g.add(head);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.258,12,8,0,Math.PI*2,0,1.1),new THREE.MeshStandardMaterial({color:0x2a211c}));hair.position.y=1.95;g.add(hair);
  const legMat=new THREE.MeshStandardMaterial({color:0x27313a});
  for(const x of [-.13,.13]){
   const leg=new THREE.Mesh(new THREE.BoxGeometry(.19,.7,.24),legMat);leg.position.set(x,.39,0);g.add(leg);
  }
  const tag=textSprite(p.name,"#153329");tag.position.y=2.58;tag.scale.set(1.65,.4,1);g.add(tag);
  g.position.set(p.x,0,p.z);g.rotation.y=p.yaw||0;
  scene.add(g);
  const info={...p,group:g,tag,bubble:null,bubbleUntil:0,targetX:p.x,targetZ:p.z,targetYaw:p.yaw||0};
  peers.set(p.id,info);
  return info;
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
 function closePeer(id){const pc=calls.get(id);if(pc){pc.close();calls.delete(id);}const el=document.getElementById("voice-"+id);if(el)el.remove();}
 function stopAllCalls(){for(const id of [...calls.keys()])closePeer(id);}
 function updateMicButton(){
  micButton.textContent=micEnabled?"🎤 Mic on — click to mute":"🎙 Enable microphone";
  micButton.setAttribute("aria-pressed",String(micEnabled));
 }
 async function ensureCall(p,initiator){
  if(!micEnabled||!stream||!p?.voice||p.zone!==zoneAt(camera.position.x,camera.position.z)||calls.has(p.id))return;
  const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
  calls.set(p.id,pc);
  stream.getTracks().forEach(t=>pc.addTrack(t,stream));
  pc.onicecandidate=e=>{if(e.candidate)send({type:"signal",to:p.id,kind:"ice",payload:e.candidate.toJSON()});};
  pc.ontrack=e=>{
   let audio=document.getElementById("voice-"+p.id);
   if(!audio){audio=document.createElement("audio");audio.id="voice-"+p.id;audio.autoplay=true;audio.playsInline=true;document.getElementById("clubAudioStreams").append(audio);}
   audio.srcObject=e.streams[0];audio.play().catch(()=>{});
  };
  pc.onconnectionstatechange=()=>{if(["failed","closed","disconnected"].includes(pc.connectionState))closePeer(p.id);};
  if(initiator){const offer=await pc.createOffer();await pc.setLocalDescription(offer);send({type:"signal",to:p.id,kind:"offer",payload:pc.localDescription.toJSON()});}
  return pc;
 }
 async function handleSignal(data){
  if(!micEnabled||!stream)return;const p=peers.get(data.from);
  if(!p||!p.voice||p.zone!==zoneAt(camera.position.x,camera.position.z))return;
  try{
   let pc=calls.get(p.id);
   if(data.kind==="offer"){
    if(pc)closePeer(p.id);
    pc=await ensureCall(p,false);if(!pc)return;
    await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    send({type:"signal",to:p.id,kind:"answer",payload:pc.localDescription.toJSON()});
   }else if(data.kind==="answer"&&pc){await pc.setRemoteDescription(new RTCSessionDescription(data.payload));}
   else if(data.kind==="ice"&&pc&&pc.remoteDescription){await pc.addIceCandidate(new RTCIceCandidate(data.payload));}
  }catch(e){console.warn("Voice connection error",e);closePeer(data.from);}
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
   micEnabled=true;updateMicButton();send({type:"voice",enabled:true});
   for(const p of peers.values())if(p.voice&&selfId<p.id)ensureCall(p,true).catch(console.warn);
   append("","Microphone enabled for players in the same room",true);
  }catch(err){append("","Microphone permission denied or unavailable",true);}
 });
 function stopMic(){
  micEnabled=false;send({type:"voice",enabled:false});stopAllCalls();
  stream?.getTracks().forEach(t=>t.stop());stream=null;updateMicButton();
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
