import {
  captureDir,
  channel,
  previewURL,
  saveRecording,
} from "./browser-check.mjs";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";

const [tag = "migration", mode = "comparison", seed = "42"] =
  process.argv.slice(2);
const browser = await chromium.launch({ channel });
const results = [];
try {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ]) {
    if (process.env.WIDTH && Number(process.env.WIDTH) !== width) continue;
    const phone = width < 600;
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: phone,
      isMobile: phone,
      deviceScaleFactor: phone ? 2 : 1,
      recordVideo: { dir: captureDir, size: { width, height } },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    // Mirror the app's actual master output for the review movie. The running
    // site uses the normal browser destination and needs no capture hooks.
    const withSound = mode === "flight";
    if (withSound)
      await page.addInitScript(() => {
        const connect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (target, ...args) {
          if (target instanceof AudioDestinationNode && !window.finishAudio) {
            const capture = this.context.createMediaStreamDestination();
            connect.call(this, capture);
            const recorder = new MediaRecorder(capture.stream);
            const chunks = [];
            const start = performance.now() / 1000;
            recorder.ondataavailable = (e) => chunks.push(e.data);
            window.finishAudio = () =>
              new Promise((resolve) => {
                recorder.onstop = async () => {
                  const bytes = new Uint8Array(
                    await new Blob(chunks).arrayBuffer(),
                  );
                  const parts = [];
                  for (let i = 0; i < bytes.length; i += 8192)
                    parts.push(
                      String.fromCharCode(...bytes.subarray(i, i + 8192)),
                    );
                  resolve({ data: btoa(parts.join("")), start });
                };
                recorder.stop();
              });
            recorder.start();
          }
          return connect.call(this, target, ...args);
        };
      });
    const replayURL = new URL(previewURL);
    replayURL.searchParams.set("seed", seed);
    await page.goto(replayURL.href);
    await page.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
    const until = (t) =>
      page.waitForFunction(
        (t) => window.__AFTER_RAIN__.stats().elapsed >= t,
        t,
        { timeout: 90000 },
      );
    await page.evaluate(
      (section) => {
        window.sections = {};
        window.slowFrames = [];
        window.section = section;
        let last;
        function sample(now) {
          if (last && window.section)
            (window.sections[window.section] ??= []).push(now - last);
          if (last && now - last > 33.4 && window.section) {
            const s = window.__AFTER_RAIN__.stats();
            window.slowFrames.push({
              section: window.section,
              ms: +(now - last).toFixed(1),
              flightSeconds: +s.elapsed.toFixed(2),
              onWater: s.onWater,
            });
          }
          last = now;
          requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      },
      mode === "flight" ? "flight" : "opening",
    );
    if (mode === "comparison") {
      await until(10);
      await page.locator("#fly").click();
      await page.keyboard.down("d");
      await page.evaluate(() => (window.section = "turn"));
      await until(13);
      await page.keyboard.up("d");
      await page.evaluate(() => (window.section = ""));
      await page.evaluate(() =>
        window.__AFTER_RAIN__.practiceLanding("memory"),
      );
      await page.waitForFunction(
        () => window.__AFTER_RAIN__.stats().manualApproach === "memory",
      );
      await page.keyboard.down("s");
      await page.waitForFunction(
        () => window.__AFTER_RAIN__.stats().position[1] < 20,
      );
      await page.evaluate(() => (window.section = "touchdown"));
      await page.keyboard.up("s");
      await page.keyboard.down("w");
      await page.waitForTimeout(600);
      await page.keyboard.up("w");
      await page.waitForFunction(() => window.__AFTER_RAIN__.stats().onWater);
      await page.waitForTimeout(2500);
    } else if (mode === "flight") {
      await page.locator("#sound").click();
      await until(6);
      await page.locator("#fly").click();
      const cdp = phone ? await context.newCDPSession(page) : null;
      const stick = phone
        ? await page.locator("#joystick").boundingBox()
        : null;
      const steer = async (key, x, y) => {
        if (!stick) return page.keyboard.down(key);
        const center = {
          x: stick.x + stick.width / 2,
          y: stick.y + stick.height / 2,
          id: 1,
        };
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [center],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { ...center, x: center.x + x * 40, y: center.y + y * 40 },
          ],
        });
      };
      const release = async (key) =>
        stick
          ? cdp.send("Input.dispatchTouchEvent", {
              type: "touchEnd",
              touchPoints: [],
            })
          : page.keyboard.up(key);
      await steer("a", -1, 0);
      await until(phone ? 7.3 : 7.65);
      await release("a");
      await until(12);
      if (phone) {
        const power = page.locator("#throttle"),
          box = await power.boundingBox();
        await power.tap({
          position: { x: box.width * 0.37, y: box.height / 2 },
        });
      } else await page.keyboard.down("-");
      await steer("s", 0, 1);
      await until(13.2);
      if (!phone) await page.keyboard.up("-");
      await page.waitForFunction(
        () => window.__AFTER_RAIN__.stats().position[1] < 16,
      );
      await release("s");
      await steer("w", 0, -1);
      await page.waitForTimeout(600);
      await release("w");
      await page.waitForFunction(() => window.__AFTER_RAIN__.stats().onWater);
      console.log(
        "landing",
        await page.evaluate(() => window.__AFTER_RAIN__.stats().position),
      );
      await until(27);
      // Look back along the aircraft's track, then let the next family pass.
      const y = height * 0.53,
        x = width * 0.19;
      if (phone)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y, id: 2 }],
        });
      else {
        await page.mouse.move(x, y);
        await page.mouse.down();
      }
      for (let i = 1; i <= 36; i++) {
        const at = x + (width * 0.68 * i) / 36;
        if (phone)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: at, y, id: 2 }],
          });
        else await page.mouse.move(at, y);
        await page.waitForTimeout(28);
      }
      await page.waitForTimeout(120);
      if (phone)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      else await page.mouse.up();
      await until(35);
      await page.locator("#reset-view").click();
      await until(phone ? 59 : 62);
      await page.locator("#takeoff").click();
      await page.waitForFunction(() => !window.__AFTER_RAIN__.stats().onWater);
      await until(74);
    } else if (mode === "watch") {
      await until(17);
    }
    const { sections, slowFrames } = await page.evaluate(() => ({
      sections: window.sections,
      slowFrames: window.slowFrames,
    }));
    for (const [section, times] of Object.entries(sections)) {
      const sorted = [...times].sort((a, b) => a - b);
      const percentile = (p) =>
        +sorted[Math.floor((sorted.length - 1) * p)].toFixed(1);
      results.push({
        width,
        height,
        section,
        frames: times.length,
        fps: +((1000 * times.length) / times.reduce((a, b) => a + b)).toFixed(
          1,
        ),
        p95: percentile(0.95),
        p99: percentile(0.99),
        worst: percentile(1),
        over33: times.filter((t) => t > 33.4).length,
        slowFrames: slowFrames.filter((f) => f.section === section),
        errors,
      });
    }
    const track = withSound
      ? await page.evaluate(() => window.finishAudio())
      : null;
    const stem = `${captureDir}/${tag}-${width}`;
    const video = page.video();
    await context.close();
    await saveRecording(video, stem + ".webm");
    if (track) {
      const audioPath = stem + "-audio.webm";
      await fs.writeFile(audioPath, Buffer.from(track.data, "base64"));
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        stem + ".webm",
        "-itsoffset",
        String(track.start),
        "-i",
        audioPath,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        stem + ".mp4",
      ]);
      await fs.unlink(audioPath);
    }
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      width,
      results.filter((s) => s.width === width),
    );
  }
} finally {
  await browser.close();
  await fs.writeFile(
    `${captureDir}/${tag}.json`,
    JSON.stringify(results, null, 2) + "\n",
  );
}
