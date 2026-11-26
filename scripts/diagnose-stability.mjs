import { captureDir, channel, devURL } from "./browser-check.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel });
const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
  p = await c.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await p.route("**/stability-review", (r) =>
  r.fulfill({
    contentType: "text/html",
    body: '<html><body><script type="module" src="/scripts/stability-studio.ts"></script></body></html>',
  }),
);
await p.goto(new URL("stability-review", devURL).href);
await p.waitForFunction(() => window.stability);
const report = { errors, motion: {} };
const tag = process.env.STABILITY_TAG || "final";
for (const hz of [60, 120, 144]) {
  const a = await p.evaluate((hz) => window.stability.frames(hz, 240), hz);
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  const movements = a
    .slice(1)
    .map((v, i) => distance(v.position, a[i].position));
  const screen = a.slice(1).map((v, i) => distance(v.screen, a[i].screen));
  report.motion[hz] = {
    zeroMovementFrames: movements.filter((v) => v < 1e-7).length,
    total: movements.length,
    worldMin: Math.min(...movements),
    worldMax: Math.max(...movements),
    screenMin: Math.min(...screen),
    screenMax: Math.max(...screen),
    samples: a,
  };
  if (tag !== "baseline") expect(report.motion[hz].zeroMovementFrames).toBe(0);
  console.log(
    hz,
    report.motion[hz].zeroMovementFrames,
    "stationary frames of",
    movements.length,
  );
}
const continuity = await p.evaluate(() => {
  const { sim } = window.stability;
  sim.setPaused(true);
  const before = sim.aircraft.root.position.toArray();
  sim.orbitTarget = 0.7;
  sim.updateCamera(0, true);
  const pausedOrbit = sim.aircraft.root.position.toArray();
  sim.setMap(true);
  const pausedMap = sim.aircraft.root.position.toArray();
  sim.depart();
  const departureGap = sim.aircraft.root.position.distanceTo(
    sim.flight.position,
  );
  sim.visit("dock", "quick");
  const arrivalGap = sim.aircraft.root.position.distanceTo(sim.flight.position);
  sim.depart();
  sim.paused = true;
  return { before, pausedOrbit, pausedMap, departureGap, arrivalGap };
});
expect(continuity.pausedOrbit).toEqual(continuity.before);
expect(continuity.pausedMap).toEqual(continuity.before);
expect(continuity.departureGap).toBe(0);
expect(continuity.arrivalGap).toBe(0);
report.continuity = continuity;
for (const near of [1, 8]) {
  await p.evaluate((near) => {
    const { sim } = window.stability;
    sim.camera.near = near;
    sim.camera.updateProjectionMatrix();
    sim.screenMaterial.uniforms.uNearFar.value.set(near, sim.camera.far);
    sim.render();
  }, near);
  await p.screenshot({ path: `${captureDir}/stability-depth-${near}.png` });
}
await fs.writeFile(
  `${captureDir}/stability-${tag}.json`,
  JSON.stringify(report, null, 2),
);
expect(errors).toEqual([]);
await browser.close();
