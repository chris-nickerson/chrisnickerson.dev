import {
  captureDir,
  channel,
  previewURL,
  saveRecording,
} from "./browser-check.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const b = await chromium.launch({ headless: true, channel }),
  report = [];
try {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    const c = await b.newContext({
        viewport: { width, height },
        hasTouch: width < 600,
        isMobile: width < 600,
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
    for (const id of ["memory", "workshop", "dock"]) {
      await p.getByRole("button", { name: "Meet Chris", exact: true }).click();
      const start = Date.now();
      await p.locator(`[data-visit="${id}"]`).click();
      await p.waitForFunction(
        (id) => window.__AFTER_RAIN__.stats().arrival?.place === id,
        id,
      );
      await p.waitForTimeout(650);
      await p.screenshot({
        path: `${captureDir}/fast-approach-${width}-${id}.png`,
      });
      const approach = await p.evaluate(() => window.__AFTER_RAIN__.stats());
      for (const v of [
        approach.aircraftBounds.left,
        approach.aircraftBounds.right,
        approach.aircraftBounds.top,
        approach.aircraftBounds.bottom,
      ])
        expect(Math.abs(v)).toBeLessThan(0.97);
      await expect(p.locator("#place-panel")).toBeVisible({ timeout: 8000 });
      await expect(
        p.getByRole("button", { name: "Back to the sky", exact: true }),
      ).toHaveCount(1);
      await expect(p.locator("#autopilot")).toBeHidden();
      await expect(p.locator("#leave-place")).toBeVisible();
      const readyMs = Date.now() - start;
      const landed = await p.evaluate(() => window.__AFTER_RAIN__.stats());
      expect(landed.onWater).toBe(true);
      expect(readyMs).toBeLessThan(7500);
      expect(landed.position[1]).toBeLessThan(8);
      await p.waitForTimeout(2000);
      await p.screenshot({
        path: `${captureDir}/fast-water-${width}-${id}.png`,
      });
      await p.locator("#place-read").click();
      await expect(p.locator("#story")).toBeVisible();
      if (width === 390 && id === "workshop") {
        const events = await p.evaluateHandle(() => {
          const seen = [];
          matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
            "change",
            () => seen.push("reduce"),
            { once: true },
          );
          document
            .querySelector("#story")
            .addEventListener("close", () => seen.push("close"), {
              once: true,
            });
          return seen;
        });
        await p.emulateMedia({ reducedMotion: "reduce" });
        await expect.poll(() => events.jsonValue()).toEqual(["reduce"]);
        await p.keyboard.press("Escape");
        await expect
          .poll(() => events.jsonValue())
          .toEqual(["reduce", "close"]);
        await expect(p.locator("#place-read")).toBeFocused();
        await expect(p.locator("#pause")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await events.dispose();
      } else {
        await p.keyboard.press("Escape");
      }
      report.push({
        width,
        height,
        id,
        readyMs,
        approachBounds: approach.aircraftBounds,
        landed,
        errors: [...errors],
      });
      console.log("PASS", width, id, readyMs + "ms");
    }
    expect(errors).toEqual([]);
    const video = p.video();
    await c.close();
    await saveRecording(video, `${captureDir}/fast-arrivals-${width}.webm`);
  }
} finally {
  await fs.writeFile(
    `${captureDir}/arrival-verification.json`,
    JSON.stringify(report, null, 2),
  );
  await b.close();
}
