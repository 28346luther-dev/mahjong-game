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
