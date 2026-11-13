import {raceAnnouncement,playerCountText} from './kart-activity.js';
const client=crypto.randomUUID();
let busy=false,dirty=false,activity=null,offset=0,shown=null,lastSuccess=0;
const dismissed=new Set();
const banners=[...document.querySelectorAll('[data-race-announcement]')];
function signedIn(){return document.getElementById('authScreen')?.classList.contains('hidden');}
function currentMode(){return signedIn()&&!document.hidden?(window.KartRacing?.getActivity?.()||'preLobby'):null;}
function tick(){
 const now=Date.now()+offset;
 const announcement=Date.now()-lastSuccess<15000?raceAnnouncement(activity,now):null;
 let seen=false;try{seen=sessionStorage.getItem('kart-announced:'+announcement?.id)==='1';}catch{}
 const visible=!!(!document.hidden&&signedIn()&&announcement&&!dismissed.has(announcement.id)&&(shown===announcement.id||!seen));
 if(visible){
  shown=announcement.id;
  try{sessionStorage.setItem('kart-announced:'+shown,'1');}catch{}
  for(const banner of banners){const text=banner.querySelector('[data-race-message]');if(text.textContent!==announcement.text)text.textContent=announcement.text;}
 }
 const kartOpen=!!window.KartRacing?.isOpen?.();
 for(const banner of banners)banner.hidden=!visible||!!banner.closest("#kartGame")!==kartOpen;
 if(lastSuccess&&Date.now()-lastSuccess>=15000){
  for(const label of document.querySelectorAll('[data-kart-player-counts]'))label.textContent='Player counts unavailable';
  for(const label of document.querySelectorAll('[data-next-race-count]'))label.textContent='Race schedule unavailable';
 }else if(activity){
  const next=activity.nextRace,seconds=Math.max(0,Math.ceil(((next?.startsAt||now)-now)/1000));
  for(const label of document.querySelectorAll('[data-next-race-count]'))label.textContent=next?`Next race: ${next.registered} registered · starts in ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'No race scheduled';
 }
}
async function refresh(){
 if(busy){dirty=true;return;}busy=true;
 try{
  const mode=currentMode();
  const response=await fetch(signedIn()?'/api/kart/presence':'/api/kart/activity',{
   method:signedIn()?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000),
   ...(signedIn()?{headers:{'content-type':'application/json'},body:JSON.stringify({client,mode})}:{})
  });
  if(!response.ok)throw Error('Player counts unavailable');
  activity=await response.json();offset=activity.serverNow-Date.now();lastSuccess=Date.now();
  const text=playerCountText(activity.counts);
  for(const element of document.querySelectorAll('[data-kart-player-counts]'))if(element.textContent!==text)element.textContent=text;
  tick();
 }catch{
  for(const element of document.querySelectorAll('[data-kart-player-counts]'))element.textContent='Player counts unavailable';
 }finally{busy=false;if(dirty){dirty=false;queueMicrotask(refresh);}}
}
for(const banner of banners){
 banner.querySelector('[data-dismiss-race]').addEventListener('click',()=>{if(shown!==null)dismissed.add(shown);tick();});
 banner.querySelector('[data-join-race]').addEventListener('click',()=>{
  if(!activity?.nextRace)return;
  window.KartRacing?.open?.();window.KartRacing?.showRaceMeetings?.();
  window.KartMeetings?.viewEvent?.(activity.nextRace.id);
  if(shown!==null)dismissed.add(shown);tick();
 });
}
const observer=new MutationObserver(refresh);
for(const id of ['authScreen','kartGame']){const node=document.getElementById(id);if(node)observer.observe(node,{attributes:true,attributeFilter:['class']});}
document.addEventListener('visibilitychange',refresh);
window.addEventListener('pagehide',()=>{
 if(signedIn())navigator.sendBeacon('/api/kart/presence',new Blob([JSON.stringify({client,mode:null})],{type:'application/json'}));
});
setInterval(()=>{if(!document.hidden)refresh();},5000);
setInterval(tick,1000);
window.KartAnnouncements={refresh};
refresh();
