/* Shared go-kart standings: everyone, including non-racers in the clubhouse,
 * sees the same global best laps. Poll only when the tab is visible. */
const list=document.getElementById("kartClubLeaderboard");
function format(ms){
 return String(Math.floor(ms/60000)).padStart(2,"0")+":"+
  String(Math.floor(ms%60000/1000)).padStart(2,"0")+"."+
  String(Math.floor(ms%1000)).padStart(3,"0");
}
async function refresh(){
 if(document.hidden||!list)return;
 try{
  const response=await fetch("/api/kart/leaderboard",{credentials:"same-origin",cache:"no-store"});
  if(!response.ok)throw Error("Leaderboard unavailable");
  const {entries=[]}=await response.json();
  list.replaceChildren();
  if(!entries.length){
   const li=document.createElement("li");
   li.textContent="No times yet. Enter the kart portal and set the first fastest lap!";
   list.append(li);return;
  }
  for(const entry of entries){
   const li=document.createElement("li");
   const rank=document.createElement("strong");rank.textContent="#"+entry.rank;
   const name=document.createElement("span");name.textContent=entry.name;
   const time=document.createElement("b");time.textContent=format(entry.bestMs);
   li.append(rank,name,time);list.append(li);
  }
 }catch{
  if(!list.children.length)list.textContent="Leaderboard temporarily unavailable.";
 }
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh();});
window.addEventListener("kart-leaderboard-updated",refresh);
const refreshTimer=setInterval(refresh,15000);
window.addEventListener("beforeunload",()=>clearInterval(refreshTimer));
refresh();
