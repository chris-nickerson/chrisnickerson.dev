import { expect } from "@playwright/test";
import { previewURL } from "./browser-check.mjs";

export const moduleURL =
  /\/(?:assets\/simulation-[^/]+\.js|src\/simulation\.ts)(?:\?|$)/;
export const loadingScreen = (page) =>
  page.getByRole("status").filter({ hasText: /^\s*Loading\s*$/ });

export async function verifyOpening(browser) {
  const noScript = await browser.newPage({ javaScriptEnabled: false });
  try {
    await noScript.goto(previewURL);
    await expect(noScript.locator(".no-script")).toBeVisible();
    await expect(noScript.locator("#fallback-note")).toBeVisible();
  } finally {
    await noScript.close();
  }
  const offlineEntry = await browser.newPage();
  try {
    await offlineEntry.route(
      /\/(?:assets\/index-[^/]+\.js|src\/main\.ts)(?:\?|$)/,
      (route) => route.abort(),
    );
    await offlineEntry.goto(previewURL);
    const fallback = offlineEntry.locator(".no-script");
    await expect(fallback).toBeVisible({ timeout: 12000 });
    await expect(
      fallback.getByRole("link", { name: "GitHub" }),
    ).toHaveAttribute("href", "https://github.com/chris-nickerson");
    await expect(offlineEntry.locator("#fallback-note")).toBeHidden();
    await expect(offlineEntry.locator(".hero-actions")).toBeHidden();
  } finally {
    await offlineEntry.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.clock.install({ time: new Date("2025-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2025-01-01T00:01:00Z"));
  const held = Promise.withResolvers();
  await page.route(moduleURL, (route) => held.resolve(route));
  try {
    const [artwork] = await Promise.all([
      page.waitForResponse(/\/images\/moonwater-portrait\.webp$/),
      page.goto(previewURL, { waitUntil: "domcontentloaded" }),
    ]);
    await page.clock.runFor(100);
    const route = await held.promise;
    try {
      expect(artwork.ok()).toBe(true);
      await expect(page.locator("#fly")).toBeDisabled();
      const loading = loadingScreen(page);
      for (const [width, height] of [
        [390, 844],
        [1440, 900],
        [320, 568],
      ]) {
        await page.setViewportSize({ width, height });
        await expect(loading).toBeVisible();
        await expect
          .poll(() =>
            loading
              .locator("img")
              .evaluate((img) =>
                img.complete && img.naturalWidth
                  ? new URL(img.currentSrc).pathname
                  : "",
              ),
          )
          .toMatch(
            width < height ? /moonwater-portrait\.webp$/ : /moonwater\.webp$/,
          );
        expect(await loading.boundingBox()).toEqual({
          x: 0,
          y: 0,
          width,
          height,
        });
        await expect(page.locator(".introduction")).toBeHidden();
      }
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const pixels = () =>
        loading.locator("canvas").evaluate((canvas) => {
          const context = canvas.getContext("2d");
          const data = context.getImageData(
            canvas.width >> 1,
            canvas.height * 0.8,
            16,
            10,
          ).data;
          return Array.from(data).join(",");
        });
      const blank = Array(16 * 10 * 4)
        .fill(0)
        .join(",");
      await page.clock.runFor(160);
      await expect.poll(pixels).not.toBe(blank);
      const initial = await pixels();
      await page.clock.runFor(240);
      await expect.poll(pixels).not.toBe(initial);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect.poll(pixels).toBe(blank);
      await expect(loading).toBeVisible();
      await page.clock.fastForward(8000);
      await page.clock.resume();
      await expect(loading).toBeHidden();
      await expect(page.locator(".loading-screen canvas")).toHaveJSProperty(
        "width",
        0,
      );
      const chart = page.locator(".flight-chart");
      await expect(chart).toBeVisible();
      const chartWidth = await chart.locator("image").evaluate(async (node) => {
        const image = new Image();
        image.src = node.href.baseVal;
        await image.decode();
        return image.naturalWidth;
      });
      expect(chartWidth).toBeGreaterThan(0);
      for (const [width, height] of [
        [320, 568],
        [900, 900],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width, height });
        const bounds = await chart.boundingBox();
        expect(bounds.x).toBeLessThanOrEqual(1);
        expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(width - 1);
        await expect(chart.locator(".chart-aircraft")).toBeInViewport();
      }
      await page
        .getByRole("button", { name: "About Chris", exact: true })
        .click();
      await expect(page.locator("#about")).toBeVisible();
    } finally {
      await route.continue();
    }
    await page.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
    await expect(page.locator("#fallback")).toBeHidden();
    await expect(page.locator("#about")).toBeVisible();
  } finally {
    await page.close();
  }

  const direct = await browser.newPage({ reducedMotion: "no-preference" });
  try {
    await direct.route(moduleURL, async (route) => {
      await direct
        .locator(".loading-screen img")
        .evaluate((img) => img.decode());
      await route.continue();
    });
    await direct.addInitScript(() => {
      document.addEventListener("animationstart", (event) => {
        if (event.animationName !== "eclipse-departure") return;
        const screen = event.target;
        screen.getAnimations().forEach((animation) => animation.pause());
        window.eclipseReveal = {
          inert: screen.inert,
          live: !document.getElementById("fly").disabled,
          chart: getComputedStyle(document.getElementById("fallback"))
            .visibility,
        };
      });
    });
    await direct.goto(previewURL);
    await expect
      .poll(() => direct.evaluate(() => window.eclipseReveal))
      .toEqual({
        inert: true,
        live: true,
        chart: "hidden",
      });
    await direct.locator("#fly").click();
    await expect(direct.locator("#experience")).toHaveClass(/piloting/);
    await direct
      .locator(".loading-screen")
      .evaluate((el) => el.getAnimations().forEach((a) => a.play()));
    await expect(direct.locator(".loading-screen")).toBeHidden();
    await expect(direct.locator(".loading-screen canvas")).toHaveJSProperty(
      "width",
      0,
    );
  } finally {
    await direct.close();
  }

  const still = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await still.addInitScript(() => {
      new MutationObserver((records) => {
        if (
          records.some(
            (r) =>
              r.attributeName === "inert" &&
              r.target.matches(".loading-screen"),
          )
        ) {
          window.attemptedDissolve = true;
        }
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["inert"],
      });
    });
    await still.goto(previewURL);
    await still.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
    await expect(still.locator(".loading-screen")).toBeHidden();
    expect(await still.evaluate(() => Boolean(window.attemptedDissolve))).toBe(
      false,
    );
  } finally {
    await still.close();
  }

  const skipping = await browser.newPage();
  await skipping.route(moduleURL, () => {});
  try {
    await Promise.all([
      skipping.waitForRequest(moduleURL),
      skipping.goto(previewURL, { waitUntil: "domcontentloaded" }),
    ]);
    await expect(loadingScreen(skipping)).toBeVisible();
    // WebKit on macOS moves focus to links with Option+Tab.
    const tab =
      browser.browserType().name() === "webkit" && process.platform === "darwin"
        ? "Alt+Tab"
        : "Tab";
    await skipping.keyboard.press(tab);
    await expect(skipping.locator("#skip")).toBeFocused();
    await skipping.keyboard.press("Enter");
    await expect(skipping.locator("#about-heading")).toBeFocused();
    await expect(loadingScreen(skipping)).toBeHidden();
  } finally {
    await skipping.close();
  }
}

