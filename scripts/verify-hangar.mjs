import { chromium, expect } from "@playwright/test";
import { captureDir, channel, devURL } from "./browser-check.mjs";

const browser = await chromium.launch({ channel });
try {
  for (const [width, height] of [
    [1440, 900],
    [320, 568],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: width === 320,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const stats = () => page.evaluate(() => window.__AFTER_RAIN__.stats());
    await page.goto(devURL);
    const hangar = page.getByRole("button", { name: "Hangar", exact: true });
    await expect(hangar).toBeEnabled();
    expect((await stats()).aircraftId).toBe("survey");
    for (const [id, place] of [
      ["survey", "memory"],
      ["alder", "workshop"],
      ["marlin", "dock"],
    ]) {
      await hangar.click();
      const dialog = page.getByRole("dialog", { name: "The hangar" });
      const options = dialog.locator("[data-aircraft]");
      await expect(options).toHaveCount(3);
      for (const option of await options.all()) {
        await expect(option.locator("img")).toHaveJSProperty(
          "naturalWidth",
          840,
        );
      }
      if (id === "survey")
        await page.screenshot({ path: `${captureDir}/hangar-${width}.png` });
      const before = await stats();
      await dialog.locator(`[data-aircraft="${id}"]`).click();
      const after = await stats();
      expect(after.aircraftId).toBe(id);
      expect(after.onWater).toBe(before.onWater);
      expect(after.arrival?.place).toBe(before.arrival?.place);
      await page
        .getByRole("button", { name: "Meet Chris", exact: true })
        .click();
      await page.locator(`[data-visit="${place}"]`).click();
      await page.waitForFunction(
        (target) => window.__AFTER_RAIN__.stats().arrival?.place === target,
        place,
      );
      await expect(page.locator("#place-panel")).toBeVisible({
        timeout: 16000,
      });
      const landed = await stats();
      expect(landed.aircraftId).toBe(id);
      expect(landed.arrival.place).toBe(place);
      expect(landed.onWater).toBe(true);
      expect(landed.position[1]).toBeLessThan(8);
      await page.screenshot({ path: `${captureDir}/water-${id}-${width}.jpg` });
      console.log("PASS landing", width, id, place);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(hangar).toBeEnabled();
    expect((await stats()).aircraftId).toBe("marlin");
    await hangar.click();
    await expect(
      page.locator('[aria-pressed="true"][data-aircraft]'),
    ).toContainText("Marlin Twin");
    await page.getByRole("button", { name: /Alder Courier/ }).click();
    expect((await stats()).paused).toBe(true);
    await page.goto(new URL("?fallback", devURL).href);
    await expect(hangar).toBeDisabled();
    expect(errors).toEqual([]);
    await page.close();
  }
} finally {
  await browser.close();
}
