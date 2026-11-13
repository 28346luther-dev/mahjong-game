// Controlled activity snapshots exercise notification timing without waiting
// for the real ten-minute race timetable. Run with local Wrangler + Playwright.
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
  const page = await browser.newPage({
      viewport: { width: 1100, height: 760 },
    }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const signup = await page.request.post(
    "http://127.0.0.1:8787/api/auth/register",
    {
      data: {
        email: `announcement-${Date.now()}@example.test`,
        password: "Local-test-only-3948",
      },
    },
  );
  assert.equal(signup.status(), 200);
  let now = Date.now(),
    startsAt = now + 61000,
    id = Math.floor(now / 600000) * 600000;
  let counts = {
    preLobby: 2,
    raceLobby: 2,
    racing: 3,
    timeTrial: 4,
    driving: 7,
    total: 11,
  };
  const heartbeats = [];
  await page.route(/\/api\/kart\/(activity|presence)$/, async (route) => {
    if (route.request().method() === "POST")
      heartbeats.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        serverNow: now,
        counts,
        nextRace: {
          id,
          startsAt,
          registrationCloses: startsAt - 8000,
          qualifyingAt: startsAt - 128000,
          registered: 6,
        },
      },
    });
  });
  await page.goto("http://127.0.0.1:8787");
  await page.waitForFunction(
    () =>
      window.KartAnnouncements &&
      window.KartRacing &&
      document.getElementById("authScreen").classList.contains("hidden"),
  );
  await page.evaluate(() => window.KartAnnouncements.refresh());
  await page.waitForFunction(() =>
    document
      .querySelector("[data-kart-player-counts]")
      .textContent.includes("Time Trial: 4"),
  );
  assert.equal(
    await page.locator("[data-race-announcement]:visible").count(),
    0,
    "no early announcement",
  );
  now += 2000;
  await page.evaluate(() => window.KartAnnouncements.refresh());
  await page.waitForSelector("[data-race-announcement]:visible");
  const message = await page
    .locator("[data-race-announcement]:visible [data-race-message]")
    .textContent();
  assert.equal(
    message,
    "Next race is starting in 1 Minute, there are 7 players racing right now. Join the race lobby to race.",
  );
  assert.equal(
    await page.locator("[data-race-announcement]:visible").count(),
    1,
    "no duplicated banner",
  );
  await page.screenshot({ path: "/tmp/race-announcement-prelobby.png" });
  await page.evaluate(() => {
    const original = window.KartMeetings.viewEvent;
    window.KartMeetings.viewEvent = (id) => {
      window.joinedAnnouncement = id;
      return original(id);
    };
  });
  await page
    .locator("[data-race-announcement]:visible [data-join-race]")
    .click();
  assert.equal(await page.evaluate(() => window.joinedAnnouncement), id);
  assert.ok(
    await page
      .locator("#kartGame")
      .evaluate((el) => el.classList.contains("kart-races-hub")),
    "join action opens race lobby",
  );
  await page.evaluate(() => window.KartAnnouncements.refresh());
  assert.equal(
    await page.locator("[data-race-announcement]:visible").count(),
    0,
    "dismissed race does not repeat",
  );
  await page.waitForFunction(
    () => window.KartRacing.getActivity() === "raceLobby",
  );
  await page.evaluate(() => window.KartAnnouncements.refresh());
  await page.waitForTimeout(100);
  assert.ok(heartbeats.some((h) => h.mode === "preLobby"));
  assert.ok(heartbeats.some((h) => h.mode === "raceLobby"));
  await page.evaluate(() => window.KartRacing.enterTrack("timetrial"));
  await page.waitForFunction(
    () => window.KartRacing.getActivity() === "timeTrial",
  );
  await page.waitForFunction(
    () => document.getElementById("kartStatus").textContent.startsWith("GO!"),
    null,
    { timeout: 60000 },
  );
  assert.ok(
    await page.locator(".kart-time-board").isVisible(),
    "Time Trial player count must be visible while driving",
  );
  counts = { ...counts, timeTrial: 5, driving: 8, total: 12 };
  await page.evaluate(() => window.KartAnnouncements.refresh());
  await page.waitForFunction(() =>
    document
      .querySelector(".kart-time-board [data-kart-player-counts]")
      .textContent.includes("Time Trial: 5"),
  );
  assert.ok(heartbeats.some((h) => h.mode === "timeTrial"));
  for (const text of await page
    .locator("[data-kart-player-counts]")
    .allTextContents())
    assert.equal(
      text,
      "Pre-lobby: 2 · Race lobby: 2 · Racing: 3 · Time Trial: 5",
    );
  // A different race may announce inside the kart/fullscreen root.
  id += 600000;
  await page.evaluate(() => window.KartAnnouncements.refresh());
  await page.waitForSelector("#kartGame [data-race-announcement]:visible");
  assert.equal(
    await page.locator("body > [data-race-announcement]:visible").count(),
    0,
  );
  await page.screenshot({ path: "/tmp/race-announcement-time-trial.png" });
  now = startsAt;
  await page.evaluate(() => window.KartAnnouncements.refresh());
  await page.waitForTimeout(1000);
  assert.equal(
    await page.locator("[data-race-announcement]:visible").count(),
    0,
    "announcement ends when race begins",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: one-minute announcement, accurate counts in all views, join-lobby CTA, per-race deduplication, kart-root banner and expiry",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
