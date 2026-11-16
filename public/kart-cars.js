// Original GT3-style designs share handling for fair races and lap comparisons.
export const GT_CARS=Object.freeze([
 Object.freeze({id:'apex',name:'Apex GT',layout:'Mid-engine coupe',color:0xff4c0a,description:'Low nose · sculpted hardtop · swan-neck wing'}),
 Object.freeze({id:'falcon',name:'Falcon GT',layout:'Front-engine endurance',color:0x287dcc,description:'Long bonnet · wide grille · fastback roof'}),
 Object.freeze({id:'nova',name:'Nova GT',layout:'Rear-engine coupe',color:0xe3bd35,description:'Rounded nose · round lamps · compact roof'})
]);
export const normalizeCarId=id=>GT_CARS.some(car=>car.id===id)?id:'apex';
export const getGTCar=id=>GT_CARS.find(car=>car.id===normalizeCarId(id));
