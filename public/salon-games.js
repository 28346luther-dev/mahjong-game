
const $=id=>document.getElementById(id);
const SUIT_COLOR=s=>s==="♥"||s==="♦"?"red":"black";
const escapes=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let current=null,blackjack=null,spinCount=0,pokerSocket=null,pokerState=null,pokerRejoin=null,
 blackjackSocket=null,blackjackRejoin=null,wallet=null;
async function refreshWallet(){
 try{
  const response=await fetch("/api/sana/wallet",{credentials:"same-origin",cache:"no-store"});
  if(!response.ok)throw Error("Wallet unavailable");
  setWallet(await response.json());
 }catch(error){console.warn("Sana wallet",error.message);}
}
function setWallet(next){
 wallet=next;const hud=$("sanaBalance");
 if(hud)hud.textContent="🪙 "+next.total+" Sana Coins";
 window.dispatchEvent(new CustomEvent("sana-wallet",{detail:next}));
}
function cardElement(card,hidden=false){
 const el=document.createElement("div");el.className="salon-card"+(hidden?" back":"");
 if(hidden){el.textContent="✦";return el;}
 if(typeof card==="string"){
  const suit=({"s":"♠","h":"♥","d":"♦","c":"♣"})[card[1]]||"♣";
  el.classList.add(SUIT_COLOR(suit));
  const top=document.createElement("span");top.textContent=card[0]==="T"?"10":card[0];
  const mid=document.createElement("b");mid.textContent=suit;
  el.append(top,mid);return el;
 }
 el.classList.add(SUIT_COLOR(card.suit));
 const top=document.createElement("span");top.textContent=card.face;
 const mid=document.createElement("b");mid.textContent=card.suit;el.append(top,mid);return el;
}
function appendCards(root,cards,hide=false){
 root.replaceChildren();for(let i=0;i<cards.length;i++)root.append(cardElement(cards[i],hide&&i===1));
}
function text(id,value){$(id).textContent=value;}
function setActive(game){
 current=game;
 const modal=$("salonGame");modal.classList.remove("hidden");
 for(const type of ["slots","blackjack","poker"])$("salon-"+type).classList.toggle("hidden",game!==type);
 $("salonTitle").textContent=({slots:"THE SLOT SALON",blackjack:"BLACKJACK AT THE CLUB",poker:"TEXAS HOLD'EM — SANA COINS"})[game];
 document.body.classList.add("salon-playing");document.exitPointerLock?.();
 if(game==="slots"){refreshWallet().then(()=>renderSlots(null));}
 if(game==="blackjack")joinBlackjack();
 if(game==="poker")joinPoker();
}
function close(){
 current=null;$("salonGame").classList.add("hidden");document.body.classList.remove("salon-playing");
 if(pokerSocket){pokerSocket.onclose=null;pokerSocket.close();pokerSocket=null;}
 if(blackjackSocket){blackjackSocket.onclose=null;blackjackSocket.close();blackjackSocket=null;}
 clearTimeout(pokerRejoin);pokerRejoin=null;
 clearTimeout(blackjackRejoin);blackjackRejoin=null;refreshWallet();
}
function renderSlots(result){
 const slots=$("slotReels");slots.replaceChildren();
 for(const symbol of result?.reels||["7️⃣","⭐","🍒"]){
  const div=document.createElement("div");div.className="slot-reel";div.textContent=symbol;slots.append(div);
 }
 text("slotScore","Sana Coins: "+(wallet?.total??500)+" · Spins: "+spinCount+" · Cost: 5");
 text("slotResult",result?result.result+" · "+(result.net>0?"+":"")+result.net+" Sana Coins":"Each spin costs 5 Sana Coins. Match two or three to win more!");
 $("slotSpin").disabled=(wallet?.balance??500)<5;
}
async function spin(){
 if(current!=="slots")return;
 const btn=$("slotSpin");btn.disabled=true;
 let frames=0;
 const timer=setInterval(()=>{
  for(const el of $("slotReels").children)
   el.textContent=["🍒","🍋","🍇","🔔","⭐","7️⃣"][Math.floor(Math.random()*6)];
  if(++frames>=13)clearInterval(timer);
 },70);
 try{
  const response=await fetch("/api/sana/spin",{method:"POST",credentials:"same-origin"});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||"Spin failed");
  await new Promise(resolve=>setTimeout(resolve,960));
  spinCount++;setWallet(result.wallet);renderSlots(result);
 }catch(error){text("slotResult",error.message);}
 finally{clearInterval(timer);btn.disabled=(wallet?.balance??0)<5;}
}
function renderBlackjack(){
 const s=blackjack;if(!s)return;
 const dealer=s.dealer||[],me=s.players.find(p=>p.id===s.you);
 appendCards($("blackjackDealer"),dealer.map(c=>c||{face:"✦",suit:""}));
 const dealerEl=$("blackjackDealer");
 for(let i=0;i<dealer.length;i++)if(!dealer[i])dealerEl.replaceChild(cardElement(null,true),dealerEl.children[i]);
 appendCards($("blackjackHand"),me?.hand||[]);
 text("blackjackDealerScore","Dealer: "+(s.dealerTotal??"hidden"));
 text("blackjackYourScore","Your hand: "+(me?.total??"—"));
 text("blackjackMessage",s.message+(me?.result?" · "+me.result:""));
 text("blackjackWallet",(s.balance?.total??wallet?.total??500)+" Sana Coins");
 if(s.balance)setWallet(s.balance);
 const players=$("blackjackPlayers");players.replaceChildren();
 for(const p of s.players){
  const item=document.createElement("div");item.className="blackjack-player"+(p.id===s.you?" me":"");
  const title=document.createElement("strong");title.textContent=p.name+(p.id===s.you?" (YOU)":"");
  const score=document.createElement("span");score.textContent=p.status+" · "+(p.total||"—")+(p.result?" · "+p.result:"");
  item.append(title,score);players.append(item);
 }
 const canPlay=s.phase==="playing"&&me?.status==="playing";
 $("blackjackHit").disabled=!canPlay;$("blackjackStand").disabled=!canPlay;
 $("blackjackReady").disabled=s.phase==="playing"||me?.status==="ready"||(s.balance?.balance??0)<10;
 $("blackjackDeal").disabled=s.phase==="playing"||!s.players.some(p=>p.status==="ready");
}
async function joinBlackjack(){
 text("blackjackMessage","Joining the shared dealer table…");
 try{
  const response=await fetch("/api/blackjack/join",{method:"POST",credentials:"same-origin"});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||"Unable to join blackjack");
  if(current!=="blackjack")return;
  blackjack=result.state;renderBlackjack();connectBlackjack();
 }catch(error){text("blackjackMessage",error.message);}
}
function connectBlackjack(){
 if(current!=="blackjack")return;
 const ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host+"/blackjack/ws");
 blackjackSocket=ws;
 ws.onmessage=e=>{
  if(blackjackSocket!==ws)return;
  let data;try{data=JSON.parse(e.data);}catch{return;}
  if(data.type==="blackjackState"){blackjack=data;renderBlackjack();}
  else if(data.type==="pokerError")text("blackjackMessage",data.message);
 };
 ws.onclose=()=>{
  if(current!=="blackjack"||blackjackSocket!==ws)return;
  text("blackjackMessage","Reconnecting to the dealer table…");
  blackjackRejoin=setTimeout(connectBlackjack,2000);
 };
 ws.onerror=()=>text("blackjackMessage","Connection interrupted.");
}
function blackjackSend(action){
 if(blackjackSocket?.readyState!==WebSocket.OPEN){text("blackjackMessage","Reconnecting to blackjack…");return;}
 blackjackSocket.send(JSON.stringify({action}));
}
async function joinPoker(){
 text("pokerMessage","Connecting to the shared club poker table…");
 try{
  const response=await fetch("/api/poker/join",{method:"POST",credentials:"same-origin"});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||"Could not join poker.");
  if(current!=="poker")return;
  pokerState=result.state;renderPoker();
  connectPoker();
 }catch(error){text("pokerMessage",error.message);}
}
function connectPoker(){
 if(current!=="poker")return;
 const proto=location.protocol==="https:"?"wss:":"ws:";
 const ws=new WebSocket(proto+"//"+location.host+"/poker/ws");
 pokerSocket=ws;
 ws.onmessage=e=>{
  if(pokerSocket!==ws)return;
  let msg;try{msg=JSON.parse(e.data);}catch{return;}
  if(msg.type==="pokerState"){pokerState=msg;renderPoker();}
  else if(msg.type==="pokerError")text("pokerMessage",msg.message);
 };
 ws.onclose=()=>{
  if(current!=="poker"||pokerSocket!==ws)return;
  text("pokerMessage","Connection interrupted — reconnecting…");
  pokerRejoin=setTimeout(connectPoker,2200);
 };
 ws.onerror=()=>text("pokerMessage","Network interrupted. Reconnecting…");
}
function pokerSend(action,amount){
 if(pokerSocket?.readyState!==WebSocket.OPEN){text("pokerMessage","Reconnect before playing.");return;}
 pokerSocket.send(JSON.stringify({action,amount}));
}
function renderPoker(){
 const s=pokerState;if(!s)return;
 appendCards($("pokerCommunity"),s.community);
 text("pokerPot","Pot: "+s.pot+" Sana Coins");
 text("pokerStreet",(s.street||"waiting").toUpperCase());
 text("pokerMessage",s.message);
 if(s.wallet){setWallet(s.wallet);text("pokerWallet","Wallet: "+s.wallet.balance+" · Table stack: "+s.wallet.pokerStack);}
 const container=$("pokerPlayers");container.replaceChildren();
 for(const p of s.players){
  const seat=document.createElement("div");
  seat.className="poker-player"+(s.players[s.toAct]?.id===p.id?" current":"")+(p.folded?" folded":"");
  const name=document.createElement("strong");name.textContent=p.name+(p.kind==="bot"?" 🤖":"")+(p.id===s.ownId?" (YOU)":"");
  const coins=document.createElement("span");coins.textContent=p.stack+" Sana Coins · In: "+p.contributed+(p.folded?" · FOLDED":p.allIn?" · ALL IN":"");
  const hand=document.createElement("div");hand.className="poker-hole";
  for(const c of p.hole)hand.append(cardElement(c,c==="??"));
  seat.append(name,coins,hand);container.append(seat);
 }
 const me=s.players.find(p=>p.id===s.ownId),turn=s.players[s.toAct]?.id===s.ownId&&s.phase==="playing";
 const owe=Math.max(0,(s.currentBet||0)-(me?.street||0));
 $("pokerTurn").textContent=turn?"YOUR TURN — "+(owe?"Call "+owe+" or raise":"Check or raise"):s.phase==="playing"?"Waiting for "+s.turnName:s.phase==="showdown"?"Hand complete":"Ready for the next hand";
 for(const b of document.querySelectorAll("[data-poker-action]"))b.disabled=!turn;
 $("pokerCheck").textContent=owe?"Call "+owe:"Check";
 $("pokerCheck").dataset.pokerAction=owe?"call":"check";
 $("pokerRaiseAmount").min=String(s.currentBet+(s.minRaise||20));
 $("pokerRaiseAmount").value=String(s.currentBet+(s.minRaise||20));
 $("pokerRaiseAmount").disabled=!turn;
 $("pokerDeal").disabled=s.phase==="playing";
 $("pokerCashOut").disabled=s.phase==="playing"||!me;
 $("pokerAddBot").disabled=s.phase==="playing"||s.players.length>=4;
}
$("salonClose").addEventListener("click",close);
$("salonGame").addEventListener("click",e=>{if(e.target===$("salonGame"))close();});
$("slotSpin").addEventListener("click",spin);
$("blackjackDeal").addEventListener("click",()=>blackjackSend("deal"));
$("blackjackReady").addEventListener("click",()=>blackjackSend("ready"));
$("blackjackHit").addEventListener("click",()=>blackjackSend("hit"));
$("blackjackStand").addEventListener("click",()=>blackjackSend("stand"));
$("pokerDeal").addEventListener("click",()=>pokerSend("newHand"));
$("pokerCashOut").addEventListener("click",()=>pokerSend("cashOut"));
$("pokerAddBot").addEventListener("click",()=>pokerSend("addBot"));
for(const b of document.querySelectorAll("[data-poker-action]"))b.addEventListener("click",()=>{
 const action=b.dataset.pokerAction;
 pokerSend(action,action==="raise"?Number($("pokerRaiseAmount").value):undefined);
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&current)close();});
window.SalonGames={open:setActive,close,isOpen:()=>!!current,refreshWallet};
document.addEventListener("DOMContentLoaded",refreshWallet);
refreshWallet();
