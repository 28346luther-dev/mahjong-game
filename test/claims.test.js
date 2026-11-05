import test from 'node:test';
import assert from 'node:assert/strict';
import { canWin, getChowChoices, getClaimOptions, chooseClaimWinner } from '../src/worker.js';

const tile=(id,key=id)=>({id,key,suit:id[0]==='c'?'characters':id[0]==='b'?'bamboo':id[0]==='d'?'dots':id[0]==='w'?'wind':'dragon',rank:Number(id.slice(1))||undefined});
const player=(id,hand=[])=>({id,name:id,hand,melds:[],discards:[],ready:false});

test('Chow choices are only consecutive numbered tiles in the discarded tile suit',()=>{
  const hand=[tile('c1','a'),tile('c2','b'),tile('c4','c'),tile('b2','d')];
  assert.deepEqual(getChowChoices(hand,tile('c3','discard')), [['a','b'],['b','c']]);
  assert.deepEqual(getChowChoices(hand,tile('w1','wind')), []);
});

test('Chow is offered only to the next player clockwise',()=>{
  const discard=tile('c3','discard');
  const s={phase:'claim',lastDiscard:{tile:discard,from:0},players:[
    player('a'),player('b',[tile('c1','1'),tile('c2','2')]),player('c',[tile('c1','3'),tile('c2','4')])
  ]};
  assert.ok(getClaimOptions(s,1).includes('chow'));
  assert.ok(!getClaimOptions(s,2).includes('chow'));
});

test('Mahjong outranks Kong/Pong and Chow',()=>{
  const players=[player('a'),player('b'),player('c'),player('d')];
  const winner=chooseClaimWinner(players,0,{b:{action:'chow'},c:{action:'pong'},d:{action:'mahjong'}});
  assert.equal(winner[0],'d');
});

test('Kong/Pong outrank Chow; equal claims go to nearest clockwise player',()=>{
  const players=[player('a'),player('b'),player('c'),player('d')];
  const winner=chooseClaimWinner(players,0,{b:{action:'pong'},c:{action:'kong'},d:{action:'chow'}});
  assert.equal(winner[0],'b');
});

test('Standard four-set-and-a-pair hand is recognised',()=>{
  const hand=['c1','c2','c3','c2','c3','c4','b5','b6','b7','d7','d8','d9','w1','w1'].map((id,i)=>tile(id,String(i)));
  assert.equal(canWin(hand,[]),true);
});

test('A winning Pong claim is applied after all eligible players respond',async()=>{
  const { MahjongRoom } = await import('../src/worker.js');
  const storage={async put(){},async get(){return null},async setAlarm(){},async deleteAlarm(){}};
  const room=new MahjongRoom({storage});
  const discard=tile('c3','discard');
  const players=[
    player('a'),
    player('b',[tile('c1','b1'),tile('c2','b2')]),
    player('c',[tile('c3','c1'),tile('c3','c2'),...Array.from({length:11},(_,i)=>tile('b'+((i%9)+1),'x'+i))]),
    player('d')
  ];
  players[0].discards=[discard];
  room.state={players,wall:[tile('d1','wall')],turn:0,dealer:0,phase:'claim',lastDiscard:{tile:discard,from:0},claimWindow:{eligible:['b','c'],responses:{b:{action:'chow',tiles:['b1','b2']},c:{action:'pong'}}},message:'',winner:null};
  room.resolveClaimWindow();
  assert.equal(room.state.turn,2);
  assert.equal(room.state.phase,'playing');
  assert.equal(players[2].melds[0].type,'pong');
  assert.equal(players[2].melds[0].tiles.length,3);
  assert.equal(players[0].discards.length,0);
  assert.equal(room.state.lastDiscard,null);
});
