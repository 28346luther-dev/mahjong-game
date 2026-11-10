// Texas Hold'em cards, hand comparison, side pots and play-only bot decisions.
// No real-world currency, purchases, cash-out or transfers.
export const RANKS="23456789TJQKA";
export const SUITS="shdc";
export function deck(){return [...SUITS].flatMap(s=>[...RANKS].map(r=>r+s));}
export function shuffle(cards,random=Math.random){
 const a=[...cards];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;
}
const rank=c=>RANKS.indexOf(c[0])+2;
const desc=a=>a.sort((x,y)=>y-x);
export function evaluateFive(cards){
 if(cards.length!==5)throw Error("Five cards required");
 const ranks=cards.map(rank),suits=cards.map(c=>c[1]),groups=new Map();
 for(const r of ranks)groups.set(r,(groups.get(r)||0)+1);
 const values=desc([...new Set(ranks)]),wheel=values.includes(14)?[...values,1]:values;
 let straight=0;
 for(let i=0;i<=wheel.length-5;i++){
  if(wheel[i]-wheel[i+4]===4){straight=wheel[i];break;}
 }
 const flush=suits.every(s=>s===suits[0]);
 if(flush&&straight)return {score:[8,straight],name:straight===14?"Royal flush":"Straight flush"};
 const counts=[...groups].map(([r,count])=>[count,r]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);
 const sorted=counts.map(x=>x[1]);
 if(counts[0][0]===4)return {score:[7,sorted[0],sorted[1]],name:"Four of a kind"};
 if(counts[0][0]===3&&counts[1][0]===2)return {score:[6,sorted[0],sorted[1]],name:"Full house"};
 if(flush)return {score:[5,...desc(ranks)],name:"Flush"};
 if(straight)return {score:[4,straight],name:"Straight"};
 if(counts[0][0]===3)return {score:[3,sorted[0],...desc(sorted.slice(1))],name:"Three of a kind"};
 if(counts[0][0]===2&&counts[1][0]===2)return {score:[2,Math.max(sorted[0],sorted[1]),Math.min(sorted[0],sorted[1]),sorted[2]],name:"Two pair"};
 if(counts[0][0]===2)return {score:[1,sorted[0],...desc(sorted.slice(1))],name:"One pair"};
 return {score:[0,...desc(ranks)],name:"High card"};
}
export function compareScore(a,b){
 const x=a.score||a,y=b.score||b;
 for(let i=0;i<Math.max(x.length,y.length);i++){
  const diff=(x[i]||0)-(y[i]||0);if(diff)return Math.sign(diff);
 }
 return 0;
}
export function evaluateSeven(cards){
 if(cards.length<5||cards.length>7)throw Error("Five to seven cards required");
 let best=null;
 for(let a=0;a<cards.length-4;a++)
 for(let b=a+1;b<cards.length-3;b++)
 for(let c=b+1;c<cards.length-2;c++)
 for(let d=c+1;d<cards.length-1;d++)
 for(let e=d+1;e<cards.length;e++){
  const hand=evaluateFive([cards[a],cards[b],cards[c],cards[d],cards[e]]);
  if(!best||compareScore(hand,best)>0)best=hand;
 }
 return best;
}
// Every contribution creates a side-pot tier; folded players fund pots but cannot win them.
export function distributePots(players,community){
 const levels=[...new Set(players.map(p=>p.contributed).filter(n=>n>0))].sort((a,b)=>a-b);
 const payments=Object.fromEntries(players.map(p=>[p.id,0]));
 const revealed={},descriptions=[];
 for(const p of players.filter(p=>!p.folded))revealed[p.id]=evaluateSeven([...p.hole,...community]);
 let previous=0;
 for(const level of levels){
  const participants=players.filter(p=>p.contributed>=level);
  const amount=(level-previous)*participants.length;
  previous=level;
  const eligible=participants.filter(p=>!p.folded);
  if(!amount||!eligible.length)continue;
  let winners=[eligible[0]];
  for(const p of eligible.slice(1)){
   const cmp=compareScore(revealed[p.id],revealed[winners[0].id]);
   if(cmp>0)winners=[p];else if(cmp===0)winners.push(p);
  }
  const per=Math.floor(amount/winners.length),remainder=amount%winners.length;
  winners.forEach((p,i)=>payments[p.id]+=per+(i<remainder?1:0));
  descriptions.push({amount,winners:winners.map(p=>p.name),hand:revealed[winners[0].id].name});
 }
 return {payments,revealed,descriptions};
}
export function botDecision(state,player,random=Math.random){
 const owed=Math.max(0,state.currentBet-player.street);
 const strength=player.hole.reduce((v,c)=>v+(rank(c)>=11?1:0),0)+
  (player.hole[0][0]===player.hole[1][0]?2:0);
 if(owed===0)return strength>=3&&random()<.22?"raise":"check";
 if(owed>Math.max(70,player.stack*.35)&&strength<2&&random()<.7)return "fold";
 if(strength>=3&&random()<.2&&player.stack>owed+40)return "raise";
 if(owed>player.stack*.45&&strength<1&&random()<.55)return "fold";
 return "call";
}
