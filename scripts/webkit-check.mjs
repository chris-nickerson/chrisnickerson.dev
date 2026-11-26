import { verifyOpening } from "./verify-opening.mjs";
import { captureDir, previewURL } from "./browser-check.mjs";
import { webkit, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { isConfigured, profile } from "../src/profile.ts";
const displayName = isConfigured(profile.fullName) ? profile.fullName : "Chris";
const browser = await webkit.launch({ headless: true });
await verifyOpening(browser);
const results = [];
async function measure(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const frames = [];
        let start = 0,
          last = 0;
        function tick(t) {
          if (last) frames.push(t - last);
          else start = t;
          last = t;
          if (t - start < 2500) requestAnimationFrame(tick);
          else {
            const sorted = [...frames].sort((a, b) => a - b);
            resolve({
              averageFPS:
                1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
              p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
            });
          }
        }
        requestAnimationFrame(tick);
      }),
  );
}
for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(previewURL);
  await page.waitForFunction(
    () =>
      window.__AFTER_RAIN__?.stats().ready ||
      document.querySelector(".fallback-mode"),
  );
  const initial = await page.evaluate(
    () => window.__AFTER_RAIN__?.stats() || { fallback: true },
  );
  await page.waitForTimeout(4000);
  await page.screenshot({
    path: `${captureDir}/webkit-${width}x${height}.png`,
  });
  const performance = initial.ready ? await measure(page) : null;
  await page.getByRole("button", { name: "About Chris", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Hi, I’m ${displayName}.` }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  if (initial.ready) {
    await page.getByRole("button", { name: "Meet Chris", exact: true }).click();
    await page.locator('[data-visit="dock"]').click();
    await page.waitForFunction((id) => {
      const arrival = window.__AFTER_RAIN__.stats().arrival;
      return arrival?.place === id && arrival.stage === "water";
    }, "dock");
    await page.screenshot({
      path: `${captureDir}/webkit-dock-${width}x${height}.png`,
    });
  }
  if (initial.ready) {
    await page.evaluate(() => window.__AFTER_RAIN__.practiceLanding("dock"));
    await page.waitForFunction(
      () => window.__AFTER_RAIN__.stats().manualApproach === "dock",
    );
    await page.keyboard.down("s");
    await page.waitForFunction(
      () => window.__AFTER_RAIN__.stats().position[1] < 20,
    );
    await page.keyboard.up("s");
    await page.keyboard.down("w");
    await page.waitForTimeout(600);
    await page.keyboard.up("w");
    await page.waitForFunction(() => window.__AFTER_RAIN__.stats().onWater);
    await page.waitForTimeout(8000);
    await page.mouse.move(width * 0.4, height * 0.53);
    await page.mouse.down();
    await page.mouse.move(width * 0.8, height * 0.58, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${captureDir}/webkit-manual-${width}.png` });
    const manual = await page.evaluate(() => window.__AFTER_RAIN__.stats());
    expect(manual.onWater).toBe(true);
    expect(manual.arrival).toBe(null);
    expect(Math.abs(manual.look.yaw)).toBeGreaterThan(0.3);
    expect(Math.abs(manual.aircraftBounds.right)).toBeLessThan(0.95);
    expect(Math.abs(manual.aircraftBounds.left)).toBeLessThan(0.95);
  }
  const stats = await page.evaluate(
    () => window.__AFTER_RAIN__?.stats() || null,
  );
  results.push({
    width,
    height,
    initial,
    stats,
    performance,
    arrivalPerformance: initial.ready ? await measure(page) : null,
    errors,
  });
  console.log(JSON.stringify(results.at(-1)));
  await context.close();
}
await browser.close();
await fs.writeFile(
  `${captureDir}/webkit-verification.json`,
  JSON.stringify(results, null, 2) + "\n",
);
if (results.some((r) => r.errors.length)) process.exitCode = 1;
