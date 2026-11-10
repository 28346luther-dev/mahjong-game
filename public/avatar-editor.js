// Account-backed clubhouse identity. No personally identifying email displayed on avatars.
const $=id=>document.getElementById(id);
const defaults={name:"Player",color:"ruby",hair:"dark"};
let current={...defaults},loaded=false,loading=null;
async function load(){
 if(loading)return loading;
 loading=(async()=>{
  try{
   const response=await fetch("/api/profile",{credentials:"same-origin",cache:"no-store"});
   if(!response.ok)throw Error("Sign in required");
   current=await response.json();
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
 $("avatarSaveStatus").textContent="Saving…";
 try{
  const response=await fetch("/api/profile",{method:"POST",credentials:"same-origin",
   headers:{"content-type":"application/json"},body:JSON.stringify(next)});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||"Could not save");
  current=data;loaded=true;$("avatarSaveStatus").textContent="Saved ✓";
  window.dispatchEvent(new CustomEvent("salon-profile",{detail:current}));
 }catch(error){$("avatarSaveStatus").textContent=error.message;}
});
window.SalonProfile={load,get:()=>current,isLoaded:()=>loaded};
