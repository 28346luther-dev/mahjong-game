import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const script=readFileSync("public/reaction-camera.js","utf8");
test("camera quality targets modest bitrates for TURN relays",()=>{
 assert.match(script,/CAMERA_WIDTH=320,CAMERA_HEIGHT=240,CAMERA_FPS=12/);
 assert.match(script,/MAX_VIDEO_BITRATE=180000/);
 assert.match(script,/maxBitrate=MAX_VIDEO_BITRATE/);
 assert.match(script,/tuneSender\(sender\)/);
});
test("only local camera is buffered for replay; remote media stays live",()=>{
 assert.match(script,/record\(self,stream\)/);
 assert.doesNotMatch(script,/record\(peer,peer\.stream\)/);
});
test("hidden gallery players do not decode additional video elements",()=>{
 assert.match(script,/if\(!expanded\|\|!active\.length\)/);
 assert.match(script,/video\.pause\(\);video\.srcObject=null/);
 assert.match(script,/if\(expanded&&stream\?\.getVideoTracks\(\)/);
});
test("camera source remains syntactically valid",()=>{
 execFileSync(process.execPath,["--check","public/reaction-camera.js"]);
});
