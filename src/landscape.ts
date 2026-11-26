import { ValleyWind } from "./valley-wind";
import * as T from "three";
import { groves } from "./rainrun";
import { terrainHeight, fbm, smoothstep, WORLD_SIZE } from "./terrain";

// The same ecological envelope colours the understory and places the actual canopy.
export function forestCover(x: number, z: number, y: number, slope: number) {
  const clearing = groves.reduce(
    (amount, g) =>
      Math.min(
        amount,
        smoothstep(
          g.radius * 0.92,
          g.radius * 1.32,
          Math.hypot(x - g.x, z - g.z),
        ),
      ),
    1,
  );
  const patches = fbm(x * 0.0021 + 71, z * 0.0021 - 19, 3);
  return (
    clearing *
    smoothstep(0.27, 0.61, patches) *
    (1 - smoothstep(540, 1040, y)) *
    (1 - smoothstep(0.24, 0.64, slope)) *
    smoothstep(6, 35, y)
  );
}

/** A small, CPU-baked terrain horizon map. No per-pixel terrain raymarch or network asset. */
export function landscapeMap(sun: T.Vector3, seed: number) {
  const n = 320,
    heights = new Float32Array(n * n),
    data = new Uint8Array(n * n * 4);
  const spacing = WORLD_SIZE / (n - 1);
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++)
      heights[z * n + x] = terrainHeight(
        (x / (n - 1) - 0.5) * WORLD_SIZE,
        (z / (n - 1) - 0.5) * WORLD_SIZE,
      );
  const horizontal = Math.hypot(sun.x, sun.z),
    dx = sun.x / horizontal,
    dz = sun.z / horizontal;
  const sunProbes = Array.from({ length: 36 }, (_, i) => {
    const cells = i + 1 + (i + 1) ** 2 * 0.07;
    return {
      x: dx * cells,
      z: dz * cells,
      rise: (cells * spacing * sun.y) / horizontal,
    };
  });
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const i = z * n + x,
        y = heights[i];
      let highest = -30;
      for (const probe of sunProbes) {
        const xx = Math.round(x + probe.x),
          zz = Math.round(z + probe.z);
        if (xx < 0 || xx >= n || zz < 0 || zz >= n) break;
        highest = Math.max(highest, heights[zz * n + xx] - y - probe.rise);
        if (highest >= 90) break;
      }
      const slope =
        Math.hypot(
          heights[z * n + Math.min(n - 1, x + 1)] - y,
          heights[Math.min(n - 1, z + 1) * n + x] - y,
        ) / spacing;
      data[i * 4] = Math.round(smoothstep(-30, 90, highest) * 255);
      data[i * 4 + 1] = Math.round(
        forestCover(
          (x / (n - 1) - 0.5) * WORLD_SIZE,
          (z / (n - 1) - 0.5) * WORLD_SIZE,
          y,
          slope,
        ) * 255,
      );
      data[i * 4 + 2] = Math.round(
        T.MathUtils.clamp((y + 60) / 180, 0, 1) * 255,
      );
      data[i * 4 + 3] = 255;
    }
  const wind = new ValleyWind(seed, heights, data, n);
  const map = new T.DataTexture(data, n, n, T.RGBAFormat);
  map.minFilter = map.magFilter = T.LinearFilter;
  map.needsUpdate = true;
  return { map, wind };
}
