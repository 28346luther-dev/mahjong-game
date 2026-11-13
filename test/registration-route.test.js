import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

function envWithStub(fetch){
 return {
  AUTH:{idFromName:()=>({}),get:()=>({fetch})},
  ROOMS:{idFromName:()=>({}),get:()=>({fetch:()=>null})},
  ASSETS:{fetch:()=>new Response("<!doctype html>")}
 };
}
function registerRequest(){
 return new Request("https://study-plus.online/api/auth/register",{
  method:"POST",headers:{"content-type":"application/json","origin":"https://study-plus.online"},
  body:JSON.stringify({email:"test@example.com",password:"a-test-password-123"})
 });
}
test("registration failure returns JSON diagnostic rather than HTML",async()=>{
 const response=await worker.fetch(registerRequest(),envWithStub(async()=>{throw Error("Simulated storage outage");}));
 assert.equal(response.status,503);
 assert.match(response.headers.get("content-type"),/application\/json/);
 const body=await response.json();
 assert.equal(body.code,"AUTH_BACKEND_FAILURE");
 assert.match(body.requestId,/^[a-f0-9-]{36}$/);
 assert.equal(JSON.stringify(body).includes("test@example.com"),false);
});
test("registration rejects non-JSON backend responses",async()=>{
 const response=await worker.fetch(registerRequest(),envWithStub(async()=>new Response("<!DOCTYPE html>",{status:500,headers:{"content-type":"text/html"}})));
 assert.equal(response.status,502);
 assert.equal((await response.json()).code,"AUTH_UPSTREAM_FORMAT");
});
test('account health exposes safe failure categories without leaking provider error contents',async()=>{
 const cases=[
  ['Daily request quota exceeded for account secret-account-id','AUTH_STORAGE_LIMIT_REACHED'],
  ['Durable Object class AuthStore is not exported','AUTH_BINDING_MISMATCH'],
  ['Durable Object namespace requires migration','AUTH_MIGRATION_REQUIRED'],
  ['Worker exceeded CPU time limit','AUTH_CPU_LIMIT'],
  ['This namespace requires a paid plan','AUTH_STORAGE_PLAN_REQUIRED'],
  ['Durable Object is overloaded','AUTH_STORAGE_BUSY'],
  ['Unexpected provider error secret-password-or-token','AUTH_STORAGE_UNAVAILABLE']
 ];
 for(const [message,reason] of cases){
  const response=await worker.fetch(new Request('https://example.test/api/auth/status'),envWithStub(async()=>{throw Error(message);}));
  const body=await response.json();
  assert.equal(response.status,503);assert.equal(body.reason,reason);assert.match(body.requestId,/^[a-f0-9-]{36}$/);
  assert.equal(JSON.stringify(body).includes('secret-'),false);
 }
});
test('registration reports a recognized account quota failure',async()=>{
 const response=await worker.fetch(registerRequest(),envWithStub(async()=>{throw Error('Daily request quota exceeded');}));
 const body=await response.json();assert.equal(body.reason,'AUTH_STORAGE_LIMIT_REACHED');assert.match(body.error,/quota/);
});
test('storage probe retains the underlying error but redacts credentials and identifiers',async()=>{
 const error=Object.assign(Error('Storage request failed: code XYZ; token="test-private-value" user=player@example.test https://provider.test/private?key=hidden abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789\nprivate stack trace'),{retryable:true,remote:true});
 const response=await worker.fetch(new Request('https://example.test/api/auth/status'),envWithStub(async()=>{throw error;}));
 const body=await response.json(),detail=JSON.stringify(body.detail);
 assert.match(body.detail.message,/Storage request failed: code XYZ/);
 for(const value of ['test-private-value','player@example.test','provider.test','abcdef0123456789','private stack trace'])assert.equal(detail.includes(value),false);
 assert.equal(body.detail.retryable,true);assert.equal(body.detail.remote,true);
 const registration=await worker.fetch(registerRequest(),envWithStub(async()=>{throw error;}));
 assert.equal((await registration.json()).detail,undefined,'credential-bearing operations never expose provider detail');
});
