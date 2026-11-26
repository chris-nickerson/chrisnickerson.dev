import { chromium, webkit } from "@playwright/test";
import { build, preview } from "vite";

await build();
const server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
try {
  process.env.BASE_URL = server.resolvedUrls.local[0];
  const { verifyOpening } = await import("./verify-opening.mjs");
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch(
      engine === chromium
        ? { channel: process.env.BROWSER_CHANNEL || "chromium" }
        : {},
    );
    try {
      await verifyOpening(browser);
      console.log(`${engine.name()} opening passed`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
