// Fun-only game engines. Outcomes use Web Crypto, never real-world money.
export const SUITS=["♠","♥","♦","♣"],FACES=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const pick=n=>{const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);return bytes[0]%n;};
export function freshDeck(){
 const cards=SUITS.flatMap(suit=>FACES.map(face=>({suit,face})));
 for(let i=cards.length-1;i>0;i--){const j=pick(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}
 return cards;
}
export function handValue(hand){
 let total=0,aces=0;
 for(const c of hand){if(c.face==="A"){total+=11;aces++;}else total+=["J","Q","K"].includes(c.face)?10:Number(c.face);}
 while(total>21&&aces){total-=10;aces--;}
 return total;
}
export function startBlackjack(){
 const deck=freshDeck(),you=[deck.pop(),deck.pop()],dealer=[deck.pop(),deck.pop()];
 const natural=handValue(you)===21||handValue(dealer)===21;
 const result=natural?(handValue(you)===handValue(dealer)?"Push":handValue(you)===21?"Blackjack! You win":"Dealer blackjack"):"";
 return {deck,you,dealer,phase:natural?"finished":"playing",result,round:1};
}
export function blackjackMove(game,action){
 if(game.phase!=="playing")return game;
 if(!["hit","stand"].includes(action))throw Error("Invalid blackjack move");
 const g={...game,deck:[...game.deck],you:[...game.you],dealer:[...game.dealer]};
 if(action==="hit"){
  g.you.push(g.deck.pop());
  const value=handValue(g.you);
  if(value>=21){
   g.phase="finished";
   if(value>21){g.result="Bust — dealer wins";return g;}
  }else return g;
 }
 while(handValue(g.dealer)<17)g.dealer.push(g.deck.pop());
 const yours=handValue(g.you),house=handValue(g.dealer);
 g.phase="finished";
 g.result=house>21||yours>house?"You win!":yours===house?"Push — tie":"Dealer wins";
 return g;
}
export const SLOT_SYMBOLS=["🍒","🍋","🍇","🔔","⭐","7️⃣"];
export function spinSlots(){
 const reels=Array.from({length:3},()=>SLOT_SYMBOLS[pick(SLOT_SYMBOLS.length)]);
 const [a,b,c]=reels;
 const match=a===b&&b===c;
 const reward=match?(a==="7️⃣"?100:a==="⭐"?50:25):a===b||b===c||a===c?5:0;
 return {reels,reward,result:match?"JACKPOT!":reward?"Nice pair!":"Spin again!",kind:match?"jackpot":reward?"pair":"none"};
}
