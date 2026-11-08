/* Illustrated tile faces and four-sided multiplayer table. No external image assets required. */
(() => {
  const windNames = {w1:"東",w2:"南",w3:"西",w4:"北"};
  const dragonNames = {z1:"中",z2:"發",z3:"白"};
  const palettes = ["#d84942","#21865e","#286bb1"];
  const dotLayouts = {
    1:[[35,49]], 2:[[21,29],[49,69]],
    3:[[20,25],[35,49],[50,73]],
    4:[[20,26],[50,26],[20,72],[50,72]],
    5:[[20,26],[50,26],[35,49],[20,72],[50,72]],
    6:[[20,24],[50,24],[20,49],[50,49],[20,74],[50,74]],
    7:[[20,20],[50,20],[20,42],[35,49],[50,56],[20,78],[50,78]],
    8:[[20,18],[50,18],[20,39],[50,39],[20,60],[50,60],[20,81],[50,81]],
    9:[[20,20],[35,20],[50,20],[20,49],[35,49],[50,49],[20,78],[35,78],[50,78]]
  };
  const bambooLayouts = {
    2:[[25,33],[45,65]],3:[[35,20],[23,62],[47,62]],
    4:[[23,28],[47,28],[23,69],[47,69]],
    5:[[23,23],[47,23],[35,49],[23,75],[47,75]],
    6:[[23,20],[47,20],[23,49],[47,49],[23,78],[47,78]],
    7:[[35,14],[23,35],[47,35],[23,60],[47,60],[23,82],[47,82]],
    8:[[23,14],[47,14],[23,38],[47,38],[23,62],[47,62],[23,86],[47,86]],
    9:[[23,18],[35,18],[47,18],[23,49],[35,49],[47,49],[23,80],[35,80],[47,80]]
  };
  function dot(x,y,color,large=false) {
    const r=large?19:8;
    return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+color+'" stroke="#153f36" stroke-width="1.5"/>'+
      '<circle cx="'+x+'" cy="'+y+'" r="'+(r*.68)+'" fill="none" stroke="#fff6d7" stroke-width="2"/>'+
      '<circle cx="'+x+'" cy="'+y+'" r="'+(r*.31)+'" fill="#fff6d7"/>';
  }
  function bamboo(x,y,color) {
    return '<g stroke-linecap="round"><path d="M'+x+' '+(y-10)+'v20" stroke="'+color+'" stroke-width="6"/>'+
      '<path d="M'+(x-5)+' '+(y-4)+'h10 M'+(x-5)+' '+(y+5)+'h10" stroke="#f8e9be" stroke-width="2"/>'+
      '<path d="M'+(x-3)+' '+(y-10)+'l-4 -4 M'+(x+3)+' '+(y+10)+'l4 4" stroke="'+color+'" stroke-width="2"/></g>';
  }
  function bird() {
    return '<path d="M14 66Q17 36 33 42Q49 18 54 30Q56 42 43 49Q60 62 48 76Q33 86 23 69Z" fill="#21865e" stroke="#185547" stroke-width="2"/>'+
      '<path d="M22 57Q34 53 49 68Q31 77 22 57Z" fill="#286bb1"/>'+
      '<path d="M43 38l14 -5 -10 10" fill="#e3a43e"/><circle cx="43" cy="35" r="2.5" fill="#1b352c"/>'+
      '<path d="M19 71l-8 13 M27 73l-4 13" stroke="#d84942" stroke-width="3"/>';
  }
  function artwork(t) {
    if (!t) return "";
    const n=Math.max(1,Math.min(9,Number(t.rank)||1));
    let inner="";
    if(t.suit==="dots") {
      inner=(dotLayouts[n]||[]).map(([x,y],i)=>dot(x,y,palettes[i%3],n===1)).join("");
    } else if(t.suit==="bamboo") {
      inner=n===1?bird():(bambooLayouts[n]||[]).map(([x,y],i)=>bamboo(x,y,palettes[(i+1)%3])).join("");
    } else if(t.suit==="characters") {
      inner='<text x="35" y="31" text-anchor="middle" font-size="28" font-weight="800" fill="#b63832">'+["","一","二","三","四","五","六","七","八","九"][n]+'</text>'+
        '<text x="35" y="76" text-anchor="middle" font-size="43" font-weight="800" fill="#203e38">萬</text>';
    } else if(t.suit==="wind") {
      inner='<text x="35" y="68" text-anchor="middle" font-size="52" font-weight="800" fill="#183d34">'+(windNames[t.id]||"風")+'</text>';
    } else if(t.suit==="dragon") {
      const color=t.id==="z1"?"#bb3433":t.id==="z2"?"#177c56":"#355c86";
      inner=t.id==="z3"?'<rect x="16" y="29" width="38" height="42" rx="3" fill="none" stroke="'+color+'" stroke-width="5"/>':
        '<text x="35" y="68" text-anchor="middle" font-size="52" font-weight="800" fill="'+color+'">'+(dragonNames[t.id]||"龍")+'</text>';
    }
    return '<svg class="tile-art" viewBox="0 0 70 98" aria-hidden="true" focusable="false">'+inner+'</svg>';
  }
  function face(t) {
    const label=["characters","bamboo","dots"].includes(t.suit)?String(t.rank):
      t.suit==="wind"?({w1:"E",w2:"S",w3:"W",w4:"N"}[t.id]||"W"):
      ({z1:"R",z2:"G",z3:"W"}[t.id]||"D");
    const suit={characters:"chars",bamboo:"bamboo",dots:"dots",wind:"wind",dragon:"dragon"}[t.suit]||"";
    return '<span class="tile-face" data-label="'+escapeText(label)+'" data-suit="'+suit+'">'+artwork(t)+'</span>';
  }
  function tile(t,cls="") {
    return '<span class="tile '+cls+'" title="'+escapeText(t.name||"Mahjong tile")+'">'+face(t)+'</span>';
  }
  function escapeText(x) {return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function position(index,myIndex) {
    return ["bottom","right","top","left"][((index-myIndex+4)%4)];
  }
  function portrait(name,index) {
    const skins=["#e4b18b","#c88b6c","#efd0a9","#b77754"];
    const clothes=["#365d77","#9b4e55","#816344","#39765b"];
    const skin=skins[index%4],shirt=clothes[index%4];
    return '<svg viewBox="0 0 64 64" class="portrait" aria-hidden="true">'+
      '<circle cx="32" cy="32" r="31" fill="#efe0bd"/>'+
      '<path d="M6 65Q10 45 32 44Q54 45 58 65" fill="'+shirt+'"/>'+
      '<path d="M24 43L32 54 40 43" fill="#f9e6c4"/>'+
      '<path d="M20 26Q18 8 33 9Q51 10 45 29L42 38Q34 48 25 39Z" fill="'+skin+'"/>'+
      '<path d="M20 28Q12 10 27 7Q45 0 50 17Q51 27 44 30L44 19Q30 25 21 20Z" fill="#302b29"/>'+
      '<path d="M26 30h3M36 30h3" stroke="#44342c" stroke-width="2.3" stroke-linecap="round"/>'+
      '<path d="M30 38Q33 40 37 37" fill="none" stroke="#985b50" stroke-width="1.7" stroke-linecap="round"/>'+
      '</svg>';
  }
  function seats(s) {
    return s.players.map((p,i)=>{
      const pos=position(i,s.myIndex),initial=escapeText((p.name||"P").trim().slice(0,1).toUpperCase());
      const active=s.turn===i&&["playing","claim"].includes(s.phase);
      return '<div class="seat seat-'+pos+(active?' active':'')+'">'+
        '<div class="avatar">'+portrait(p.name,i)+'</div><div class="seat-info"><b>'+escapeText(p.name)+(i===s.myIndex?' <span class="you">YOU</span>':'')+
        (i===s.dealer?' <span class="dealer">★</span>':'')+'</b><span>'+p.seat+' · '+p.handCount+' tiles'+(p.ready?' · Ready':'')+'</span></div>'+
        (active?'<span class="turn-dot" aria-label="Current turn"></span>':'')+'</div>';
    }).join("");
  }
  // With only a wallCount exposed by the game server, distribute remaining
  // tiles over four visual wall sections; never imply a specific draw position.
  function walls(s) {
    const total=Math.max(0,Math.min(136,Number(s.wallCount)||0));
    return ["top","right","bottom","left"].map((side,i)=>{
      const count=Math.floor(total/4)+(i<total%4?1:0);
      const stacks=Math.ceil(count/2);
      let pieces="";
      for(let j=0;j<stacks;j++){
        pieces+='<span class="wall-stack'+(j*2+1>=count?' single':'')+'"><i></i><i></i></span>';
      }
      return '<div class="wall-side wall-'+side+'" aria-label="'+count+' tiles remaining in '+side+' visual wall">'+pieces+'</div>';
    }).join("");
  }
  function discards(s) {
    const any=s.players.some(p=>p.discards.length);
    if(!any)return '<span class="empty table-empty">Discarded tiles gather here</span>';
    return s.players.map((p,i)=>{
      const pos=position(i,s.myIndex);
      return '<div class="discard-group discard-'+pos+'" aria-label="'+escapeText(p.name)+' discards">'+
        '<span class="discard-owner">'+escapeText(p.name)+'</span><div class="discard-row">'+
        p.discards.map((t,j)=>tile(t,"discard-tile"+(s.lastDiscard?.from===i&&j===p.discards.length-1?" latest-discard":""))).join("")+
        '</div></div>';
    }).join("");
  }
  function melds(s) {
    return s.players.flatMap(p=>p.melds.map(m=>
      '<div class="meld"><span class="meld-caption">'+escapeText(p.name)+' · '+escapeText(m.type.toUpperCase())+'</span>'+
      '<div class="meld-tiles">'+m.tiles.map(t=>tile(t,"meld-tile")).join("")+'</div></div>'
    )).join("");
  }
  window.MahjongVisuals={face,seats,walls,discards,melds};
})();
