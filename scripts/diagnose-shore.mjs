import { captureDir, channel, devURL } from "./browser-check.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
// A deterministic, frozen-world camera sweep isolates depth and material shimmer.
// SHORE_TAG avoids overwriting earlier evidence. SHORE_VARIANTS=near8 captures the final renderer.
const tag = process.env.SHORE_TAG || "current";
const focused = process.env.SHORE_FOCUS === "1";
const variants = (
  process.env.SHORE_VARIANTS || "near1,near8,near8-no-coast,near8-no-micro"
).split(",");
const browser = await chromium.launch({ channel });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const p = await context.newPage(),
  errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await p.route(/\/stability-review(?:\?|$)/, (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<html><body><script type="module" src="/scripts/stability-studio.ts"></script></body></html>',
    }),
  );
  const url = new URL("stability-review", devURL);
  url.search = new URL(devURL).search;
  await p.goto(url.href);
  await p.waitForFunction(() => {
    const sim = window.stability?.sim;
    return sim && (sim.world.sky.material.uniforms.uSkyReady?.value ?? 1);
  });
  await p.evaluate((focused) => {
    const { sim } = window.stability;
    sim.paused = true;
    sim.aircraft.root.visible = false;
    sim.water.mesh.visible = false;
    if (focused) sim.world.focus(-900, -1450);
    else sim.world.focus();
    sim.camera.position.set(0, 450, 2600);
    sim.camera.lookAt(-900, 0, -1450);
    sim.camera.updateMatrixWorld();
  }, focused);
  const referenceFrames = new Map();
  for (const variant of variants) {
    const terrainMaterials = await p.evaluate((variant) => {
      const { sim } = window.stability;
      const near = variant === "near1" ? 1 : 8;
      sim.camera.near = near;
      sim.camera.updateProjectionMatrix();
      sim.screenMaterial.uniforms.uNearFar.value.set(near, sim.camera.far);
      const terrainKey =
        sim.world.terrain.children[0].material.customProgramCacheKey();
      const materials = new Set();
      sim.scene.traverse((o) => {
        const material = o.material;
        if (material?.uniforms?.uIsDetail)
          o.visible = variant !== "near8-no-coast";
        if (
          material?.isMeshStandardMaterial &&
          material.customProgramCacheKey() === terrainKey
        )
          materials.add(material);
      });
      for (const material of materials) {
        const geometric = variant === "near8-no-micro";
        if (Boolean(material.defines.ALPINE_GEOMETRIC_NORMALS) === geometric)
          continue;
        if (geometric) material.defines.ALPINE_GEOMETRIC_NORMALS = 1;
        else delete material.defines.ALPINE_GEOMETRIC_NORMALS;
        material.needsUpdate = true;
      }
      return materials.size;
    }, variant);
    if (focused && terrainMaterials < 2)
      throw new Error(
        "The focused sweep needs both coarse and detail terrain.",
      );
    for (let i = 0; i < 10; i++) {
      await p.evaluate((i) => {
        const { sim } = window.stability;
        sim.camera.position.set(i * 0.08, 450, 2600);
        sim.camera.lookAt(-900 + i * 0.08, 0, -1450);
        sim.camera.updateMatrixWorld();
        sim.render();
      }, i);
      const image = await p.screenshot({
        path: `${captureDir}/shore-${tag}-${variant}-${i}.png`,
      });
      if (i === 0) referenceFrames.set(variant, image);
    }
  }
  const control = referenceFrames.get("near8");
  const geometric = referenceFrames.get("near8-no-micro");
  if (control && geometric && control.equals(geometric))
    throw new Error(
      "Disabling terrain relief produced an identical shoreline frame.",
    );
  await fs.writeFile(
    `${captureDir}/shore-${tag}-diagnostic.json`,
    JSON.stringify(
      {
        errors,
        variants,
        focused,
        steps: 10,
        translationPerFrame: 0.08,
        viewport: [1280, 800],
      },
      null,
      2,
    ),
  );
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
}
console.log({ tag, variants, errors });
