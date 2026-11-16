// Render original garage thumbnails directly from the in-game models.
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:480,height:280}});await page.goto('http://127.0.0.1:8787');
  await page.evaluate(async()=>{
   const THREE=await import('/vendor/three.module.js'),{prepareGTCar,createGTCar,disposeGTCar}=await import('/kart-gt-car.js');await prepareGTCar();
   const scene=new THREE.Scene();scene.background=new THREE.Color('#182b38');scene.add(new THREE.HemisphereLight(0xe7f3ff,0x7a766c,2.8));
   const sun=new THREE.DirectionalLight(0xffedd5,3);sun.position.set(3,8,-4);scene.add(sun);
   const camera=new THREE.PerspectiveCamera(36,480/280,.1,100);camera.position.set(5,3,-6);camera.lookAt(0,.65,0);
   const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(480,280);renderer.setPixelRatio(1.5);renderer.toneMapping=THREE.ACESFilmicToneMapping;
   document.body.style='margin:0;overflow:hidden';document.body.replaceChildren(renderer.domElement);
   let model;window.renderCar=id=>{if(model){scene.remove(model.group);disposeGTCar(model);}model=createGTCar(THREE,{carId:id});scene.add(model.group);renderer.render(scene,camera);};
  });
  for(const id of ['apex','falcon','nova']){await page.evaluate(id=>window.renderCar(id),id);await page.screenshot({path:`public/assets/gt3-${id}.png`});}
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
