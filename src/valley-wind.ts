import { clamp, smoothstep, WORLD_SIZE } from "./terrain";

export function flightSeed(query: string, random: () => number) {
  const value = new URLSearchParams(query).get("seed");
  return value !== null && /^\d{1,10}$/.test(value)
    ? Number(value) >>> 0
    : Math.floor(random() * 0x100000000);
}

/** Upwind terrain obstruction on the same grid the water shader samples. */
export class ValleyWind {
  readonly east: number;
  readonly south: number;
  readonly speed: number;
  constructor(
    readonly seed: number,
    readonly heights: Float32Array,
    readonly pixels: Uint8Array,
    readonly n: number,
  ) {
    const angle = -0.28 + ((seed % 127) / 126) * 0.48;
    this.east = Math.cos(angle);
    this.south = Math.sin(angle);
    this.speed = 2.4 + (seed % 13) * 0.1;
    const probes = [1, 2, 4, 7, 10, 14];
    const spacing = WORLD_SIZE / (n - 1);
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const i = z * n + x;
        const ground = Math.max(0, heights[i]);
        let horizon = 0;
        for (const step of probes) {
          const col = Math.round(clamp(x - this.east * step, 0, n - 1));
          const row = Math.round(clamp(z - this.south * step, 0, n - 1));
          horizon = Math.max(
            horizon,
            (heights[row * n + col] - ground) / (step * spacing),
          );
        }
        pixels[i * 4 + 3] = Math.round(
          255 * (1 - smoothstep(0.035, 0.19, horizon)),
        );
      }
  }

  private sample(x: number, z: number, exposure: boolean) {
    const n = this.n;
    const u = clamp((x / WORLD_SIZE + 0.5) * (n - 1), 0, n - 1.001);
    const v = clamp((z / WORLD_SIZE + 0.5) * (n - 1), 0, n - 1.001);
    const col = Math.floor(u),
      row = Math.floor(v),
      i = row * n + col;
    const grid = exposure ? this.pixels : this.heights,
      stride = exposure ? 4 : 1;
    const a = i * stride + (exposure ? 3 : 0),
      b = a + n * stride;
    const upper = grid[a] + (grid[a + stride] - grid[a]) * (u - col);
    const lower = grid[b] + (grid[b + stride] - grid[b]) * (u - col);
    return (upper + (lower - upper) * (v - row)) / (exposure ? 255 : 1);
  }
  exposure(x: number, z: number) {
    return this.sample(x, z, true);
  }
  lift(x: number, y: number, z: number) {
    const h = this.sample(x, z, false);
    const ahead = this.sample(x + this.east * 110, z + this.south * 110, false);
    return (
      Math.min(3.8, (Math.max(0, ahead - h) / 110) * this.speed * 3.2) *
      (1 - smoothstep(140, 520, y - Math.max(0, h)))
    );
  }
}