async function sceneSamples(page, clip) {
  const screenshot = await page.screenshot({
    clip,
    style:
      "#experience > :not(#scene), body > :not(#experience) {visibility:hidden!important}",
  });
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = "data:image/png;base64," + png;
    await image.decode();
    const ctx = new OffscreenCanvas(32, 24).getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, 32, 24);
    return Array.from(ctx.getImageData(0, 0, 32, 24).data).filter(
      (_, i) => i % 4 !== 3,
    );
  }, screenshot.toString("base64"));
}

function rgbDifference(before, after) {
  return (
    after.reduce((sum, value, i) => sum + Math.abs(value - before[i]), 0) /
    after.length
  );
}

export async function verifyStreamedSky(browser) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  let skyRequest;
  await page.route(/\/storm-sky(?:-[^/?]+)?\.webp(?:\?|$)/, (route) => {
    skyRequest = route;
  });
  try {
    await page.goto(new URL("?seed=42", previewURL).href, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
    await expect.poll(() => Boolean(skyRequest)).toBe(true);
    await expect(page.locator(".loading-screen")).toBeHidden();
    await expect(page.locator("#fly")).toBeEnabled();
    const { width, height } = page.viewportSize();
    const upperSky = { x: 0, y: 0, width, height: Math.ceil(height / 3) };
    const fallback = await sceneSamples(page, upperSky);
    await skyRequest.continue();
    await expect
      .poll(
        async () => rgbDifference(fallback, await sceneSamples(page, upperSky)),
        {
          message:
            "the storm panorama must visibly replace the paused fallback sky",
        },
      )
      .toBeGreaterThan(10);
    expect(
      await page.evaluate(() => window.__AFTER_RAIN__.stats()),
    ).toMatchObject({
      paused: true,
      elapsed: 0,
    });
    await page.getByRole("button", { name: "Go flying", exact: true }).click();
    await expect(page.locator("#experience")).toHaveClass(/piloting/);
  } finally {
    await page.close();
  }
}

