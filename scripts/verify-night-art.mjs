import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { channel, previewURL } from "./browser-check.mjs";
import { moduleURL } from "./verify-opening.mjs";

const browser = await chromium.launch({ channel });
try {
  const page = await browser.newPage({
    viewport: { width: 960, height: 600 },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
  });
  const target = new URL(previewURL);
  target.searchParams.set("seed", "42");
  target.searchParams.delete("fallback");
  const [module] = await Promise.all([
    page.waitForRequest(moduleURL),
    page.goto(target.href),
  ]);
  // The production chunk imports the page entry. Fallback supplies its portfolio DOM and leaves the renderer to this probe.
  target.searchParams.set("fallback", "1");
  await page.goto(target.href);
  await page.locator(".fallback-mode").waitFor();
  await page.evaluate(async (url) => {
    const { Simulation } = await import(url);
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0";
    document.body.append(host);
    const sim = new Simulation(host, true);
    cancelAnimationFrame(sim.frame);
    window.nightArt = sim;
  }, module.url());
  await page.waitForFunction(() => window.nightArt.stats().skyReady);
  const result = await page.evaluate(() => {
    const sim = window.nightArt;
    sim.setNight(true);
    const gl = sim.renderer.getContext();
    function pixels(x, y, width, height) {
      sim.render();
      const rgba = new Uint8Array(width * height * 4);
      gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      return rgba;
    }
    function count(rgba, test) {
      let found = 0;
      for (let i = 0; i < rgba.length; i += 4) if (test(i)) found++;
      return found;
    }
    sim.camera.position.set(0, 2200, 0);
    sim.camera.lookAt(0, 2800, -1800);
    const sky = pixels(0, 100, 960, 420);
    const aurora = count(sky, (i) => {
      const r = sky[i],
        g = sky[i + 1],
        b = sky[i + 2];
      return g - r > 34 && b - g < 20 && g > 58;
    });

    sim.practiceLanding("dock");
    sim.setPaused(true);
    sim.flight.position.y = 7;
    sim.resetPresentation();
    sim.updateCamera(0, true);
    const water = () => pixels(460, 130, 175, 115);
    const litWater = water();
    sim.landingLight.intensity = 0;
    const unlitWater = water();
    const landing = count(litWater, (i) => litWater[i] - unlitWater[i] > 12);

    const dock = sim.landmarks.roots.dock.position;
    sim.camera.position.set(dock.x - 22, dock.y + 46, dock.z + 180);
    sim.camera.lookAt(dock.x - 22, dock.y + 46, dock.z - 27);
    const seaward = () => pixels(96, 260, 280, 80);
    const beam = seaward();
    const update = sim.landmarks.update;
    sim.landmarks.update = (time, aircraft) => update(time + 14, aircraft);
    const turned = seaward();
    const lighthouse = count(beam, (i) => beam[i] - turned[i] > 12);

    sim.camera.position.set(dock.x - 95, 20, dock.z + 85);
    sim.camera.lookAt(dock.x - 70, 1.6, dock.z + 42);
    const berth = () => pixels(458, 278, 44, 44);
    const marker = berth();
    sim.landmarks.setNight(false);
    const dark = berth();
    const dockLamp = count(
      marker,
      (i) => marker[i + 1] - dark[i + 1] > 25 && marker[i + 1] - marker[i] > 8,
    );
    return { aurora, landing, lighthouse, dockLamp };
  });
  console.log("Night art pixels", module.url(), result);
  assert.ok(result.aurora > 800, "Expected a green aurora in the north sky.");
  assert.ok(result.landing > 80, "Expected landing light on the water.");
  assert.ok(result.lighthouse > 120, "Expected a sweeping lighthouse beam.");
  assert.ok(result.dockLamp > 20, "Expected a green lamp at the berth.");
} finally {
  await browser.close();
}
