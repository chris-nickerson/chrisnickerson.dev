import { captureDir, channel, devURL } from "./browser-check.mjs";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
// A deterministic, frozen-world camera sweep isolates depth and material shimmer.
// SHORE_TAG avoids overwriting earlier evidence. SHORE_VARIANTS=near8 captures the final renderer.
const tag = process.env.SHORE_TAG || "current";
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
  await p.route("**/stability-review", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<html><body><script type="module" src="/scripts/stability-studio.ts"></script></body></html>',
    }),
  );
  await p.goto(new URL("stability-review", devURL).href);
  await p.waitForFunction(() => window.stability);
  await p.evaluate(() => {
    const { sim } = window.stability;
    sim.paused = true;
    sim.aircraft.root.visible = false;
    sim.water.mesh.visible = false;
    sim.world.focus();
    sim.camera.position.set(0, 450, 2600);
    sim.camera.lookAt(-900, 0, -1450);
    sim.camera.updateMatrixWorld();
    sim.scene.traverse((o) => {
      if (
        o.material?.onBeforeCompile &&
        o.material.type === "MeshStandardMaterial" &&
        o.material.envMapIntensity === 0.14
      ) {
        o.material.userData.original = o.material.onBeforeCompile;
        o.material.userData.originalCacheKey = o.material.customProgramCacheKey;
      }
    });
  });
  for (const variant of variants) {
    await p.evaluate((variant) => {
      const { sim } = window.stability;
      const near = variant === "near1" ? 1 : 8;
      sim.camera.near = near;
      sim.camera.updateProjectionMatrix();
      sim.screenMaterial.uniforms.uNearFar.value.set(near, sim.camera.far);
      sim.scene.traverse((o) => {
        if (o.material?.uniforms?.uIsDetail)
          o.visible = variant !== "near8-no-coast";
        if (variant === "near8-no-micro" && o.material?.userData.original) {
          const original = o.material.userData.original;
          o.material.onBeforeCompile = (shader, r) => {
            original(shader, r);
            shader.fragmentShader = shader.fragmentShader
              .replace(/float micro=[^;]+;/, "float micro=0.;")
              .replace(/vec2 microSlope=[^;]+;/, "vec2 microSlope=vec2(0.);");
          };
          o.material.customProgramCacheKey = () => "shore-diagnostic-no-micro";
          o.material.needsUpdate = true;
        } else if (o.material?.userData.original) {
          o.material.onBeforeCompile = o.material.userData.original;
          o.material.customProgramCacheKey =
            o.material.userData.originalCacheKey;
          o.material.needsUpdate = true;
        }
      });
    }, variant);
    for (let i = 0; i < 10; i++) {
      await p.evaluate((i) => {
        const { sim } = window.stability;
        sim.camera.position.set(i * 0.08, 450, 2600);
        sim.camera.lookAt(-900 + i * 0.08, 0, -1450);
        sim.camera.updateMatrixWorld();
        sim.render();
      }, i);
      await p.screenshot({
        path: `${captureDir}/shore-${tag}-${variant}-${i}.png`,
      });
    }
  }
  await fs.writeFile(
    `${captureDir}/shore-${tag}-diagnostic.json`,
    JSON.stringify(
      {
        errors,
        variants,
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
