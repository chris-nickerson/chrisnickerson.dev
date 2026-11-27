import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { flight: "index.html", atlas: "atlas/index.html" },
      output: { manualChunks: { three: ["three"] } },
    },
  },
});
