import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
try {
  await server.listen();
  process.env.BASE_URL = server.resolvedUrls.local[0];
  await import("./diagnose-stability.mjs");
} finally {
  await server.close();
}
