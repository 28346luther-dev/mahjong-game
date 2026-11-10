/* Three-second, permission-based Mahjong claim reactions.
   A camera is requested only after the claimant accepts. No continuous streams,
   STUN, TURN, WebRTC subscriptions or background recording.
   Clips pass through the existing room WebSocket and are not stored server-side. */
(()=>{
 const $=id=>document.getElementById(id);
 const MAX_BYTES=250000,CHUNK_BYTES=6000,MAX_CHUNKS=56,RECORD_MS=3000;
 let socket=null,myId=null,epoch=0,lastEvent=null,pendingEvent=null,stream=null,recorder=null;
 let countdown=null,recordTimeout=null,playTimeout=null,videoUrl=null,busy=false;
 const incoming=new Map();
 const connected=()=>socket?.readyState===WebSocket.OPEN;
 const send=msg=>{if(!connected())throw Error("Table disconnected");socket.send(JSON.stringify(msg));};
 const status=text=>{if($("reactionCameraNote"))$("reactionCameraNote").textContent=text;};
 function hidePrompt(){
  $("reactionConsent")?.classList.add("hidden");pendingEvent=null;
 }
 function stopCapture(){
  clearInterval(countdown);clearTimeout(recordTimeout);countdown=null;recordTimeout=null;
  if(recorder?.state==="recording")try{recorder.stop();}catch{}
  recorder=null;
  stream?.getTracks().forEach(t=>t.stop());stream=null;
  const preview=$("reactionCameraPreview");if(preview){preview.pause();preview.srcObject=null;preview.classList.add("hidden");}
 }
 function closePlayback(){
  clearTimeout(playTimeout);
  const overlay=$("reactionOverlay"),v=$("reactionVideo");
  overlay?.classList.add("hidden");
  if(v){v.pause();v.srcObject=null;v.removeAttribute("src");v.onended=null;}
  if(videoUrl){URL.revokeObjectURL(videoUrl);videoUrl=null;}
 }
 function stop(){
  epoch++;stopCapture();hidePrompt();closePlayback();incoming.clear();
  socket=null;myId=null;busy=false;
  status("Your camera is off. A three-second reaction is recorded only if you choose to submit one.");
 }
 function attach(ws,id){
  stop();socket=ws;myId=id;
 }
 function reaction(event){
  if(!event?.id||event.id===lastEvent)return;
  lastEvent=event.id;
  // Never prompt for old claims after rejoining or refreshing.
  if(event.playerId!==myId||Date.now()-Number(event.at)>18000||busy)return;
  if(!["pong","chow","mahjong"].includes(event.claim))return;
  pendingEvent={id:event.id,claim:event.claim,at:event.at};
  $("reactionConsentTitle").textContent="Nice "+event.claim.toUpperCase()+"!";
  $("reactionConsentDetail").textContent="Record a 3-second video reaction and send it to the other players at your table? Your camera will turn off immediately afterward.";
  $("reactionConsent").classList.remove("hidden");
  status("Your move is confirmed. Choose Record reaction or Skip.");
 }
 function skip(){
  hidePrompt();status("Reaction skipped. Your camera remains off.");
 }
 function preferredMime(){
  if(!window.MediaRecorder)return null;
  return ["video/webm;codecs=vp8","video/webm","video/mp4"].find(type=>MediaRecorder.isTypeSupported(type))||"";
 }
 async function capture(){
  if(!pendingEvent||busy)return;
  const event=pendingEvent;hidePrompt();busy=true;const generation=epoch;
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
   status("This browser cannot record short camera clips.");busy=false;return;
  }
  try{
   stream=await navigator.mediaDevices.getUserMedia({
    video:{facingMode:"user",width:{ideal:320},height:{ideal:240},frameRate:{ideal:12,max:15}},
    audio:false
   });
   if(generation!==epoch){stopCapture();busy=false;return;}
   const preview=$("reactionCameraPreview");preview.srcObject=stream;preview.muted=true;
   preview.classList.remove("hidden");preview.play().catch(()=>{});
   const mime=preferredMime();
   const chunks=[];
   recorder=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:140000}:{videoBitsPerSecond:140000});
   const recording=recorder;
   let seconds=3;
   status("Recording reaction — 3 seconds");
   countdown=setInterval(()=>{seconds=Math.max(0,seconds-1);status("Recording reaction — "+seconds+" seconds");},1000);
   const finished=new Promise((resolve,reject)=>{
    recording.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
    recording.onerror=()=>reject(Error("Recording failed"));
    recording.onstop=()=>resolve(new Blob(chunks,{type:recording.mimeType||"video/webm"}));
   });
   recording.start(300);
   recordTimeout=setTimeout(()=>{if(recording.state==="recording")recording.stop();},RECORD_MS);
   const blob=await finished;
   // Stop the real camera before doing any network work.
   stopCapture();
   if(generation!==epoch){busy=false;return;}
   if(blob.size<250||blob.size>MAX_BYTES){
    status("Reaction clip too large or empty. Your camera is off; please try next claim.");
   }else{
    status("Sending your 3-second reaction to other players…");
    await transmit(event,blob,generation);
    if(generation===epoch)status("Reaction sent. Your camera is off.");
   }
  }catch(e){
   stopCapture();status(e?.name==="NotAllowedError"?"Camera permission declined. Nothing was sent.":
     "Unable to capture or send this reaction. Your camera is off.");
  }finally{if(generation===epoch)busy=false;}
 }
 async function transmit(event,blob,generation){
  if(!connected())throw Error("Room is disconnected");
  const raw=new Uint8Array(await blob.arrayBuffer());
  if(raw.length>MAX_BYTES)throw Error("Clip too big");
  const chunks=Math.ceil(raw.length/CHUNK_BYTES);
  if(chunks>MAX_CHUNKS)throw Error("Too many clip chunks");
  const mime=blob.type.split(";")[0];
  if(!["video/webm","video/mp4"].includes(mime))throw Error("Unsupported format");
  send({action:"reactionClipStart",eventId:event.id,mime,chunks});
  for(let index=0;index<chunks;index++){
   if(generation!==epoch||!connected())throw Error("Disconnected");
   const bytes=raw.subarray(index*CHUNK_BYTES,(index+1)*CHUNK_BYTES);
   let binary="";for(const b of bytes)binary+=String.fromCharCode(b);
   // One message per chunk; keep the websocket buffer small on slower connections.
   while(socket.bufferedAmount>75000){
    await new Promise(resolve=>setTimeout(resolve,60));
    if(generation!==epoch||!connected())throw Error("Disconnected");
   }
   send({action:"reactionClipChunk",eventId:event.id,index,data:btoa(binary)});
  }
  send({action:"reactionClipEnd",eventId:event.id});
 }
 function handle(msg){
  if(msg.type==="reactionClipAccepted"){status("Reaction delivered to the table. Camera off.");return;}
  if(msg.type==="reactionClipAbort"){incoming.delete(msg.eventId);return;}
  if(msg.type==="reactionClipStart"){
   if(!["video/webm","video/mp4"].includes(String(msg.mime).split(";")[0])||
      !Number.isInteger(msg.chunks)||msg.chunks<1||msg.chunks>MAX_CHUNKS||
      msg.from===myId)return;
   if(incoming.size>=3)incoming.delete(incoming.keys().next().value);
   incoming.set(msg.eventId,{from:msg.from,name:String(msg.name||"Player").slice(0,30),
    claim:String(msg.claim||"").toUpperCase(),mime:msg.mime,expected:msg.chunks,next:0,total:0,chunks:[],created:Date.now()});
   return;
  }
  const transfer=incoming.get(msg.eventId);
  if(!transfer||Date.now()-transfer.created>35000){incoming.delete(msg.eventId);return;}
  if(msg.type==="reactionClipChunk"){
   if(msg.index!==transfer.next||typeof msg.data!=="string"||msg.data.length>12000){
    incoming.delete(msg.eventId);return;
   }
   try{
    const binary=atob(msg.data);
    transfer.total+=binary.length;
    if(transfer.total>MAX_BYTES)throw Error("Clip too large");
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    transfer.chunks.push(bytes);transfer.next++;
   }catch{incoming.delete(msg.eventId);}
   return;
  }
  if(msg.type==="reactionClipEnd"){
   incoming.delete(msg.eventId);
   if(transfer.next!==transfer.expected)return;
   const clip=new Blob(transfer.chunks,{type:transfer.mime});
   playback(transfer,clip);
  }
 }
 function playback(transfer,clip){
  closePlayback();
  const overlay=$("reactionOverlay"),video=$("reactionVideo");
  $("reactionFeedLabel").textContent="3-SECOND PLAYER REACTION";
  $("reactionAction").textContent=transfer.claim+"!";
  $("reactionName").textContent=transfer.name;
  $("reactionFallback").classList.add("hidden");
  video.classList.remove("hidden");
  video.muted=true;video.playsInline=true;
  videoUrl=URL.createObjectURL(clip);
  video.src=videoUrl;
  overlay.classList.remove("hidden");
  video.onended=()=>{playTimeout=setTimeout(closePlayback,1500);};
  video.play().catch(()=>{
   $("reactionFallback").textContent="Tap play to watch this player's reaction.";
   $("reactionFallback").classList.remove("hidden");video.controls=true;
  });
  playTimeout=setTimeout(closePlayback,12000);
 }
 $("reactionAccept")?.addEventListener("click",capture);
 $("reactionSkip")?.addEventListener("click",skip);
 $("reactionClose")?.addEventListener("click",closePlayback);
 window.addEventListener("beforeunload",stop);
 window.MahjongReactionCam={attach,handle,reaction,stop};
})();
