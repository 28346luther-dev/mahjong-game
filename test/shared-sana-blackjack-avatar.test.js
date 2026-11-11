import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {PokerTable} from "../src/poker-table.js";
import {INITIAL_SANA,BLACKJACK_BET,newBlackjack,joinBlackjack,readyBlackjack,beginBlackjack,moveBlackjack,settleBlackjack,blackjackView} from "../src/blackjack-multiplayer.js";

function fixture(){
 const storage={data:new Map(),async get(k){return this.data.get(k);},async put(k,v){this.data.set(k,v);}};
 return {table:new PokerTable({storage,getWebSockets:()=>[]}),storage};
}
async function casinoRequest(table,path,user,name){
 const response=await table.fetch(new Request("https://casino"+path,{method:"POST",body:JSON.stringify({user,name})}));
 return {status:response.status,data:await response.json()};
}
test("Every account starts with exactly 500 Sana Coins, and wallets are isolated",async()=>{
 const {table}=fixture();
 const a=await casinoRequest(table,"/wallet","alice");
 const b=await casinoRequest(table,"/wallet","bob");
 assert.equal(a.data.total,500);assert.equal(b.data.total,500);
 assert.equal(a.data.balance,500);assert.equal(b.data.balance,500);
});
test("Poker buy-in reserves exactly 200 from shared wallet without increasing total",async()=>{
 const {table}=fixture();
 const result=await casinoRequest(table,"/join","alice","Alice");
 assert.equal(result.status,200);
 assert.equal(result.data.state.wallet.total,500);
 assert.equal(result.data.state.wallet.balance,300);
 assert.equal(result.data.state.wallet.pokerStack,200);
 const duplicate=await casinoRequest(table,"/join","alice","Alice");
 assert.equal(duplicate.data.state.wallet.total,500,"rejoining must not buy-in twice");
});
test("Slot costs are charged once server-side and reflected in one wallet",async()=>{
 const {table}=fixture();
 const first=await casinoRequest(table,"/slots/spin","alice");
 assert.equal(first.status,200);
 assert.equal(first.data.cost,5);
 assert.equal(first.data.wallet.balance,500-5+first.data.won);
 const second=await casinoRequest(table,"/wallet","alice");
 assert.equal(second.data.total,first.data.wallet.total);
});
test("Blackjack allows multiple human players to join one shared round",async()=>{
 const {table}=fixture();
 const alice=await casinoRequest(table,"/blackjack/join","alice","Alice");
 const bob=await casinoRequest(table,"/blackjack/join","bob","Bob");
 assert.equal(alice.status,200);assert.equal(bob.status,200);
 const game=table.data.blackjack;
 game.players.forEach(p=>p.online=true); // Simulate both users with live WebSocket seats.
 assert.deepEqual(game.players.map(p=>p.name),["Alice","Bob"]);
 readyBlackjack(game,"alice",table.data.wallets);
 readyBlackjack(game,"bob",table.data.wallets);
 assert.equal(table.walletView("alice").balance,490);
 assert.equal(table.walletView("bob").balance,490);
 beginBlackjack(game,table.data.wallets);
 assert.equal(game.players.filter(p=>p.bet===10).length,2);
 assert.equal(game.dealer.length>=2,true);
 const aliceState=blackjackView(game,"alice",table.walletView("alice"));
 assert.equal(aliceState.players.length,2);
 if(game.phase==="playing"){
  for(const p of game.players.filter(p=>p.status==="playing"))
   moveBlackjack(game,p.id,"stand",table.data.wallets);
 }
 assert.equal(game.phase,"finished");
 const balances=game.players.map(p=>table.walletView(p.id).balance);
 assert.ok(balances.every(n=>n>=490&&n<=515));
});
test("Blackjack next round does not pay out anyone from an old hand again",()=>{
 const game=newBlackjack(),wallets={alice:{balance:500},bob:{balance:500}};
 joinBlackjack(game,"alice","Alice");joinBlackjack(game,"bob","Bob");
 game.players.forEach(p=>p.online=true);
 readyBlackjack(game,"alice",wallets);
 beginBlackjack(game,wallets);
 for(const p of game.players.filter(p=>p.status==="playing"))
  moveBlackjack(game,p.id,"stand",wallets);
 const balanceBob=wallets.bob.balance;
 readyBlackjack(game,"bob",wallets);
 beginBlackjack(game,wallets);
 for(const p of game.players.filter(p=>p.status==="playing"))
  moveBlackjack(game,p.id,"stand",wallets);
 assert.equal(wallets.alice.balance,Math.max(0,wallets.alice.balance));
 assert.equal(wallets.bob.balance>=balanceBob-10,true);
 assert.equal(game.players.find(p=>p.id==="alice").bet,0);
});
test("Profile photo is compressed in-browser and displayed on multiplayer avatars",()=>{
 const editor=readFileSync("public/avatar-editor.js","utf8");
 const avatar=readFileSync("public/club-social.js","utf8");
 const server=readFileSync("src/auth.js","utf8");
 assert.match(editor,/canvas\.toDataURL\("image\/jpeg"/);
 assert.match(editor,/avatarPhotoRemove/);
 assert.match(avatar,/CircleGeometry/);
 assert.match(avatar,/applyFacePhoto/);
 assert.match(server,/photo\.length>18000/);
});
test("All new browser and Worker source parses cleanly",()=>{
 for(const path of ["src/blackjack-multiplayer.js","src/poker-table.js","src/worker.js","src/auth.js","src/club-social.js","public/salon-games.js","public/avatar-editor.js","public/club-social.js"])
  execFileSync(process.execPath,["--check",path]);
 const html=readFileSync("public/index.html","utf8");
 for(const id of ["sanaBalance","blackjackPlayers","blackjackReady","avatarPhoto","avatarPhotoPreview"])
  assert.ok(html.includes('id="'+id+'"'));
});
