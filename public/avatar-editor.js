// Account-backed clubhouse identity. No personally identifying email displayed on avatars.
const $=id=>document.getElementById(id);
const defaults={name:"Player",color:"ruby",hair:"dark"};
let current={...defaults},loaded=false,loading=null,pendingPhoto=undefined;
async function load(){
 if(loading)return loading;
 loading=(async()=>{
  try{
   const response=await fetch("/api/profile",{credentials:"same-origin",cache:"no-store"});
   if(!response.ok)throw Error("Sign in required");
   current=await response.json();pendingPhoto=undefined;
   showPhoto(current.photo||"");
   $("avatarName").value=current.name;
   $("avatarColor").value=current.color;
   $("avatarHair").value=current.hair;
   loaded=true;window.dispatchEvent(new CustomEvent("salon-profile",{detail:current}));
  }catch(e){$("avatarSaveStatus").textContent="Sign in to edit profile";}
  finally{loading=null;}
 })();return loading;
}
$("avatarForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const next={name:$("avatarName").value.trim(),color:$("avatarColor").value,hair:$("avatarHair").value};
 if(pendingPhoto!==undefined)next.photo=pendingPhoto;
 $("avatarSaveStatus").textContent="Saving…";
 try{
  const response=await fetch("/api/profile",{method:"POST",credentials:"same-origin",
   headers:{"content-type":"application/json"},body:JSON.stringify(next)});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||"Could not save");
  current=data;loaded=true;pendingPhoto=undefined;
  showPhoto(current.photo||"");$("avatarSaveStatus").textContent="Saved ✓";
  window.dispatchEvent(new CustomEvent("salon-profile",{detail:current}));
 }catch(error){$("avatarSaveStatus").textContent=error.message;}
});

function showPhoto(uri){
 const preview=$("avatarPhotoPreview");
 preview.classList.toggle("hidden",!uri);
 if(uri)preview.src=uri;else preview.removeAttribute("src");
}
function preparePhoto(file){
 if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>5*1024*1024)
  return Promise.reject(Error("Choose a JPEG, PNG or WebP photo under 5 MB."));
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file),image=new Image();
  image.onload=()=>{
   URL.revokeObjectURL(url);
   try{
    const canvas=document.createElement("canvas");canvas.width=96;canvas.height=96;
    const ctx=canvas.getContext("2d");
    const size=Math.min(image.naturalWidth,image.naturalHeight);
    ctx.drawImage(image,(image.naturalWidth-size)/2,(image.naturalHeight-size)/2,size,size,0,0,96,96);
    let data="";
    for(const quality of [.73,.6,.45,.31]){
     data=canvas.toDataURL("image/jpeg",quality);
     if(data.length<=17500)break;
    }
    if(data.length>17500)throw Error("Could not compress that photo. Choose a simpler image.");
    resolve(data);
   }catch(error){reject(error);}
  };
  image.onerror=()=>{URL.revokeObjectURL(url);reject(Error("The photo could not be opened."));};
  image.src=url;
 });
}
$("avatarPhoto").addEventListener("change",async event=>{
 const file=event.target.files?.[0];if(!file)return;
 $("avatarSaveStatus").textContent="Preparing photo…";
 try{
  pendingPhoto=await preparePhoto(file);
  showPhoto(pendingPhoto);
  $("avatarSaveStatus").textContent="Photo ready — click Save avatar & name";
 }catch(error){$("avatarSaveStatus").textContent=error.message;}
 event.target.value="";
});
$("avatarPhotoRemove").addEventListener("click",()=>{
 pendingPhoto="";showPhoto("");$("avatarSaveStatus").textContent="Photo removed — click Save to confirm.";
});

window.SalonProfile={load,get:()=>current,isLoaded:()=>loaded};
