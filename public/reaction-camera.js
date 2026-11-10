/* Opt-in Mahjong webcams: peer-to-peer live gallery and claim reaction replay.
   No video is uploaded to the Worker; optional <=4s replay buffers live in browser memory. */
(()=>{
 const $=id=>document.getElementById(id);
 const peers=new Map(),names=new Map(),publishers=new Set();
 let socket=null,myId=null,localStream=null,enabled=false,iceConfig=null,icePromise=null,epoch=0;
 let lastReactionId=null,overlayTimer=null,replayUrl=null,expanded=false,failedPeers=new Set();
 const fallbackIce=[{urls:["stun:stun.cloudflare.com:3478","stun:stun.l.google.com:19302"]}];
 const open=()=>socket?.readyState===WebSocket.OPEN;
 const send=obj=>{if(open())socket.send(JSON.stringify(obj));};
 const note=text=>{if($("reactionCameraNote"))$("reactionCameraNote").textContent=text;};
 const publisherName=id=>names.get(id)||"Player";
 async function ice(){
  if(iceConfig)return iceConfig;
  if(icePromise)return icePromise;
  icePromise=(async()=>{
   try{
    const response=await fetch("/api/rtc/ice",{credentials:"same-origin",cache:"no-store"});
    if(!response.ok)throw Error("ICE unavailable");
    const data=await response.json();
    if(!Array.isArray(data.iceServers)||!data.iceServers.length)throw Error("Missing servers");
    iceConfig={iceServers:data.iceServers,relayAvailable:!!data.relayAvailable};
   }catch{iceConfig={iceServers:fallbackIce,relayAvailable:false};}
   return iceConfig;
  })();return icePromise;
 }
 function button(){
  const b=$("reactionCameraToggle"),preview=$("reactionCameraPreview");
  if(b){b.textContent=enabled?"Turn camera off":"Enable reaction camera";b.setAttribute("aria-pressed",String(enabled));}
  if(preview){preview.classList.toggle("hidden",!enabled);preview.srcObject=enabled?localStream:null;}
 }
 function member(id){
  if(!peers.has(id))peers.set(id,{id,pc:null,stream:null,status:"Connecting…",candidates:[],queue:Promise.resolve(),rec:null,clip:null});
  return peers.get(id);
 }
 function stopRecord(peer){
  const item=peer?.rec;if(!item)return;
  item.active=false;clearTimeout(item.timer);
  if(item.recorder?.state==="recording")try{item.recorder.stop();}catch{}
  peer.rec=null;peer.clip=null;
 }
 function record(peer,stream){
  stopRecord(peer);
  if(!window.MediaRecorder||!stream?.getVideoTracks().length)return;
  const item={active:true,recorder:null,timer:null,replay:false};peer.rec=item;
  const current=epoch;
  function cycle(){
   if(!item.active||current!==epoch||!stream.getVideoTracks().some(t=>t.readyState==="live"))return;
   try{
    const mime=["video/webm;codecs=vp8","video/webm","video/mp4"].find(t=>MediaRecorder.isTypeSupported(t));
    const recorder=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:350000}:{videoBitsPerSecond:350000});
    const chunks=[];item.recorder=recorder;
    recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
    recorder.onstop=()=>{
     const clip=chunks.length?new Blob(chunks,{type:recorder.mimeType}):null;
     if(item.active&&clip?.size>600)peer.clip=clip;
     if(item.active&&item.replay){item.replay=false;playClip(peer.id,clip?.size>600?clip:peer.clip);}
     if(item.active)cycle();
    };
    recorder.start();
    item.timer=setTimeout(()=>{if(recorder.state==="recording")recorder.stop();},3800);
   }catch{item.active=false;peer.rec=null;}
  }
  cycle();
 }
 function releaseClip(){
  const video=$("reactionVideo");if(video)video.onended=null;
  if(replayUrl){URL.revokeObjectURL(replayUrl);replayUrl=null;}
  video?.removeAttribute("src");
 }
 function showFeed(id){
  const video=$("reactionVideo"),fallback=$("reactionFallback");
  if(!video||!fallback)return;
  releaseClip();$("reactionFeedLabel").textContent="LIVE TABLE REACTION";
  const stream=id===myId?localStream:peers.get(id)?.stream;
  if(stream?.getVideoTracks().some(t=>t.readyState==="live")){
   video.srcObject=stream;video.classList.remove("hidden");fallback.classList.add("hidden");
   video.play().catch(()=>{});
  }else{
   video.pause();video.srcObject=null;video.classList.add("hidden");fallback.classList.remove("hidden");
   fallback.textContent=publishers.has(id)?"Player camera is connecting…":"This player has their camera turned off.";
  }
 }
 function playClip(id,blob){
  if(!blob||$("reactionOverlay")?.classList.contains("hidden")||$("reactionOverlay")?.dataset.playerId!==id)return;
  const video=$("reactionVideo");
  releaseClip();video.pause();video.srcObject=null;
  replayUrl=URL.createObjectURL(blob);video.src=replayUrl;
  video.classList.remove("hidden");$("reactionFallback").classList.add("hidden");
  $("reactionFeedLabel").textContent="REACTION REPLAY · last moments";
  video.onended=()=>{releaseClip();showFeed(id);};
  video.play().catch(()=>{releaseClip();showFeed(id);});
 }
 function requestReplay(id){
  const peer=peers.get(id);if(!peer?.rec)return;
  if(peer.rec.recorder?.state==="recording"){
   peer.rec.replay=true;clearTimeout(peer.rec.timer);
   try{peer.rec.recorder.stop();}catch{peer.rec.replay=false;}
  }else playClip(id,peer.clip);
 }
 function hideOverlay(){
  clearTimeout(overlayTimer);$("reactionOverlay")?.classList.add("hidden");
  const video=$("reactionVideo");if(video){video.pause();video.srcObject=null;}
  releaseClip();
 }
 function removePeer(id){
  const peer=peers.get(id);if(!peer)return;
  stopRecord(peer);
  if(peer.pc){peer.pc.ontrack=null;peer.pc.onicecandidate=null;peer.pc.onconnectionstatechange=null;peer.pc.close();}
  peers.delete(id);
  updateGallery();
 }
 function updateGallery(){
  const gallery=$("reactionCameraGallery"),count=$("reactionCameraCount"),toggle=$("reactionCameraGalleryToggle");
  if(!gallery||!toggle)return;
  const active=[...publishers].filter(id=>id!==myId);
  toggle.classList.toggle("hidden",!active.length);
  if(count)count.textContent=active.length+" live";
  gallery.classList.toggle("hidden",!expanded||!active.length);
  const existing=new Map([...gallery.children].map(e=>[e.dataset.playerId,e]));
  for(const id of active){
   let card=existing.get(id);
   if(!card){
    card=document.createElement("div");card.className="reaction-peer";card.dataset.playerId=id;
    const video=document.createElement("video");video.className="reaction-peer-video";video.autoplay=true;video.muted=true;video.playsInline=true;
    const placeholder=document.createElement("div");placeholder.className="reaction-peer-placeholder";
    const title=document.createElement("strong");title.className="reaction-peer-name";
    const status=document.createElement("span");status.className="reaction-peer-status";
    card.append(video,placeholder,title,status);gallery.append(card);
   }
   const peer=peers.get(id),stream=peer?.stream;
   const video=card.querySelector("video"),placeholder=card.querySelector(".reaction-peer-placeholder");
   card.querySelector("strong").textContent=publisherName(id);
   card.querySelector(".reaction-peer-status").textContent=peer?.status||"Connecting…";
   if(stream?.getVideoTracks().some(t=>t.readyState==="live")){
    if(video.srcObject!==stream)video.srcObject=stream;
    video.classList.remove("hidden");placeholder.classList.add("hidden");video.play().catch(()=>{});
   }else{
    video.srcObject=null;video.classList.add("hidden");placeholder.classList.remove("hidden");
    placeholder.textContent=peer?.status||"Connecting…";
   }
  }
  for(const [id,card] of existing)if(!active.includes(id)){card.querySelector("video").srcObject=null;card.remove();}
 }
 async function startPeer(id,publish=false){
  if(id===myId||!open())return null;
  const peer=member(id);
  if(peer.pc&&peer.pc.signalingState!=="closed")return peer.pc;
  const current=epoch,config=await ice();
  if(current!==epoch||!open())return null;
  const pc=new RTCPeerConnection({iceServers:config.iceServers});
  peer.pc=pc;peer.status="Connecting…";
  pc.onicecandidate=e=>{if(e.candidate)send({action:"cameraSignal",to:id,kind:"ice",payload:e.candidate.toJSON()});};
  pc.ontrack=e=>{
   peer.stream=e.streams[0]||new MediaStream([e.track]);
   peer.status="Live";failedPeers.delete(id);record(peer,peer.stream);updateGallery();
   if($("reactionOverlay")?.dataset.playerId===id&&!$("reactionOverlay").classList.contains("hidden"))showFeed(id);
  };
  pc.onconnectionstatechange=()=>{
   if(peer.pc!==pc)return;
   peer.status=pc.connectionState==="connected"?"Live":pc.connectionState;
   updateGallery();
   if(pc.connectionState==="failed"){
    peer.status=config.relayAvailable?"Video connection failed":"TURN relay not configured";
    failedPeers.add(id);
    updateGallery();note(config.relayAvailable?"Video connection failed. Tap Retry cameras.":"Live video needs the Cloudflare TURN relay enabled. After setup, tap Retry cameras.");
    removePeer(id);
    if(config.relayAvailable&&publishers.has(id)&&open())setTimeout(()=>send({action:"cameraSubscribe",to:id}),3500);
   }
  };
  if(publish&&localStream){
   for(const track of localStream.getVideoTracks())pc.addTrack(track,localStream);
  }else pc.addTransceiver("video",{direction:"recvonly"});
  updateGallery();return pc;
 }
 async function offerTo(id){
  if(!enabled||!localStream)return;
  // A subscription request may repeat; ignore duplicate negotiations.
  const existing=peers.get(id)?.pc;
  if(existing&&existing.signalingState!=="closed")return;
  const pc=await startPeer(id,true);if(!pc)return;
  try{const offer=await pc.createOffer();await pc.setLocalDescription(offer);
   send({action:"cameraSignal",to:id,kind:"offer",payload:pc.localDescription.toJSON()});
  }catch(e){note("Could not start video connection.");removePeer(id);}
 }
 async function drain(peer){
  if(!peer.pc?.remoteDescription)return;
  for(const candidate of peer.candidates.splice(0))
   try{await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));}catch{}
 }
 function signal(data){
  if(!data.from||!data.payload)return;
  const peer=member(data.from),current=epoch;
  peer.queue=peer.queue.then(async()=>{
   if(current!==epoch||!open())return;
   if(data.kind==="ice"){
    if(peer.pc?.remoteDescription){
     try{await peer.pc.addIceCandidate(new RTCIceCandidate(data.payload));}catch{}
    }else if(peer.candidates.length<70)peer.candidates.push(data.payload);
    return;
   }
   if(data.kind==="offer"){
    if(peer.pc){const old=peer.pc;peer.pc=null;old.close();}
    const pc=await startPeer(data.from,false);if(!pc)return;
    await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
    await drain(peer);
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    send({action:"cameraSignal",to:data.from,kind:"answer",payload:pc.localDescription.toJSON()});
   }else if(data.kind==="answer"&&peer.pc){
    await peer.pc.setRemoteDescription(new RTCSessionDescription(data.payload));
    await drain(peer);
   }
  }).catch(err=>{console.warn("Camera signaling",err);peer.status="Camera negotiation failed";updateGallery();});
 }
 function disable(){
  if(enabled)send({action:"cameraStatus",enabled:false});
  enabled=false;localStream?.getTracks().forEach(t=>t.stop());localStream=null;
  const self=peers.get(myId);if(self)stopRecord(self);
  for(const id of [...peers.keys()])removePeer(id);
  publishers.clear();hideOverlay();button();updateGallery();
  note("Camera off. Other players cannot view your video.");
 }
 async function enable(){
  if(enabled){disable();return;}
  if(!open()){note("Wait for the Mahjong room to reconnect.");return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){note("Camera sharing is unavailable in this browser.");return;}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:640},height:{ideal:480},frameRate:{ideal:20,max:24}},audio:false});
   localStream=stream;enabled=true;
   for(const track of stream.getVideoTracks())track.onended=()=>{if(enabled)disable();};
   const self=member(myId);record(self,stream);
   send({action:"cameraStatus",enabled:true});
   button();note("Camera is live for other players at this table. You can switch it off at any time.");
  }catch{note("Camera permission was denied or the camera is busy.");}
 }
 function handle(data){
  if(data.type==="cameraPeers"){
   for(const p of data.players||[]){
    names.set(p.id,p.name);
    if(p.id===myId)continue;
    if(p.enabled){publishers.add(p.id);member(p.id);send({action:"cameraSubscribe",to:p.id});}
    else publishers.delete(p.id);
   }
   updateGallery();
  }else if(data.type==="cameraStatus"){
   if(data.id===myId)return;
   if(data.enabled){publishers.add(data.id);member(data.id);send({action:"cameraSubscribe",to:data.id});}
   else{publishers.delete(data.id);removePeer(data.id);}
   updateGallery();
  }else if(data.type==="cameraSubscribe"){
   if(enabled&&data.from!==myId)offerTo(data.from);
  }else if(data.type==="cameraSignal")signal(data);
 }
 function reaction(event){
  if(!event?.id||event.id===lastReactionId)return;
  lastReactionId=event.id;if(Date.now()-Number(event.at)>14000)return;
  const claim=String(event.claim||"").toUpperCase();
  if(!["PONG","CHOW","MAHJONG"].includes(claim))return;
  const overlay=$("reactionOverlay");
  overlay.dataset.playerId=event.playerId;
  $("reactionAction").textContent=claim+"!";
  $("reactionName").textContent=event.playerName||publisherName(event.playerId);
  overlay.classList.remove("hidden");showFeed(event.playerId);
  requestReplay(event.playerId);clearTimeout(overlayTimer);overlayTimer=setTimeout(hideOverlay,9500);
 }
 function retry(){
  if(!open()){note("Reconnect to the Mahjong room first.");return;}
  iceConfig=null;icePromise=null;failedPeers.clear();
  for(const id of [...peers.keys()])removePeer(id);
  for(const id of publishers)if(id!==myId)send({action:"cameraSubscribe",to:id});
  note("Trying camera connections again with the current relay configuration…");
 }
 function attach(ws,id){
  // A reconnect does not silently re-enable the local webcam.
  disable();epoch++;socket=ws;myId=id;iceConfig=null;icePromise=null;lastReactionId=null;
  note("Camera off until enabled. Live feeds from other opt-in players appear under Cameras.");
 }
 function stop(){disable();epoch++;socket=null;myId=null;names.clear();expanded=false;updateGallery();}
 $("reactionCameraToggle")?.addEventListener("click",enable);
 $("reactionClose")?.addEventListener("click",hideOverlay);
 $("reactionCameraRetry")?.addEventListener("click",retry);
 $("reactionCameraGalleryToggle")?.addEventListener("click",()=>{
  expanded=!expanded;
  $("reactionCameraGalleryToggle").setAttribute("aria-expanded",String(expanded));
  updateGallery();
 });
 window.addEventListener("beforeunload",disable);
 window.MahjongReactionCam={attach,handle,reaction,stop};
})();
