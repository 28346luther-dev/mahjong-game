/* Login/register shell for the Cloudflare account backend. */
(() => {
  const $=id=>document.getElementById(id);
  const auth=$("authScreen");
  const form=$("authForm");
  const message=$("authMessage");
  const submit=$("authSubmit");
  let mode="login";
  async function readApiJson(response){
    const contentType=response.headers.get("content-type")||"";
    if(!contentType.toLowerCase().includes("application/json")){
      throw Error("The login service returned a website page instead of JSON. Deploy the latest Cloudflare Worker (including wrangler.toml), then refresh this page.");
    }
    const data=await response.json();
    if(!response.ok)throw Error(data.error||"The login service could not complete your request.");
    return data;
  }
  function showAuth(){
    auth.classList.remove("hidden");
    $("clubhouse").classList.add("hidden");
    $("home").classList.add("hidden");
    $("room").classList.add("hidden");
    $("clubReturn").classList.add("hidden");
    $("accountBar").classList.add("hidden");
  }
  function showSignedIn(user){
    auth.classList.add("hidden");
    $("accountBar").classList.remove("hidden");
    $("accountEmail").textContent=user.email;
    if(window.MahjongClubhouse?.showLobby)window.MahjongClubhouse.showLobby();
    else $("clubhouse").classList.remove("hidden");
    if(new URLSearchParams(location.search).get("room"))
      window.MahjongClubhouse?.enterMahjong();
  }
  function setMode(next){
    mode=next;message.textContent="";
    $("authTitle").textContent=mode==="login"?"Welcome back":"Create your account";
    submit.textContent=mode==="login"?"Sign in":"Create account";
    $("authSwitch").textContent=mode==="login"?"New here? Create an account":"Already registered? Sign in";
    $("authPassword").autocomplete=mode==="login"?"current-password":"new-password";
  }
  $("authSwitch").onclick=()=>setMode(mode==="login"?"register":"login");
  form.onsubmit=async e=>{
    e.preventDefault();message.textContent="";submit.disabled=true;
    try{
      const response=await fetch("/api/auth/"+mode,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({
        email:$("authEmail").value.trim(),password:$("authPassword").value
      })});
      const data=await readApiJson(response);
      $("authPassword").value="";
      showSignedIn(data);
    }catch(err){message.textContent=err.message;}finally{submit.disabled=false;}
  };
  $("logout").onclick=async()=>{
    $("logout").disabled=true;
    try{await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin"});}
    finally{location.href="/";}
  };
  window.GamesAccount={showAuth,showSignedIn};
  showAuth();
  fetch("/api/auth/me",{credentials:"same-origin"}).then(async response=>{
    if(response.status===401)return null;
    return readApiJson(response);
  }).then(data=>{
    if(data)showSignedIn(data);else showAuth();
  }).catch(err=>{showAuth();message.textContent=err.message||"Unable to check login status.";});
})();