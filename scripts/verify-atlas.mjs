import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function verifyAtlas(browser, baseURL) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  try {
    await page.goto(new URL("atlas/", baseURL).href);
    const plate = page.getByRole("img", { name: /oblique relief/i });
    await plate.evaluate((img) => img.decode());
    assert.match(
      await plate.evaluate((img) => img.currentSrc),
      /relief-west-small/,
    );
    assert(
      !requests.some((url) => /relief-east|\/three-|\/simulation-/.test(url)),
    );

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
      await page.getByRole("button", { name: `Locate ${berth}` }).click();
      await expect(
        page.getByRole("button", { name: berth, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      const pin = await page
        .getByRole("button", { name: `Locate ${berth}` })
        .boundingBox();
      const bounds = await map.boundingBox();
      assert(
        Math.abs(pin.x + pin.width / 2 - (bounds.x + bounds.width / 2)) < 2,
      );
      await page.getByRole("button", { name: "Whole inlet" }).click();
    }
  } finally {
    await page.close();
  }
}
