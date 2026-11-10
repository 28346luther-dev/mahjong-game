import {AuthStore,sessionCookieName,emptySessionCookie} from "./auth.js";
export {AuthStore};
export {ClubSocial} from "./club-social.js";
export {PokerTable} from "./poker-table.js";
export {KartLeaderboard} from "./kart-leaderboard.js";

const TILE_NAMES = [
  ...Array.from({length:9},(_,i)=>({id:`c${i+1}`,name:`${i+1} Characters`,short:`${i+1}萬`,suit:"characters",rank:i+1})),
  ...Array.from({length:9},(_,i)=>({id:`b${i+1}`,name:`${i+1} Bamboo`,short:`${i+1}索`,suit:"bamboo",rank:i+1})),
  ...Array.from({length:9},(_,i)=>({id:`d${i+1}`,name:`${i+1} Dots`,short:`${i+1}筒`,suit:"dots",rank:i+1})),
  ...["East","South","West","North"].map((n,i)=>({id:`w${i+1}`,name:n,short:["東","南","西","北"][i],suit:"wind"})),
  ...["Red","Green","White"].map((n,i)=>({id:`z${i+1}`,name:`${n} Dragon`,short:["中","發","白"][i],suit:"dragon"}))
];
const TILE_BY_ID = Object.fromEntries(TILE_NAMES.map(t=>[t.id,t]));
const uid = () => crypto.randomUUID();
const code = () => Math.random().toString(36).slice(2,8).toUpperCase();
const shuffle = a => { for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const tileSet = () => shuffle(TILE_NAMES.flatMap(t=>Array.from({length:4},()=>({...t,key:uid()}))));
const SEATS = ["East","South","West","North"];

function counts(hand) {
  const out={};
  for(const t of hand)out[t.id]=(out[t.id]||0)+1;
  return out;
}
export function canWin(hand,melds=[]) {
  if(hand.length!==14-melds.length*3)return false;
  const c=counts(hand);
  for(const pair of Object.keys(c)){
    if(c[pair]<2)continue;
    c[pair]-=2;
    const ok=setsPossible(c);
    c[pair]+=2;
    if(ok)return true;
  }
  return false;
}
function setsPossible(c) {
  const first=Object.keys(c).find(k=>c[k]>0);
  if(!first)return true;
  if(c[first]>=3){c[first]-=3;if(setsPossible(c)){c[first]+=3;return true;}c[first]+=3;}
  const t=TILE_BY_ID[first];
  if(t.suit!=="wind"&&t.suit!=="dragon"&&t.rank<=7){
    const a=`${first[0]}${t.rank+1}`,b=`${first[0]}${t.rank+2}`;
    if(c[a]>0&&c[b]>0){c[first]--;c[a]--;c[b]--;if(setsPossible(c)){c[first]++;c[a]++;c[b]++;return true;}c[first]++;c[a]++;c[b]++;}
  }
  return false;
}
export function getChowChoices(hand,discard) {
  if(!discard||!TILE_BY_ID[discard.id]||!["characters","bamboo","dots"].includes(discard.suit))return [];
  const choices=new Map();
  for(let i=0;i<hand.length;i++)for(let j=i+1;j<hand.length;j++){
    const a=hand[i],b=hand[j];
    if(a.suit!==discard.suit||b.suit!==discard.suit)continue;
    const ranks=[discard.rank,a.rank,b.rank].sort((x,y)=>x-y);
    if(ranks[1]!==ranks[0]+1||ranks[2]!==ranks[1]+1)continue;
    const ids=[a.id,b.id].sort().join(":");
    if(!choices.has(ids))choices.set(ids,[a.key,b.key]);
  }
  return [...choices.values()];
}
export function getClaimOptions(s,idx) {
  if(!s.lastDiscard||s.phase!=="claim"||idx===s.lastDiscard.from)return [];
  const p=s.players[idx],tile=s.lastDiscard.tile;
  const n=p.hand.filter(t=>t.id===tile.id).length,opts=[];
  if(n>=2)opts.push("pong");
  if(n>=3)opts.push("kong");
  if(idx===(s.lastDiscard.from+1)%s.players.length&&getChowChoices(p.hand,tile).length)opts.push("chow");
  if(canWin([...p.hand,tile],p.melds))opts.push("mahjong");
  return opts;
}
const CLAIM_PRIORITY={chow:1,pong:2,kong:2,mahjong:3};
export function chooseClaimWinner(players,from,responses) {
  const claims=Object.entries(responses).filter(([,r])=>r&&r.action!=="pass");
  claims.sort(([idA,a],[idB,b])=>{
    const priority=(CLAIM_PRIORITY[b.action]||0)-(CLAIM_PRIORITY[a.action]||0);
    if(priority)return priority;
    const ia=players.findIndex(p=>p.id===idA),ib=players.findIndex(p=>p.id===idB),n=players.length;
    return ((ia-from+n)%n)-((ib-from+n)%n);
  });
  return claims[0]||null;
}
function sortHand(hand) {
  const order={characters:0,bamboo:1,dots:2,wind:3,dragon:4};
  hand.sort((a,b)=>order[a.suit]-order[b.suit]||(a.rank||0)-(b.rank||0));
}
function publicState(s,viewer) {
  const me=s.players.findIndex(p=>p.id===viewer),window=s.claimWindow;
  const spectators=s.spectators||[];
  const spectator=spectators.find(p=>p.id===viewer);
  const submitted=!!(window&&window.responses[viewer]);
  const waiting=window?window.eligible.filter(id=>!window.responses[id]).map(id=>s.players.find(p=>p.id===id)?.name||"Player"):[];
  return {
    code:s.code,phase:s.phase,ruleset:"Hong Kong-style",
    spectator:!!spectator,spectatorQueue:spectators.map(p=>({id:p.id,name:p.name,ready:!!p.ready})),
    queuePosition:spectator?.ready?spectators.filter(p=>p.ready).findIndex(p=>p.id===viewer)+1:0,
    nextRoundReady:s.phase==="finished"?s.players.filter(p=>p.ready).length+spectators.filter(p=>p.ready).length:0,
    round:s.round||0,
    players:s.players.map((p,i)=>({
      id:p.id,name:p.name,seat:SEATS[i],ready:p.ready,
      hand:i===me?p.hand.map(t=>({...t})):undefined,handCount:p.hand.length+(s.pendingDraw&&s.turn===i?1:0),
      melds:p.melds.map(m=>({...m,tiles:m.tiles.map(t=>({...t}))})),discards:p.discards.map(t=>({...t}))
    })),
    wallCount:s.wall.length,turn:s.turn,dealer:s.dealer,lastDiscard:s.lastDiscard,
    message:s.message,winner:s.winner,myIndex:me,
    claimOptions:me>=0&&s.phase==="claim"&&!submitted?getClaimOptions(s,me):[],
    chowChoices:me>=0&&s.phase==="claim"&&!submitted?getChowChoices(s.players[me].hand,s.lastDiscard?.tile):[],
    claimSubmitted:submitted,claimWaiting:waiting,
    pendingDraw:me>=0&&s.turn===me&&s.pendingDraw?{...s.pendingDraw}:null,
    reaction:s.lastReaction||null,
    selfWin:me>=0&&s.phase==="playing"&&s.turn===me&&canWin(s.pendingDraw&&s.turn===me?[...s.players[me].hand,s.pendingDraw]:s.players[me].hand,s.players[me].melds)
  };
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==="/api/health"){
      return Response.json({
        ok:true,
        service:"mahjong-game",
        version:"auth-worker-first-2026-11-09",
        authentication:"enabled",
        bindings:{auth:!!env.AUTH,rooms:!!env.ROOMS,assets:!!env.ASSETS}
      },{headers:{"cache-control":"no-store"}});
    }
    const authStub=env.AUTH.get(env.AUTH.idFromName("global-accounts"));
    const cookies=request.headers.get("cookie")||"";
    const sessionMatch=cookies.match(new RegExp("(?:^|;\\s*)"+sessionCookieName+"=([a-f0-9]{64})(?:;|$)"));
    const token=sessionMatch?.[1]||"";
    const isSecure=url.protocol==="https:";
    const authenticate=async()=>{
      if(!token)return null;
      const res=await authStub.fetch("https://auth/me",{method:"POST",body:JSON.stringify({token})});
      return res.ok?await res.json():null;
    };
    if(url.pathname==="/api/auth/status"){
      try{
        const response=await authStub.fetch("https://auth/health",{method:"POST",body:"{}"});
        if(!response.ok)return Response.json({ok:false,component:"account-storage",code:"AUTH_STORAGE_CHECK_FAILED"},{status:503,headers:{"cache-control":"no-store"}});
        return Response.json({ok:true,component:"account-storage"},{headers:{"cache-control":"no-store"}});
      }catch(error){
        console.error("Auth storage health check failed",error?.name,error?.message);
        return Response.json({ok:false,component:"account-storage",code:"AUTH_STORAGE_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});
      }
    }
    if(url.pathname==="/api/profile"&&(request.method==="GET"||request.method==="POST")){
      if(!token)return Response.json({error:"Sign in first"},{status:401});
      let details={};if(request.method==="POST"){
        if(request.headers.get("origin")&&request.headers.get("origin")!==url.origin)
          return Response.json({error:"Invalid origin"},{status:403});
        if(Number(request.headers.get("content-length")||0)>25000)return Response.json({error:"Profile picture too large (maximum 18 KB)"},{status:413});
        try{details=await request.json();}catch{return Response.json({error:"Invalid JSON"},{status:400});}
        details.update=true;
      }
      return authStub.fetch("https://auth/profile",{method:"POST",body:JSON.stringify({token,...details})});
    }
    if(url.pathname.startsWith("/api/auth/")){
      if(url.pathname==="/api/auth/me"){
        const me=await authenticate();
        return me?Response.json(me,{headers:{"cache-control":"no-store"}}):Response.json({error:"Not signed in"},{status:401,headers:{"cache-control":"no-store"}});
      }
      if(url.pathname==="/api/auth/logout"&&request.method==="POST"){
        if(token)await authStub.fetch("https://auth/logout",{method:"POST",body:JSON.stringify({token})});
        return Response.json({ok:true},{headers:{"set-cookie":emptySessionCookie,"cache-control":"no-store"}});
      }
      if((url.pathname==="/api/auth/login"||url.pathname==="/api/auth/register")&&request.method==="POST"){
        if((request.headers.get("content-type")||"").split(";")[0].trim()!=="application/json")
          return Response.json({error:"Expected JSON"},{status:415});
        if(Number(request.headers.get("content-length")||"0")>8192)return Response.json({error:"Request too large"},{status:413});
        const origin=request.headers.get("origin");
        if(origin&&origin!==url.origin)return Response.json({error:"Invalid request origin"},{status:403});
        let body;try{body=await request.json();}catch{return Response.json({error:"Invalid JSON"},{status:400});}
        const action=url.pathname.endsWith("/register")?"register":"login";
        const requestId=crypto.randomUUID();
        try{
          const response=await authStub.fetch("https://auth/"+action,{
            method:"POST",body:JSON.stringify({email:body.email,password:body.password,secure:isSecure})
          });
          const contentType=response.headers.get("content-type")||"";
          if(!contentType.toLowerCase().includes("application/json")){
            console.error("Auth Durable Object returned unexpected content-type",action,response.status,requestId);
            return Response.json({error:"Account service returned an unexpected response. Please try again.",code:"AUTH_UPSTREAM_FORMAT",requestId},{status:502,headers:{"cache-control":"no-store"}});
          }
          return response;
        }catch(error){
          // Don't log credentials or other request payloads.
          console.error("Auth Durable Object error",action,requestId,error?.name,error?.message);
          return Response.json({error:"The account service could not complete your request. Please report the reference code.",code:"AUTH_BACKEND_FAILURE",requestId},{status:503,headers:{"cache-control":"no-store"}});
        }
      }
      return new Response("Not found",{status:404});
    }
    // Read-only public rankings; no account identity or personal data exposed.
    if(url.pathname==="/api/kart/leaderboard"&&request.method==="GET"){
      return env.KART.get(env.KART.idFromName("velvet-circuit-global"))
        .fetch("https://kart/leaderboard",{method:"GET"});
    }
    if(url.pathname.startsWith("/api/")){
      const viewer=await authenticate();
      if(!viewer)return Response.json({error:"Please sign in first"},{status:401});
      if(url.pathname.startsWith("/api/kart/")){
        if(request.method!=="GET"&&request.method!=="POST")
          return Response.json({error:"Method not allowed"},{status:405});
        const action=url.pathname.slice("/api/kart".length);
        if(!["/leaderboard","/start","/sample","/finish","/abort"].includes(action))
          return Response.json({error:"Unknown kart endpoint"},{status:404});
        const origin=request.headers.get("origin");
        if(origin&&origin!==url.origin)return Response.json({error:"Invalid origin"},{status:403});
        const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(viewer.email));
        const userId=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
        const stub=env.KART.get(env.KART.idFromName("velvet-circuit-global"));
        if(action==="/leaderboard"){
          return stub.fetch("https://kart/leaderboard",{method:"GET"});
        }
        if(request.method!=="POST")return Response.json({error:"POST required"},{status:405});
        if(Number(request.headers.get("content-length")||0)>2048)
          return Response.json({error:"Invalid kart request"},{status:413});
        let body={};try{body=await request.json();}catch{return Response.json({error:"Invalid JSON"},{status:400});}
        if(action==="/start"){
          const profileRes=await authStub.fetch("https://auth/profile",{
            method:"POST",body:JSON.stringify({token})
          });
          const profile=profileRes.ok?await profileRes.json():{name:"Racer"};
          body.name=profile.name;
        }
        return stub.fetch("https://kart"+action,{
          method:"POST",body:JSON.stringify({user:userId,
            raceId:body.raceId,index:body.index,x:body.x,z:body.z,pit:body.pit===true,name:body.name})
        });
      }
      if(["/api/sana/wallet","/api/sana/spin","/api/blackjack/join"].includes(url.pathname)){
        if(url.pathname!=="/api/sana/wallet"&&request.method!=="POST")
          return Response.json({error:"POST required"},{status:405});
        const origin=request.headers.get("origin");
        if(origin&&origin!==url.origin)return Response.json({error:"Invalid origin"},{status:403});
        const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(viewer.email));
        const userId=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
        const target=url.pathname==="/api/sana/spin"?"/slots/spin":url.pathname==="/api/blackjack/join"?"/blackjack/join":"/wallet";
        let name="Player";
        if(target==="/blackjack/join"){
          const r=await authStub.fetch("https://auth/profile",{method:"POST",body:JSON.stringify({token})});
          if(r.ok)name=(await r.json()).name;
        }
        return env.POKER.get(env.POKER.idFromName("club-texas-holdem")).fetch("https://poker"+target,{
          method:"POST",body:JSON.stringify({user:userId,name})
        });
      }
      if(url.pathname==="/api/poker/join"&&request.method==="POST"){
        const origin=request.headers.get("origin");
        if(origin&&origin!==url.origin)return Response.json({error:"Invalid request origin"},{status:403});
        const profileRes=await authStub.fetch("https://auth/profile",{method:"POST",body:JSON.stringify({token})});
        const profile=profileRes.ok?await profileRes.json():{name:"Player"};
        const user=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(viewer.email));
        const userId=Array.from(new Uint8Array(user),b=>b.toString(16).padStart(2,"0")).join("");
        return env.POKER.get(env.POKER.idFromName("club-texas-holdem")).fetch("https://poker/join",{
          method:"POST",body:JSON.stringify({user:userId,name:profile.name})
        });
      }
      if(url.pathname==="/api/rtc/ice"&&request.method==="GET"){
        // ICE configuration is issued only to signed-in users. TURN key secrets
        // stay in Cloudflare Worker secrets and are never sent to the browser.
        const defaultServers=[{urls:["stun:stun.cloudflare.com:3478","stun:stun.l.google.com:19302"]}];
        if(env.TURN_KEY_ID&&env.TURN_KEY_API_TOKEN){
          try{
            const upstream=await fetch("https://rtc.live.cloudflare.com/v1/turn/keys/"+encodeURIComponent(env.TURN_KEY_ID)+"/credentials/generate-ice-servers",{
              method:"POST",
              headers:{"authorization":"Bearer "+env.TURN_KEY_API_TOKEN,"content-type":"application/json"},
              body:JSON.stringify({ttl:3600})
            });
            if(upstream.ok){
              const payload=await upstream.json();
              if(Array.isArray(payload.iceServers)&&payload.iceServers.length)
                return Response.json({iceServers:payload.iceServers,relayAvailable:true},{headers:{"cache-control":"no-store"}});
            }
            console.error("TURN credentials unavailable",upstream.status);
          }catch(e){console.error("TURN credentials request failed",e?.name);}
        }
        return Response.json({iceServers:defaultServers,relayAvailable:false},{headers:{"cache-control":"no-store"}});
      }
      if(url.pathname==="/api/sessions"&&request.method==="GET"){
        return env.CLUB.get(env.CLUB.idFromName("main-lobby")).fetch("https://club/sessions");
      }
      if(url.pathname==="/api/create"&&request.method==="POST"){
        const body=await request.json(),roomCode=code(),stub=env.ROOMS.get(env.ROOMS.idFromName(roomCode));
        const res=await stub.fetch("https://room/init",{method:"POST",body:JSON.stringify({name:String(body.name||"Player 1").slice(0,20),code:roomCode})});
        return new Response(JSON.stringify({...(await res.json()),code:roomCode}),{headers:{"content-type":"application/json"}});
      }
      if(url.pathname==="/api/join"&&request.method==="POST"){
        const body=await request.json(),roomCode=String(body.code||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
        if(!/^[A-Z0-9]{6}$/.test(roomCode))return Response.json({error:"Enter a valid six-character room code."},{status:400});
        return env.ROOMS.get(env.ROOMS.idFromName(roomCode)).fetch("https://room/join",{method:"POST",body:JSON.stringify({name:String(body.name||"Player").slice(0,20)})});
      }
      return new Response("Not found",{status:404});
    }
    if(url.pathname==="/blackjack/ws"){
      if(request.headers.get("upgrade")?.toLowerCase()!=="websocket")
        return Response.json({error:"Upgrade required"},{status:426});
      const viewer=await authenticate();
      if(!viewer)return Response.json({error:"Sign in first"},{status:401});
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(viewer.email));
      const userId=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
      return env.POKER.get(env.POKER.idFromName("club-texas-holdem")).fetch(
        new Request("https://poker/blackjack/ws?user="+userId,{headers:new Headers(request.headers)})
      );
    }
    if(url.pathname==="/poker/ws"){
      if(request.headers.get("upgrade")?.toLowerCase()!=="websocket")
        return Response.json({error:"Upgrade required"},{status:426});
      const viewer=await authenticate();
      if(!viewer)return Response.json({error:"Sign in first"},{status:401});
      const user=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(viewer.email));
      const userId=Array.from(new Uint8Array(user),b=>b.toString(16).padStart(2,"0")).join("");
      const headers=new Headers(request.headers);
      return env.POKER.get(env.POKER.idFromName("club-texas-holdem")).fetch(
        new Request("https://poker/ws?user="+userId,{headers})
      );
    }
    if(url.pathname==="/club/ws"){
      if(request.headers.get("upgrade")?.toLowerCase()!=="websocket")
        return Response.json({error:"WebSocket upgrade required"},{status:426});
      const viewer=await authenticate();
      if(!viewer)return Response.json({error:"Please sign in first"},{status:401});
      const headers=new Headers(request.headers);
      const profileRes=await authStub.fetch("https://auth/profile",{method:"POST",body:JSON.stringify({token})});
      const profile=profileRes.ok?await profileRes.json():{name:viewer.email.split("@")[0].slice(0,22),color:"ruby",hair:"dark"};
      headers.set("x-club-user",viewer.email);
      headers.set("x-club-name",profile.name);
      headers.set("x-club-color",profile.color);
      headers.set("x-club-hair",profile.hair);
      if(profile.photo)headers.set("x-club-photo",profile.photo);
      const lobby=env.CLUB.get(env.CLUB.idFromName("main-lobby"));
      return lobby.fetch(new Request("https://club/ws",{method:"GET",headers}));
    }
    if(url.pathname==="/ws"){
      if(!await authenticate())return new Response("Authentication required",{status:401});
      const roomCode=(url.searchParams.get("code")||"").toUpperCase(),playerId=url.searchParams.get("player");
      if(!roomCode||!playerId)return new Response("Missing room or player",{status:400});
      return env.ROOMS.get(env.ROOMS.idFromName(roomCode)).fetch(new Request(`https://room/ws?player=${encodeURIComponent(playerId)}`,request));
    }
    return env.ASSETS.fetch(request);
  }
};

