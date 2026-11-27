import { captureDir, channel, previewURL } from "./browser-check.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const b = await chromium.launch({ channel, headless: true }),
  report = [];
const url = new URL(previewURL);
if (!url.searchParams.has("seed")) url.searchParams.set("seed", "42");
try {
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    const c = await b.newContext({
        viewport: { width, height },
        isMobile: true,
        hasTouch: true,
        reducedMotion: "reduce",
      }),
      p = await c.newPage(),
      cd = await c.newCDPSession(p),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(url.href);
    await p.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
    const samples = [];
    async function swipe(dx, dy) {
      const x = width * 0.4,
        y = height * 0.5;
      await cd.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      for (let i = 1; i <= 10; i++) {
        await cd.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10, id: 1 }],
        });
        const s = await p.evaluate(() => window.__AFTER_RAIN__.stats());
        samples.push(s.aircraftBounds);
        for (const v of [
          s.aircraftBounds.left,
          s.aircraftBounds.right,
          s.aircraftBounds.top,
          s.aircraftBounds.bottom,
        ])
          expect(Math.abs(v)).toBeLessThan(0.97);
      }
      await cd.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }
    for (let i = 0; i < 8; i++)
      await swipe(width * 0.4, i < 3 ? height * 0.2 : -height * 0.1);
    expect(
      Math.abs(
        (await p.evaluate(() => window.__AFTER_RAIN__.stats())).look.yaw,
      ),
    ).toBeGreaterThan(1);
    await p.screenshot({ path: `${captureDir}/air-orbit-${width}.png` });
    await p.locator("#reset-view").click();
    expect(
      Math.abs(
        Math.sin(
          (await p.evaluate(() => window.__AFTER_RAIN__.stats())).look.yaw,
        ),
      ),
    ).toBeLessThan(0.01);
    if (width > 600) {
      expect(errors).toEqual([]);
      report.push({ width, height, samples, errors, touchLanding: false });
      console.log("PASS landscape camera", width, height);
      await c.close();
      continue;
    }
    await p.evaluate(() => window.__AFTER_RAIN__.practiceLanding("workshop"));
    await p.waitForTimeout(500);
    // Independent fingers: hold the flight stick while a second finger looks around.
    const r = await p.locator("#joystick").boundingBox(),
      stick = { x: r.x + r.width / 2, y: r.y + r.height / 2 + 30, id: 1 },
      look = { x: width * 0.5, y: height * 0.56, id: 2 };
    await cd.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [stick],
    });
    await cd.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [stick, look],
    });
    for (let i = 1; i <= 12; i++)
      await cd.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [stick, { ...look, x: look.x + (width * 0.25 * i) / 12 }],
      });
    await cd.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await p.waitForTimeout(500);
    expect(
      (await p.evaluate(() => window.__AFTER_RAIN__.stats())).look.dragging,
    ).toBe(false);
    await p.locator("#reset-view").click();
    // Land using the actual touch stick, then flare.
    await cd.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [stick],
    });
    await p.waitForFunction(
      () => window.__AFTER_RAIN__.stats().position[1] < 20,
      null,
      { timeout: 20000 },
    );
    await cd.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...stick, y: r.y + r.height / 2 - 25 }],
    });
    await p.waitForTimeout(600);
    await cd.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await p.waitForFunction(() => window.__AFTER_RAIN__.stats().onWater, null, {
      timeout: 15000,
    });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${captureDir}/touch-landing-${width}.png` });
    expect(errors).toEqual([]);
    report.push({ width, height, samples, errors, touchLanding: true });
    console.log("PASS camera and touch landing", width, height);
    await c.close();
  }
} finally {
  await fs.writeFile(
    `${captureDir}/camera-verification.json`,
    JSON.stringify(report, null, 2),
  );
  await b.close();
}
