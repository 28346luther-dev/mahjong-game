import {deck,shuffle,evaluateSeven,distributePots,botDecision} from "./poker-rules.js";
import {INITIAL_SANA,POKER_BUYIN,SLOT_PRICE,newBlackjack,blackjackView,joinBlackjack,readyBlackjack,beginBlackjack,moveBlackjack,chooseBlackjackMode,disconnectBlackjack,reconcileBlackjack} from "./blackjack-multiplayer.js";
import {spinSlots} from "../public/salon-rules.js";
const START_STACK=POKER_BUYIN,SMALL_BLIND=10,BIG_BLIND=20,MAX_PLAYERS=4;
const cleanName=name=>String(name||"Guest").replace(/[^\p{L}\p{N} ._-]/gu,"").slice(0,22)||"Guest";
const uid=()=>crypto.randomUUID();
const bot=p=>p.kind==="bot";
export class PokerTable{
 constructor(ctx){
  this.ctx=ctx;this.data=null;this.sockets=new Map();this.blackjackSockets=new Map();
  for(const ws of ctx.getWebSockets?.()||[]){
   const info=ws.deserializeAttachment?.();if(info?.user&&info.kind==="blackjack")this.blackjackSockets.set(info.user,ws);
   else if(info?.user)this.sockets.set(info.user,ws);
  }
 }
 async load(){
  if(this.data)return;
  this.data=await this.ctx.storage.get("poker")||{
   players:[],dealer:0,hand:0,phase:"waiting",street:"preflop",community:[],shoe:[],
   currentBet:0,minRaise:BIG_BLIND,toAct:-1,message:"Texas Hold'em. Sana Coins are for fun only.",wallets:{},blackjack:newBlackjack(),casinoVersion:2
  };
  if(!this.data.wallets)this.data.wallets={};
  if(!this.data.blackjack)this.data.blackjack=newBlackjack();
  if(reconcileBlackjack(this.data.blackjack,new Set(this.blackjackSockets.keys()),this.data.wallets))await this.save();
  if(!this.data.casinoVersion||this.data.casinoVersion<2){
   for(const p of this.data.players.filter(p=>p.kind==="human")){
    this.data.wallets[p.id]={balance:INITIAL_SANA-POKER_BUYIN};
    p.stack=POKER_BUYIN;p.street=0;p.contributed=0;p.hole=[];
    p.folded=false;p.allIn=false;p.acted=false;
   }
   this.data.phase="waiting";this.data.players=this.data.players.filter(p=>p.kind==="human");
   this.data.casinoVersion=2;await this.save();
  }
 }
 async save(){await this.ctx.storage.put("poker",this.data);}
 wallet(id){
  if(!this.data.wallets)this.data.wallets={};
  if(!this.data.wallets[id])this.data.wallets[id]={balance:INITIAL_SANA};
  return this.data.wallets[id];
 }
 walletView(id){
  const w=this.wallet(id),seat=this.data.players.find(p=>p.id===id&&p.kind==="human");
  return {balance:w.balance,pokerStack:seat?.stack||0,total:w.balance+(seat?.stack||0)};
 }
 blackjackBroadcast(){
  for(const [id,ws] of this.blackjackSockets)
   this.send(ws,blackjackView(this.data.blackjack,id,this.walletView(id)));
 }
 send(ws,data){try{ws.send(JSON.stringify(data));}catch{}}
 stateFor(user){
  const s=this.data;return {
   type:"pokerState",hand:s.hand,phase:s.phase,street:s.street,
   dealer:s.dealer,toAct:s.toAct,pot:s.players.reduce((n,p)=>n+p.contributed,0),
   currentBet:s.currentBet,minRaise:s.minRaise,community:s.community,message:s.message,
   ownId:user,wallet:this.walletView(user),turnName:s.players[s.toAct]?.name||"",
   players:s.players.map((p,i)=>({
    id:p.id,name:p.name,kind:p.kind,stack:p.stack,street:p.street,contributed:p.contributed,
    folded:p.folded,allIn:p.allIn,hole:p.id===user||s.phase==="showdown"?p.hole:["??","??"],
    seat:i,online:p.kind==="bot"||this.sockets.has(p.id)
   }))
  };
 }
 broadcast(){for(const [user,ws] of this.sockets)this.send(ws,this.stateFor(user));}
 active(p){return p&&!p.folded&&p.hole.length===2;}
 next(index,filter){
  const s=this.data;if(!s.players.length)return -1;
  for(let i=1;i<=s.players.length;i++){
   const k=(index+i)%s.players.length;
   if(filter(s.players[k]))return k;
  }return -1;
 }
 ensureBots(){
  const s=this.data;
  // At least one computer opponent; human seats take precedence when they join.
  while(s.players.length<2)s.players.push({id:uid(),name:"House Bot",kind:"bot",stack:START_STACK,hole:[],street:0,contributed:0,folded:false,allIn:false,acted:false});
 }
 resetSeats(){
  const s=this.data;
  s.players=s.players.filter(p=>p.kind==="human"||p.stack>0);
  for(const p of s.players.filter(p=>p.kind==="bot"))if(p.stack<=0)p.stack=START_STACK;
  for(const p of s.players.filter(p=>p.kind==="human"&&p.stack<SMALL_BLIND)){
   const amount=Math.min(POKER_BUYIN,this.wallet(p.id).balance);
   if(amount>=SMALL_BLIND){this.wallet(p.id).balance-=amount;p.stack+=amount;}
  }
  this.ensureBots();
 }
 post(index,amount){
  const p=this.data.players[index],paid=Math.min(Math.max(0,amount),p.stack);
  p.stack-=paid;p.street+=paid;p.contributed+=paid;if(!p.stack)p.allIn=true;
  return paid;
 }
 start(){
  const s=this.data;this.resetSeats();
  if(s.players.filter(p=>p.kind==="human"&&p.stack>=SMALL_BLIND).length<1)
   throw Error("Not enough Sana Coins for poker.");
  s.hand++;s.dealer=s.hand===1?0:(s.dealer+1)%s.players.length;
  s.phase="playing";s.street="preflop";s.community=[];s.shoe=shuffle(deck());
  s.currentBet=0;s.minRaise=BIG_BLIND;
  for(const p of s.players){
   p.hole=[s.shoe.pop(),s.shoe.pop()];p.street=0;p.contributed=0;
   p.folded=false;p.allIn=false;p.acted=false;
  }
  const headsUp=s.players.filter(p=>this.active(p)).length===2;
  const sb=headsUp?s.dealer:this.next(s.dealer,p=>this.active(p));
  const bb=this.next(sb,p=>this.active(p));
  this.post(sb,SMALL_BLIND);this.post(bb,BIG_BLIND);
  s.currentBet=Math.max(s.players[sb].street,s.players[bb].street);
  s.toAct=this.next(bb,p=>this.active(p)&&!p.allIn);
  s.message="New Texas Hold'em hand. Small blind 10, big blind 20 Sana Coins.";
  this.advanceBots();
 }
 playerAct(user,action,amount){
  const s=this.data,at=s.players.findIndex(p=>p.id===user);
  if(s.phase!=="playing"||at!==s.toAct)throw Error("Wait for your turn.");
  const p=s.players[at],owed=Math.max(0,s.currentBet-p.street);
  if(action==="fold")p.folded=true;
  else if(action==="check"){
   if(owed)throw Error("You must call or fold.");
  }else if(action==="call")this.post(at,owed);
  else if(action==="raise"){
   const to=Number(amount);
   const minTo=s.currentBet+s.minRaise;
   if(!Number.isInteger(to)||to<minTo||to>p.street+p.stack)throw Error("Raise at least "+minTo+" Sana Coins (or use All in).");
   const prev=s.currentBet;this.post(at,to-p.street);
   s.currentBet=p.street;s.minRaise=Math.max(BIG_BLIND,s.currentBet-prev);
   for(const other of s.players)if(other!==p&&!other.folded&&!other.allIn)other.acted=false;
  }else if(action==="allIn"){
   const prev=s.currentBet;this.post(at,p.stack);
   if(p.street>prev){
    s.currentBet=p.street;
    if(s.currentBet-prev>=s.minRaise){
     s.minRaise=s.currentBet-prev;
     for(const other of s.players)if(other!==p&&!other.folded&&!other.allIn)other.acted=false;
    }
   }
  }else throw Error("Unknown poker action.");
  p.acted=true;
  s.message=p.name+" "+(action==="allIn"?"went all in":action==="raise"?"raised to "+p.street:action+"ed")+".";
  this.progress(at);
  this.advanceBots();
 }
 progress(index){
  const s=this.data;
  const standing=s.players.filter(p=>this.active(p));
  if(standing.length===1){this.awardLast(standing[0]);return;}
  const eligible=p=>this.active(p)&&!p.allIn&&(!p.acted||p.street<s.currentBet);
  const next=this.next(index,eligible);
  if(next>=0){s.toAct=next;return;}
  this.nextStreet();
 }
 nextStreet(){
  const s=this.data;
  if(s.street==="river"){this.showdown();return;}
  if(s.street==="preflop"){s.shoe.pop();s.community.push(s.shoe.pop(),s.shoe.pop(),s.shoe.pop());s.street="flop";}
  else if(s.street==="flop"){s.shoe.pop();s.community.push(s.shoe.pop());s.street="turn";}
  else{s.shoe.pop();s.community.push(s.shoe.pop());s.street="river";}
  s.currentBet=0;s.minRaise=BIG_BLIND;
  for(const p of s.players){p.street=0;p.acted=false;}
  const eligible=p=>this.active(p)&&!p.allIn;
  const next=this.next(s.dealer,eligible);
  if(next<0){this.nextStreet();return;}
  s.toAct=next;s.message=s.street.toUpperCase()+" — community cards revealed.";
 }
 showdown(){
  const s=this.data;while(s.community.length<5){s.shoe.pop();s.community.push(s.shoe.pop());}
  const result=distributePots(s.players,s.community);
  for(const p of s.players)p.stack+=result.payments[p.id]||0;
  s.phase="showdown";s.toAct=-1;
  s.message=result.descriptions.map(p=>p.winners.join(" & ")+" won "+p.amount+" Sana Coins with "+p.hand).join(" · ")||"Hand complete.";
 }
 awardLast(winner){
  const s=this.data,amount=s.players.reduce((n,p)=>n+p.contributed,0);
  winner.stack+=amount;s.phase="showdown";s.toAct=-1;
  s.message=winner.name+" takes "+amount+" Sana Coins. Everyone else folded.";
 }
 advanceBots(){
  const s=this.data;let count=0;
  while(s.phase==="playing"&&bot(s.players[s.toAct])&&count++<90){
   const p=s.players[s.toAct],owed=Math.max(0,s.currentBet-p.street);
   const decision=botDecision(s,p);
   if(decision==="fold")p.folded=true;
   else if(decision==="raise"&&p.stack>=owed+s.minRaise){
    const old=s.currentBet;this.post(s.toAct,owed+s.minRaise);
    s.currentBet=p.street;s.minRaise=Math.max(BIG_BLIND,s.currentBet-old);
    for(const other of s.players)if(other!==p&&!other.folded&&!other.allIn)other.acted=false;
   }else this.post(s.toAct,owed);
   p.acted=true;
   s.message=p.name+" "+(decision==="fold"?"folded":decision==="raise"?"raised":"acted")+".";
   this.progress(s.toAct);
  }
 }
 async fetch(request){
  const url=new URL(request.url);await this.load();
  if(url.pathname==="/wallet"&&request.method==="POST"){
   const {user}=await request.json();
   if(!user)return Response.json({error:"Sign in first"},{status:401});
   return Response.json(this.walletView(user));
  }
  if(url.pathname==="/slots/spin"&&request.method==="POST"){
   const {user}=await request.json();
   if(!user)return Response.json({error:"Sign in first"},{status:401});
   const wallet=this.wallet(user);
   if(wallet.balance<SLOT_PRICE)return Response.json({error:"You need 5 Sana Coins to spin."},{status:409});
   wallet.balance-=SLOT_PRICE;
   const spin=spinSlots();
   const won=spin.reward===100?125:spin.reward===50?65:spin.reward===25?35:spin.reward===5?10:0;
   wallet.balance+=won;await this.save();
   return Response.json({...spin,cost:SLOT_PRICE,won,net:won-SLOT_PRICE,wallet:this.walletView(user)});
  }
  if(url.pathname==="/blackjack/join"&&request.method==="POST"){
   const {user,name}=await request.json();
   if(!user)return Response.json({error:"Sign in first"},{status:401});
   try{
    this.wallet(user);joinBlackjack(this.data.blackjack,user,name);
    await this.save();this.blackjackBroadcast();
    return Response.json({ok:true,state:blackjackView(this.data.blackjack,user,this.walletView(user))});
   }catch(error){return Response.json({error:error.message},{status:409});}
  }
  if(url.pathname==="/blackjack/ws"){
   const user=url.searchParams.get("user");
   if(!this.data.blackjack.players.some(p=>p.id===user))return new Response("Join blackjack first",{status:403});
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];
   const old=this.blackjackSockets.get(user);if(old)try{old.close(4001,"Reconnected");}catch{}
   this.ctx.acceptWebSocket(server);server.serializeAttachment({user,kind:"blackjack"});
   this.blackjackSockets.set(user,server);
   const participant=this.data.blackjack.players.find(p=>p.id===user);
   if(participant)participant.online=true;
   await this.save();
   this.blackjackBroadcast();
   return new Response(null,{status:101,webSocket:client});
  }
  if(url.pathname==="/join"&&request.method==="POST"){
   const {user,name}=await request.json();
   if(!user)return Response.json({error:"Sign in to play."},{status:401});
   let seat=this.data.players.find(p=>p.id===user);
   if(!seat){
    if(this.data.phase==="playing")return Response.json({error:"Current hand in progress. Join after showdown."},{status:409});
    if(this.data.players.length>=MAX_PLAYERS){
     const botIndex=this.data.players.findIndex(p=>bot(p));
     if(botIndex>=0)this.data.players.splice(botIndex,1);
     else return Response.json({error:"Poker table full (4 players)."},{status:409});
    }
    const wallet=this.wallet(user);
    if(wallet.balance<SMALL_BLIND)return Response.json({error:"Not enough Sana Coins for poker."},{status:409});
    const buyin=Math.min(POKER_BUYIN,wallet.balance);
    wallet.balance-=buyin;
    seat={id:user,name:cleanName(name),kind:"human",stack:buyin,hole:[],street:0,contributed:0,folded:false,allIn:false,acted:false};
    this.data.players.push(seat);
   }
   await this.save();this.broadcast();
   return Response.json({ok:true,state:this.stateFor(user)});
  }
  if(url.pathname==="/ws"){
   const user=url.searchParams.get("user");
   if(!this.data.players.some(p=>p.id===user&&p.kind==="human"))return new Response("Not seated",{status:403});
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];
   const previous=this.sockets.get(user);
   if(previous)try{previous.close(4001,"Reconnected");}catch{}
   this.ctx.acceptWebSocket(server);server.serializeAttachment({user,kind:"poker"});this.sockets.set(user,server);
   this.send(server,this.stateFor(user));
   return new Response(null,{status:101,webSocket:client});
  }
  return new Response("Not found",{status:404});
 }
 async webSocketMessage(ws,raw){
  await this.load();const user=ws.deserializeAttachment?.()?.user;
  const isBlackjack=ws.deserializeAttachment?.()?.kind==="blackjack";
  if(!user||(isBlackjack?this.blackjackSockets.get(user)!==ws:this.sockets.get(user)!==ws))return;
  if(typeof raw==="string"&&raw.length>8192)return;
  let msg;try{msg=JSON.parse(typeof raw==="string"?raw:new TextDecoder().decode(raw));}catch{return;}
  try{
   if(ws.deserializeAttachment?.()?.kind==="blackjack"){
    const g=this.data.blackjack;
    reconcileBlackjack(g,new Set(this.blackjackSockets.keys()),this.data.wallets);
    if(msg.action==="leave"){
     disconnectBlackjack(g,user,this.data.wallets);
     await this.save();this.blackjackBroadcast();
     return;
    }
    if(msg.action==="mode")chooseBlackjackMode(g,msg.mode);
    else if(msg.action==="ready")readyBlackjack(g,user,this.data.wallets);
    else if(msg.action==="deal")beginBlackjack(g,this.data.wallets);
    else if(["hit","stand"].includes(msg.action))moveBlackjack(g,user,msg.action,this.data.wallets);
    else if(msg.action==="heartbeat"){this.send(ws,{type:"heartbeatAck"});return;}
    else return;
    await this.save();this.blackjackBroadcast();return;
   }
   if(msg.action==="cashOut"){
    if(this.data.phase==="playing")throw Error("Finish the poker hand first.");
    const index=this.data.players.findIndex(p=>p.id===user&&p.kind==="human");
    if(index>=0){
     const seat=this.data.players.splice(index,1)[0];
     this.wallet(user).balance+=seat.stack;this.data.phase="waiting";
     await this.save();this.broadcast();
     this.send(ws,{type:"pokerCashOut",wallet:this.walletView(user)});
    }
    return;
   }
   if(msg.action==="newHand"){
    if(this.data.phase==="playing")throw Error("Finish this hand first.");
    if(this.data.players.filter(p=>p.kind==="human").length<1)throw Error("A human player must join.");
    this.start();
   }else if(["fold","check","call","raise","allIn"].includes(msg.action)){
    this.playerAct(user,msg.action,msg.amount);
   }else if(msg.action==="addBot"){
    if(this.data.phase==="playing")throw Error("Wait until the hand ends.");
    if(this.data.players.length>=MAX_PLAYERS)throw Error("Table is full.");
    this.data.players.push({id:uid(),name:"Bot "+this.data.players.length,kind:"bot",stack:START_STACK,hole:[],street:0,contributed:0,folded:false,allIn:false,acted:false});
   }else if(msg.action==="heartbeat"){
    this.send(ws,{type:"heartbeatAck"});return;
   }else return;
   await this.save();this.broadcast();
  }catch(error){this.send(ws,{type:"pokerError",message:error.message});}
 }
 async webSocketClose(ws){
  const info=ws.deserializeAttachment?.(),user=info?.user;
  if(info?.kind==="blackjack"){
   if(this.blackjackSockets.get(user)===ws){
    this.blackjackSockets.delete(user);
    await this.load();
    disconnectBlackjack(this.data.blackjack,user,this.data.wallets);
    await this.save();
    this.blackjackBroadcast();
   }
  }
  else if(this.sockets.get(user)===ws)this.sockets.delete(user);
 }
 webSocketError(ws){this.webSocketClose(ws);}
}
