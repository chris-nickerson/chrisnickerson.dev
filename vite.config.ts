import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    rollupOptions: {
      input: { index: "index.html", atlas: "atlas/index.html" },
      output: { manualChunks: { three: ["three"] } },
    },
  },
});
