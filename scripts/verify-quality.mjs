import { captureDir, channel, previewURL } from "./browser-check.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // Test the controller with injected timing evidence, not a claim of GPU throttling.
  await page.addInitScript(() => {
    window.testGpuMs = 30;
    const read = WebGL2RenderingContext.prototype.getQueryParameter;
    WebGL2RenderingContext.prototype.getQueryParameter = function (
      query,
      pname,
    ) {
      if (pname === this.QUERY_RESULT) return window.testGpuMs * 1e6;
      return read.call(this, query, pname);
    };
  });
  await page.goto(previewURL);
  await page.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
  const first = await page.evaluate(() => window.__AFTER_RAIN__.stats());
  expect(first.rendering.gpuTimerAvailable).toBe(true);
  await page.waitForFunction(
    () => window.__AFTER_RAIN__.stats().pixelRatio < 1,
    null,
    { timeout: 15000 },
  );
  const degraded = await page.evaluate(() => window.__AFTER_RAIN__.stats());
  await page.evaluate(() => {
    window.testGpuMs = 6;
  });
  await page.waitForFunction(
    (r) => window.__AFTER_RAIN__.stats().pixelRatio > r,
    degraded.pixelRatio,
    { timeout: 40000 },
  );
  const recovered = await page.evaluate(() => window.__AFTER_RAIN__.stats());
  expect(recovered.pixelRatio).toBeLessThanOrEqual(first.pixelRatio);
  expect(errors).toEqual([]);
  await fs.writeFile(
    `${captureDir}/graphics-quality-controller.json`,
    JSON.stringify(
      {
        injectedGpuTimings: true,
        first: first.pixelRatio,
        degraded: degraded.pixelRatio,
        recovered: recovered.pixelRatio,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS adaptive quality",
    first.pixelRatio,
    degraded.pixelRatio,
    recovered.pixelRatio,
  );
} finally {
  await browser.close();
}
