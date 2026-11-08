/* Isometric games-clubhouse prototype. A local, walkable lobby that enters the
   existing Cloudflare multiplayer Mahjong rooms; it does not claim shared
   avatar presence or real-money slot gameplay. */
(() => {
  const canvas=document.getElementById("clubhouseCanvas");
  const section=document.getElementById("clubhouse");
  if(!canvas||!section)return;
  const ctx=canvas.getContext("2d");
  const $=id=>document.getElementById(id);
  const world={w:1100,h:670};
  const avatar={x:5.5,y:7.4,tx:5.5,ty:7.4,dir:1};
  const W=12,H=10;
  const objects=[
    {id:"mahjong",type:"table",title:"Mahjong",desc:"Enter a live Mahjong room",x:3.3,y:3.1,open:true,icon:"麻"},
    {id:"poker",type:"table",title:"Poker",desc:"Coming soon",x:8.5,y:3.2,open:false,icon:"♠"},
    {id:"blackjack",type:"table",title:"Blackjack",desc:"Coming soon",x:8.4,y:7.0,open:false,icon:"21"},
    {id:"slots",type:"slots",title:"Slot machines",desc:"Decorative machines — games coming soon",x:2.1,y:7.5,open:false,icon:"7"}
  ];
  const keys=new Set();
  let raf=null,last=0,enabled=true,pointTarget=null,objectHit=[],motion=0;
  const colors={felt:"#16573f",gold:"#e0b977",outline:"#102923"};
  function iso(x,y,z=0){return {x:550+(x-y)*35,y:170+(x+y)*19-z*24};}
  function line(points,fill,stroke=null,width=1){
    ctx.beginPath();
    points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
  }
  function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  function box(x,y,w,h,height,top,front,right){
    const a=iso(x,y,height),b=iso(x+w,y,height),c=iso(x+w,y+h,height),d=iso(x,y+h,height);
    const a0=iso(x,y),b0=iso(x+w,y),c0=iso(x+w,y+h),d0=iso(x,y+h);
    line([d,c,c0,d0],front,"#16332c",1);
    line([b,c,c0,b0],right,"#173e34",1);
    line([a,b,c,d],top,"#dfbe79",1.5);
    return [a,b,c,d];
  }
  function label(text,x,y,main=true){
    ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.font=main?'700 17px system-ui':'600 12px system-ui';
    ctx.fillStyle=main?"#fff2cd":"#dedcc8";
    ctx.shadowColor="#092d25";ctx.shadowBlur=8;ctx.fillText(text,x,y);
    ctx.shadowBlur=0;
  }
  function drawFloor(){
    ctx.fillStyle="#111c20";ctx.fillRect(0,0,world.w,world.h);
    const grd=ctx.createRadialGradient(550,390,70,550,390,540);
    grd.addColorStop(0,"#314b42");grd.addColorStop(1,"#101b1d");
    ctx.fillStyle=grd;ctx.fillRect(0,0,world.w,world.h);
    const a=iso(0,0),b=iso(W,0),c=iso(W,H),d=iso(0,H);
    line([a,b,c,d],"#074d40","#d9b06c",10);
    line([iso(.15,.15),iso(W-.15,.15),iso(W-.15,H-.15),iso(.15,H-.15)],"#12644e","#e1c07a",3);
    for(let i=1;i<W;i++){
      const p=iso(i,0),q=iso(i,H);
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle="#cbe0b21b";ctx.stroke();
    }
    for(let i=1;i<H;i++){
      const p=iso(0,i),q=iso(W,i);
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle="#cbe0b21b";ctx.stroke();
    }
    for(const p of [[1,1],[11,1],[1,9],[11,9]]){
      const a=iso(...p,0.1);
      ellipse(a.x,a.y,8,4,"#eac377");
    }
    // 3D back walls, art lamps, and pillars.
    box(0,-.38,W,.38,3.5,"#5a654d","#3a5045","#32463e");
    box(-.38,0,.38,H,3.5,"#526e58","#2e5546","#2b4e40");
    for(const x of [1.0,5.7,10.6]){
      const p=iso(x,-.39,2.65);
      ellipse(p.x,p.y,10,16,"#f4c66a");ellipse(p.x,p.y,19,25,"#eab45b22");
    }
  }
  function table(o){
    const {x,y}=o;
    const shade=o.id==="mahjong"?"#187554":o.id==="poker"?"#245777":"#853d45";
    box(x-.93,y-.67,1.86,1.34,.52,"#65482c","#3f3025","#493322");
    const pts=box(x-.86,y-.64,1.72,1.25,.68,shade,"#694e35","#5c4632");
    line(pts,null,"#e4c17b",3);
    const p=iso(x,y,.7);
    ellipse(p.x,p.y,24,10,"#13372e66");
    label(o.icon,p.x,p.y-3);
    for(const [dx,dy] of [[-.62,-.7],[.6,-.7],[-.78,.35],[.77,.35]]){
      box(x+dx-.14,y+dy-.12,.28,.24,.32,"#bfa16e","#64503a","#68503a");
    }
    const sign=iso(x,y-.85,1.65);
    ellipse(sign.x,sign.y,58,17,o.open?"#10372ff2":"#26333cf2");
    ctx.strokeStyle="#e2bd72";ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(sign.x,sign.y,58,17,0,0,Math.PI*2);ctx.stroke();
    label(o.title.toUpperCase(),sign.x,sign.y, false);
    return {x:sign.x-58,y:sign.y-23,w:116,h:55};
  }
  function slots(o){
    const machines=[-0.60,0,0.60];
    let first;
    for(let i=0;i<3;i++){
      const x=o.x+machines[i],y=o.y+(i%2)*.08;
      box(x-.2,y-.27,.4,.54,1.45,"#c9ad6d","#712c43","#752e46");
      const p=iso(x,y,1.17);
      ctx.fillStyle="#fbe9b1";ctx.fillRect(p.x-11,p.y-19,22,28);
      ctx.fillStyle="#ba3c4d";ctx.font="bold 16px system-ui";ctx.textAlign="center";ctx.fillText(["7","★","7"][i],p.x,p.y+1);
      ellipse(p.x,p.y-22,16,4,"#ffda71");
      if(!first) first={x:p.x-40,y:p.y-52};
    }
    const p=iso(o.x,o.y-.55,1.9);
    label("SLOTS",p.x,p.y,false);
    return {x:first.x,y:first.y,w:115,h:108};
  }
  function player(x,y,isMe=false){
    const p=iso(x,y);
    ellipse(p.x,p.y,20,8,"#051e17a8");
    const body=iso(x,y,.5);
    ctx.beginPath();ctx.moveTo(body.x-12,body.y+8);ctx.lineTo(body.x-10,body.y-12);ctx.quadraticCurveTo(body.x,body.y-25,body.x+11,body.y-12);ctx.lineTo(body.x+13,body.y+8);ctx.closePath();
    ctx.fillStyle=isMe?"#f1bd65":"#b48add";ctx.fill();
    ellipse(body.x,body.y-21,11,12,"#e9ba97");
    ctx.beginPath();ctx.arc(body.x,body.y-26,10,Math.PI,Math.PI*2);ctx.fillStyle="#322c2a";ctx.fill();
    if(isMe){const n=iso(x,y,1.65);ellipse(n.x,n.y,21,11,"#fff0bb");label("YOU",n.x,n.y,false);}
  }
  function update(dt){
    if(!enabled)return;
    const active=document.activeElement?.tagName;
    if(active==="INPUT"||active==="TEXTAREA")return;
    let vx=0,vy=0;
    if(keys.has("w")||keys.has("arrowup"))vy--;
    if(keys.has("s")||keys.has("arrowdown"))vy++;
    if(keys.has("a")||keys.has("arrowleft"))vx--;
    if(keys.has("d")||keys.has("arrowright"))vx++;
    if(vx||vy){pointTarget=null;const len=Math.hypot(vx,vy);vx/=len;vy/=len;avatar.tx+=vx*dt*.0034;avatar.ty+=vy*dt*.0034;}
    if(pointTarget){avatar.tx=pointTarget.x;avatar.ty=pointTarget.y;}
    avatar.tx=Math.max(.8,Math.min(W-.8,avatar.tx));
    avatar.ty=Math.max(.8,Math.min(H-.8,avatar.ty));
    const d=Math.hypot(avatar.tx-avatar.x,avatar.ty-avatar.y);
    if(d<.07){pointTarget=null;avatar.x=avatar.tx;avatar.y=avatar.ty;}
    else{const step=Math.min(1,dt*.007);avatar.x+=(avatar.tx-avatar.x)*step;avatar.y+=(avatar.ty-avatar.y)*step;}
    if(pointTarget&&pointTarget.object&&d<1.2){const id=pointTarget.object;pointTarget=null;activate(id);}
  }
  function frame(t){
    if(!section.classList.contains("hidden")){
      const dt=Math.min(40,last?t-last:16);last=t;motion+=dt;update(dt);draw();
    }else last=t;
    raf=requestAnimationFrame(frame);
  }
  function draw(){
    const width=canvas.clientWidth,height=canvas.clientHeight;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
    ctx.setTransform(canvas.width/world.w,0,0,canvas.height/world.h,0,0);
    ctx.clearRect(0,0,world.w,world.h);
    drawFloor();objectHit=[];
    const drawables=[...objects.map(o=>({depth:o.x+o.y,kind:"object",o})),{depth:avatar.x+avatar.y,kind:"avatar"}].sort((a,b)=>a.depth-b.depth);
    for(const item of drawables){
      if(item.kind==="avatar")player(avatar.x,avatar.y,true);
      else{const box=item.o.type==="slots"?slots(item.o):table(item.o);objectHit.push({...box,o:item.o});}
    }
    const grd=ctx.createLinearGradient(0,0,0,world.h);grd.addColorStop(0,"#0000");grd.addColorStop(1,"#030a0999");
    ctx.fillStyle=grd;ctx.fillRect(0,540,world.w,130);
  }
  function screenPos(e){const rect=canvas.getBoundingClientRect();return {x:(e.clientX-rect.left)*world.w/rect.width,y:(e.clientY-rect.top)*world.h/rect.height};}
  function unproject(x,y){const a=(x-550)/35,b=(y-170)/19;return {x:(a+b)/2,y:(b-a)/2};}
  function activate(id){
    if(id==="mahjong"){window.MahjongClubhouse?.enterMahjong();return;}
    const o=objects.find(x=>x.id===id);
    $("clubToast").textContent=(o?.title||"This game")+" is coming soon. Mahjong is playable now.";
    $("clubToast").classList.remove("hidden");
  }
  canvas.addEventListener("click",e=>{
    const p=screenPos(e);
    const hit=[...objectHit].reverse().find(h=>p.x>=h.x-8&&p.x<=h.x+h.w+8&&p.y>=h.y-10&&p.y<=h.y+h.h+14);
    if(hit){if(hit.o.id==="mahjong"){activate("mahjong");return;}activate(hit.o.id);return;}
    const floor=unproject(p.x,p.y);
    if(floor.x>=0&&floor.x<=W&&floor.y>=0&&floor.y<=H)pointTarget={x:floor.x,y:floor.y};
  });
  window.addEventListener("keydown",e=>{
    const key=e.key.toLowerCase();
    if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"].includes(key)&&section.classList.contains("hidden")===false){
      if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA")return;
      e.preventDefault();keys.add(key);
    }
  });
  window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur",()=>keys.clear());
  $("enterMahjong").addEventListener("click",()=>activate("mahjong"));
  $("clubToastClose").addEventListener("click",()=>$("clubToast").classList.add("hidden"));
  $("clubReturn").addEventListener("click",()=>window.MahjongClubhouse?.returnToLobby());
  window.MahjongClubhouse={
    enterMahjong(){
      section.classList.add("hidden"); $("home").classList.remove("hidden"); $("room").classList.add("hidden");
      $("clubReturn").classList.remove("hidden");enabled=false;keys.clear();
      history.replaceState({}, "",location.pathname);
    },
    returnToLobby(){
      // Never silently abandon an active live multiplayer session.
      if(!$("room").classList.contains("hidden")){
        if(!confirm("Leave this Mahjong room and return to the clubhouse?"))return;
        try{window.MahjongClubhouse.disconnect?.();}catch{}
        location.href="/";return;
      }
      $("home").classList.add("hidden");section.classList.remove("hidden");
      $("clubReturn").classList.add("hidden");enabled=true;last=0;
    },
    disconnect:null
  };
  if(new URLSearchParams(location.search).get("room")){
    window.MahjongClubhouse.enterMahjong();
    $("joinCode").value=new URLSearchParams(location.search).get("room").toUpperCase();
  }else{$("home").classList.add("hidden");$("clubReturn").classList.add("hidden");}
  if(!raf)raf=requestAnimationFrame(frame);
})();