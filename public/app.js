const $=id=>document.getElementById(id);
let roomCode=null,playerId=null,ws=null,state=null,selected=null;
const icons={characters:"萬",bamboo:"索",dots:"筒",wind:"風",dragon:"龍"};
function tileLabel(t){return t.suit==="wind"?({w1:"東",w2:"南",w3:"西",w4:"北"}[t.id]):t.suit==="dragon"?({z1:"中",z2:"發",z3:"白"}[t.id]):`${t.rank}${icons[t.suit]}`;}
async function post(path,data){const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw Error(j.error||"Something went wrong.");return j;}
function showError(id,msg){$(id).textContent=msg||"";}
function connect(code,id){roomCode=code;playerId=id;$("home").classList.add("hidden");$("room").classList.remove("hidden");$("roomCode").textContent=code;
 const scheme=location.protocol==="https:"?"wss:":"ws:";ws=new WebSocket(`${scheme}//${location.host}/ws?code=${code}&player=${id}`);
 window.MahjongReactionCam?.attach(ws,id,code);
 ws.onmessage=e=>{
   const m=JSON.parse(e.data);
   if(m.type==="state"){
     const initialState=!state;
     state=m.state;selected=state.players[state.myIndex]?.hand?.some(t=>t.key===selected)?selected:null;
     render();
     if(!initialState)window.MahjongReactionCam?.reaction(state.reaction);
   }
   else if(m.type==="error")showError("roomError",m.message);
   else window.MahjongReactionCam?.handle(m);
 };
 ws.onclose=()=>{window.MahjongReactionCam?.stop();showError("roomError","Connection closed. Refresh to reconnect if needed.");};
 if(window.MahjongClubhouse)window.MahjongClubhouse.disconnect=()=>{
   window.MahjongReactionCam?.stop();if(ws){ws.close();ws=null;}state=null;selected=null;playerId=null;roomCode=null;
   showError("roomError","");
 };
}
function send(action,extra={}){if(ws&&ws.readyState===1)ws.send(JSON.stringify({action,...extra}));}
$("create").onclick=async()=>{try{showError("homeError","");const r=await post("/api/create",{name:$("name").value||"Player 1"});connect(r.code,r.playerId);}catch(e){showError("homeError",e.message);}};
$("join").onclick=async()=>{try{showError("homeError","");const code=$("joinCode").value.toUpperCase();const r=await post("/api/join",{code,name:$("name").value||"Player"});connect(code,r.playerId);}catch(e){showError("homeError",e.message);}};
$("joinCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
$("copy").onclick=async()=>{await navigator.clipboard.writeText(`${location.origin}?room=${roomCode}`);$("copy").textContent="Copied!";setTimeout(()=>$("copy").textContent="Copy invite code",1400);};
$("leave").onclick=()=>{if(window.MahjongClubhouse){window.MahjongClubhouse.returnToLobby();}else{if(ws)ws.close();location.href="/";}};
function render(){
 if(!state)return;
 $("wallCount").textContent=`Wall: ${state.wallCount}`;
 $("statusTitle").textContent=state.phase==="lobby"?"Waiting for players":state.phase==="finished"?"Hand complete":state.phase==="claim"?"Claim window":"Game in progress";
 $("statusText").textContent=state.message;
 $("seats").innerHTML=MahjongVisuals.seats(state);
 $("wallTiles").innerHTML=MahjongVisuals.walls(state);
 $("discards").innerHTML=MahjongVisuals.discards(state);
 $("melds").innerHTML=MahjongVisuals.melds(state);
 const me=state.players[state.myIndex],hand=me?.hand||[];
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
 if(state.phase==="lobby"){
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
   note("The hand has finished. The room can be refreshed to start another table.");
 }
 $("turnLabel").textContent=state.phase==="playing"?(state.turn===state.myIndex?"Your turn":`Waiting for ${state.players[state.turn]?.name||"player"}`):state.phase==="claim"?"Claim window · 18 seconds":"";
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
const params=new URLSearchParams(location.search);if(params.get("room"))$("joinCode").value=params.get("room").toUpperCase();
