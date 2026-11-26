import {
  captureDir,
  channel,
  previewURL,
  saveRecording,
} from "./browser-check.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const viewports = [
  [1440, 900],
  [390, 844],
  [320, 568],
].filter(
  ([width]) =>
    (!process.env.PHONE_ONLY || width < 600) &&
    (!process.env.WIDTH_ONLY || width === Number(process.env.WIDTH_ONLY)),
);
if (!viewports.length)
  throw new Error(
    "No landing viewport matches. Use width 1440, 390, or 320 (390 or 320 with PHONE_ONLY).",
  );
const b = await chromium.launch({ headless: true, channel }),
  report = [];
const state = (p) => p.evaluate(() => window.__AFTER_RAIN__.stats());
try {
  for (const [width, height] of viewports) {
    const mobile = width < 600,
      c = await b.newContext({
        viewport: { width, height },
        isMobile: mobile,
        hasTouch: mobile,
        recordVideo: { dir: captureDir, size: { width, height } },
      }),
      p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.goto(previewURL);
    await p.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
    await p.evaluate(() => window.__AFTER_RAIN__.practiceLanding("memory"));
    await p.waitForFunction(
      () => window.__AFTER_RAIN__.stats().manualApproach === "memory",
    );
    expect(await p.evaluate(() => document.activeElement.id)).toBe("scene");
    await p.screenshot({ path: `${captureDir}/manual-approach-${width}.png` });
    await p.keyboard.down("s");
    await p.waitForFunction(
      () => window.__AFTER_RAIN__.stats().position[1] < 20,
    );
    await p.keyboard.up("s");
    await p.keyboard.down("w");
    await p.waitForTimeout(600);
    await p.keyboard.up("w");
    await p.waitForFunction(() => window.__AFTER_RAIN__.stats().onWater, null, {
      timeout: 30000,
    });
    await p.waitForTimeout(8000);
    const landed = await state(p);
    expect(landed.arrival).toBe(null);
    expect(landed.position[1]).toBeLessThan(8);
    await p.screenshot({ path: `${captureDir}/manual-water-${width}.png` });
    const bounds = [];
    if (mobile) {
      const cd = await c.newCDPSession(p);
      async function swipe(dx, dy, cancel = false) {
        const x = width / 2,
          y = height * 0.56;
        await cd.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y, id: 1 }],
        });
        for (let j = 1; j <= 16; j++) {
          await cd.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              { x: x + (dx * j) / 16, y: y + (dy * j) / 16, id: 1 },
            ],
          });
          await p.waitForTimeout(18);
        }
        await cd.send("Input.dispatchTouchEvent", {
          type: cancel ? "touchCancel" : "touchEnd",
          touchPoints: [],
        });
        await p.waitForTimeout(450);
        const s = await state(p);
        bounds.push(s.aircraftBounds);
        expect(s.look.dragging).toBe(false);
        for (const v of [
          s.aircraftBounds.left,
          s.aircraftBounds.right,
          s.aircraftBounds.top,
          s.aircraftBounds.bottom,
        ])
          expect(Math.abs(v)).toBeLessThan(0.97);
      }
      for (let i = 0; i < 8; i++) {
        await swipe(
          width * 0.4,
          i === 2 ? height * 0.2 : i === 5 ? -height * 0.25 : 0,
        );
        if ([1, 3, 6].includes(i))
          await p.screenshot({
            path: `${captureDir}/manual-orbit-${width}-${i}.png`,
          });
      }
      await swipe(-width * 0.3, 0, true);
      await p.getByRole("button", { name: "Reset camera view" }).click();
      await p.waitForTimeout(1200);
      expect(Math.abs(Math.sin((await state(p)).look.yaw))).toBeLessThan(0.05);
      await p.locator("#pause").click();
      await swipe(width * 0.25, 0);
      expect((await state(p)).paused).toBe(true);
      await p.getByRole("button", { name: "Reset camera view" }).click();
      await p.locator("#pause").click();
    }
    await p.locator("#takeoff").click();
    await p.waitForFunction(
      () => !window.__AFTER_RAIN__.stats().onWater,
      null,
      { timeout: 30000 },
    );
    await p.waitForTimeout(5000);
    const takeoff = await state(p);
    expect(takeoff.position[1]).toBeGreaterThan(15);
    expect(takeoff.manualApproach).toBe(null);
    const power = await p.locator("#pilot-power").boundingBox(),
      instruments = await p.locator(".instruments").boundingBox();
    if (power && instruments)
      expect(
        power.x + power.width <= instruments.x ||
          instruments.x + instruments.width <= power.x ||
          power.y + power.height <= instruments.y ||
          instruments.y + instruments.height <= power.y,
      ).toBe(true);
    await p.screenshot({ path: `${captureDir}/manual-takeoff-${width}.png` });
    const fps = await p.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0,
            start = performance.now();
          function tick(t) {
            frames++;
            if (t - start > 3000) resolve((frames * 1000) / (t - start));
            else requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }),
    );
    expect(errors).toEqual([]);
    report.push({ width, height, landed, takeoff, bounds, fps, errors });
    console.log("PASS", width, height, "fps", fps);
    const video = p.video();
    await c.close();
    await saveRecording(video, `${captureDir}/manual-landing-${width}.webm`);
  }
} finally {
  await fs.writeFile(
    process.env.WIDTH_ONLY
      ? `${captureDir}/manual-layout-${process.env.WIDTH_ONLY}.json`
      : `${captureDir}/manual-verification.json`,
    JSON.stringify(report, null, 2),
  );
  await b.close();
}
