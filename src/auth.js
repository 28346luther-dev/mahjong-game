// Durable Object account registry. Password hashes and opaque sessions never leave this object.
// Prototype: add verified email, password reset and production abuse monitoring before public launch.
const encode = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,"0")).join("");
const digest = async value => hex(await crypto.subtle.digest("SHA-256",encode.encode(value)));
const randomHex = size => hex(crypto.getRandomValues(new Uint8Array(size)));
const cookieName="games_club_session";
const maxAge=60*60*24*7;
// Cloudflare workerd caps PBKDF2 operations at 100,000 iterations.
// Store the iteration count per account to retain compatibility with existing hashes.
const PBKDF2_ITERATIONS=100000;
const emailRx=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function hashPassword(password,salt,iterations=PBKDF2_ITERATIONS){
  const key=await crypto.subtle.importKey("raw",encode.encode(password),"PBKDF2",false,["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({name:"PBKDF2",salt:encode.encode(salt),iterations,hash:"SHA-256"},key,256));
}
function safeEqual(a,b){
  if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;
  let value=0;for(let i=0;i<a.length;i++)value|=a.charCodeAt(i)^b.charCodeAt(i);
  return value===0;
}
function json(payload,status=200,headers={}){return Response.json(payload,{status,headers:{"cache-control":"no-store",...headers}});}
function setCookie(token,secure){
  return cookieName+"="+token+"; Path=/; HttpOnly; SameSite=Lax; Max-Age="+maxAge+(secure?"; Secure":"");
}
export class AuthStore {
  constructor(ctx){this.ctx=ctx;}
  async fetch(request){
    const url=new URL(request.url),action=url.pathname;
    if(request.method!=="POST")return json({error:"Method not allowed"},405);
    let body={};try{body=await request.json();}catch{return json({error:"Invalid request"},400);}
    if(action==="/health"){await this.ctx.storage.get("auth-health-check");return json({ok:true,storage:"reachable"});}
    const now=Date.now();
    const secure=body.secure!==false;
    if(action==="/register"||action==="/login"){
      const email=String(body.email||"").trim().toLowerCase();
      const password=String(body.password||"");
      if(email.length>254||!emailRx.test(email)||password.length>128||password.length<10)
        return json({error:"Enter a valid email and a password of at least 10 characters."},400);
      const key="account:"+await digest(email);
      const attemptKey="attempt:"+await digest(email);
      const attempt=await this.ctx.storage.get(attemptKey)||{count:0,until:0};
      if(attempt.until>now && attempt.count>=6)return json({error:"Too many attempts. Try again in 15 minutes."},429);
      let user=await this.ctx.storage.get(key);
      if(action==="/register"){
        if(user)return json({error:"An account with that email already exists."},409);
        const salt=randomHex(16);
        user={email,salt,iterations:PBKDF2_ITERATIONS,hash:await hashPassword(password,salt),createdAt:now};
        await this.ctx.storage.put(key,user);
      }else{
        const matched=user&&safeEqual(user.hash,await hashPassword(password,user.salt,user.iterations??210000));
        if(!matched){
          const recent=attempt.until>now?attempt.count:0;
          await this.ctx.storage.put(attemptKey,{count:recent+1,until:now+15*60*1000});
          return json({error:"Incorrect email or password."},401);
        }
      }
      await this.ctx.storage.delete(attemptKey);
      const token=randomHex(32);
      const session={email,expiresAt:now+maxAge*1000};
      await this.ctx.storage.put("session:"+await digest(token),session);
      return json({email:user.email},200,{"set-cookie":setCookie(token,secure)});
    }
    if(action==="/profile"){
      const token=typeof body.token==="string"&&/^[a-f0-9]{64}$/.test(body.token)?body.token:"";
      if(!token)return json({error:"Sign in required"},401);
      const session=await this.ctx.storage.get("session:"+await digest(token));
      if(!session||session.expiresAt<=Date.now())return json({error:"Session expired"},401);
      const key="profile:"+await digest(session.email);
      if(body.update){
        const name=String(body.name||"").trim();
        const color=String(body.color||"");
        const hair=String(body.hair||"");
        if(name.length<2||name.length>22||!/^[\p{L}\p{N} _.-]+$/u.test(name))
          return json({error:"Username must be 2–22 letters, numbers, spaces or _.-"},400);
        if(!["ruby","plum","emerald","navy","gold"].includes(color))
          return json({error:"Invalid outfit colour"},400);
        if(!["dark","brown","blonde","auburn"].includes(hair))
          return json({error:"Invalid hair colour"},400);
        await this.ctx.storage.put(key,{name,color,hair});
      }
      return json(await this.ctx.storage.get(key)||{
        name:session.email.split("@")[0].slice(0,22),color:"ruby",hair:"dark"
      });
    }
    if(action==="/me"||action==="/logout"){
      const token=typeof body.token==="string"&&/^[a-f0-9]{64}$/.test(body.token)?body.token:"";
      if(!token)return json({error:"Not signed in"},401);
      const key="session:"+await digest(token);
      const session=await this.ctx.storage.get(key);
      if(action==="/logout"){
        await this.ctx.storage.delete(key);
        return json({ok:true});
      }
      if(!session||session.expiresAt<=now){
        if(session)await this.ctx.storage.delete(key);
        return json({error:"Session expired"},401);
      }
      return json({email:session.email});
    }
    return json({error:"Not found"},404);
  }
}
export const sessionCookieName=cookieName;
export const emptySessionCookie=cookieName+"=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
