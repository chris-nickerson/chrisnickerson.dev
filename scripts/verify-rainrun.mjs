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
async function ready(p) {
  await p.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
}
async function state(p) {
  return p.evaluate(() => window.__AFTER_RAIN__.stats());
}
async function start(p) {
  await p
    .getByRole("button", { name: "How this world works", exact: true })
    .click();
  await p.getByRole("button", { name: /Try a rain run/ }).click();
  await p
    .getByRole("button", { name: "Start the rain run", exact: true })
    .click();
  await p.waitForFunction(
    () => window.__AFTER_RAIN__.stats().rainRun?.index === 0,
  );
}
try {
  for (const [width, height, mobile] of [
    [1440, 900, false],
    [390, 844, true],
  ]) {
    const c = await b.newContext({
      viewport: { width, height },
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile,
      hasTouch: mobile,
      recordVideo: { dir: captureDir, size: { width, height } },
    });
    const p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.goto(previewURL);
    await ready(p);
    await start(p);
    const completed = [];
    for (let i = 0; i < (mobile ? 1 : 3); i++) {
      await p.waitForFunction(
        () => window.__AFTER_RAIN__.stats().rainRun?.aimed,
        null,
        { timeout: 30000 },
      );
      const aim = await p.locator("#water-aim").boundingBox();
      expect(aim.y).toBeGreaterThan(height * 0.25);
      expect(aim.y + aim.height).toBeLessThan(height - 95);
      await p.screenshot({ path: `${captureDir}/rain-aim-${width}-${i}.png` });
      if (mobile) {
        const bb = await p.locator("#touch-water").boundingBox();
        const client = await c.newCDPSession(p);
        await client.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }],
        });
        await p.waitForFunction(
          () => window.__AFTER_RAIN__.stats().rainRun.complete,
          null,
          { timeout: 18000 },
        );
        await client.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      } else {
        await p.keyboard.down("Space");
        await p.waitForFunction(
          () => window.__AFTER_RAIN__.stats().rainRun.complete,
          null,
          { timeout: 18000 },
        );
        await p.keyboard.up("Space");
      }
      await p.waitForTimeout(600);
      completed.push((await state(p)).rainRun);
      await p.screenshot({
        path: `${captureDir}/rain-complete-${width}-${i}.png`,
      });
      if (!mobile && i < 2) {
        await p
          .getByRole("button", { name: "Next grove", exact: true })
          .click();
        await p.waitForFunction(
          (i) => window.__AFTER_RAIN__.stats().rainRun?.index === i,
          i + 1,
        );
      }
    }
    if (!mobile) {
      await p
        .getByRole("button", { name: "Land at the field station", exact: true })
        .click();
      await p.waitForFunction(
        () => window.__AFTER_RAIN__.stats().arrival?.stage === "water",
        null,
        { timeout: 45000 },
      );
      await p.waitForTimeout(2500);
      await p.mouse.move(1000, 400);
      await p.mouse.down();
      await p.mouse.move(1150, 360, { steps: 12 });
      await p.mouse.up();
      await p.waitForTimeout(1800);
      await p.screenshot({ path: `${captureDir}/rain-station-orbit.png` });
    } else {
      await p.getByRole("button", { name: "End run", exact: true }).click();
      expect((await state(p)).rainRun).toBe(null);
    }
    expect(errors).toEqual([]);
    const video = p.video();
    report.push({ width, height, completed, errors, final: await state(p) });
    await c.close();
    await saveRecording(video, `${captureDir}/rain-run-${width}.webm`);
    console.log("PASS rain run", width);
  }
  const c = await b.newContext({ viewport: { width: 320, height: 568 } }),
    p = await c.newPage();
  await p.goto(previewURL);
  await ready(p);
  await start(p);
  await p.waitForFunction(
    () => window.__AFTER_RAIN__.stats().rainRun.missed,
    null,
    { timeout: 40000 },
  );
  expect((await state(p)).rainRun.progress).toBe(0);
  await p
    .getByRole("button", { name: "Try this pass again", exact: true })
    .click();
  await p.waitForFunction(() => !window.__AFTER_RAIN__.stats().rainRun.missed);
  expect((await state(p)).rainRun.progress).toBe(0);
  await p.keyboard.press("Escape");
  expect((await state(p)).rainRun).toBe(null);
  await c.close();
  report.push({
    width: 320,
    height: 568,
    missAndRetry: "passed",
    escape: "passed",
  });
} finally {
  await b.close();
  await fs.writeFile(
    `${captureDir}/rainrun-verification.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
}