export class MahjongRoom {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.state=null;this.sockets=new Map();this.reactionTransfers=new Map();this.submittedReactions=new Set();
    // Hibernatable WebSockets are reattached to a new Durable Object instance on wake.
    for(const ws of ctx.getWebSockets?.()||[]){
      const attachment=ws.deserializeAttachment?.();
      const playerId=attachment?.playerId;
      if(!playerId)continue;
      const older=this.sockets.get(playerId);
      if(older&&older!==ws)try{older.close(4001,"Reconnected elsewhere");}catch{}
      this.sockets.set(playerId,ws);

    }
  }
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==="/init"&&request.method==="POST"){
      if(this.state||await this.ctx.storage.get("state"))return Response.json({error:"Room already exists"},{status:409});
      const {name,code:roomCode}=await request.json(),player={id:uid(),name,hand:[],melds:[],discards:[],ready:false};
      this.state={code:roomCode||"",players:[player],spectators:[],round:0,wall:[],turn:0,dealer:0,phase:"lobby",pendingDraw:null,lastReaction:null,claimWindow:null,message:`${name} created the room.`,winner:null};
      await this.save();return Response.json({playerId:player.id});
    }
    if(url.pathname==="/join"&&request.method==="POST"){
      await this.load();if(!this.state)return Response.json({error:"Room not found."},{status:404});
      const {name}=await request.json();
      const p={id:uid(),name:String(name||"Player").slice(0,20),hand:[],melds:[],discards:[],ready:false};
      this.state.spectators||=[];
      const spectate=this.state.phase!=="lobby"||this.state.players.length>=4;
      if(spectate){
        if(this.state.spectators.length>=24)return Response.json({error:"Spectator lobby is full."},{status:409});
        this.state.spectators.push(p);
        this.state.message=p.name+" joined as a spectator. They can queue for the next round.";
      }else{
        this.state.players.push(p);this.state.message=p.name+" joined the table.";
      }
      await this.save();this.broadcast();
      return Response.json({playerId:p.id,spectator:spectate});
    }
    if(url.pathname==="/ws"){
      await this.load();if(!this.state)return new Response("Room not found",{status:404});
      const playerId=url.searchParams.get("player");if(!this.state.players.some(p=>p.id===playerId)&&!(this.state.spectators||[]).some(p=>p.id===playerId))return new Response("Player not found",{status:404});
      const pair=new WebSocketPair(),client=pair[0],server=pair[1];
      const old=this.sockets.get(playerId);
      // A reconnection replaces the previous socket without removing the player.
      if(old)try{old.close(4001,"Reconnected elsewhere");}catch{}
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({playerId});
      this.sockets.set(playerId,server);

      server.send(JSON.stringify({type:"state",state:publicState(this.state,playerId)}));

      return new Response(null,{status:101,webSocket:client});
    }
    return new Response("Not found",{status:404});
  }
  async webSocketMessage(ws,data){
    const playerId=ws.deserializeAttachment?.()?.playerId;
    if(!playerId||this.sockets.get(playerId)!==ws)return;
    try{await this.onMessage(playerId,typeof data==="string"?data:new TextDecoder().decode(data));}
    catch(error){
      console.error("Mahjong socket message failed",error?.name,error?.message);
      try{ws.send(JSON.stringify({type:"error",message:"Could not process that move. Please try again."}));}catch{}
    }
  }
  async webSocketClose(ws){
    const id=ws.deserializeAttachment?.()?.playerId;
    if(id&&this.sockets.get(id)===ws){this.sockets.delete(id);this.reactionTransfers.delete(id);}
  }
  async webSocketError(ws){await this.webSocketClose(ws);}
  async load(){if(!this.state)this.state=await this.ctx.storage.get("state");}
  async save(){
    await this.ctx.storage.put("state",this.state);
    if(this.env?.CLUB&&/^[A-Z0-9]{6}$/.test(this.state?.code||"")){
      try{
        await this.env.CLUB.get(this.env.CLUB.idFromName("main-lobby")).fetch(
          "https://club/sessions/update",{method:"POST",body:JSON.stringify({
            code:this.state.code,phase:this.state.phase,round:this.state.round||0,
            players:this.state.players.length,spectators:(this.state.spectators||[]).length
          })});
      }catch(error){console.error("Mahjong room listing update",error?.message);}
    }
  }
  broadcast(){if(!this.state)return;for(const [id,ws] of this.sockets){try{ws.send(JSON.stringify({type:"state",state:publicState(this.state,id)}));}catch{}}}
  async alarm(){
    await this.load();const s=this.state;if(!s||s.phase!=="claim"||!s.claimWindow)return;
    for(const id of s.claimWindow.eligible)if(!s.claimWindow.responses[id])s.claimWindow.responses[id]={action:"pass"};
    this.resolveClaimWindow();await this.save();this.broadcast();
  }
  // Short reaction videos travel as small bounded WebSocket messages. The Durable
  // Object forwards each chunk only to other players and never persists video.
  reactionBroadcast(from,data){
    for(const [id,ws] of this.sockets)if(id!==from){
      try{ws.send(JSON.stringify(data));}catch{}
    }
  }
  handleReactionClip(playerId,msg){
    const event=this.state?.lastReaction;
    if(!event||event.playerId!==playerId||event.id!==msg.eventId||Date.now()-event.at>90000)return;
    const transfer=this.reactionTransfers.get(playerId);
    if(msg.action==="reactionClipStart"){
      if(this.submittedReactions.has(event.id)||transfer)return;
      const mime=String(msg.mime||"");
      if(!/^video\/(webm|mp4)(;[a-zA-Z0-9=.,+ -]+)?$/.test(mime))return;
      const chunks=msg.chunks;
      if(!Number.isInteger(chunks)||chunks<1||chunks>56)return;
      this.reactionTransfers.set(playerId,{eventId:event.id,mime,chunks,next:0,total:0,started:Date.now()});
      this.reactionBroadcast(playerId,{type:"reactionClipStart",eventId:event.id,from:playerId,
        name:event.playerName,claim:event.claim,mime,chunks});
      return;
    }
    if(!transfer||transfer.eventId!==event.id||Date.now()-transfer.started>30000){
      this.reactionTransfers.delete(playerId);return;
    }
    if(msg.action==="reactionClipChunk"){
      if(!Number.isInteger(msg.index)||msg.index!==transfer.next||
         typeof msg.data!=="string"||msg.data.length>12000||
         !/^[A-Za-z0-9+/]*={0,2}$/.test(msg.data)){
        this.reactionTransfers.delete(playerId);
        this.reactionBroadcast(playerId,{type:"reactionClipAbort",eventId:event.id});return;
      }
      transfer.total+=msg.data.length;
      if(transfer.total>360000){
        this.reactionTransfers.delete(playerId);
        this.reactionBroadcast(playerId,{type:"reactionClipAbort",eventId:event.id});return;
      }
      transfer.next++;
      this.reactionBroadcast(playerId,{type:"reactionClipChunk",eventId:event.id,index:msg.index,data:msg.data});
      return;
    }
    if(msg.action==="reactionClipEnd"){
      if(transfer.next!==transfer.chunks){this.reactionTransfers.delete(playerId);return;}
      this.reactionTransfers.delete(playerId);
      this.submittedReactions.add(event.id);
      if(this.submittedReactions.size>32)this.submittedReactions.delete(this.submittedReactions.values().next().value);
      this.reactionBroadcast(playerId,{type:"reactionClipEnd",eventId:event.id});
      this.send(playerId,{type:"reactionClipAccepted",eventId:event.id});
    }
  }
  async onMessage(playerId,raw){
    await this.load();const s=this.state;if(!s)return;
    if(typeof raw!=="string"||raw.length>30000)return;
    let msg;try{msg=JSON.parse(raw);}catch{return;}
    if(msg.action==="heartbeat"){this.send(playerId,{type:"heartbeatAck"});return;}
    if(["reactionClipStart","reactionClipChunk","reactionClipEnd"].includes(msg.action)){
      this.handleReactionClip(playerId,msg);return;
    }
    const idx=s.players.findIndex(p=>p.id===playerId);
    const observer=(s.spectators||[]).find(p=>p.id===playerId);
    if(msg.action==="queueNext"&&observer&&s.phase!=="lobby"){
      observer.ready=!observer.ready;
      s.message=observer.name+(observer.ready?" joined the next-round queue.":" left the next-round queue.");
      await this.save();this.broadcast();return;
    }
    if(msg.action==="nextReady"&&idx>=0&&s.phase==="finished"){
      s.players[idx].ready=!s.players[idx].ready;
      s.message=s.players[idx].name+(s.players[idx].ready?" will play the next round.":" is sitting out the next round.");
      await this.save();this.broadcast();return;
    }
    if(msg.action==="nextRound"&&s.phase==="finished"){
      const queued=(s.spectators||[]).filter(p=>p.ready);
      const returning=s.players.filter(p=>p.ready);
      const lineup=[...queued,...returning].slice(0,4);
      if(lineup.length<2){this.send(playerId,{type:"error",message:"At least two people must opt in to start the next round."});return;}
      const ids=new Set(lineup.map(p=>p.id));
      s.spectators=[...s.players,...(s.spectators||[])].filter(p=>!ids.has(p.id)).map(p=>({...p,hand:[],melds:[],discards:[],ready:false}));
      s.players=lineup.map(p=>({...p,hand:[],melds:[],discards:[],ready:false}));
      s.dealer=0;this.startGame();await this.save();this.broadcast();return;
    }
    if(idx<0)return;
    const p=s.players[idx];
    if(msg.action==="ready"&&s.phase==="lobby"){
      p.ready=!p.ready;s.message=`${p.name} ${p.ready?"is ready":"is not ready"}.`;
      if(s.players.length===4&&s.players.every(x=>x.ready))this.startGame();
    }else if(msg.action==="start"&&s.phase==="lobby"&&idx===0&&s.players.length>=2){this.startGame();}
    else if(msg.action==="discard"&&s.phase==="playing"&&s.turn===idx&&!s.pendingDraw&&p.hand.length%3===2&&p.hand.some(t=>t.key===msg.tileKey)){
      const at=p.hand.findIndex(t=>t.key===msg.tileKey),tile=p.hand.splice(at,1)[0];p.discards.push(tile);
      s.lastDiscard={tile,from:idx};s.phase="claim";await this.openClaimWindow();
      if(s.phase==="claim")s.message=`${p.name} discarded ${tile.name}. Claim window: Mahjong, then Kong/Pong, then Chow.`;
    }else if(msg.action==="draw"&&s.phase==="playing"&&s.turn===idx&&!s.pendingDraw&&p.hand.length%3===1){
      this.drawFor(p);if(s.phase!=="finished")s.message=`${p.name} drew a tile and is choosing whether to keep it.`;
    }else if(msg.action==="keepDrawn"&&s.phase==="playing"&&s.turn===idx&&s.pendingDraw){
      p.hand.push(s.pendingDraw);s.pendingDraw=null;s.message=`${p.name} kept the drawn tile and must discard one tile.`;
    }else if(msg.action==="discardDrawn"&&s.phase==="playing"&&s.turn===idx&&s.pendingDraw){
      const tile=s.pendingDraw;s.pendingDraw=null;p.discards.push(tile);
      s.lastDiscard={tile,from:idx};s.phase="claim";await this.openClaimWindow();
      if(s.phase==="claim")s.message=`${p.name} discarded the drawn ${tile.name}. Claim window open.`;
    }else if(msg.action==="selfWin"&&s.phase==="playing"&&s.turn===idx&&canWin(s.pendingDraw?[...p.hand,s.pendingDraw]:p.hand,p.melds)){
      if(s.pendingDraw){p.hand.push(s.pendingDraw);s.pendingDraw=null;}
      s.phase="finished";s.winner=playerId;s.message=`${p.name} wins by self-draw!`;
      s.lastReaction={id:uid(),playerId,playerName:p.name,claim:"mahjong",at:Date.now()};
    }else if((msg.action==="pass"||["pong","kong","chow","mahjong"].includes(msg.action))&&s.phase==="claim"&&s.claimWindow){
      const w=s.claimWindow,options=w.eligible.includes(playerId)?getClaimOptions(s,idx):[];
      if(!w.eligible.includes(playerId)||w.responses[playerId]){this.send(playerId,{type:"error",message:"You do not have an active claim to respond to."});return;}
      if(msg.action!=="pass"&&!options.includes(msg.action)){this.send(playerId,{type:"error",message:"That claim is not available."});return;}
      let response={action:msg.action};
      if(msg.action==="chow"){
        const requested=Array.isArray(msg.tiles)?msg.tiles:[];
        const valid=getChowChoices(p.hand,s.lastDiscard.tile).some(pair=>pair.length===2&&pair.every(k=>requested.includes(k))&&requested.length===2);
        if(!valid){this.send(playerId,{type:"error",message:"Choose one of the displayed Chow combinations."});return;}
        response.tiles=requested;
      }
      w.responses[playerId]=response;
      const outstanding=w.eligible.filter(id=>!w.responses[id]);
      if(!outstanding.length){this.resolveClaimWindow();await this.save();await this.ctx.storage.deleteAlarm();}
      else s.message=`${p.name} ${msg.action==="pass"?"passed":`called ${msg.action.toUpperCase()}`}. Waiting for ${outstanding.length} other response${outstanding.length===1?"":"s"}.`;
    }else{return;}
    for(const player of s.players)sortHand(player.hand);
    await this.save();this.broadcast();
  }
  async openClaimWindow(){
    const s=this.state,eligible=[];
    for(let i=0;i<s.players.length;i++)if(i!==s.lastDiscard.from&&getClaimOptions(s,i).length)eligible.push(s.players[i].id);
    s.claimWindow={eligible,responses:{}};
    if(!eligible.length){this.resolveClaimWindow();return;}
    await this.save();
    await this.ctx.storage.setAlarm(Date.now()+18000);
  }
  resolveClaimWindow(){
    const s=this.state,w=s.claimWindow;if(!w||!s.lastDiscard)return;
    const chosen=chooseClaimWinner(s.players,s.lastDiscard.from,w.responses),discard=s.lastDiscard.tile,from=s.lastDiscard.from;
    if(!chosen){
      const next=(from+1)%s.players.length;s.lastDiscard=null;s.claimWindow=null;s.turn=next;s.phase="playing";
      this.drawFor(s.players[next]);if(s.phase!=="finished")s.message=`No claim. ${s.players[next].name} draws.`;return;
    }
    const [winnerId,response]=chosen,idx=s.players.findIndex(p=>p.id===winnerId),p=s.players[idx];
    const source=s.players[from];
    if(response.action==="mahjong"){
      source.discards.pop();p.hand.push(discard);s.lastDiscard=null;s.claimWindow=null;s.winner=winnerId;s.phase="finished";s.message=`${p.name} wins by Mahjong!`;s.lastReaction={id:uid(),playerId:winnerId,playerName:p.name,claim:"mahjong",at:Date.now()};return;
    }
    if(response.action==="chow"){
      const chosenTiles=response.tiles.map(key=>p.hand.find(t=>t.key===key));
      if(chosenTiles.some(t=>!t)){s.message="Chow could not be completed. The claim was cancelled.";s.claimWindow=null;s.lastDiscard=null;s.turn=(from+1)%s.players.length;s.phase="playing";this.drawFor(s.players[s.turn]);return;}
      for(const t of chosenTiles)p.hand.splice(p.hand.findIndex(x=>x.key===t.key),1);
      p.melds.push({type:"chow",tiles:[discard,...chosenTiles]});
    }else{
      const needed=response.action==="pong"?2:3,matches=p.hand.filter(t=>t.id===discard.id).slice(0,needed);
      if(matches.length!==needed){s.message="Claim could not be completed. The claim was cancelled.";s.claimWindow=null;s.lastDiscard=null;s.turn=(from+1)%s.players.length;s.phase="playing";this.drawFor(s.players[s.turn]);return;}
      for(const t of matches)p.hand.splice(p.hand.findIndex(x=>x.key===t.key),1);
      p.melds.push({type:response.action,tiles:[discard,...matches]});
    }
    source.discards.pop();s.lastDiscard=null;s.claimWindow=null;s.turn=idx;s.phase="playing";
    if(response.action==="pong"||response.action==="chow")s.lastReaction={id:uid(),playerId:winnerId,playerName:p.name,claim:response.action,at:Date.now()};
    if(response.action==="kong"){this.drawFor(p);if(s.phase!=="finished")s.message=`${p.name} called Kong and drew a replacement tile.`;}
    else s.message=`${p.name} won the claim with ${response.action.toUpperCase()}. They must discard.`;
  }
  drawFor(p){if(!this.state.wall.length){this.state.phase="finished";this.state.message="The wall is empty. Draw game.";return;}this.state.pendingDraw=this.state.wall.pop();}
  startGame(){
    const s=this.state;s.round=(s.round||0)+1;s.wall=tileSet();
    for(const p of s.players){p.hand=[];p.melds=[];p.discards=[];p.ready=false;for(let i=0;i<13;i++)p.hand.push(s.wall.pop());sortHand(p.hand);}
    s.players[s.dealer].hand.push(s.wall.pop());sortHand(s.players[s.dealer].hand);
    s.turn=s.dealer;s.phase="playing";s.lastDiscard=null;s.pendingDraw=null;s.lastReaction=null;s.claimWindow=null;s.winner=null;s.message="Round "+s.round+" started. East begins.";
  }
  send(id,obj){const ws=this.sockets.get(id);if(ws)try{ws.send(JSON.stringify(obj));}catch{}}
}
