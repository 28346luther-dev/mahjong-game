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
  if (process.env.DRIVING_TEST_FAST) p.screenshot = async () => {};
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/kart-racing.js", async (r) => {
    const res = await r.fetch();
    await r.fulfill({
      response: res,
      body:
        (await res.text()) +
        `\nwindow.driveTest={state:()=>({pos:{...pos},yaw,speed,playing,inPitLane,pitLimiter,steer:dynamics.steer,roll:dynamics.roll,heave:dynamics.heave,rotation:kart?.rotation.toArray(),calls:renderer?.info.render.calls,triangles:renderer?.info.render.triangles}), objects:()=>({kart,camera,scene,renderer,carVisual}), step:update, run:(input,dt)=>{playing=true;keys.clear();for(const key of input)keys.add(key);update(dt);updateRideHeightAndBank(dt);playing=false;keys.clear();}, reset, pose:(p)=>{pos={x:p.x,y:p.y,z:p.z};
yaw=p.yaw;bonnetYaw=yaw;playing=false;raceId=null;pitLimiter=!!p.pit;inPitLane=!!p.pit;
dynamics.reset(p.y);
speed=p.speed||0;
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

    const { kart, carVisual, scene } = window.driveTest.objects();

    const THREE = await import("/vendor/three.module.js");

    const { sampleAt, PIT, projectToRoute } = await import("/kart-track.js");

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
        const tyre = w.tyre;
        const h = wheelSurface(c.x, c.z).height + 0.044;
        const slopeX =
          (wheelSurface(c.x + 0.25, c.z).height -
            wheelSurface(c.x - 0.25, c.z).height) /
          0.5;
        const slopeZ =
          (wheelSurface(c.x, c.z + 0.25).height -
            wheelSurface(c.x, c.z - 0.25).height) /
          0.5;
        let gap = Infinity;
        tyre.traverse((mesh) => {
          if (!mesh.isMesh) return;
          const positions = mesh.geometry.attributes.position,
            vertex = new THREE.Vector3();
          for (let i = 0; i < positions.count; i++) {
            vertex
              .fromBufferAttribute(positions, i)
              .applyMatrix4(mesh.matrixWorld);
            gap = Math.min(
              gap,
              vertex.y -
                h -
                slopeX * (vertex.x - c.x) -
                slopeZ * (vertex.z - c.z),
            );
          }
        });
        const error = Math.abs(gap);
        maxContactError = Math.max(maxContactError, error);
      }
    }
    assert(minAlignment > 0.999, "body heading follows travel");

    assert(maxContactError < 0.025, "tyres follow hills: " + maxContactError);

    // Compare the actual scene's uppermost surface with the pit asphalt,
    // rather than checking only route centreline coordinates.
    const surfaces = [];
    scene.traverse((o) => {
      if (
        o.isMesh &&
        !o.isInstancedMesh &&
        !o.material.isShaderMaterial &&
        !carVisual.group.getObjectById(o.id)
      )
        surfaces.push(o);
    });
    const ray = new THREE.Raycaster();
    ray.far = 4;
    let pitChecks = 0;
    for (let i = 1; i < 160; i++) {
      const point = sampleAt(i / 160, PIT),
        q = projectToRoute(point.x, point.z, PIT);
      for (const offset of [-4.5, -2.15, 0, 4.5]) {
        const x = point.x + q.normalX * offset,
          z = point.z + q.normalZ * offset;
        ray.set(
          new THREE.Vector3(x, point.y + 2, z),
          new THREE.Vector3(0, -1, 0),
        );
        const hits = ray.intersectObjects(surfaces, false);
        assert(
          hits.length &&
            (hits[0].object.userData.paved || hits[0].object.userData.pitPaint),
          "pit entry is covered at " +
            i +
            "," +
            offset +
            " by " +
            hits[0]?.object.name +
            " " +
            hits[0]?.object.geometry.type +
            " color " +
            hits[0]?.object.material.color?.getHexString() +
            " height " +
            hits[0]?.point.y +
            " expected " +
            point.y +
            " hits " +
            JSON.stringify(
              hits
                .slice(0, 5)
                .map((h) => ({
                  name: h.object.name,
                  color: h.object.material.color?.getHexString(),
                  geo: h.object.geometry.type,
                  y: h.point.y,
                  paved: h.object.userData.paved,
                })),
            ),
        );
        pitChecks++;
      }
    }
    // Exercise the real update loop with held keys: heading changes must
    // account for motion instead of a separate lateral skating velocity.
    const start = sampleAt(0.01),
      next = sampleAt(0.0101),
      heading = Math.atan2(next.x - start.x, next.z - start.z);
    window.driveTest.pose({ ...start, yaw: heading, speed: 18 });
    for (let i = 0; i < 12; i++) window.driveTest.run(["d"], 1 / 120);
    const turned = window.driveTest.state();
    assert(
      turned.yaw < heading - 0.015,
      "D must visibly pivot the nose within 100ms",
    );
    assert(Math.abs(turned.heave) <= 0.025, "body height stays on road");
    const entry = sampleAt(0.02, PIT),
      ahead = sampleAt(0.021, PIT);
    window.driveTest.pose({
      ...entry,
      yaw: Math.atan2(ahead.x - entry.x, ahead.z - entry.z),
      speed: 10,
    });
    let maximumPitError = 0;
    for (let i = 0; i < 1200; i++) {
      const state = window.driveTest.state(),
        where = projectToRoute(state.pos.x, state.pos.z, PIT);
      maximumPitError = Math.max(maximumPitError, where.distance);
      const target = sampleAt(Math.min(0.95, where.progress + 0.014), PIT);
      const desired = Math.atan2(
        target.x - state.pos.x,
        target.z - state.pos.z,
      );
      const error = Math.atan2(
        Math.sin(desired - state.yaw),
        Math.cos(desired - state.yaw),
      );
      window.driveTest.run(
        ["w", ...(Math.abs(error) > 0.015 ? [error < 0 ? "d" : "a"] : [])],
        1 / 60,
      );
      if (where.progress > 0.25) break;
    }
    const arrived = window.driveTest.state();
    const pitProgress = projectToRoute(
      arrived.pos.x,
      arrived.pos.z,
      PIT,
    ).progress;
    assert(
      arrived.inPitLane && arrived.pitLimiter,
      "pit entry automatically selects the paved lane and limiter",
    );
    assert(
      pitProgress > 0.25 && maximumPitError < 5.0,
      "must drive through entry without grass/barrier slowdown: " +
        pitProgress +
        " error " +
        maximumPitError,
    );
    console.log(
      "driven pit entry",
      pitProgress,
      "maximum deviation",
      maximumPitError,
    );
    console.log(
      "pit entry checks",
      pitChecks,
      "100ms heading change",
      turned.yaw - heading,
      "measured tyre radii",
      carVisual.wheels.map((w) => w.radius),
    );
    window.driveTest.reset();

    return {
      routeSamples: 40,
      pitChecks,
      pitProgress,
      maximumPitError,
      turnIn100ms: turned.yaw - heading,
      tyreRadii: carVisual.wheels.map((w) => w.radius),
      wheelsPerSample: 4,
      minAlignment,
      maxContactError,
    };
  });
  console.log("ASSERTIONS PASSED", checks);
  for (const [fraction, label, pit] of [
    [0.909, "bridge"],
    [0.945, "final-corner"],
    [0.975, "pit-frontage"],
    [0.1, "pit-entry", true],
    [0.24, "pit-entry-after-bridge", true],
  ]) {
    await p.evaluate(
      async ({ fraction, pit }) => {
        const { sampleAt, PIT, projectToRoute } =
          await import("/kart-track.js");
        const point = sampleAt(fraction, pit ? PIT : undefined),
          next = sampleAt(fraction + 0.0001, pit ? PIT : undefined);
        window.driveTest.pose({
          ...point,
          pit,
          yaw: Math.atan2(next.x - point.x, next.z - point.z),
        });
      },
      { fraction, pit },
    );
    await p.waitForTimeout(200);
    await p.screenshot({ path: `/tmp/driving-${label}.png` });
  }

  if (errors.length) throw Error(errors.join("\n"));
  await b.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
