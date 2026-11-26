import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, preview } from "vite";

const engine = process.argv[2] ?? "chromium";
if (engine !== "chromium" && engine !== "webkit") {
  throw new Error("Use chromium or webkit.");
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
  if (engine === "webkit") await import("./webkit-check.mjs");
  else await import("./verify.mjs");
} finally {
  await server?.close();
}
