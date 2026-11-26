import { loadingScreen, verifyOpening } from "./verify-opening.mjs";
import {
  captureDir,
  channel,
  previewURL,
  saveRecording,
} from "./browser-check.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import { isConfigured, profile } from "../src/profile.ts";
const displayName = isConfigured(profile.fullName) ? profile.fullName : "Chris";
const aboutHeading = `Hi, I’m ${displayName}.`;
const browser = await chromium.launch({ headless: true, channel });
const report = {
  date: new Date().toISOString(),
  platform: `${os.platform()} ${os.arch()}`,
  browser: await browser.version(),
  baseURL: previewURL,
  cases: [],
  failures: [],
  limitations: [
    "Phone viewports and touch input are emulated in the desktop browser.",
    "Physical audio output, native Safari, and physical mobile devices have not been verified. The WebKit engine has a separate check.",
    "Rendering FPS and recorded-video FPS are different; the recording is an evidence artifact.",
  ],
};
async function context(options = {}) {
  return browser.newContext(options);
}
async function ready(page) {
  await page.waitForFunction(
    () =>
      window.__AFTER_RAIN__?.stats().ready ||
      document.querySelector(".fallback-mode"),
    null,
    { timeout: 30000 },
  );
  expect(
    await page.evaluate(() => !!window.__AFTER_RAIN__?.stats().ready),
    "3D startup failed",
  ).toBe(true);
}
async function stats(page) {
  return page.evaluate(() => window.__AFTER_RAIN__.stats());
}
function watch(page) {
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => requests.push(r.url()));
  return { errors, requests };
}
async function shot(page, name) {
  await page.screenshot({
    path: `${captureDir}/${name}.png`,
    animations: "disabled",
  });
}
async function measure(page, duration = 4000) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        let first = 0,
          last = 0;
        const frames = [];
        function tick(t) {
          if (last) frames.push(t - last);
          else first = t;
          last = t;
          if (t - first < ms) requestAnimationFrame(tick);
          else {
            const sorted = [...frames].sort((a, b) => a - b);
            resolve({
              frames: frames.length,
              averageFPS:
                1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
              p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
              worstFrameMs: sorted.at(-1),
            });
          }
        }
        requestAnimationFrame(tick);
      }),
    duration,
  );
}
async function run(name, fn) {
  try {
    const result = await fn();
    report.cases.push({ name, status: "passed", ...result });
    console.log("PASS", name, JSON.stringify(result));
  } catch (e) {
    report.failures.push({ name, error: String(e) });
    console.error("FAIL", name, String(e));
    for (const context of browser.contexts()) await context.close();
  }
}

await run("eclipse loading screen and profile during slow startup", () =>
  verifyOpening(browser),
);

