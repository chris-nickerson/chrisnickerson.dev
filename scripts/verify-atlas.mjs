import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { previewURL } from "./browser-check.mjs";

export async function verifyAtlas(browser) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const resourceNames = () =>
    page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => entry.name),
    );
  try {
    await page.goto(previewURL);
    const entry = page.getByRole("link", { name: "Relief atlas", exact: true });
    await expect(entry).toBeVisible();
    await page.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
    assert(
      !(await resourceNames()).some((url) => /relief-(west|east)/.test(url)),
    );
    await page.addInitScript(() => {
      window.atlasFrames = 0;
      const schedule = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        window.atlasFrames++;
        return schedule(callback);
      };
    });
    await entry.click();
    await expect(page).toHaveURL(new URL("atlas/", previewURL).href);
    const plate = page.getByRole("img", { name: /oblique relief/i });
    await plate.evaluate((img) => img.decode());
    assert.match(
      await plate.evaluate((img) => img.currentSrc),
      /relief-west-small/,
    );
    assert(
      !(await resourceNames()).some((url) =>
        /relief-east|\/three-|\/simulation-/.test(url),
      ),
    );

    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await expect(page.locator("canvas")).toHaveCount(0);
    const map = page.locator("[data-map]");
    const west = await map.screenshot();
    const light = page.getByRole("slider", { name: "Raking light" });
    await light.press("End");
    await expect(light).toHaveAttribute("aria-valuetext", "East");
    await page.locator("img.east").evaluate((img) => img.decode());
    assert(
      !west.equals(await map.screenshot()),
      "the plate changes under eastern light",
    );

    for (const berth of ["Field station", "Workshop", "Quiet dock"]) {
      await page
        .getByRole("button", { name: `Locate ${berth}` })
        .press("Enter");
      await expect(
        page.getByRole("button", { name: berth, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("figcaption")).toContainText(berth);
      const pin = await page
        .getByRole("button", { name: `Locate ${berth}` })
        .boundingBox();
      const bounds = await map.boundingBox();
      assert(
        Math.abs(pin.x + pin.width / 2 - (bounds.x + bounds.width / 2)) < 2,
      );
      assert(Math.abs(pin.y + pin.height - (bounds.y + bounds.height / 2)) < 2);
      await page.getByRole("button", { name: "Whole inlet" }).click();
    }
    assert.equal(await page.evaluate(() => window.atlasFrames), 0);
    await page.getByRole("link", { name: "Back to flight" }).click();
    await expect(page).toHaveURL(new URL("./", previewURL).href);
    await page.goBack();
    const restored = await light.inputValue();
    assert(["0", "100"].includes(restored));
    await expect(light).toHaveAttribute(
      "aria-valuetext",
      restored === "100" ? "East" : "West",
    );
    await expect(page.locator("img.east")).toHaveCSS(
      "opacity",
      restored === "100" ? "1" : "0",
    );
    await light.press("End");
    await page.reload();
    await expect(light).toHaveValue("0");
    await expect(light).toHaveAttribute("aria-valuetext", "West");
    await light.evaluate((input) => {
      input.value = "100";
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });
    await expect(light).toHaveAttribute("aria-valuetext", "East");
    await expect(page.locator("img.east")).toHaveCSS("opacity", "1");

    await page.setViewportSize({ width: 320, height: 568 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect
      .poll(() => plate.evaluate((image) => image.currentSrc))
      .toMatch(/\/relief-west(?:-(?!small)[^/?]+)?\.webp(?:\?|$)/);
    await plate.evaluate((image) => image.decode());
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}
