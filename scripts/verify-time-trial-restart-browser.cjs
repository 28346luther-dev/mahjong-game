// Requires local Wrangler and Playwright on NODE_PATH.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let starts = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/kart/start") starts++;
  });
  await page.route("**/kart-racing.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `\nwindow.restartTest=()=>({raceId,playing,busy,started,lapCount,speed,pos:{...pos}});`,
    });
  });
  const signup = await page.request.post(
    "http://127.0.0.1:8787/api/auth/register",
    {
      data: {
        email: `restart-${Date.now()}@example.test`,
        password: "Local-test-only-3948",
      },
    },
  );
  assert.equal(signup.status(), 200);
  await page.goto("http://127.0.0.1:8787");
  await page.waitForFunction(
    () =>
      window.KartRacing &&
      document.getElementById("authScreen").classList.contains("hidden"),
  );
  await page.evaluate(() => {
    window.KartRacing.open();
    window.KartRacing.enterTrack("timetrial");
  });
  await page.waitForFunction(() => window.restartTest?.().playing, null, {
    timeout: 60000,
  });
  const original = await page.evaluate(() => window.restartTest());
  await page.keyboard.down("w");
  await page.waitForFunction(() => window.restartTest().speed > 1, null, {
    timeout: 15000,
  });
  await page.keyboard.up("w");
  await page.keyboard.press("r");
  await page.waitForFunction(
    (id) => {
      const state = window.restartTest();
      return state.playing && !state.busy && state.raceId !== id;
    },
    original.raceId,
    { timeout: 15000 },
  );
  const restarted = await page.evaluate(() => window.restartTest());
  assert.equal(restarted.lapCount, 1);
  assert.ok(restarted.started > original.started);
  assert.ok(
    Math.hypot(
      restarted.pos.x - original.pos.x,
      restarted.pos.z - original.pos.z,
    ) < 0.1,
    "reset returns to start",
  );
  assert.ok(Math.abs(restarted.speed) < 0.1, "reset stops the old car");
  const requests = starts;
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", repeat: true }),
    ),
  );
  await page.waitForTimeout(250);
  assert.equal(starts, requests, "held R does not repeatedly create sessions");
  assert.ok(
    await page.evaluate(() => window.restartTest().playing),
    "held R must not pause the car",
  );
  await page.keyboard.down("w");
  await page.waitForFunction(() => window.restartTest().speed > 1, null, {
    timeout: 15000,
  });
  await page.keyboard.up("w");
  assert.ok(
    (await page.evaluate(() => window.restartTest())).playing,
    "can drive after restart",
  );
  await page.keyboard.press("r");
  await page.waitForFunction(
    (id) => {
      const state = window.restartTest();
      return state.playing && !state.busy && state.raceId !== id;
    },
    restarted.raceId,
    { timeout: 15000 },
  );
  const again = await page.evaluate(() => window.restartTest());
  const sample = await page.request.post(
    "http://127.0.0.1:8787/api/kart/sample",
    {
      data: {
        raceId: again.raceId,
        x: again.pos.x,
        z: again.pos.z,
        pit: false,
      },
    },
  );
  assert.equal(sample.status(), 200, await sample.text());
  assert.equal(starts, 3, "one fresh server session per restart");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: R starts a fresh timed lap, resets car/timer, allows acceleration again, ignores key-repeat, and remains valid on a second restart",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
