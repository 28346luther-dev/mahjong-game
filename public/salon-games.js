import {startBlackjack,blackjackMove,handValue,spinSlots} from "./salon-rules.js";
const $=id=>document.getElementById(id);
const SUIT_COLOR=s=>s==="♥"||s==="♦"?"red":"black";
const escapes=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let current=null,blackjack=null,spinCount=0,slotScore=0,pokerSocket=null,pokerState=null,pokerRejoin=null;
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
 if(game==="slots")renderSlots(null);
 if(game==="blackjack")renderBlackjack();
 if(game==="poker")joinPoker();
}
function close(){
 current=null;$("salonGame").classList.add("hidden");document.body.classList.remove("salon-playing");
 if(pokerSocket){pokerSocket.onclose=null;pokerSocket.close();pokerSocket=null;}
 clearTimeout(pokerRejoin);pokerRejoin=null;
}
function renderSlots(result){
 const slots=$("slotReels");slots.replaceChildren();
 for(const symbol of result?.reels||["7️⃣","⭐","🍒"]){
  const div=document.createElement("div");div.className="slot-reel";div.textContent=symbol;slots.append(div);
 }
 text("slotScore","Fun score: "+slotScore+" · Spins: "+spinCount);
 text("slotResult",result?result.result+(result.reward?" +"+result.reward+" points":""):"Spin the reels. No money or wagering — just arcade points!");
 $("slotSpin").disabled=false;
}
function spin(){
 if(current!=="slots")return;
 const btn=$("slotSpin");btn.disabled=true;
 let frames=0;const timer=setInterval(()=>{
  const reels=$("slotReels").children;for(const el of reels)el.textContent=["🍒","🍋","🍇","🔔","⭐","7️⃣"][Math.floor(Math.random()*6)];
  if(++frames>=13){clearInterval(timer);const result=spinSlots();spinCount++;slotScore+=result.reward;renderSlots(result);}
 },70);
}
function renderBlackjack(){
 const playing=blackjack?.phase==="playing";
 const dealer=blackjack?.dealer||[],you=blackjack?.you||[];
 appendCards($("blackjackDealer"),dealer,playing);
 appendCards($("blackjackHand"),you);
 text("blackjackDealerScore","Dealer: "+(playing?dealer.length?dealer[0].face:"—":handValue(dealer)));
 text("blackjackYourScore","Your hand: "+(you.length?handValue(you):"—"));
 text("blackjackMessage",blackjack?.result||"Closest to 21 wins. Dealer stands on 17; aces count as 1 or 11.");
 $("blackjackHit").disabled=!playing;$("blackjackStand").disabled=!playing;
}
function playBlackjack(action){
 blackjack=action==="deal"?startBlackjack():blackjackMove(blackjack,action);
 renderBlackjack();
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
 $("pokerAddBot").disabled=s.phase==="playing"||s.players.length>=4;
}
$("salonClose").addEventListener("click",close);
$("salonGame").addEventListener("click",e=>{if(e.target===$("salonGame"))close();});
$("slotSpin").addEventListener("click",spin);
$("blackjackDeal").addEventListener("click",()=>playBlackjack("deal"));
$("blackjackHit").addEventListener("click",()=>playBlackjack("hit"));
$("blackjackStand").addEventListener("click",()=>playBlackjack("stand"));
$("pokerDeal").addEventListener("click",()=>pokerSend("newHand"));
$("pokerAddBot").addEventListener("click",()=>pokerSend("addBot"));
for(const b of document.querySelectorAll("[data-poker-action]"))b.addEventListener("click",()=>{
 const action=b.dataset.pokerAction;
 pokerSend(action,action==="raise"?Number($("pokerRaiseAmount").value):undefined);
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&current)close();});
window.SalonGames={open:setActive,close,isOpen:()=>!!current};
