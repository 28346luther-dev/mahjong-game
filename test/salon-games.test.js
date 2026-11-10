import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {evaluateFive,evaluateSeven,compareScore,distributePots,deck,shuffle} from "../src/poker-rules.js";
import {PokerTable} from "../src/poker-table.js";
import {freshDeck,handValue,startBlackjack,blackjackMove,spinSlots,SLOT_SYMBOLS} from "../public/salon-rules.js";

test("Texas Hold'em evaluates straight flush, full house, two pair and wheel",()=>{
 const royal=evaluateSeven(["As","Ks","Qs","Js","Ts","2d","3c"]);
 const full=evaluateSeven(["Ah","Ad","Ac","Kh","Kd","5c","2s"]);
 const wheel=evaluateSeven(["As","2h","3c","4d","5s","9c","Kh"]);
 const pair=evaluateFive(["2s","2h","As","Kd","9c"]);
 assert.equal(royal.name,"Royal flush");
 assert.equal(full.name,"Full house");
 assert.equal(wheel.name,"Straight");
 assert.deepEqual(wheel.score,[4,5]);
 assert.equal(pair.name,"One pair");
 assert.ok(compareScore(royal,full)>0);
});
test("Hold'em side pots split fairly and folded players are ineligible",()=>{
 const p=(id,contributed,hole,folded=false)=>({id,name:id,contributed,hole,folded});
 const players=[
  p("a",100,["As","Ah"]),
  p("b",300,["Ks","Kh"]),
  p("c",300,["2s","3s"],true)
 ];
 const result=distributePots(players,["Ad","4c","5h","8d","9c"]);
 assert.equal(result.payments.a,300);
 assert.equal(result.payments.b,400);
 assert.equal(result.payments.c,0);
 assert.equal(Object.values(result.payments).reduce((a,b)=>a+b),700);
});
test("52-card poker and blackjack decks are complete",()=>{
 assert.equal(deck().length,52);
 assert.equal(new Set(deck()).size,52);
 assert.equal(shuffle(deck(),()=>.5).length,52);
 const cards=freshDeck();
 assert.equal(cards.length,52);
 assert.equal(new Set(cards.map(c=>c.face+c.suit)).size,52);
});
test("Blackjack handles ace softening, bust and dealer comparisons",()=>{
 assert.equal(handValue([{face:"A"},{face:"9"},{face:"A"}]),21);
 assert.equal(handValue([{face:"K"},{face:"Q"},{face:"4"}]),24);
 const game={phase:"playing",you:[{face:"K"},{face:"9"}],
  dealer:[{face:"8"},{face:"8"}],deck:[{face:"7"}]};
 const after=blackjackMove(game,"stand");
 assert.equal(after.phase,"finished");
 assert.equal(after.result,"You win!");
 assert.notEqual(after,game);
 const fresh=startBlackjack();
 assert.equal(fresh.you.length,2);
 assert.equal(fresh.dealer.length,2);
});
test("Free slots return recognized reels and scores with no wagers",()=>{
 for(let i=0;i<10;i++){
  const outcome=spinSlots();
  assert.equal(outcome.reels.length,3);
  assert.ok(outcome.reels.every(x=>SLOT_SYMBOLS.includes(x)));
  assert.ok([0,5,25,50,100].includes(outcome.reward));
 }
});
function harness(){
 const storage={data:new Map(),async get(k){return this.data.get(k);},async put(k,v){this.data.set(k,v);}};
 const ctx={storage,getWebSockets:()=>[]};
 return {table:new PokerTable(ctx),storage};
}
test("PokerTable lets multiple humans join and computer opponents fill seats",async()=>{
 const {table}=harness();
 const join=async(user,name)=>table.fetch(new Request("https://poker/join",{method:"POST",body:JSON.stringify({user,name})}));
 assert.equal((await join("alice","Alice")).status,200);
 assert.equal((await join("bob","Bob")).status,200);
 assert.equal(table.data.players.filter(p=>p.kind==="human").length,2);
 table.start();
 assert.equal(table.data.phase,"playing");
 assert.equal(table.data.players.length,2);
 assert.equal(table.data.players.every(p=>p.hole.length===2),true);
 assert.equal(table.data.players.reduce((sum,p)=>sum+p.contributed,0),30);
});
test("Heads-up Hold'em correctly alternates small blind and post-flop action",async()=>{
 const {table}=harness();
 for(const [user,name] of [["alice","Alice"],["bob","Bob"]]){
  const response=await table.fetch(new Request("https://poker/join",{
   method:"POST",body:JSON.stringify({user,name})
  }));
  assert.equal(response.status,200);
 }
 table.start();
 assert.equal(table.data.players[table.data.dealer].street,10,"dealer posts small blind heads-up");
 const dealer=table.data.players[table.data.dealer];
 const other=table.data.players[(table.data.dealer+1)%2];
 assert.equal(other.street,20,"other player posts big blind");
 assert.equal(table.data.players[table.data.toAct].id,dealer.id,"small blind acts first pre-flop");
 table.playerAct(dealer.id,"call");
 assert.equal(table.data.players[table.data.toAct].id,other.id);
 table.playerAct(other.id,"check");
 assert.equal(table.data.street,"flop");
 assert.equal(table.data.players[table.data.toAct].id,other.id,"big blind acts first after flop");
 assert.equal(table.data.community.length,3);
});
test("PokerTable starts with a bot opponent and masks cards from other humans",async()=>{
 const {table}=harness();
 await table.fetch(new Request("https://poker/join",{method:"POST",body:JSON.stringify({user:"alice",name:"Alice"})}));
 table.start();
 assert.equal(table.data.players.length,2);
 assert.equal(table.data.players.some(p=>p.kind==="bot"),true);
 const state=table.stateFor("alice");
 const other=state.players.find(p=>p.id!=="alice");
 assert.deepEqual(other.hole,["??","??"]);
 assert.equal(state.players.find(p=>p.id==="alice").hole.length,2);
});
test("Frontend integrates all salons, account avatar and TURN voice",()=>{
 const html=readFileSync("public/index.html","utf8");
 for(const id of ["salon-slots","slotSpin","salon-blackjack","blackjackHit","salon-poker","pokerPlayers","avatarName","avatarColor","avatarHair"])
  assert.match(html,new RegExp('id="'+id+'"'));
 const house=readFileSync("public/clubhouse.js","utf8");
 assert.match(house,/SalonGames\?\.open/);assert.match(house,/avatarYaw/);
 const client=readFileSync("public/club-social.js","utf8");
 assert.match(client,/\/api\/rtc\/ice/);assert.match(client,/getIce\(/);
});
test("All updated scripts parse and Durable Object migration exists",()=>{
 for(const path of ["src/poker-rules.js","src/poker-table.js","src/auth.js","src/club-social.js","src/worker.js","public/salon-rules.js","public/salon-games.js","public/avatar-editor.js","public/clubhouse.js","public/club-social.js","public/club-velvet-world.js"])
  execFileSync(process.execPath,["--check",path]);
 const wrangler=readFileSync("wrangler.toml","utf8");
 assert.match(wrangler,/class_name = "PokerTable"/);assert.match(wrangler,/tag = "v4"/);
});
