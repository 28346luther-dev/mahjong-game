/* Opt-in peer-to-peer reaction camera for live Mahjong claims.
 * Camera/video is shared only after the player chooses "Enable reaction camera".
 * No recordings, uploads, or persistent storage.
 */
(()=>{
 const $=id=>document.getElementById(id);
 let ws=null,myId=null,room=null,localStream=null,enabled=false;
 const pcs=new Map(),remoteStreams=new Map(),names=new Map(),publishers=new Set(),recorders=new Map(),iceQueue=new Map();
 let lastReactionId=null,overlayTimer=null,replayUrl=null;
 const canSend=()=>ws?.readyState===WebSocket.OPEN;
 const send=obj=>{if(canSend())ws.send(JSON.stringify(obj));};
 function message(text){const note=$("reactionCameraNote");if(note)note.textContent=text;}
 function refreshButton(){
  const btn=$("reactionCameraToggle");if(!btn)return;
  btn.textContent=enabled?"Turn camera off":"Enable reaction camera";
  btn.setAttribute("aria-pressed",String(enabled));
  const preview=$("reactionCameraPreview");
  if(preview){preview.classList.toggle("hidden",!enabled);preview.srcObject=enabled?localStream:null;}
 }
 function stopRecording(id){
   const item=recorders.get(id);if(!item)return;
   item.active=false;clearTimeout(item.timer);recorders.delete(id);
   if(item.recorder.state!=="inactive")try{item.recorder.stop();}catch{}
   item.lastClip=null;item.chunks=[];
 }
 function startRecording(id,stream){
   stopRecording(id);
   // Each recording is at most four seconds and exists only in browser memory.
   if(!window.MediaRecorder||!stream?.getVideoTracks().length)return;
   const item={active:true,stream,recorder:null,chunks:[],lastClip:null,timer:null,startedAt:0};
   recorders.set(id,item);
   function cycle(){
     if(!item.active||!item.stream.getVideoTracks().some(t=>t.readyState==="live"))return;
     try{
       const mime=["video/webm;codecs=vp8","video/webm","video/mp4"].find(t=>MediaRecorder.isTypeSupported(t));
       const rec=new MediaRecorder(item.stream,mime?{mimeType:mime,videoBitsPerSecond:350000}:undefined);
       item.recorder=rec;item.chunks=[];item.startedAt=Date.now();
       rec.ondataavailable=e=>{if(e.data?.size)item.chunks.push(e.data);};
       rec.onstop=()=>{
         const clip=item.chunks.length?new Blob(item.chunks,{type:rec.mimeType}):null;
         if(item.active&&clip?.size>600)item.lastClip=clip;
         if(item.active){
           if($("reactionOverlay")?.dataset.playerId===id&&
              !$("reactionOverlay").classList.contains("hidden")&&item.replayRequested){
             item.replayRequested=false;
             playClip(id,clip?.size>600?clip:item.lastClip);
           }
           cycle();
         }
       };
       rec.start();
       item.timer=setTimeout(()=>{if(rec.state==="recording")rec.stop();},4000);
     }catch(err){item.active=false;recorders.delete(id);}
   }
   cycle();
 }
 function releaseReplay(){
   const v=$("reactionVideo");
   v.onended=null;
   if(replayUrl){URL.revokeObjectURL(replayUrl);replayUrl=null;}
   v.removeAttribute("src");
 }
 function playClip(id,blob){
   if(!blob||$("reactionOverlay")?.dataset.playerId!==id||
      $("reactionOverlay").classList.contains("hidden"))return;
   const video=$("reactionVideo");
   releaseReplay();
   video.pause();video.srcObject=null;replayUrl=URL.createObjectURL(blob);
   video.src=replayUrl;video.classList.remove("hidden");$("reactionFallback").classList.add("hidden");
   $("reactionFeedLabel").textContent="REACTION REPLAY · last moments";
   video.onended=()=>{releaseReplay();showStream(id);};
   video.play().catch(()=>{releaseReplay();showStream(id);});
 }
 function requestReplay(id){
   const item=recorders.get(id);
   if(!item)return;
   if(item.recorder?.state==="recording"){
     item.replayRequested=true;
     clearTimeout(item.timer);
     try{item.recorder.stop();}catch{item.replayRequested=false;}
   }else playClip(id,item.lastClip);
 }
 function closePeer(id){
  const pc=pcs.get(id);if(pc){pc.ontrack=null;pc.close();pcs.delete(id);}
  const stream=remoteStreams.get(id);if(stream)for(const t of stream.getTracks())t.stop();
  remoteStreams.delete(id);stopRecording(id);iceQueue.delete(id);
 }
 function clearOverlay(){
  clearTimeout(overlayTimer);
  const overlay=$("reactionOverlay");
  if(!overlay)return;
  overlay.classList.add("hidden");
  const video=$("reactionVideo");video.pause();video.srcObject=null;releaseReplay();
 }
 function stopCamera(){
  if(enabled)send({action:"cameraStatus",enabled:false});
  enabled=false;
  localStream?.getTracks().forEach(track=>track.stop());localStream=null;
  for(const id of [...pcs.keys()])closePeer(id);
  for(const id of [...recorders.keys()])stopRecording(id);
  publishers.clear();refreshButton();clearOverlay();message("Your camera is off. Turn it on only if you want other players to see your reactions.");
 }
 function makePC(id,publisher){
  if(pcs.has(id))closePeer(id);
  const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
  pcs.set(id,pc);
  pc.onicecandidate=e=>{if(e.candidate)send({action:"cameraSignal",to:id,kind:"ice",payload:e.candidate.toJSON()});};
  if(publisher&&localStream)for(const track of localStream.getVideoTracks())pc.addTrack(track,localStream);
  if(!publisher)pc.addTransceiver("video",{direction:"recvonly"});
  pc.ontrack=e=>{
    const stream=e.streams[0]||new MediaStream([e.track]);
    remoteStreams.set(id,stream);startRecording(id,stream);
    if($("reactionOverlay")?.dataset.playerId===id&& !$("reactionOverlay").classList.contains("hidden"))
      showStream(id);
  };
  pc.onconnectionstatechange=()=>{if(["failed","closed"].includes(pc.connectionState))closePeer(id);};
  return pc;
 }
 async function offerTo(id){
  if(!enabled||!localStream||id===myId||!canSend())return;
  try{
    const pc=makePC(id,true);
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    send({action:"cameraSignal",to:id,kind:"offer",payload:pc.localDescription.toJSON()});
  }catch(err){console.warn("Reaction camera offer failed",err);closePeer(id);}
 }
 async function signal(data){
  if(!data.from||!data.payload)return;
  try{
    let pc=pcs.get(data.from);
    if(data.kind==="offer"){
      pc=makePC(data.from,false);
      await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
      for(const candidate of iceQueue.get(data.from)||[])
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      iceQueue.delete(data.from);
      const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
      send({action:"cameraSignal",to:data.from,kind:"answer",payload:pc.localDescription.toJSON()});
    }else if(data.kind==="answer"&&pc){
      await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
      for(const candidate of iceQueue.get(data.from)||[])
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      iceQueue.delete(data.from);
    }else if(data.kind==="ice"){
      if(pc?.remoteDescription)await pc.addIceCandidate(new RTCIceCandidate(data.payload));
      else{
        const pending=iceQueue.get(data.from)||[];
        if(pending.length<64)pending.push(data.payload);
        iceQueue.set(data.from,pending);
      }
    }
  }catch(err){console.warn("Reaction camera negotiation failed",err);closePeer(data.from);}
 }
 function showStream(id){
  releaseReplay();$("reactionFeedLabel").textContent="LIVE TABLE REACTION";
  const v=$("reactionVideo"),fallback=$("reactionFallback");
  const stream=id===myId?localStream:remoteStreams.get(id);
  if(stream&&stream.getVideoTracks().some(t=>t.readyState==="live")){
    v.srcObject=stream;v.classList.remove("hidden");fallback.classList.add("hidden");
    v.play().catch(()=>{});
  }else{
    v.pause();v.srcObject=null;v.classList.add("hidden");fallback.classList.remove("hidden");
    fallback.textContent="Camera unavailable — only players who opt in are shown.";
  }
 }
 function reaction(event){
  if(!event||!event.id||event.id===lastReactionId)return;
  lastReactionId=event.id;
  // Do not replay old claims on refresh/rejoin.
  if(Date.now()-Number(event.at)>14000)return;
  const overlay=$("reactionOverlay");
  const label=String(event.claim||"").toUpperCase();
  if(!["PONG","CHOW","MAHJONG"].includes(label))return;
  overlay.dataset.playerId=event.playerId;
  $("reactionAction").textContent=label+"!";
  $("reactionName").textContent=event.playerName||names.get(event.playerId)||"Player";
  overlay.classList.remove("hidden");
  showStream(event.playerId);
  requestReplay(event.playerId);
  clearTimeout(overlayTimer);
  overlayTimer=setTimeout(clearOverlay,9500);
 }
 async function enable(){
  if(enabled){stopCamera();return;}
  if(!canSend()){message("Join a Mahjong table first.");return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){message("This browser does not support camera sharing.");return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:640},height:{ideal:480},frameRate:{ideal:20,max:24}},audio:false});
    localStream=stream;enabled=true;startRecording(myId,stream);
    for(const track of stream.getVideoTracks())track.onended=stopCamera;
    send({action:"cameraStatus",enabled:true});
    refreshButton();
    message("Camera on. Others at this table can see your live video and a short temporary reaction replay. Turn it off any time; no files are saved.");
  }catch(err){message("Camera permission was declined or your camera is unavailable.");}
 }
 function handle(data){
  if(data.type==="cameraPeers"){
    names.clear();publishers.clear();
    for(const p of data.players||[]){
      names.set(p.id,p.name);
      if(p.enabled&&p.id!==myId){
        publishers.add(p.id);
        send({action:"cameraSubscribe",to:p.id});
      }
    }
  }
  if(data.type==="cameraStatus"){
    if(data.id===myId)return;
    if(data.enabled){publishers.add(data.id);send({action:"cameraSubscribe",to:data.id});}
    else{publishers.delete(data.id);closePeer(data.id);}
  }
  if(data.type==="cameraSubscribe"&&enabled&&data.from!==myId)offerTo(data.from);
  if(data.type==="cameraSignal")signal(data);
 }
 function attach(socket,id,code){
  stopCamera();ws=socket;myId=id;room=code;lastReactionId=null;
  message("Camera off by default. Only enable it if you want other players to see your reactions.");
 }
 function stop(){stopCamera();ws=null;myId=null;room=null;names.clear();}
 $("reactionCameraToggle")?.addEventListener("click",enable);
 $("reactionClose")?.addEventListener("click",clearOverlay);
 window.addEventListener("beforeunload",stopCamera);
 window.MahjongReactionCam={attach,handle,reaction,stop};
})();
