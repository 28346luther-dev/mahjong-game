const $=id=>document.getElementById(id);
let roomCode=null,playerId=null,ws=null,state=null,selected=null;
const icons={characters:"萬",bamboo:"索",dots:"筒",wind:"風",dragon:"龍"};
function tileLabel(t){return t.suit==="wind"?({w1:"東",w2:"南",w3:"西",w4:"北"}[t.id]):t.suit==="dragon"?({z1:"中",z2:"發",z3:"白"}[t.id]):`${t.rank}${icons[t.suit]}`;}
async function post(path,data){const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw Error(j.error||"Something went wrong.");return j;}
function showError(id,msg){$(id).textContent=msg||"";}
let reconnectTimer=null,heartbeatTimer=null,reconnectAttempts=0,leavingRoom=false;
function stopTransport(){
 clearTimeout(reconnectTimer);clearInterval(heartbeatTimer);
 reconnectTimer=null;heartbeatTimer=null;
 const old=ws;ws=null;if(old){old.onclose=null;old.onerror=null;old.onmessage=null;try{old.close(1000,"Leaving table");}catch{}}
 window.MahjongReactionCam?.stop();
}
function openSocket(){
 if(!roomCode||!playerId||leavingRoom)return;
 const code=roomCode,id=playerId;
 const scheme=location.protocol==="https:"?"wss:":"ws:";
 const socket=new WebSocket(`${scheme}//${location.host}/ws?code=${encodeURIComponent(code)}&player=${encodeURIComponent(id)}`);
 ws=socket;
 window.MahjongReactionCam?.attach(socket,id,code);
 socket.onopen=()=>{
   if(ws!==socket)return;
   reconnectAttempts=0;showError("roomError","");
   clearInterval(heartbeatTimer);
   // A tiny app-level heartbeat keeps the connection observable and detects stalls.
   heartbeatTimer=setInterval(()=>{
     if(ws===socket&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({action:"heartbeat"}));
   },25000);
 };
 socket.onmessage=e=>{
   if(ws!==socket)return;
   let m;try{m=JSON.parse(e.data);}catch{return;}
   if(m.type==="state"){
     const initialState=!state;
     state=m.state;selected=state.players[state.myIndex]?.hand?.some(t=>t.key===selected)?selected:null;
     render();
     if(!initialState)window.MahjongReactionCam?.reaction(state.reaction);
   }else if(m.type==="error")showError("roomError",m.message);
   else if(m.type!=="heartbeatAck")window.MahjongReactionCam?.handle(m);
 };
 socket.onclose=e=>{
   if(ws!==socket||leavingRoom)return;
   ws=null;clearInterval(heartbeatTimer);heartbeatTimer=null;
   window.MahjongReactionCam?.stop();
   const delay=Math.min(15000,900*2**Math.min(reconnectAttempts++,4))+Math.floor(Math.random()*350);
   showError("roomError","Connection interrupted — reconnecting to this room automatically…");
   reconnectTimer=setTimeout(openSocket,delay);
 };
 socket.onerror=()=>{if(ws===socket)showError("roomError","Connection issue — attempting to restore the table…");};
}
function connect(code,id){
 stopTransport();leavingRoom=false;roomCode=code;playerId=id;
 state=null;selected=null;reconnectAttempts=0;
 $("home").classList.add("hidden");$("room").classList.remove("hidden");$("roomCode").textContent=code;
 openSocket();
 if(window.MahjongClubhouse)window.MahjongClubhouse.disconnect=()=>{
   leavingRoom=true;stopTransport();state=null;selected=null;playerId=null;roomCode=null;
   showError("roomError","");
 };
}
function send(action,extra={}){
 if(ws&&ws.readyState===WebSocket.OPEN){ws.send(JSON.stringify({action,...extra}));return;}
 showError("roomError","Reconnecting to the table — please try that move again in a moment.");
}
async function refreshSessions(){
 const holder=$("sessionGames");if(!holder)return;
 try{
  const response=await fetch("/api/sessions",{credentials:"same-origin",cache:"no-store"});
  if(!response.ok)throw Error("Session listing is unavailable");
  const {sessions=[]}=await response.json();holder.replaceChildren();
  if(!sessions.length){holder.textContent="No active tables yet. Create a room to start the first game.";return;}
  for(const room of sessions){
   const item=document.createElement("div");item.className="session-entry";
   const info=document.createElement("span");
   info.textContent=room.code+" · "+({lobby:"Waiting",playing:"Playing",claim:"Claim window",finished:"Round finished"}[room.phase]||room.phase)+
    " · "+room.players+"/4 seated · "+room.spectators+" watching";
   const btn=document.createElement("button");btn.className="secondary";
   btn.textContent=room.phase==="lobby"&&room.players<4?"Join table":"Spectate / queue";
   btn.onclick=()=>{$("joinCode").value=room.code;$("join").click();};
   item.append(info,btn);holder.append(item);
  }
 }catch(error){holder.textContent=error.message;}
}
$("refreshSessions")?.addEventListener("click",refreshSessions);
refreshSessions();
$("create").onclick=async()=>{try{showError("homeError","");const r=await post("/api/create",{name:$("name").value||"Player 1"});connect(r.code,r.playerId);}catch(e){showError("homeError",e.message);}};
$("join").onclick=async()=>{try{showError("homeError","");const code=$("joinCode").value.toUpperCase();const r=await post("/api/join",{code,name:$("name").value||"Player"});connect(code,r.playerId);}catch(e){showError("homeError",e.message);}};
$("joinCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
$("copy").onclick=async()=>{await navigator.clipboard.writeText(`${location.origin}?room=${roomCode}`);$("copy").textContent="Copied!";setTimeout(()=>$("copy").textContent="Copy invite code",1400);};
$("leave").onclick=()=>{if(window.MahjongClubhouse){window.MahjongClubhouse.returnToLobby();}else{leavingRoom=true;stopTransport();location.href="/";}};
function render(){
 if(!state)return;
 $("wallCount").textContent=`Wall: ${state.wallCount}`;
 $("statusTitle").textContent=state.phase==="lobby"?"Waiting for players":state.phase==="finished"?"Hand complete":state.phase==="claim"?"Claim window":"Game in progress";
 $("statusText").textContent=state.message;
 $("seats").innerHTML=MahjongVisuals.seats(state);
 const queue=$("mahjongQueue");
 if(queue){
  const observers=state.spectatorQueue||[];
  queue.textContent=observers.length
   ?"Spectator lobby ("+observers.length+"): "+observers.map(p=>p.name+(p.ready?" ✓ queued":"")).join(" · ")
   :"Spectator lobby: no one waiting";
 }
 $("mahjongSession").textContent="Round "+(state.round||0)+" · "+state.players.length+"/4 seated · "+(state.spectatorQueue?.length||0)+" spectating";
 $("wallTiles").innerHTML=MahjongVisuals.walls(state);
 $("discards").innerHTML=MahjongVisuals.discards(state);
 $("melds").innerHTML=MahjongVisuals.melds(state);
 const me=state.myIndex>=0?state.players[state.myIndex]:null,hand=me?.hand||[];
 const drawn=state.pendingDraw;
 const drawer=$("drawnTileArea");
 drawer.classList.toggle("hidden",!drawn);
 if(drawn){
   $("drawnTileFace").innerHTML=MahjongVisuals.face(drawn);
   $("drawnTileName").textContent=drawn.name;
 }
 $("hand").innerHTML=hand.map(t=>`<button class="tile ${selected===t.key?'selected':''}" data-key="${t.key}" title="${t.name}">${MahjongVisuals.face(t)}</button>`).join("");
 $("hand").querySelectorAll("button").forEach(b=>b.onclick=()=>{selected=selected===b.dataset.key?null:b.dataset.key;render();});
 const controls=$("controls");controls.innerHTML="";
 const add=(label,action,cls="secondary",extra={})=>{const b=document.createElement("button");b.className=cls;b.textContent=label;b.onclick=()=>send(action,extra);controls.appendChild(b);};
 const note=message=>{const span=document.createElement("span");span.className="empty action-note";span.textContent=message;controls.appendChild(span);};
 if(state.spectator){
   add(state.queuePosition?"Leave next-round queue":"Join next round queue","queueNext",state.queuePosition?"ghost":"primary");
   note(state.queuePosition
    ?"You're #"+state.queuePosition+" in the waiting queue. Watch the current game; when it ends, players can start the next round."
    :"You're spectating. All player hands stay private until dealt to you next round.");
   if(state.phase==="finished"&&state.nextRoundReady>=2)add("Start queued round","nextRound","secondary");
 }else if(state.phase==="lobby"){
   if(state.myIndex===0&&state.players.length>=2)add("Start game","start","primary");
   add(me?.ready?"Not ready":"I'm ready","ready","secondary");
   note(`${state.players.length}/4 players · Start with at least 2 for testing`);
 }else if(state.phase==="playing"&&state.turn===state.myIndex){
   if(state.selfWin)add("Mahjong! (self-draw)","selfWin","primary");
   if(state.pendingDraw){
     add("Keep drawn tile","keepDrawn","secondary");
     add("Discard drawn tile","discardDrawn","primary");
     note("Choose what to do with your drawn tile before it enters your hand.");
   }else if(hand.length%3===2){
     if(selected)add("Discard selected tile","discard","primary",{tileKey:selected});
     else note("Select a tile to discard.");
   }else if(hand.length%3===1)add("Draw tile","draw");
 }else if(state.phase==="claim"){
   if(state.claimSubmitted){note(`Your response is in. Waiting for: ${state.claimWaiting.join(", ")||"the table"}.`);}
   else if((state.claimOptions||[]).length){
     for(const opt of state.claimOptions){
       if(opt==="chow"){
         for(const pair of state.chowChoices||[]){
           const labels=pair.map(key=>{const t=hand.find(x=>x.key===key);return t?tileLabel(t):"?";}).join(" + ");
           add(`Chow ${labels}`,"chow","secondary",{tiles:pair});
         }
       }else add(opt==="mahjong"?"Mahjong!":opt.toUpperCase(),opt,opt==="mahjong"?"primary":"secondary");
     }
     add("Pass","pass","ghost");
     note("Claims resolve by priority: Mahjong, Kong/Pong, then Chow.");
   }else note(`Waiting for claim responses${state.claimWaiting?.length?`: ${state.claimWaiting.join(", ")}`:"..."}`);
 }else if(state.phase==="finished"){
   add(me?.ready?"Sit out next round":"Play next round","nextReady","secondary");
   if(state.nextRoundReady>=2)add("Start next round","nextRound","primary");
   note("Next-round lobby: "+state.nextRoundReady+" players ready · spectators receive seats first, then returning players. Minimum 2, maximum 4.");
 }
 $("turnLabel").textContent=state.spectator?"Spectator view · no private tiles":state.phase==="playing"?(state.turn===state.myIndex?"Your turn":`Waiting for ${state.players[state.turn]?.name||"player"}`):state.phase==="claim"?"Claim window · 18 seconds":"";
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
const params=new URLSearchParams(location.search);if(params.get("room"))$("joinCode").value=params.get("room").toUpperCase();