await run(
  "desktop 1440×900: profile, keyboard, simulation, persistence, travel",
  async () => {
    const ctx = await context({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      recordVideo: { dir: captureDir, size: { width: 1440, height: 900 } },
    });
    const page = await ctx.newPage(),
      logs = watch(page);
    const start = Date.now();
    await page.goto(previewURL);
    await ready(page);
    const readyMs = Date.now() - start;
    await expect(loadingScreen(page)).toHaveCount(0);
    await page.waitForTimeout(2500);
    await shot(page, "final-desktop");
    const performance = await measure(page);
    await page
      .getByRole("button", { name: "About Chris", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: aboutHeading }),
    ).toBeVisible();
    const aboutMe = isConfigured(profile.aboutMe)
      ? profile.aboutMe
      : "I work across most of the stack.";
    await expect(page.locator("#about-personal")).toHaveText(aboutMe, {
      useInnerText: true,
    });
    await shot(page, "final-about");
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "My links", exact: true })
      .first()
      .click();
    await expect(
      page.locator("#contact-links a, #contact-note:not([hidden])").first(),
    ).toBeVisible();
    await shot(page, "final-contact");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Go flying", exact: true }).click();
    const before = await stats(page);
    await page.keyboard.down("d");
    await page.keyboard.down("w");
    await page.waitForTimeout(1800);
    await page.keyboard.up("d");
    await page.keyboard.up("w");
    const after = await stats(page);
    expect(after.assisted).toBe(false);
    expect(after.position[0]).not.toBe(before.position[0]);
    await page.keyboard.down("Space");
    await page.waitForTimeout(1200);
    await page.keyboard.up("Space");
    await shot(page, "final-piloting");
    await page.keyboard.press("Escape");
    expect((await stats(page)).assisted).toBe(true);
    await page.keyboard.press("p");
    const paused = await stats(page);
    await page.waitForTimeout(800);
    expect((await stats(page)).elapsed).toBe(paused.elapsed);
    await page.keyboard.press("p");
    await page.keyboard.press("m");
    await expect(
      page.getByRole("heading", { name: "The watershed" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Watch it grow/ }).click();
    const groundBefore = await stats(page);
    await page.waitForTimeout(13000);
    const growth = await stats(page);
    expect(growth.groundTime - groundBefore.groundTime).toBeGreaterThan(120);
    // The opening now crosses open water. Spray there feeds sea discharge.
    expect(growth.delivered).toBeGreaterThan(0);
    await shot(page, "final-watershed");
    const delivered = growth.delivered;
    await page.reload();
    await ready(page);
    expect((await stats(page)).delivered).toBeGreaterThanOrEqual(delivered);
    const persistence = "survived reload";
    await page.getByRole("button", { name: "Meet Chris", exact: true }).click();
    await shot(page, "final-places");
    await page.locator('[data-story="memory"]').first().click();
    await expect(
      page.getByRole("heading", { name: "A little about me." }),
    ).toBeVisible();
    await shot(page, "final-story");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Meet Chris", exact: true }).click();
    await page.locator('[data-visit="memory"]').first().click();
    await page.waitForTimeout(1800);
    await shot(page, "final-approach");
    await page.waitForFunction(
      () => window.__AFTER_RAIN__.stats().arrival?.stage === "water",
      null,
      { timeout: 45000 },
    );
    await page.waitForTimeout(3000);
    await shot(page, "final-field-station");
    const arrivalPerformance = await measure(page, 2500);
    for (const id of ["workshop", "dock"]) {
      await page
        .getByRole("button", { name: "Meet Chris", exact: true })
        .click();
      await page.locator(`[data-visit="${id}"]`).click();
      await page.waitForFunction((id) => {
        const arrival = window.__AFTER_RAIN__.stats().arrival;
        return arrival?.place === id && arrival.stage === "water";
      }, id);
      await shot(page, `final-${id}`);
      expect((await stats(page)).arrival.place).toBe(id);
    }
    await page
      .locator("#place-panel")
      .getByRole("button", { name: "Back to the sky", exact: true })
      .click();
    await page.waitForTimeout(700);
    expect((await stats(page)).arrival).toBe(null);
    await expect(
      page.getByRole("button", { name: "Go flying", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "How this world works", exact: true })
      .click();
    await page.getByLabel("Rendering", { exact: true }).selectOption("low");
    expect((await stats(page)).pixelRatio).toBe(0.8);
    await shot(page, "final-field-notes");
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Enable sound", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Disable sound", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "Disable sound", exact: true })
      .click();
    expect(logs.errors).toEqual([]);
    const externalRequests = logs.requests.filter(
      (url) =>
        !url.startsWith(new URL(previewURL).origin) && !url.startsWith("data:"),
    );
    expect(externalRequests).toEqual([]);
    const final = await stats(page);
    const video = page.video();
    await ctx.close();
    await saveRecording(video, `${captureDir}/final-desktop.webm`);
    return {
      readyMs,
      performance,
      arrivalPerformance,
      persistence,
      consoleErrors: logs.errors,
      externalRequests,
      final,
    };
  },
);
await run(
  "phone 390×844 DPR 2: touch flight and portrait composition",
  async () => {
    const ctx = await context({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      recordVideo: { dir: captureDir, size: { width: 390, height: 844 } },
    });
    const page = await ctx.newPage(),
      logs = watch(page);
    await page.goto(previewURL);
    await ready(page);
    await page.waitForTimeout(2500);
    await shot(page, "final-phone");
    const performance = await measure(page, 3500);
    await page.getByRole("button", { name: "Go flying", exact: true }).click();
    const stick = await page.locator("#joystick").boundingBox();
    const client = await ctx.newCDPSession(page);
    const x = stick.x + stick.width / 2,
      y = stick.y + stick.height / 2;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 30, y: y - 22 }],
    });
    const knob = page.locator("#joystick i");
    const held = await knob.evaluate((el) => el.style.transform);
    expect(held).toContain("translate");
    await page
      .locator("#joystick")
      .dispatchEvent("pointercancel", { pointerId: 9876 });
    expect(await knob.evaluate((el) => el.style.transform)).toBe(held);
    await page.waitForTimeout(1500);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect((await stats(page)).assisted).toBe(false);
    await shot(page, "final-phone-piloting");
    await page.getByRole("button", { name: "Let it fly", exact: true }).click();
    expect((await stats(page)).assisted).toBe(true);
    await page.getByRole("button", { name: "Meet Chris", exact: true }).click();
    await page.locator('[data-visit="dock"]').click();
    await page.waitForFunction((id) => {
      const arrival = window.__AFTER_RAIN__.stats().arrival;
      return arrival?.place === id && arrival.stage === "water";
    }, "dock");
    await shot(page, "final-phone-dock");
    await page.getByRole("button", { name: "Read more", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Away from the keyboard." }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !window.__AFTER_RAIN__.stats().paused);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(logs.errors).toEqual([]);
    const final = await stats(page),
      video = page.video();
    await ctx.close();
    await saveRecording(video, `${captureDir}/final-phone.webm`);
    return { performance, consoleErrors: logs.errors, final };
  },
);
for (const [width, height] of [
  [1920, 1080],
  [320, 568],
  [844, 390],
])
  await run(`layout ${width}×${height}`, async () => {
    const ctx = await context({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage(),
      logs = watch(page);
    await page.goto(previewURL);
    await ready(page);
    await page.waitForTimeout(1700);
    await shot(page, `final-${width}x${height}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const toolbar = await page.locator(".bottom-bar").boundingBox();
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(height);
    expect(logs.errors).toEqual([]);
    await ctx.close();
    return { consoleErrors: logs.errors };
  });
await run("reduced motion: still first frame and keyboard access", async () => {
  const ctx = await context({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(previewURL);
  await ready(page);
  const first = await stats(page);
  await page.waitForTimeout(1000);
  const second = await stats(page);
  expect(first.paused).toBe(true);
  expect(second.elapsed).toBe(first.elapsed);
  await shot(page, "final-reduced-motion");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: aboutHeading })).toBeVisible();
  await page.keyboard.press("Escape");
  expect((await stats(page)).paused).toBe(true);
  await ctx.close();
  return { elapsed: first.elapsed, paused: second.paused };
});
await run("storage denied: world remains usable", async () => {
  const ctx = await context();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    Storage.prototype.getItem = function () {
      throw new DOMException("Blocked", "SecurityError");
    };
    Storage.prototype.setItem = function () {
      throw new DOMException("Blocked", "SecurityError");
    };
  });
  await page.goto(previewURL);
  await ready(page);
  expect((await stats(page)).storageAvailable).toBe(false);
  await page.getByRole("button", { name: "Watershed", exact: true }).click();
  await expect(
    page.getByText("This browser can’t save soil moisture between visits."),
  ).toBeVisible();
  await ctx.close();
  return { graceful: true };
});
await run("lost GPU context: illustration and biography survive", async () => {
  const ctx = await context();
  const page = await ctx.newPage();
  await page.goto(previewURL);
  await ready(page);
  await page.getByRole("button", { name: "Go flying", exact: true }).click();
  await page.getByRole("button", { name: "Enable sound" }).click();
  await expect(page.locator("#sound")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#water").click();
  await page.locator("#pause").click();
  await expect(page.locator("#water")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pause")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#scene").focus();
  await expect(page.locator("#scene")).toBeFocused();
  await page.evaluate(() =>
    document
      .querySelector("#scene canvas")
      .getContext("webgl2")
      .getExtension("WEBGL_lose_context")
      .loseContext(),
  );
  await expect(page.locator("#fallback-note")).toBeVisible();
  await expect(page.locator("#fallback")).toBeVisible();
  await expect(page.locator(".loading-screen")).toBeHidden();
  await expect(page.locator(".flight-chart")).toBeVisible();
  for (const id of ["pause", "water"]) {
    await expect(page.locator(`#${id}`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  }
  for (const id of ["pause", "water", "sound", "quality"])
    await expect(page.locator(`#${id}`)).toBeDisabled();
  await expect(page.locator("#sound")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#sound")).toHaveAccessibleName("Enable sound");
  await expect(page.locator("#pilot-power")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Get to know me" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-visit="memory"]')).toBeDisabled();
  await page.locator('[data-story="memory"]').first().click();
  await expect(page.locator("#story")).toBeVisible();
  await expect(page.locator("#story-visit")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#world-status")).toHaveText("Static view");
  const s = await stats(page);
  expect(s.ready).toBe(false);
  await expect(page.locator("#scene canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "About Chris", exact: true }).click();
  await expect(page.getByRole("heading", { name: aboutHeading })).toBeVisible();
  const otherTab = await ctx.newPage();
  await otherTab.goto(new URL("?fallback", previewURL).href);
  await otherTab.evaluate(() => {
    const key = "after-rain.watershed.v1";
    const saved = JSON.parse(localStorage.getItem(key));
    saved.delivered += 10;
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.goto("about:blank");
  expect(
    await otherTab.evaluate(
      () =>
        JSON.parse(localStorage.getItem("after-rain.watershed.v1")).delivered,
    ),
  ).toBe(s.delivered + 10);
  await ctx.close();
  return { graceful: true };
});
await run(
  "an open profile sheet keeps keyboard focus after graphics loss",
  async () => {
    const ctx = await context();
    const page = await ctx.newPage();
    await page.goto(previewURL);
    await ready(page);
    await page.getByRole("button", { name: "Meet Chris", exact: true }).click();
    await page.locator('[data-visit="dock"]').focus();
    await page.evaluate(() =>
      document
        .querySelector("#scene canvas")
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context")
        .loseContext(),
    );
    await expect(page.locator("#places .close")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#places")).toBeHidden();
    await ctx.close();
    return { keptFocus: true };
  },
);
for (const action of ["fly-in", "departure", "rain run"])
  await run(
    `context loss during ${action} cancels pending travel`,
    async () => {
      const ctx = await context();
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(previewURL);
      await ready(page);
      let trigger;
      if (action === "rain run") {
        await page.locator("#help").click();
        await page.locator("#rain-invitation").click();
        trigger = page.locator("#start-run");
      } else {
        await page
          .getByRole("button", { name: "Meet Chris", exact: true })
          .click();
        trigger = page.locator('[data-visit="dock"]');
        if (action === "departure") {
          await trigger.click();
          trigger = page.locator("#leave-place");
        }
      }
      await expect(trigger).toBeVisible({ timeout: 20000 });
      const now = new Date();
      await page.clock.install({ time: now });
      await page.clock.pauseAt(new Date(now.getTime() + 1000));
      const before = await stats(page);
      await trigger.evaluate((button) => {
        button.click();
        document
          .querySelector("#scene canvas")
          .getContext("webgl2")
          .getExtension("WEBGL_lose_context")
          .loseContext();
      });
      await expect(page.locator("#fallback-note")).toBeVisible();
      const stopped = await stats(page);
      expect(stopped.paused).toBe(false);
      await page.clock.runFor(500);
      await expect(page.locator("#travel-veil")).not.toHaveClass(/cover/);
      const after = await stats(page);
      expect(after.elapsed).toBe(stopped.elapsed);
      if (action === "rain run") expect(after.rainRun).toBeNull();
      else expect(after.arrival?.place).toBe(before.arrival?.place);
      expect(errors).toEqual([]);
      await ctx.close();
      return { canceled: action };
    },
  );
await browser.close();
const noGL = await chromium.launch({
  headless: true,
  channel,
  args: ["--disable-webgl"],
});
await run("WebGL unavailable: flight chart and direct profile", async () => {
  const page = await noGL.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(previewURL);
  await expect(page.locator("#fallback-note")).toBeVisible();
  await expect(page.locator("#fallback")).toBeVisible();
  await expect(page.locator(".loading-screen")).toBeHidden();
  await expect(page.locator(".flight-chart")).toBeVisible();
  for (const id of ["sound", "pause", "quality"])
    await expect(page.locator(`#${id}`)).toBeDisabled();
  await shot(page, "final-no-webgl");
  await page.getByRole("button", { name: "About Chris", exact: true }).click();
  await expect(page.getByRole("heading", { name: aboutHeading })).toBeVisible();
  await page.close();
  return { graceful: true };
});
await noGL.close();
await fs.writeFile(
  `${captureDir}/verification.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    passed: report.cases.length,
    failed: report.failures.length,
    failures: report.failures,
  }),
);
if (report.failures.length) process.exitCode = 1;
