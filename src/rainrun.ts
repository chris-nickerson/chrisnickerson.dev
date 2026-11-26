import * as T from "three";
import { terrainHeight, seededRandom, clamp } from "./terrain";
import type { Flight } from "./flight";
import { predictWaterImpact } from "./water-release";

export const groves = [
  { name: "The south meadow", x: -900, z: 2400, radius: 120 },
  { name: "The willow bank", x: 1300, z: -800, radius: 110 },
  { name: "The high clearing", x: 800, z: -2200, radius: 105 },
];
const REQUIRED_WATER = 180;

export class RainRun {
  active = false;
  index = 0;
  delivered = [0, 0, 0];
  missed = false;
  impact = new T.Vector3();
  get grove() {
    return groves[this.index];
  }
  get progress() {
    return clamp(this.delivered[this.index] / REQUIRED_WATER, 0, 1);
  }
  get complete() {
    return this.progress >= 1;
  }
  get finished() {
    return this.delivered.every((v) => v >= REQUIRED_WATER);
  }
  get aimed() {
    return (
      Math.hypot(this.impact.x - this.grove.x, this.impact.z - this.grove.z) <
      this.grove.radius * 0.85
    );
  }
  start(f: Flight, index = 0, fresh = false) {
    if (fresh) this.delivered.fill(0);
    this.active = true;
    this.index = index;
    this.missed = false;
    const g = this.grove;
    f.reset();
    f.assisted = false;
    let high = terrainHeight(g.x, g.z);
    for (let z = g.z; z < g.z + 900; z += 50)
      high = Math.max(high, terrainHeight(g.x, z));
    f.position.set(g.x, high + 125, g.z + 900);
    f.velocity.set(0, 0, -53);
    f.quaternion.identity();
  }
  deposit(x: number, z: number, amount: number) {
    if (!this.active) return;
    const g = this.grove;
    if (Math.hypot(x - g.x, z - g.z) < g.radius && terrainHeight(x, z) > 0)
      this.delivered[this.index] += amount;
  }
  update(f: Flight) {
    if (!this.active) return;
    this.impact.copy(predictWaterImpact(f.position, f.velocity, f.wind));
    this.missed = !this.complete && f.position.z < this.grove.z - 240;
  }
  stop() {
    this.active = false;
  }
  stats() {
    return this.active
      ? {
          grove: this.grove.name,
          index: this.index,
          progress: this.progress,
          complete: this.complete,
          finished: this.finished,
          aimed: this.aimed,
          missed: this.missed,
          impact: this.impact.toArray(),
        }
      : null;
  }
}

export function createGroves(scene: T.Scene, run: RainRun) {
  const root = new T.Group();
  root.visible = false;
  scene.add(root);
  const random = seededRandom(918);
  const geo = new T.IcosahedronGeometry(1, 1);
  geo.translate(0, 1, 0);
  const leaves = new T.InstancedMesh(
    geo,
    new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    360,
  );
  leaves.castShadow = true;
  const transforms: {
    x: number;
    y: number;
    z: number;
    r: number;
    grove: number;
  }[] = [];
  const d = new T.Object3D(),
    col = new T.Color();
  for (let i = 0; i < 360; i++) {
    const g = groves[Math.floor(i / 120)],
      angle = random() * Math.PI * 2,
      r = Math.sqrt(random()) * g.radius * 0.88;
    const x = g.x + Math.cos(angle) * r,
      z = g.z + Math.sin(angle) * r;
    transforms.push({
      x,
      y: Math.max(0, terrainHeight(x, z)),
      z,
      r: 2 + random() * 3,
      grove: Math.floor(i / 120),
    });
  }
  root.add(leaves);
  const rings = groves.map((g) => {
    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * Math.PI * 2,
        r = g.radius * (1 + 0.035 * Math.sin(t * 7) + 0.02 * Math.cos(t * 11));
      const x = g.x + Math.cos(t) * r,
        z = g.z + Math.sin(t) * r;
      pts.push(new T.Vector3(x, Math.max(0, terrainHeight(x, z)) + 1.2, z));
    }
    const line = new T.Line(
      new T.BufferGeometry().setFromPoints(pts),
      new T.LineBasicMaterial({
        color: 0xf5d094,
        transparent: true,
        opacity: 0.8,
      }),
    );
    root.add(line);
    return line;
  });
  const growth = [0, 0, 0];
  return {
    update(dt: number) {
      root.visible = run.active;
      if (!run.active) return;
      for (let j = 0; j < 3; j++)
        growth[j] +=
          (clamp(run.delivered[j] / REQUIRED_WATER, 0, 1) - growth[j]) *
          Math.min(1, dt * 0.8);
      transforms.forEach((p, i) => {
        const g = growth[p.grove];
        d.position.set(p.x, p.y, p.z);
        d.scale.set(
          p.r * (0.4 + g * 0.8),
          p.r * (0.25 + g * 1.9),
          p.r * (0.4 + g * 0.8),
        );
        d.rotation.y = i * 2.39;
        d.updateMatrix();
        leaves.setMatrixAt(i, d.matrix);
        col.setRGB(0.39 - g * 0.2, 0.31 + g * 0.15, 0.13 - g * 0.02);
        leaves.setColorAt(i, col);
      });
      leaves.instanceMatrix.needsUpdate = true;
      leaves.instanceColor!.needsUpdate = true;
      rings.forEach((r, i) => {
        r.visible = i === run.index;
        r.material.opacity = 0.65 + Math.sin(performance.now() * 0.0015) * 0.1;
        r.material.color.set(run.complete ? 0xbad780 : 0xf5d094);
      });
    },
  };
}
