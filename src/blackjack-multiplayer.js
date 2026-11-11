// Blackjack: choose a computer dealer or a real-person heads-up dealer duel.
// All chips are play-only Sana Coins, with no purchases or real-money use.
import {freshDeck,handValue} from "../public/salon-rules.js";
export const BLACKJACK_BET=10;
export const INITIAL_SANA=500;
export const SLOT_PRICE=5;
export const POKER_BUYIN=200;
const safeName=name=>String(name||"Player").slice(0,22);
export function newBlackjack(){
 return {phase:"waiting",mode:"computer",round:0,shoe:[],dealer:[],
  dealerId:null,players:[],message:"Choose the computer dealer or challenge another real player."};
}
export function blackjackView(game,id,balance){
 const reveal=game.phase==="finished",humanDealer=game.mode==="person";
 const dealerPlayer=game.players.find(p=>p.id===game.dealerId);
 const actualDealer=humanDealer?(dealerPlayer?.hand||[]):game.dealer;
 return {type:"blackjackState",phase:game.phase,round:game.round,mode:game.mode,
  dealerId:game.dealerId,dealerName:humanDealer?dealerPlayer?.name||"Waiting for opponent":"Computer dealer",
  dealer:actualDealer.map((c,i)=>reveal||(!humanDealer&&i===0)||id===game.dealerId?c:null),
  players:game.players.map(p=>({
   id:p.id,name:p.name,hand:p.id===id||reveal?p.hand:(humanDealer&&p.id===game.dealerId?[null,null]:p.hand),
   bet:p.bet,status:p.status,result:p.result,
   total:reveal||p.id===id||(!humanDealer&&p.status!=="playing")?p.hand.length?handValue(p.hand):0:null,
   online:p.online
  })),
  you:id,message:game.message,balance,dealerTotal:reveal?handValue(actualDealer):null};
}
export function joinBlackjack(game,id,name){
 let p=game.players.find(p=>p.id===id);
 if(!p){
  if(game.phase==="playing")throw Error("Round in progress. Join when it finishes.");
  if(game.players.length>=6)throw Error("Blackjack has six seats maximum.");
  p={id,name:safeName(name),hand:[],bet:0,status:"watching",result:"",online:false};
  game.players.push(p);
 }else{p.name=safeName(name);}
 return p;
}
export function chooseBlackjackMode(game,mode){
 if(!["computer","person"].includes(mode))throw Error("Choose computer or real person.");
 if(game.phase==="playing"||game.players.some(p=>p.status==="ready"))
  throw Error("Finish this round before changing opponents.");
 game.mode=mode;game.dealerId=null;game.dealer=[];
 game.phase="waiting";
 for(const p of game.players){p.status="watching";p.bet=0;p.hand=[];p.result="";}
 game.message=mode==="person"
  ?"Real-player challenge: two people join for 10 Sana Coins each. First ready plays challenger; second ready deals."
  :"Computer dealer: up to six people play their own hand against the house.";
}
export function readyBlackjack(game,id,wallets){
 if(game.phase==="playing")throw Error("Wait for this blackjack round to end.");
 if(game.phase==="finished"){
  game.phase="waiting";game.dealerId=null;
  for(const old of game.players){old.bet=0;old.status="watching";old.hand=[];}
 }
 const p=game.players.find(p=>p.id===id);if(!p)throw Error("Join first.");
 if(p.status==="ready")throw Error("You're already entered.");
 if(game.mode==="person"&&game.players.filter(x=>x.status==="ready"&&x.online).length>=2)
  throw Error("The player-versus-player round already has two people.");
 const wallet=wallets[id];
 if(!wallet||wallet.balance<BLACKJACK_BET)throw Error("You need 10 Sana Coins to enter.");
 wallet.balance-=BLACKJACK_BET;
 p.bet=BLACKJACK_BET;p.status="ready";p.hand=[];p.result="";
 game.message=p.name+" is ready ("+game.players.filter(x=>x.status==="ready").length+
  (game.mode==="person"?"/2 players).":" players).");
}
export function beginBlackjack(game,wallets){
 if(game.phase==="playing")throw Error("The hand is already in progress.");
 const active=game.players.filter(p=>p.status==="ready"&&p.online);
 if(game.mode==="person"&&active.length!==2)
  throw Error("Two real players must join the player-versus-player duel.");
 if(!active.length)throw Error("At least one player needs to join.");
 game.shoe=freshDeck();game.round++;game.phase="playing";game.dealerId=null;
 if(game.mode==="person"){
  game.dealerId=active[1].id;
  game.dealer=[];
  for(const p of active){p.hand=[game.shoe.pop(),game.shoe.pop()];p.status="playing";}
  game.message=active[0].name+" goes first. "+active[1].name+" is the real-person dealer.";
 }else{
  game.dealer=[game.shoe.pop(),game.shoe.pop()];
  for(const p of active){
   p.hand=[game.shoe.pop(),game.shoe.pop()];
   p.status=handValue(p.hand)===21?"stand":"playing";
  }
  game.message="Computer dealer dealt. Each player may Hit or Stand.";
  if(!active.some(p=>p.status==="playing"))settleBlackjack(game,wallets);
 }
}
export function moveBlackjack(game,id,action,wallets){
 if(game.phase!=="playing")throw Error("Wait for the next deal.");
 const p=game.players.find(p=>p.id===id&&p.status==="playing");
 if(!p)throw Error("It isn't your turn.");
 if(game.mode==="person"){
  const opponent=game.players.find(x=>x.bet&&x.id!==game.dealerId);
  if(p.id===game.dealerId&&opponent?.status==="playing")
   throw Error("The challenger must finish before the human dealer plays.");
  if(p.id!==game.dealerId&&p.id!==opponent?.id)throw Error("You are not in this duel.");
 }
 if(action==="hit"){
  p.hand.push(game.shoe.pop());
  if(handValue(p.hand)>21){p.status="bust";p.result="Bust";}
  else if(handValue(p.hand)===21)p.status="stand";
 }else if(action==="stand")p.status="stand";
 else throw Error("Hit or Stand only.");
 game.message=p.name+(p.status==="bust"?" went bust.":action==="stand"?" stands.":" drew another card.");
 if(game.mode==="person"){
  const challenger=game.players.find(x=>x.bet&&x.id!==game.dealerId);
  if(challenger?.status!=="playing"&&p.id!==game.dealerId){
   game.message+=" Human dealer's turn!";
  }
 }
 if(!game.players.some(x=>x.bet&&x.status==="playing"))settleBlackjack(game,wallets);
}
export function settleBlackjack(game,wallets){
 if(game.phase!=="playing")return;
 const players=game.players.filter(p=>p.bet>0);
 if(game.mode==="person"){
  const dealer=players.find(p=>p.id===game.dealerId),challenger=players.find(p=>p.id!==game.dealerId);
  if(!dealer||!challenger)throw Error("Both real players must finish.");
  const a=handValue(challenger.hand),b=handValue(dealer.hand);
  const winner=a>21?dealer:b>21?challenger:a>b?challenger:b>a?dealer:null;
  const result=winner?winner.name+" won the 20 Sana Coin duel pot!":"Push: 10 Sana Coins returned to each player.";
  if(winner){
   wallets[winner.id].balance+=20;
   winner.result="Won +10 Sana";players.find(p=>p.id!==winner.id).result="Lost −10 Sana";
  }else{
   for(const p of players){wallets[p.id].balance+=10;p.result="Tie · 10 Sana returned";}
  }
  for(const p of players)p.status="finished";
  game.phase="finished";game.message=result;return;
 }
 const live=players.filter(p=>p.status!=="bust");
 if(live.length)while(handValue(game.dealer)<17)game.dealer.push(game.shoe.pop());
 const house=handValue(game.dealer);
 for(const p of players){
  const own=handValue(p.hand),natural=own===21&&p.hand.length===2;
  const houseNatural=house===21&&game.dealer.length===2;
  let payout=0;
  if(p.status==="bust")p.result="Bust · −10 Sana";
  else if(natural&&!houseNatural){payout=25;p.result="Blackjack! +15 Sana";}
  else if(houseNatural){p.result="Dealer blackjack · −10 Sana";}
  else if(house>21||own>house){payout=20;p.result="Win · +10 Sana";}
  else if(own===house){payout=10;p.result="Push · 10 Sana returned";}
  else p.result="Dealer wins · −10 Sana";
  wallets[p.id]??={balance:INITIAL_SANA};
  wallets[p.id].balance+=payout;p.status="finished";
 }
 game.phase="finished";
 game.message="Computer dealer finished on "+house+". Choose Join next round to play again.";
}

export function disconnectBlackjack(game,id,wallets){
 const player=game.players.find(p=>p.id===id);
 if(!player)return false;
 player.online=false;
 if(game.phase==="waiting"&&player.status==="ready"){
  wallets[id]??={balance:INITIAL_SANA};
  wallets[id].balance+=player.bet||0;
  player.bet=0;player.status="watching";
 }
 if(game.phase==="playing"&&player.status==="playing"){
  // Leaving a live game cannot hold the other human indefinitely.
  player.status="stand";
  player.result="Disconnected · auto-stand";
  if(!game.players.some(p=>p.bet&&p.status==="playing"))
   settleBlackjack(game,wallets);
 }
 if(game.phase!=="playing"){
  game.players=game.players.filter(p=>p.id!==id);
 }
 game.message=player.name+" left the blackjack table."+
  (game.phase==="waiting"?" Their entry was refunded.":"");
 return true;
}
export function reconcileBlackjack(game,connectedIds,wallets){
 let changed=false;
 for(const p of [...game.players]){
  if(!connectedIds.has(p.id)&&(p.online||p.status==="ready"||p.status==="playing")){
   changed=disconnectBlackjack(game,p.id,wallets)||changed;
  }
 }
 return changed;
}
