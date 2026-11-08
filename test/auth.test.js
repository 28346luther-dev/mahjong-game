import test from "node:test";
import assert from "node:assert/strict";
import {AuthStore} from "../src/auth.js";
class FakeStorage {
  constructor(){this.data=new Map();}
  async get(key){return this.data.get(key);}
  async put(key,value){this.data.set(key,value);}
  async delete(key){this.data.delete(key);}
}
function request(path,body){return new Request("https://auth/"+path,{method:"POST",body:JSON.stringify(body)});}
test("register, login, check session and logout using hashed passwords",async()=>{
  const store=new FakeStorage(),auth=new AuthStore({storage:store});
  const registered=await auth.fetch(request("register",{email:"Player@example.com",password:"long-secret-password",secure:true}));
  assert.equal(registered.status,200);
  assert.equal((await registered.json()).email,"player@example.com");
  const cookie=registered.headers.get("set-cookie");
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/Secure/);
  assert.match(cookie,/SameSite=Lax/);
  const token=/games_club_session=([a-f0-9]{64})/.exec(cookie)[1];
  const keys=[...store.data.keys()];
  assert.equal(keys.some(x=>x.includes("Player@example.com")),false);
  assert.equal(JSON.stringify([...store.data.values()]).includes("long-secret-password"),false);
  const session=await auth.fetch(request("me",{token}));
  assert.equal((await session.json()).email,"player@example.com");
  assert.equal((await auth.fetch(request("login",{email:"player@example.com",password:"wrong-password"}))).status,400);
  assert.equal((await auth.fetch(request("login",{email:"player@example.com",password:"wrong-password123"}))).status,401);
  assert.equal((await auth.fetch(request("register",{email:"player@example.com",password:"long-secret-password"}))).status,409);
  assert.equal((await auth.fetch(request("logout",{token}))).status,200);
  assert.equal((await auth.fetch(request("me",{token}))).status,401);
  assert.equal((await auth.fetch(request("login",{email:"player@example.com",password:"long-secret-password"}))).status,200);
});
test("reject invalid email and short password",async()=>{
  const auth=new AuthStore({storage:new FakeStorage()});
  assert.equal((await auth.fetch(request("register",{email:"bad-email",password:"long-secret-password"}))).status,400);
  assert.equal((await auth.fetch(request("register",{email:"good@example.com",password:"short"}))).status,400);
});
