// Shared multiplayer blackjack rules. One dealer, individual player hands, and
// a single real-time round at a clubhouse table. All stakes are fictional Sana Coins.
import {freshDeck,handValue} from "../public/salon-rules.js";
export const BLACKJACK_BET=10;
export const INITIAL_SANA=500;
export const SLOT_PRICE=5;
export const POKER_BUYIN=200;
export function newBlackjack(){
 return {phase:"waiting",round:0,shoe:[],dealer:[],players:[],message:"Join the blackjack table and place 10 Sana Coins for the next round."};
}
export function blackjackView(game,id,balance){
 const reveal=game.phase==="finished";
 return {type:"blackjackState",phase:game.phase,round:game.round,
  dealer:game.dealer.map((c,i)=>reveal||i===0?c:null),
  players:game.players.map(p=>({id:p.id,name:p.name,hand:p.hand,bet:p.bet,status:p.status,result:p.result,
    total:p.hand.length?handValue(p.hand):0,online:p.online})),
  you:id,message:game.message,balance,
  dealerTotal:reveal?handValue(game.dealer):null};
}
export function joinBlackjack(game,id,name){
 let p=game.players.find(p=>p.id===id);
 if(!p){
  if(game.phase==="playing")throw Error("Dealer round in progress. Join when it finishes.");
  if(game.players.length>=6)throw Error("This blackjack table is full (6 seats).");
  p={id,name:String(name||"Player").slice(0,22),hand:[],bet:0,status:"watching",result:"",online:true};
  game.players.push(p);
 }else{p.name=String(name||p.name).slice(0,22);p.online=true;}
 return p;
}
export function readyBlackjack(game,id,wallets){
 if(game.phase==="playing")throw Error("Wait for the dealer to finish this round.");
 if(game.phase==="finished"){
  game.phase="waiting";
  for(const old of game.players){old.bet=0;old.status="watching";}
 }
 const p=game.players.find(p=>p.id===id);if(!p)throw Error("Join the table first.");
 if(p.status==="ready")throw Error("Already entered the next round.");
 const wallet=wallets[id];
 if(!wallet||wallet.balance<BLACKJACK_BET)throw Error("Not enough Sana Coins to enter. Your balance is below 10.");
 wallet.balance-=BLACKJACK_BET;
 p.bet=BLACKJACK_BET;p.status="ready";p.hand=[];p.result="Ready for next deal";
 game.message=p.name+" has placed 10 Sana Coins and is ready.";
}
export function beginBlackjack(game,wallets){
 if(game.phase==="playing")throw Error("The dealer is already playing.");
 const active=game.players.filter(p=>p.status==="ready");
 if(!active.length)throw Error("At least one player must place 10 Sana Coins.");
 game.shoe=freshDeck();game.dealer=[game.shoe.pop(),game.shoe.pop()];
 game.round++;game.phase="playing";
 for(const p of active){
  p.hand=[game.shoe.pop(),game.shoe.pop()];
  p.status=handValue(p.hand)===21?"stand":"playing";
 }
 game.message="Dealer has dealt. Each player can Hit or Stand on their own hand.";
 if(!active.some(p=>p.status==="playing"))settleBlackjack(game,wallets);
}
export function moveBlackjack(game,id,action,wallets){
 if(game.phase!=="playing")throw Error("Wait for the next deal.");
 const p=game.players.find(p=>p.id===id&&p.status==="playing");
 if(!p)throw Error("You cannot play this hand right now.");
 if(action==="hit"){
  p.hand.push(game.shoe.pop());
  if(handValue(p.hand)>21){p.status="bust";p.result="Bust";}
  else if(handValue(p.hand)===21)p.status="stand";
 }else if(action==="stand"){p.status="stand";}
 else throw Error("Choose Hit or Stand.");
 game.message=p.name+(p.status==="bust"?" went bust.":action==="stand"?" stands.":" drew another card.");
 if(!game.players.some(x=>x.status==="playing"))settleBlackjack(game,wallets);
}
export function settleBlackjack(game,wallets){
 const players=game.players.filter(p=>p.bet>0);
 const live=players.filter(p=>p.status!=="bust");
 if(live.length)while(handValue(game.dealer)<17)game.dealer.push(game.shoe.pop());
 const house=handValue(game.dealer);
 for(const p of players){
  const own=handValue(p.hand);
  const natural=own===21&&p.hand.length===2;
  const houseNatural=house===21&&game.dealer.length===2;
  let payout=0;
  if(p.status==="bust")p.result="Bust · −10 Sana";
  else if(natural&&!houseNatural){payout=25;p.result="Blackjack! +15 Sana";}
  else if(houseNatural){p.result="Dealer blackjack · −10 Sana";}
  else if(house>21||own>house){payout=20;p.result="Win · +10 Sana";}
  else if(own===house){payout=10;p.result="Push · 10 Sana returned";}
  else p.result="Dealer wins · −10 Sana";
  wallets[p.id]??={balance:INITIAL_SANA};
  wallets[p.id].balance+=payout;
  p.status="finished";
 }
 game.phase="finished";game.message="Dealer finished on "+house+". Choose Join next round to play again.";
}
