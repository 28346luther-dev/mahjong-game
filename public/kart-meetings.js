/* Scheduled multiplayer championship overlay for Velvet Circuit.
 * One global event every 10 minutes. Registration, server-timed qualifying,
 * staggered grid, live rivals and mandatory 10-second pit service.
 */
const $=id=>document.getElementById(id);
const when=id=>new Date(id).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
const fmt=ms=>ms==null?"—":(Math.floor(ms/60000)+":"+String(Math.floor(ms%60000/1000)).padStart(2,"0")+"."+String(ms%1000).padStart(3,"0"));
let open=false,selected=null,snapshot=null,list=[],poller=null,refreshing=false,sending=false;
let phaseEntered=null,raceIdentity=null,serviceUntil=0,serviceRequested=false,serverOffset=0;
async function call(path,body=null){
 const r=await fetch("/api/kart/"+path,{method:body?"POST":"GET",credentials:"same-origin",
  headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined,cache:"no-store"});
 const payload=await r.json();
 if(!r.ok)throw Error(payload.error||"Race server unavailable");
 return payload;
}
const status=s=>{if($("kartMeetingStatus"))$("kartMeetingStatus").textContent=s;};
const countdown=ms=>Math.max(0,Math.ceil(ms/1000));
function timeRemaining(){
 const localRemaining=window.KartRacing?.getLocalPitRemaining?.()||0;
 if(!snapshot){
  $("kartServiceOverlay").classList.toggle("hidden",localRemaining<=0);
  if(localRemaining>0)$("kartServiceCountdown").textContent=(localRemaining/1000).toFixed(1);
  return;
 }
 const now=Date.now()+serverOffset;
 const clock=$("kartMeetingClock");if(clock)clock.textContent=new Date(now).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"});
 const el=$("kartMeetingCountdown");
 if(snapshot.phase==="registration")el.textContent=countdown(snapshot.qualifyingAt-now)+"s until qualifying";
 else if(snapshot.phase==="qualifying")el.textContent=countdown(snapshot.raceAt-now)+"s until grid start";
 else if(snapshot.phase==="grid")el.textContent="GRID · FIVE RED LIGHTS";
 else if(snapshot.phase==="race")el.textContent="10-LAP RACE IN PROGRESS";
 else el.textContent="SESSION COMPLETE";
 const lights=$("kartStartLights");
 const isGrid=snapshot.phase==="grid"&&!!snapshot.you;
 const amount=isGrid?Math.min(5,Math.floor(Math.max(0,now-snapshot.raceAt)/1000)+1):0;
 lights.classList.toggle("hidden",!isGrid);
 [...lights.querySelectorAll(".light-bulb")].forEach((bulb,i)=>bulb.classList.toggle("on",i<amount));
 $("kartLightsText").textContent=amount===5?"HOLD FOR LIGHTS OUT":"FIVE RED LIGHTS";
 const you=snapshot.racers?.find(p=>p.id===snapshot.you);
 const serverRemaining=Math.max(0,(you?.pitUntil||serviceUntil)-now);
 const seconds=Math.max(localRemaining,serverRemaining)/1000;
 const servicing=seconds>0;
 $("kartServiceOverlay").classList.toggle("hidden",!servicing);
 if(servicing)$("kartServiceCountdown").textContent=seconds.toFixed(1);
 const pose=window.KartRacing?.getPose?.();
 const bays=window.KartRacing?.pitBays?.()||[];
 const nearby=bays.find(b=>pose&&Math.hypot(pose.x-b.x,pose.z-b.z)<(b.radius||3.65));
 const ready=snapshot.phase==="race"&&you&&!you.pitComplete&&!you.finishedAt
  &&you.pitMode&&nearby&&Math.abs(pose?.speed||0)<.65&&!servicing;
 if(ready&&!serviceRequested){serviceRequested=true;service();}
 if(you?.pitComplete||!you?.pitMode)serviceRequested=false;
 const btn=$("kartPitService");
 btn.disabled=!ready||serviceRequested;
 btn.textContent=servicing?"🛠 SERVICING…":you?.pitComplete?"✓ PIT STOP COMPLETE":
   nearby&&you?.pitMode?"STOP HERE · 10-SECOND SERVICE":"Stop in pit bay · 10 sec";
}
function renderRoster(state){
 const listEl=$("kartMeetingRoster");listEl.replaceChildren();
 const racers=state.racers||[];
 if(!racers.length){const li=document.createElement("li");li.textContent="No registrations yet. Be first on the grid!";listEl.append(li);return;}
 for(const [i,p] of racers.entries()){
  const li=document.createElement("li");li.className="timing-row";
  if(p.id===state.you)li.classList.add("driver-self");
  const rank=document.createElement("strong");rank.textContent=p.grid?"P"+p.grid:"#"+(i+1);
  const name=document.createElement("span");
  name.textContent=p.name+(p.id===state.you?" (YOU)":"")+
    (p.finishedAt?(p.disqualified?" · DQ":" · FINISHED"):p.pitComplete?" · PIT ✓":p.pitUntil?" · SERVICING":"");
  const value=document.createElement("b");
  value.textContent=state.phase==="qualifying"||state.phase==="registration"?fmt(p.qualifiedMs):
   p.finishedAt?fmt(p.finishedMs):"LAP "+Math.min(p.lap+1,10)+"/10";
  const split=document.createElement("span");split.className="timing-mini-sectors";
  for(let j=0;j<3;j++){
   const cell=document.createElement("i");
   cell.className="sector-chip "+(p.sectorColors?.[j]||"neutral");
   cell.textContent="S"+(j+1);split.append(cell);
  }
  li.append(rank,name,split,value);listEl.append(li);
 }
}
function renderSchedule(){
 const host=$("kartEventList");host.replaceChildren();
 for(const item of list){
  const card=document.createElement("div");
  card.className="kart-event-item"+(selected===item.id?" current":"");
  const time=document.createElement("strong");time.textContent=when(item.qualifyingAt)+" QUALI";
  const info=document.createElement("span");
  info.textContent=when(item.raceAt)+" race · "+item.registered+" entered";
  const tag=document.createElement("span");tag.textContent=item.phase.toUpperCase();
  const btn=document.createElement("button");btn.type="button";
  btn.textContent=selected===item.id?"Viewing session":"View race";
  btn.onclick=()=>choose(item.id);
  card.append(time,info,tag,btn);host.append(card);
 }
}
function stateUpdate(data){
 snapshot=data;
 serverOffset=data.serverNow-Date.now();
 renderRoster(data);timeRemaining();
 const phaseLabel=$("kartRacePhase");if(phaseLabel&&data.you)phaseLabel.textContent=data.phase.toUpperCase();
 $("kartMeetingTitle").textContent=when(data.qualifyingAt)+" QUALI · "+when(data.raceAt)+" RACE";
 const mine=data.racers?.find(p=>p.id===data.you);
 const registered=!!mine;
 $("kartMeetingRegister").disabled=registered||!(data.phase==="registration"||data.phase==="qualifying");
 $("kartMeetingRegister").textContent=registered?"✓ REGISTERED":"Register for selected race";
 const details=registered?
  data.phase==="registration"?"Registered. Qualifying starts at "+when(data.qualifyingAt)+". Grid set by your fastest lap.":
  data.phase==="qualifying"?"QUALIFYING: set your fastest lap before "+when(data.raceAt)+" ("+fmt(mine.qualifiedMs)+" best).":
  data.phase==="grid"?"ON THE GRID · P"+mine.grid+" · wait for five red lights to go out.":
  data.phase==="race"?mine.finishedAt?
   mine.disqualified?"Race complete: disqualified for missing the mandatory pit stop.":
   "Finished! Final race position P"+mine.position:
   "10 laps · grid P"+mine.grid+" · "+(mine.pitComplete?"pit stop ✓":"mandatory pit stop needed"):
   "This meeting is complete.":
  data.phase==="race"?"Race in progress. You can watch results and register for the next meeting.":
  "Register to race. Two-minute qualifying precedes a ten-lap race.";
 status(details);
 const identity=String(selected)+":"+data.phase;
 if(data.you&&["qualifying","grid","race"].includes(data.phase)&&phaseEntered!==identity){
  phaseEntered=identity;raceIdentity=selected;
  window.KartRacing?.beginMeetingStage?.(data.phase,mine,data);
 }
 if(data.you&&["grid","race"].includes(data.phase)){
  window.KartRacing?.updateRivals?.(data.racers,data.you);
 }
 if(mine?.pitUntil)serviceUntil=mine.pitUntil;
 if(mine?.finishedAt)window.KartRacing?.finishMeetingStage?.(mine);
 if(data.lapUpdate)window.KartRacing?.meetingLapUpdate?.(data.lapUpdate);
 if(data.sectorUpdate)window.KartRacing?.meetingSectorUpdate?.(data.sectorUpdate);
}
async function refreshSchedule(){
 if(!open)return;
 try{
  const data=await call("events");list=data.events||[];
  if(!selected||!list.some(item=>item.id===selected)){
   const now=Date.now();
   selected=list.find(x=>x.phase==="registration"&&x.qualifyingAt>now)?.id||
    list.find(x=>x.phase==="qualifying")?.id||list.at(-1)?.id||null;
  }
  renderSchedule();
 }catch(error){status("Could not load race timetable: "+error.message);}
}
async function refreshState(){
 if(!open||selected==null||refreshing)return;
 refreshing=true;
 try{
  const data=await call("event/state?id="+selected);
  if(open&&selected===data.id)stateUpdate(data);
 }catch(error){status("Race status unavailable: "+error.message);}
 finally{refreshing=false;}
}
function choose(id){
 if(selected!==id){
  selected=id;snapshot=null;phaseEntered=null;raceIdentity=null;serviceUntil=0;
  window.KartRacing?.clearMeetingStage?.();
 }
 renderSchedule();refreshState();
}
async function register(){
 if(!selected)return;
 try{
  const data=await call("event/register",{eventId:selected});
  stateUpdate(data);await refreshSchedule();
 }catch(error){status(error.message);}
}
async function service(){
 const pose=window.KartRacing?.getPose?.(),bays=window.KartRacing?.pitBays?.()||[];
 const bay=bays.find(b=>pose&&Math.hypot(b.x-pose.x,b.z-pose.z)<(b.radius||3.65));
 if(!bay||!pose)return;
 try{
  const data=await call("event/pit",{eventId:selected,x:pose.x,z:pose.z,speed:pose.speed,bay:bay.index});
  serviceUntil=data.serviceUntil;serviceRequested=true;
  status("PIT STOP: hold position for 10 seconds. Do not accelerate.");
  timeRemaining();
 }catch(error){serviceRequested=false;status(error.message);}
}
async function sendTelemetry(pose){
 if(!open||!selected||!snapshot?.you||!["qualifying","race"].includes(snapshot.phase)||sending)return;
 if(serviceUntil>Date.now()+serverOffset)return;
 sending=true;
 try{
  const data=await call("event/sample",{eventId:selected,x:pose.x,z:pose.z,yaw:pose.yaw,
   speed:pose.speed,pit:pose.pit});
  if(data.id===selected&&open)stateUpdate(data);
 }catch(error){status(error.message);}
 finally{sending=false;}
}
function start(){
 if(open)return;
 open=true;phaseEntered=null;
 refreshSchedule().then(refreshState);
 poller=setInterval(()=>{
  timeRemaining();
  refreshState();
  if(Date.now()%18000<2300)refreshSchedule();
 },2200);
}
function stop(){
 open=false;clearInterval(poller);poller=null;
}
$("kartMeetingRegister").addEventListener("click",register);
$("kartPitService").addEventListener("click",service);
$("kartPractice").addEventListener("click",()=>window.KartRacing?.beginPractice?.());
window.KartMeetings={open:start,close:stop,getState:()=>snapshot,
 getActiveId:()=>raceIdentity,sendTelemetry,serviceUntil:()=>Math.max(0,serviceUntil-Date.now()-serverOffset),
 canDrive:()=>snapshot?.phase!=="grid"&&serviceUntil<=Date.now()+serverOffset&&!snapshot?.racers?.find(p=>p.id===snapshot.you)?.finishedAt,
 tick:timeRemaining,refresh:refreshState};
