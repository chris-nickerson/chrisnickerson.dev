import {
  captureDir,
  channel,
  devURL,
  saveRecording,
} from "./browser-check.mjs";
import fs from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch({ channel });
const report = [];
try {
  for (const kind of ["slope", "island", "head-on", "break-away"]) {
    const seed = kind === "slope" ? 43 : kind === "island" ? 44 : 42;
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: captureDir, size: { width: 1280, height: 800 } },
    });
    const page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    // Place one opposing aircraft deterministically. Only this local development
    // response is instrumented. Birds still fly their ordinary unmodified route.
    let opposingFlightInstalled = false;
    if (kind === "head-on")
      await page.route(/\/src\/simulation\.ts(?:\?|$)/, async (r) => {
        const res = await r.fetch();
        const src = await res.text();
        const marker = "this.ready = true;";
        if (!src.includes(marker))
          throw Error("Missing creation point for opposing-flight fixture");
        opposingFlightInstalled = true;
        await r.fulfill({
          response: res,
          body: src.replace(
            marker,
            `
      this.flight.position.set(-18,119,1850); this.flight.heading=Math.PI;
      this.flight.velocity.set(0,0,50); this.flight.assisted=false;
      this.flight.quaternion.setFromAxisAngle(new T.Vector3(0,1,0),-Math.PI);
      this.resetPresentation();this.updateCamera(1,true);
      ` + marker,
          ),
        });
      });
    const replayURL = new URL(devURL);
    replayURL.searchParams.set("seed", String(seed));
    await page.goto(replayURL.href);
    await page.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
    if (kind === "head-on")
      expect(
        opposingFlightInstalled,
        "Serve the Vite dev build for the opposing-flight fixture",
      ).toBe(true);
    const until = (t) =>
      page.waitForFunction(
        (t) => window.__AFTER_RAIN__.stats().elapsed >= t,
        t,
      );
    const stats = () => page.evaluate(() => window.__AFTER_RAIN__.stats());
    await until(5);
    if (kind === "head-on") await page.locator("#scene").focus();
    else await page.locator("#fly").click();
    const key = kind === "island" ? "a" : "d";
    await page.keyboard.down(key);
    await until(kind === "head-on" ? 5.35 : kind === "break-away" ? 11 : 8.4);
    await page.keyboard.up(key);
    if (kind === "slope") await page.keyboard.down("w");
    await until(12);
    await page.keyboard.up("w");
    if (kind === "break-away") {
      await page.mouse.move(400, 310);
      await page.mouse.down();
      await page.mouse.move(1180, 310, { steps: 25 });
      await page.mouse.up();
    }
    const samples = [];
    for (const t of [13, 17, 22, 28]) {
      await until(t);
      const s = await stats();
      samples.push({
        elapsed: s.elapsed,
        position: s.position,
        flock: s.migration.caller,
        lift: s.migration.lift,
        camera: s.look,
      });
    }
    await page.screenshot({ path: `${captureDir}/migration-${kind}.jpg` });
    const video = page.video();
    await ctx.close();
    await saveRecording(video, `${captureDir}/migration-${kind}.webm`);
    report.push({ kind, seed, samples, errors });
    expect(errors).toEqual([]);
    console.log(
      kind,
      samples.map((s) => s.position.map(Math.round)),
    );
  }
} finally {
  await browser.close();
  await fs.writeFile(
    `${captureDir}/migration-intercepts.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
}