export async function verifyNightFlight(browser, viewport) {
  const phone = viewport.width < 700;
  const page = await browser.newPage({
    viewport,
    isMobile: phone,
    hasTouch: phone,
    deviceScaleFactor: phone ? 1.5 : 1,
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const stats = () => page.evaluate(() => window.__AFTER_RAIN__.stats());
  try {
    await page.goto(new URL("?seed=42", previewURL).href, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(() => window.__AFTER_RAIN__?.stats().skyReady);
    const night = page.getByRole("button", {
      name: "Night flight",
      exact: true,
    });
    await expect(night).toHaveAttribute("aria-pressed", "false");
    expect(await stats()).toMatchObject({
      night: false,
      paused: true,
      elapsed: 0,
    });
    const dayFrame = await sceneSamples(page);
    await night.click();
    await expect(night).toHaveAttribute("aria-pressed", "true");
    expect(await stats()).toMatchObject({
      night: true,
      paused: true,
      elapsed: 0,
    });
    const nightFrame = await sceneSamples(page);
    expect(
      rgbDifference(dayFrame, nightFrame),
      "night must visibly relight the paused inlet",
    ).toBeGreaterThan(20);
    const intensity = [];
    for (let i = 0; i < nightFrame.length; i += 3) {
      intensity.push(
        (nightFrame[i] + nightFrame[i + 1] + nightFrame[i + 2]) / 3,
      );
    }
    intensity.sort((a, b) => a - b);
    const percentile = (p) => intensity[Math.floor(p * intensity.length)];
    expect(
      percentile(0.9) - percentile(0.1),
      "the night scene must retain visible detail",
    ).toBeGreaterThan(18);
    await night.click();
    await expect(night).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(async () => rgbDifference(dayFrame, await sceneSamples(page)), {
        message: "daylight must return to the same paused scene",
      })
      .toBeLessThan(2);
    expect(await stats()).toMatchObject({
      night: false,
      paused: true,
      elapsed: 0,
    });

    await page.getByRole("button", { name: "Go flying", exact: true }).click();
    await night.click();
    await page.waitForFunction(() => {
      const s = window.__AFTER_RAIN__.stats();
      return s.night && !s.paused && !s.assisted && s.elapsed > 0.3;
    });
    if (!phone) {
      await expect(page.locator("#scene")).toBeFocused();
      const heading = (await stats()).heading;
      await page.keyboard.down("d");
      try {
        await page.waitForFunction(
          (start) =>
            Math.sin(window.__AFTER_RAIN__.stats().heading - start) > 0.03,
          heading,
        );
      } finally {
        await page.keyboard.up("d");
      }
    }
    await night.click();
    expect(await stats()).toMatchObject({
      night: false,
      paused: false,
      assisted: false,
    });
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}
