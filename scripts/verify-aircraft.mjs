import { captureDir, channel, devURL } from "./browser-check.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel }),
  tag = process.env.AIRCRAFT_TAG || "after",
  report = [];
try {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    const c = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
      }),
      p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.route("**/aircraft-review", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module" src="/scripts/aircraft-studio.ts"></script></body></html>',
      }),
    );
    await p.goto(new URL("aircraft-review", devURL).href);
    await p.waitForFunction(() => window.studio);
    for (const view of width > 600
      ? ["front", "rear", "profile", "cockpit", "floats"]
      : ["front"]) {
      await p.evaluate((v) => window.studio.view(v), view);
      await p.screenshot({
        path: `${captureDir}/aircraft-${tag}-${width}-${view}.png`,
      });
      report.push({
        width,
        height,
        view,
        ...(await p.evaluate(() => window.studio.stats())),
        errors: [...errors],
      });
    }
    expect(errors).toEqual([]);
    await c.close();
  }
} finally {
  await fs.writeFile(
    `${captureDir}/aircraft-${tag}.json`,
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
console.log(report[0]);
