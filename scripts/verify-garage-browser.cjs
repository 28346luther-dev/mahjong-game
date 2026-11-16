const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/kart-racing.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+`\nwindow.garageTest={state:()=>({playing,busy,selectedCar,model:carVisual?.carId,carCount:scene?.children.filter(o=>o===kart).length}),car:()=>carVisual,step:()=>{playing=false;updateRideHeightAndBank(1/60);},pose:()=>{playing=false;speed=0;keys.clear();touch.clear();}};`});});
  await page.goto('http://127.0.0.1:8787');await page.waitForFunction(()=>window.KartRacing);
  await page.evaluate(async()=>{
   const response=await fetch('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`garage-${Date.now()}@example.test`,password:'Local-test-only-3948'})});if(!response.ok)throw Error(await response.text());window.KartRacing.open();
  });
  for(const id of ['apex','falcon','nova','apex']){
   await page.locator(`[data-car-id="${id}"]`).click();
   assert.equal(await page.locator(`[data-car-id="${id}"]`).getAttribute('aria-pressed'),'true');
   await page.locator('[data-kart-mode="timetrial"]').click();
   await page.waitForFunction(id=>window.garageTest.state().playing&&window.garageTest.state().model===id,id,{timeout:90000});
   const car=await page.evaluate(async()=>{
    window.garageTest.pose();window.garageTest.step();const THREE=await import('/vendor/three.module.js'),{wheelSurface}=await import('/kart-vehicle-dynamics.js');
    const model=window.garageTest.car();model.group.updateMatrixWorld(true);
    const contacts=model.wheels.map(w=>{const centre=w.group.getWorldPosition(new THREE.Vector3()),up=new THREE.Vector3(0,1,0).applyQuaternion(model.group.quaternion);return Math.abs(centre.y-w.radius/up.y-(wheelSurface(centre.x,centre.z).height+.044));});
    const roof=model.group.getObjectByName('gt3-hardtop');
    return {id:model.carId,roof:!!roof,roofVisible:roof?.visible,contacts,...window.garageTest.state()};
   });
   assert.ok(car.roof&&car.roofVisible,'solid roof is visible in chase view');assert.equal(car.carCount,1);
   assert.equal(await page.evaluate(()=>window.KartRacing.mayAutoJoinMeeting()),false,'scheduled races cannot interrupt Time Trial');
   assert.equal(car.contacts.length,4);assert.ok(car.contacts.every(gap=>gap<.006),`grounded tyres: ${JSON.stringify(car.contacts)}`);
   await page.evaluate(()=>window.KartRacing.setCameraMode('cockpit'));
   assert.equal(await page.evaluate(()=>window.garageTest.car().group.getObjectByName('gt3-hardtop').visible),false,'bonnet camera hides cabin geometry');
   await page.evaluate(()=>{window.KartRacing.setCameraMode('chase');window.KartRacing.backToSelector();});
   console.log(id,'selection, closed roof, camera and four tyre contacts passed');
  }
  await page.locator('[data-car-id="nova"]').click();
  await page.reload();await page.waitForFunction(()=>window.KartRacing);await page.evaluate(()=>window.KartRacing.open());
  assert.equal(await page.locator('[data-car-id="nova"]').getAttribute('aria-pressed'),'true','choice survives reload');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/garage-mobile.png'});
  assert.ok(await page.locator('[data-car-id="nova"]').isVisible());assert.deepEqual(errors,[]);
  console.log('garage persistence and mobile layout passed');
  await page.route('**/assets/gt-coupe.glb',route=>route.abort());
  await page.route('**/assets/daylight.hdr',route=>route.abort());
  await page.reload();await page.waitForFunction(()=>window.KartRacing);await page.evaluate(()=>window.KartRacing.open());
  await page.locator('[data-car-id="apex"]').click();
  await page.evaluate(()=>{window.KartRacing.enterTrack('timetrial');window.KartRacing.close();});
  await page.waitForFunction(()=>!window.garageTest.state().busy,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>window.garageTest.state().playing),false,'closing during init cannot start a hidden session');
  await page.evaluate(()=>{window.KartRacing.open();window.KartRacing.enterTrack('timetrial');});
  await page.waitForFunction(()=>window.garageTest.state().playing,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>window.garageTest.car().group.getObjectByName('gt3-hardtop')?.visible),true,'fallback car loads without detailed model or HDR');
  assert.deepEqual(errors,[]);console.log('cancelled initialization and failed model/HDR fallback passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
