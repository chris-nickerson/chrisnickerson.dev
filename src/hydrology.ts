import { clamp, terrainHeight, WORLD_SIZE } from "./terrain";
export const GRID = 128;
export const SAVE_KEY = "after-rain.watershed.v1";
export interface SavedWatershed {
  version: 1;
  moisture: number[];
  delivered: number;
}
/** A conservative surface-water flux solver. Moisture is a separate, slower reservoir. */
export class Watershed {
  readonly heights = new Float32Array(GRID * GRID);
  readonly surface = new Float32Array(GRID * GRID);
  readonly moisture = new Float32Array(GRID * GRID);
  readonly vegetation = new Float32Array(GRID * GRID);
  readonly pixels = new Uint8Array(GRID * GRID * 4);
  private delta = new Float32Array(GRID * GRID);
  delivered = 0;
  seaDischarge = 0;
  evaporated = 0;
  dirty = true;
  constructor() {
    for (let z = 0; z < GRID; z++)
      for (let x = 0; x < GRID; x++)
        this.heights[z * GRID + x] = terrainHeight(
          (x / (GRID - 1) - 0.5) * WORLD_SIZE,
          (z / (GRID - 1) - 0.5) * WORLD_SIZE,
        );
  }
  index(x: number, z: number) {
    return (
      Math.round(clamp(z / WORLD_SIZE + 0.5, 0, 1) * (GRID - 1)) * GRID +
      Math.round(clamp(x / WORLD_SIZE + 0.5, 0, 1) * (GRID - 1))
    );
  }
  deposit(x: number, z: number, amount: number) {
    if (!Number.isFinite(x + z + amount) || amount <= 0) return;
    const index = this.index(x, z);
    this.delivered += amount;
    if (this.heights[index] <= 0) {
      this.seaDischarge += amount;
      return;
    }
    this.surface[index] += amount;
    this.dirty = true;
  }
  step(dt: number) {
    this.delta.fill(0);
    const neighbors: number[] = [];
    for (let z = 0; z < GRID; z++)
      for (let x = 0; x < GRID; x++) {
        const i = z * GRID + x,
          w = this.surface[i];
        if (w < 0.00001) continue;
        if (this.heights[i] <= 0) {
          this.seaDischarge += w;
          this.delta[i] -= w;
          continue;
        }
        const level = this.heights[i] + w;
        let sum = 0;
        neighbors.length = 0;
        if (x > 0) neighbors.push(i - 1);
        if (x < GRID - 1) neighbors.push(i + 1);
        if (z > 0) neighbors.push(i - GRID);
        if (z < GRID - 1) neighbors.push(i + GRID);
        for (const j of neighbors)
          sum += Math.max(0, level - this.heights[j] - this.surface[j]);
        const flow = sum > 0 ? Math.min(w, w * dt * 0.22) : 0;
        if (sum > 0)
          for (const j of neighbors) {
            const f =
              (flow * Math.max(0, level - this.heights[j] - this.surface[j])) /
              sum;
            this.delta[i] -= f;
            this.delta[j] += f;
          }
        const absorbed = Math.min(w - flow, w * dt * 0.18);
        this.delta[i] -= absorbed;
        this.moisture[i] += absorbed;
      }
    for (let i = 0; i < this.surface.length; i++) {
      this.surface[i] = Math.max(0, this.surface[i] + this.delta[i]);
      const loss = this.moisture[i] * dt * 0.0008;
      this.moisture[i] -= loss;
      this.evaporated += loss;
      const goal = clamp(this.moisture[i] / 12, 0, 1);
      this.vegetation[i] +=
        (goal - this.vegetation[i]) * Math.min(1, dt * 0.12);
      this.pixels[i * 4] = Math.round(clamp(this.moisture[i] / 18, 0, 1) * 255);
      this.pixels[i * 4 + 1] = Math.round(this.vegetation[i] * 255);
      this.pixels[i * 4 + 2] = Math.round(
        clamp(this.surface[i] / 8, 0, 1) * 255,
      );
      this.pixels[i * 4 + 3] = 255;
    }
    this.dirty = true;
  }
  get wateredCells() {
    let n = 0;
    for (const v of this.moisture) if (v > 0.05) n++;
    return n;
  }
  snapshot(): SavedWatershed {
    return {
      version: 1,
      moisture: Array.from(this.moisture, (v) => Math.round(v * 1000) / 1000),
      delivered: this.delivered,
    };
  }
  restore(raw: unknown) {
    const s = raw as SavedWatershed;
    if (
      !s ||
      s.version !== 1 ||
      !Array.isArray(s.moisture) ||
      s.moisture.length !== GRID * GRID ||
      !Number.isFinite(s.delivered) ||
      s.delivered < 0 ||
      s.moisture.some((v) => !Number.isFinite(v) || v < 0 || v > 1000000)
    )
      return false;
    this.surface.fill(0);
    this.seaDischarge = 0;
    this.evaporated = 0;
    this.moisture.set(s.moisture);
    this.delivered = s.delivered;
    for (let i = 0; i < this.moisture.length; i++)
      this.vegetation[i] = clamp(this.moisture[i] / 12, 0, 1);
    this.step(0);
    return true;
  }
  clear() {
    this.moisture.fill(0);
    this.surface.fill(0);
    this.vegetation.fill(0);
    this.delivered = 0;
    this.seaDischarge = 0;
    this.evaporated = 0;
    this.step(0);
  }
}
