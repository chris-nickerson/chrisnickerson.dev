// Run with node --import tsx. Both URLs must serve the Vite development build.
import { captureDir, channel } from "./browser-check.mjs";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { Vector3 } from "three";
import { Flight } from "../src/flight.ts";
import { landscapeMap } from "../src/landscape.ts";

const url = process.argv[2],
  label = process.argv[3];
const seed = 42,
  flight = new Flight();
flight.valley = landscapeMap(
  new Vector3(-0.78, 0.38, -0.36).normalize(),
  seed,
).wind;
flight.enterInlet();
const poses = [];
let contact;
for (let i = 0; i < 60 * 32; i++) {
  const t = i / 60;
  if (t >= 6) flight.assisted = false;
  flight.step(1 / 60, {
    roll: t >= 6 && t < 7.65 ? -1 : 0,
    pitch: t >= 12 && flight.position.y > 12 ? -1 : 0,
    throttle: t >= 12 && t < 13.2 ? -1 : 0,
  });
  if (flight.onWater && contact === undefined) contact = t;
  poses.push({
    p: flight.position.toArray(),
    q: flight.quaternion.toArray(),
    v: flight.velocity.toArray(),
    heading: flight.heading,
    bank: flight.bank,
    pitch: flight.pitch,
    throttle: flight.throttle,
    onWater: flight.onWater,
    assisted: flight.assisted,
    speed: flight.speed,
  });
}
if (!contact) throw Error("Reference flight missed the inlet");
const browser = await chromium.launch({ channel });
const report = [];
try {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: width < 600 ? 2 : 1,
      hasTouch: width < 600,
      isMobile: width < 600,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.addInitScript(
      ({ poses, contact }) => {
        window.routeIndex = 0;
        window.replayPose = (f) => {
          const frame = poses[Math.min(poses.length - 1, window.routeIndex++)];
          f.position.fromArray(frame.p);
          f.quaternion.fromArray(frame.q);
          f.velocity.fromArray(frame.v);
          for (const k of [
            "heading",
            "bank",
            "pitch",
            "throttle",
            "onWater",
            "assisted",
            "speed",
          ])
            f[k] = frame[k];
        };
        const phases = { pass: [], turn: [], touchdown: [] };
        window.samples = phases;
        let last;
        function sample(now) {
          const t = window.routeIndex / 60;
          const list =
            t >= 8 && t < 12
              ? phases.pass
              : t >= 6 && t < 8
                ? phases.turn
                : t >= contact - 1 && t < contact + 2
                  ? phases.touchdown
                  : null;
          if (list && last) list.push(now - last);
          last = now;
          requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      },
      { poses, contact },
    );
    // Replay the same recorded physics poses after each solver tick in either
    // checkout. Keep the solver, camera, GPU passes and frame pacing live.
    await page.route(/\/src\/flight\.ts(?:\?|$)/, async (route) => {
      const res = await route.fetch();
      const body = await res.text();
      await route.fulfill({
        response: res,
        body:
          body +
          "\nconst originalStep=Flight.prototype.step; Flight.prototype.step=function(dt,input){ originalStep.call(this,dt,input); window.replayPose(this); };",
      });
    });
    const start = Date.now();
    await page.goto(url + "?seed=" + seed);
    await page.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
    const readyMs = Date.now() - start;
    await page.waitForFunction(
      (t) => window.routeIndex / 60 > t,
      contact + 2.5,
      { timeout: 90000 },
    );
    const result = await page.evaluate(() => ({
      times: window.samples,
      rendering: window.__AFTER_RAIN__.stats().rendering,
      ratio: window.__AFTER_RAIN__.stats().pixelRatio,
    }));
    for (const [section, times] of Object.entries(result.times)) {
      const sorted = times.toSorted((a, b) => a - b);
      const q = (p) => +sorted[Math.floor((sorted.length - 1) * p)].toFixed(1);
      report.push({
        label,
        width,
        height,
        section,
        readyMs,
        frames: times.length,
        fps: +((1000 * times.length) / times.reduce((a, b) => a + b)).toFixed(
          1,
        ),
        p95: q(0.95),
        p99: q(0.99),
        worst: q(1),
        over33: times.filter((t) => t > 33.4).length,
        pixelRatio: result.ratio,
        errors,
      });
    }
    await ctx.close();
    if (errors.length) throw Error(errors.join("\n"));
  }
} finally {
  await browser.close();
  await fs.writeFile(
    `${captureDir}/migration-timing-${label}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(report);
}
