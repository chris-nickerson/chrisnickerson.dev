import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";
import { captureDir, channel } from "./browser-check.mjs";

const views = [
  [42, 1440, "home"],
  [42, 390, "home"],
  [43, 1440, "flight"],
  [44, 390, "home"],
  [42, 390, "dock"],
];
const [reference, historical] = await Promise.all(
  ["inlet-views.png", "inlet-views-7004e89.png"].map((file) =>
    readFile(new URL("../evidence/" + file, import.meta.url), "base64"),
  ),
);

async function verifySteering(page, portrait) {
  const touch = portrait && (await page.context().newCDPSession(page));
  const stick = portrait && (await page.locator("#joystick").boundingBox());
  if (!portrait) await page.locator("#scene canvas").click();
  for (const direction of [1, -1]) {
    const key = direction === 1 ? "d" : "a";
    const start = await page.evaluate(
      () => window.__AFTER_RAIN__.stats().heading,
    );
    if (touch) {
      assert.ok(stick, "The flight joystick must be visible.");
      const x = stick.x + stick.width / 2,
        y = stick.y + stick.height / 2;
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + direction * 36, y }],
      });
    } else await page.keyboard.down(key);
    await page.waitForFunction(
      ({ start, direction }) => {
        const s = window.__AFTER_RAIN__.stats();
        return (
          !s.paused &&
          !s.assisted &&
          direction * Math.sin(s.heading - start) > 0.03
        );
      },
      { start, direction },
      { timeout: 8000 },
    );
    if (touch)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    else await page.keyboard.up(key);
  }
}

let browser, server, outDir;
try {
  if (!process.env.BASE_URL) {
    outDir = await mkdtemp(join(tmpdir(), "after-rain-views-"));
    await build({ build: { outDir, emptyOutDir: true }, logLevel: "warn" });
    server = await preview({
      build: { outDir },
      preview: { host: "127.0.0.1", port: 0 },
    });
  }
  const url = new URL(process.env.BASE_URL || server.resolvedUrls.local[0]);
  browser = await chromium.launch({ channel });
  let left = 0;
  const failures = [];
  for (const [seed, width, view] of views) {
    const height = width === 390 ? 844 : 900;
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
      isMobile: width === 390,
      hasTouch: width === 390,
      deviceScaleFactor: width === 390 ? 1.5 : 1,
    });
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    if (view !== "home") {
      await page.clock.install({ time: new Date("2025-01-01T00:00:00Z") });
    }
    url.searchParams.set("seed", String(seed));
    await page.goto(url.href, { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      const state = window.__AFTER_RAIN__?.stats();
      return state?.ready && state.skyReady !== false;
    });
    assert.equal(
      await page.evaluate(() => window.__AFTER_RAIN__.stats().migration.seed),
      seed,
    );
    const launch = page.getByRole("button", { name: "Go flying", exact: true });
    if (view !== "home") {
      await page.clock.pauseAt(new Date("2025-01-01T01:00:00Z"));
      if (view === "dock")
        await page.evaluate(() =>
          window.__AFTER_RAIN__.practiceLanding("dock"),
        );
      else await launch.evaluate((button) => button.click());
      await page.clock.runFor(368);
      await page.evaluate(() => document.getElementById("pause").click());
      const state = await page.evaluate(() => window.__AFTER_RAIN__.stats());
      assert.ok(state.paused && !state.assisted);
      assert.ok(Math.abs(state.elapsed - 0.36) < 0.027);
      if (view === "dock") assert.equal(state.manualApproach, "dock");
      await page.clock.resume();
    }
    const name = `inlet-${seed}-${width}-${view}`;
    const png = await page.locator("#scene canvas").screenshot({
      path: join(captureDir, name + ".png"),
      style:
        "#experience > :not(#scene),body > :not(#experience) {visibility:hidden!important}",
    });
    const tileWidth = Math.round((144 * width) / height);
    const [approvedDelta, oldDelta] = await page.evaluate(
      async ({ reference, historical, shot, left, tileWidth }) => {
        async function decode(data) {
          const image = new Image();
          image.src = "data:image/png;base64," + data;
          await image.decode();
          return image;
        }
        const [gold, old, current] = await Promise.all([
          decode(reference),
          decode(historical),
          decode(shot),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 24;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(current, 0, 0, 32, 24);
        const actual = ctx.getImageData(0, 0, 32, 24).data;
        function difference(image, offset, width) {
          ctx.drawImage(image, offset, 0, width, image.height, 0, 0, 32, 24);
          const pixels = ctx.getImageData(0, 0, 32, 24).data;
          let delta = 0;
          for (let i = 0; i < pixels.length; i += 4)
            for (let c = 0; c < 3; c++)
              delta += Math.abs(actual[i + c] - pixels[i + c]);
          return delta / (32 * 24 * 3);
        }
        return [
          difference(gold, left, tileWidth),
          difference(old, left, tileWidth),
        ];
      },
      {
        reference,
        historical,
        shot: png.toString("base64"),
        left,
        tileWidth,
      },
    );
    if (approvedDelta > 12) failures.push(name + " differs from approved view");
    if (oldDelta <= 9) failures.push(name + " resembles 7004e89");
    if (view === "home") await launch.click();
    else await page.getByRole("button", { name: "Resume simulation" }).click();
    await verifySteering(page, width === 390);
    assert.deepEqual(errors, []);
    console.log(
      name,
      "RGB delta from approved",
      approvedDelta.toFixed(1),
      "from 7004e89",
      oldDelta.toFixed(1),
      "steered both ways",
    );
    left += tileWidth;
    await page.close();
  }
  assert.deepEqual(failures, [], "Inspect the captured views.");
} finally {
  await browser?.close();
  await server?.close();
  if (outDir) await rm(outDir, { recursive: true, force: true });
}
