// Requires local Wrangler and Playwright on NODE_PATH. Controlled packet delays
// exercise both browser clients; authoritative race rules have separate tests.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const base = Date.now(),
    racers = [0, 1].map((i) => ({
      id: (i ? "b" : "a").repeat(64),
      name: "Driver " + i,
      x: i * 5,
      z: 0,
      yaw: 0,
      speed: 20,
      lap: 0,
      lastAt: base,
    }));
  const counts = [0, 0],
    pages = [];
  for (let i = 0; i < 2; i++) {
    const page = await browser.newPage();
    pages.push(page);
    await page.route("**/api/kart/**", async (route) => {
      const url = new URL(route.request().url()),
        now = Date.now();
      if (url.pathname.endsWith("/events"))
        return route.fulfill({
          json: {
            events: [
              {
                id: base,
                qualifyingAt: base,
                raceAt: base,
                registered: 2,
                phase: "race",
              },
            ],
          },
        });
      if (url.pathname.endsWith("/event/sample")) {
        const body = route.request().postDataJSON();
        counts[i]++;
        Object.assign(racers[i], {
          x: body.x,
          z: body.z,
          lastAt: now,
          speed: body.speed,
          yaw: body.yaw,
        });
      }
      const data = {
        id: base,
        serverNow: now,
        phase: "race",
        you: racers[i].id,
        laps: 3,
        qualifyingAt: base,
        raceAt: base,
        racers: structuredClone(racers),
      };
      await new Promise((resolve) =>
        setTimeout(resolve, url.pathname.endsWith("/event/state") ? 140 : 25),
      );
      const collision =
        url.pathname.endsWith("/event/sample") && counts[i] === 7;
      if (collision) {
        data.collision = true;
        data.error = "Contact with another car";
      }
      await route.fulfill({ json: data, status: collision ? 409 : 200 });
    });
    await page.goto("http://127.0.0.1:8787");
    await page.waitForFunction(() => window.KartMeetings);
    await page.evaluate(() => {
      window.received = [];
      window.KartRacing = {
        mayAutoJoinMeeting: () => false,
        getPose: () => ({ x: 0, z: 0, speed: 0 }),
        pitBays: () => [],
        getLocalPitRemaining: () => 0,
        updateRivals: (drivers, id, time) =>
          window.received.push({ time, drivers }),
      };
      window.KartMeetings.open();
    });
    await page.waitForFunction(() => window.KartMeetings.getState()?.you);
    await page.evaluate(
      ({ i, base }) => {
        window.sender = setInterval(
          () =>
            window.KartMeetings.sendTelemetry({
              x: i * 5,
              z: (Date.now() - base) / 50,
              speed: 20,
              yaw: 0,
              pit: false,
            }),
          100,
        );
      },
      { i, base },
    );
  }
  await pages[0].waitForTimeout(2500);
  for (let i = 0; i < 2; i++) {
    const result = await pages[i].evaluate(() => {
      clearInterval(window.sender);
      window.KartMeetings.close();
      return {
        frames: window.received,
        text: document.getElementById("kartMeetingCountdown").textContent,
      };
    });
    assert.ok(counts[i] >= 15, "both drivers must send frequent telemetry");
    assert.ok(
      result.frames.length >= 15,
      "both viewers receive frequent rival updates",
    );
    for (let n = 1; n < result.frames.length; n++)
      assert.ok(
        result.frames[n].time >= result.frames[n - 1].time,
        "delayed polls cannot rewind race state",
      );
    assert.ok(
      result.frames.at(-1).drivers.every((driver) => driver.z > 20),
      "both cars advance on both viewers",
    );
    assert.equal(result.text, "3-LAP RACE IN PROGRESS");
    console.log(
      "client",
      i,
      "samples",
      counts[i],
      "rival updates",
      result.frames.length,
      "ordered timestamps and three-lap HUD passed",
    );
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
