import {
  captureDir,
  channel,
  previewURL,
  saveRecording,
} from "./browser-check.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel, headless: true });
const report = [];
const tag = process.env.GRAPHICS_TAG || "after";
try {
  const viewports = process.env.GRAPHICS_RETINA
    ? [[1440, 900]]
    : [
        [1440, 900],
        [390, 844],
      ];
  for (const [width, height] of viewports) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: width < 600 || process.env.GRAPHICS_RETINA ? 2 : 1,
      isMobile: width < 600,
      hasTouch: width < 600,
      ...(process.env.RECORD
        ? { recordVideo: { dir: captureDir, size: { width, height } } }
        : {}),
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(previewURL);
    await page.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
    await page.waitForTimeout(2000);
    for (const place of ["sky", "dock"]) {
      if (place === "dock") {
        await page
          .getByRole("button", { name: "Meet Chris", exact: true })
          .click();
        await page.locator('[data-visit="dock"]').click();
        await page.waitForFunction((id) => {
          const arrival = window.__AFTER_RAIN__.stats().arrival;
          return arrival?.place === id && arrival.stage === "water";
        }, "dock");
        await page.waitForFunction(
          () =>
            Number(
              getComputedStyle(document.getElementById("travel-veil")).opacity,
            ) < 0.01,
        );
        await page.waitForTimeout(3000);
      }
      await page.screenshot({
        path: `${captureDir}/graphics-${tag}-${width}-${place}.png`,
      });
      const result = await page.evaluate(
        () =>
          new Promise((resolve) => {
            let first = 0,
              last = 0;
            const times = [],
              triangles = [],
              draws = [];
            function tick(t) {
              if (last) {
                times.push(t - last);
                const s = window.__AFTER_RAIN__.stats();
                triangles.push(s.triangles);
                draws.push(s.drawCalls);
              } else first = t;
              last = t;
              if (t - first < 5000) requestAnimationFrame(tick);
              else {
                const sorted = times.toSorted((a, b) => a - b);
                resolve({
                  fps: 1000 / (times.reduce((a, b) => a + b) / times.length),
                  p95: sorted[Math.floor(times.length * 0.95)],
                  triangles:
                    triangles.reduce((a, b) => a + b) / triangles.length,
                  draws: draws.reduce((a, b) => a + b) / draws.length,
                  stats: window.__AFTER_RAIN__.stats(),
                });
              }
            }
            requestAnimationFrame(tick);
          }),
      );
      report.push({ width, height, place, ...result, errors: [...errors] });
      console.log(
        width,
        place,
        JSON.stringify({
          fps: result.fps,
          p95: result.p95,
          triangles: result.triangles,
          draws: result.draws,
          rendering: result.stats.rendering,
          errors,
        }),
      );
      expect(errors).toEqual([]);
    }
    const video = page.video();
    await context.close();
    if (video)
      await saveRecording(video, `${captureDir}/graphics-${tag}-${width}.webm`);
  }
} finally {
  await fs.writeFile(
    `${captureDir}/graphics-${tag}.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
