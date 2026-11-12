// Run with Playwright available on NODE_PATH and a local Wrangler server.
// Example: NODE_PATH=/workspace/browser-tools/node_modules node scripts/verify-driving-browser.cjs
const { chromium } = require("playwright");

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/kart-racing.js", async (r) => {
    const res = await r.fetch();
    await r.fulfill({
      response: res,
      body:
        (await res.text()) +
        `\nwindow.driveTest={state:()=>({pos:{...pos},yaw,speed,playing,steer:dynamics.steer,roll:dynamics.roll,heave:dynamics.heave,rotation:kart?.rotation.toArray(),calls:renderer?.info.render.calls,triangles:renderer?.info.render.triangles}), objects:()=>({kart,camera,scene,renderer,carVisual}), step:update, reset, pose:(p)=>{pos={x:p.x,y:p.y,z:p.z};
yaw=p.yaw;playing=false;
dynamics.reset(p.y);
speed=0;
updateRideHeightAndBank(1);
}};
`,
    });
  });
  await p.goto(process.env.DRIVING_TEST_URL || "http://127.0.0.1:8787");
  await p.waitForFunction(() => window.KartRacing);
  await p.evaluate(async () => {
    await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `driving-${Date.now()}@example.test`,
        password: "Local-test-only-3948",
      }),
    });
  });
  await p.evaluate(() => {
    window.KartRacing.open();
    window.KartRacing.beginPractice();
  });
  await p.waitForFunction(() => window.driveTest.state().playing, null, {
    timeout: 60000,
  });
  await p.waitForTimeout(4000);
  console.log(await p.evaluate(() => window.driveTest.state()));
  await p.screenshot({ path: "/tmp/driving-chase.png" });
  await p.evaluate(() => window.KartRacing.setCameraMode("cockpit"));
  await p.waitForTimeout(1000);
  await p.screenshot({ path: "/tmp/driving-bonnet.png" });
  console.log(
    "health",
    await p.evaluate(async () =>
      Promise.all(
        ["/api/health", "/api/auth/status"].map(async (path) => ({
          path,
          status: (await fetch(path)).status,
        })),
      ),
    ),
  );

  const checks = await p.evaluate(async () => {
    const assert = (ok, message) => {
      if (!ok) throw Error(message);
    };

    const { kart, carVisual } = window.driveTest.objects();

    const THREE = await import("/vendor/three.module.js");

    const { sampleAt } = await import("/kart-track.js");

    const { wheelSurface } = await import("/kart-vehicle-dynamics.js");

    assert(
      carVisual.hiddenInCockpit.every((o) => !o.visible),
      "cabin occluders",
    );
    assert(kart.getObjectByName("body").visible, "bonnet visible");

    for (const steer of [-0.3, 0.3, 0]) {
      carVisual.animate(20, steer, 1 / 60);

      for (const wheel of carVisual.wheels) {
        assert(
          Math.abs(wheel.group.rotation.y - (wheel.front ? steer : 0)) < 1e-9,
          "wheel steering",
        );

        const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(
          wheel.mesh.quaternion,
        );

        assert(
          axis.distanceTo(
            new THREE.Vector3(1, 0, 0).applyQuaternion(wheel.basis),
          ) < 1e-6,
          "wheel axle basis",
        );
      }
    }
    let maxContactError = 0,
      minAlignment = 1;

    for (let i = 0; i < 40; i++) {
      const p = sampleAt(i / 40),
        q = sampleAt(i / 40 + 0.0001),
        yaw = Math.atan2(q.x - p.x, q.z - p.z);

      window.driveTest.pose({ ...p, yaw });

      kart.updateMatrixWorld(true);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        kart.quaternion,
      );

      minAlignment = Math.min(
        minAlignment,
        (forward.x * Math.sin(yaw) + forward.z * Math.cos(yaw)) /
          Math.hypot(forward.x, forward.z),
      );

      for (const w of carVisual.wheels) {
        const c = w.group.getWorldPosition(new THREE.Vector3());
        const error = Math.abs(
          c.y - 0.358 - 0.044 - wheelSurface(c.x, c.z).height,
        );
        maxContactError = Math.max(maxContactError, error);
      }
    }
    assert(minAlignment > 0.999, "body heading follows travel");

    assert(maxContactError < 0.025, "tyres follow hills: " + maxContactError);

    window.driveTest.reset();

    return {
      routeSamples: 40,
      wheelsPerSample: 4,
      minAlignment,
      maxContactError,
    };
  });
  console.log("ASSERTIONS PASSED", checks);
  for (const [fraction, label] of [
    [0.909, "bridge"],
    [0.945, "final-corner"],
    [0.975, "pit-frontage"],
  ]) {
    await p.evaluate(async (fraction) => {
      const { sampleAt } = await import("/kart-track.js");
      const point = sampleAt(fraction),
        next = sampleAt(fraction + 0.0001);
      window.driveTest.pose({
        ...point,
        yaw: Math.atan2(next.x - point.x, next.z - point.z),
      });
    }, fraction);
    await p.waitForTimeout(200);
    await p.screenshot({ path: `/tmp/driving-${label}.png` });
  }

  if (errors.length) throw Error(errors.join("\n"));
  await b.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
