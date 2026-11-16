// Real browser -> Worker authentication -> Durable Object WebSocket handshake.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8787');
  const result=await page.evaluate(async()=>{
   const registration=await fetch('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`socket-${Date.now()}@example.test`,password:'Local-test-only-3948'})});
   if(!registration.ok)throw Error(await registration.text());
   const events=(await (await fetch('/api/kart/events')).json()).events;
   const id=events.find(e=>e.phase==='registration').id;
   const register=await fetch('/api/kart/event/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({eventId:id,carId:"nova"})});
   if(!register.ok)throw Error(await register.text());
   return await new Promise((resolve,reject)=>{
    const ws=new WebSocket(`ws://${location.host}/api/kart/event/socket?id=${id}`);
    const timeout=setTimeout(()=>reject(Error('Socket timed out')),10000);
    ws.onerror=()=>reject(Error('Socket handshake failed'));
    ws.onmessage=e=>{const data=JSON.parse(e.data);clearTimeout(timeout);ws.close();resolve({id:data.id,phase:data.phase,you:data.you,registered:data.registered,carId:data.racers.find(p=>p.id===data.you)?.carId});};
   });
  });
  assert.equal(result.carId,'nova');assert.equal(result.phase,'registration');assert.match(result.you,/^[a-f0-9]{64}$/);assert.ok(result.registered>=1);
  const anonymous=await browser.newPage();await anonymous.goto('http://127.0.0.1:8787');
  const status=await anonymous.evaluate(async id=>(await fetch('/api/kart/event/socket?id='+id)).status,result.id);
  assert.equal(status,401);
  console.log('Real authenticated race WebSocket and anonymous rejection passed',result.phase);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
