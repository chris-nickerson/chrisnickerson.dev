import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, preview } from "vite";

const suite = process.argv[2] ?? "chromium";
if (!["chromium", "webkit", "night-art"].includes(suite)) {
  throw new Error("Use chromium, webkit, or night-art.");
}

let server;
try {
  if (!process.env.BASE_URL) {
    const outDir = await mkdtemp(join(tmpdir(), "after-rain-preview-"));
    // Playwright can exit on Ctrl-C before an async finally block completes.
    process.once("exit", () =>
      rmSync(outDir, { recursive: true, force: true }),
    );
    await build({ build: { outDir } });
    server = await preview({
      build: { outDir },
      preview: { host: "127.0.0.1", port: 0 },
    });
    process.env.BASE_URL = server.resolvedUrls.local[0];
  }
  if (suite === "webkit") await import("./webkit-check.mjs");
  else {
    await import("./verify-night-art.mjs");
    if (suite === "chromium") {
      await import("./verify-inlet-views.mjs");
      await import("./verify.mjs");
    }
  }
} finally {
  await server?.close();
}
