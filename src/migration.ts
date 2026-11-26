import { Vector3, CatmullRomCurve3, Sphere } from "three";
import { SwanWakes } from "./swan-wakes";
import { SwanFlock } from "./swan";
import { seededRandom, smoothstep, terrainHeight } from "./terrain";
import type { ValleyWind } from "./valley-wind";

// World-space flight corridors. Arc length gives each family a cruising speed
// independent of the aircraft, camera, frame rate and distance between knots.
const crossing = [
  [-210, 118, 2420],
  [-58, 132, 2345],
  [20, 126, 2230],
  [-22, 87, 2045],
  [-104, 53, 1880],
  [-133, 26, 1650],
  [-118, 8, 1460],
  [-144, 1.3, 1340],
];
// Each departure uses a different reach of the same terrain.
const routes = [
  { kind: "cove", start: [30, 108, 2750], points: crossing },
  {
    kind: "slope",
    start: [1260, 125, 2650],
    points: [
      [1480, 104, 2270],
      [1350, 132, 2200],
      [1280, 144, 2110],
      [1320, 153, 2010],
      [1535, 163, 1910],
      [1680, 165, 1820],
      [1770, 208, 1560],
      [1840, 240, 1250],
      [1920, 295, 820],
      [1860, 325, 390],
      [1830, 360, -150],
      [1770, 530, -820],
      [1440, 580, -1700],
      [980, 650, -3100],
      [1050, 760, -5200],
      [1200, 800, -8000],
    ],
  },
  {
    kind: "island",
    start: [-672, 100, 90],
    points: [
      [-915, 106, -243],
      [-754, 123, -310],
      [-666, 121, -388],
      [-724, 96, -502],
      [-833, 83, -653],
      [-991, 75, -815],
      [-1090, 56, -1010],
      [-1150, 43, -1300],
      [-1210, 38, -1610],
      [-1220, 48, -1870],
      [-1150, 64, -2200],
      [-950, 83, -2650],
      [-1020, 109, -3400],
      [-1380, 160, -4250],
      [-1530, 180, -5750],
      [-1550, 220, -8200],
    ],
  },
];
export const inletRoute = (seed: number) => routes[seed % routes.length];
const speed = 24;
export class Migration {
  readonly birds: SwanFlock;
  readonly wakes?: SwanWakes;

  readonly kind: string;
  private readonly members;
  private readonly spine: Vector3[] = [];
  private readonly spacing: number;
  readonly caller = new Vector3();
  private readonly pos = new Vector3();
  private readonly front = new Vector3();
  private readonly tangent = new Vector3();
  constructor(
    readonly wind: ValleyWind,
    low: boolean,
  ) {
    const random = seededRandom(wind.seed);
    const route = inletRoute(wind.seed);
    this.kind = route.kind;
    const points = route.points.map(([x, y, z]) => new Vector3(x, y, z));
    const curve = new CatmullRomCurve3(points);
    curve.arcLengthDivisions = Math.ceil(
      curve.points.reduce(
        (total, p, i, list) => total + (i ? p.distanceTo(list[i - 1]) : 0),
        0,
      ) / 4,
    );
    // Cache an evenly spaced spine, including clearance for the width of the
    // formation. Render frames interpolate samples without probing the terrain.
    const length = curve.getLength();
    const count = Math.ceil(length / 8);
    this.spacing = length / count;
    for (let j = 0; j <= count; j++) {
      const p = curve.getPointAt(j / count);
      if (this.kind !== "cove") {
        const ground = Math.max(
          ...[-50, 0, 50].flatMap((dx) =>
            [-44, 0, 44].map((dz) => terrainHeight(p.x + dx, p.z + dz)),
          ),
        );
        p.y = Math.max(p.y, ground + 46);
      }
      this.spine.push(p);
    }
    // Start climbing before the steepest part of a distant ridge. A broad
    // envelope avoids pitching the formation at every little terrain ripple.
    if (this.kind !== "cove") {
      for (let j = count - 1; j >= 0; j--)
        this.spine[j].y = Math.max(
          this.spine[j].y,
          this.spine[j + 1].y - this.spacing * 0.28,
        );
      for (let j = 1; j <= count; j++)
        this.spine[j].y = Math.max(
          this.spine[j].y,
          this.spine[j - 1].y - this.spacing * 0.28,
        );
    }
    this.members = Array.from({ length: low ? 13 : 16 }, (_, i) => {
      // Two loose families travel at different times. Young grey birds stay in pairs.
      const family = i < 8 ? 0 : 1;
      const rank = i % 8;
      return {
        delay: family * 7 + Math.floor((rank + 1) / 2) * 0.57 + random() * 0.3,
        side:
          (rank % 2 ? 1 : -1) *
          (Math.ceil(rank / 2) * 12 + (random() - 0.5) * 1.5),
        high: random() * 5,
        phase: random() * Math.PI * 2,
        rate: 1.66 + random() * 0.25,
        size: 0.94 + random() * 0.16,
        grey: rank === 4 || rank === 5 ? 0.7 + random() * 0.3 : random() * 0.1,
      };
    });
    if (this.kind === "cove") this.wakes = new SwanWakes(this.members.length);
    this.birds = new SwanFlock(this.members.length);
    this.birds.mesh.boundingSphere = new Sphere();
    this.birds.mesh.frustumCulled = true;
  }
  update(time: number) {
    const last = this.spine.length - 1;
    const length = last * this.spacing;
    const settling = this.kind === "cove";
    const bounds = this.birds.mesh.boundingSphere!;
    let radiusSq = 0;
    let onSurface = false;
    for (const [i, m] of this.members.entries()) {
      const age = time + 4 - m.delay;
      const distance = age * speed;
      // Ease out over the last 90 units, then paddle slowly in the cove.
      const braking = length - 90;
      const run =
        settling && distance > braking
          ? braking + 90 * (1 - Math.exp(-(distance - braking) / 90))
          : distance;
      const sample = Math.max(0, Math.min(last, run / this.spacing));
      const index = Math.min(last - 1, Math.floor(sample));
      this.pos.lerpVectors(
        this.spine[index],
        this.spine[index + 1],
        sample - index,
      );
      this.tangent
        .subVectors(
          this.spine[Math.min(last, index + 2)],
          this.spine[Math.max(0, index - 1)],
        )
        .normalize();
      this.front
        .subVectors(this.spine[Math.min(last, index + 4)], this.spine[index])
        .normalize();
      if (distance < 0) this.pos.addScaledVector(this.tangent, distance);
      if (!settling && distance > length)
        this.pos.addScaledVector(this.tangent, distance - length);
      if (distance > length && !settling)
        this.pos.y = Math.max(this.pos.y, this.spine[last].y);
      const folded = settling ? smoothstep(length - 38, length - 6, run) : 0;
      const paddle = Math.max(0, (distance - length) / speed);
      const course = Math.atan2(this.tangent.x, -this.tangent.z);
      const swimPhase = paddle * 0.07 + m.phase;
      const turnAfloat =
        Math.atan2(Math.cos(swimPhase), Math.sin(swimPhase)) - course;
      const heading =
        course +
        folded * Math.atan2(Math.sin(turnAfloat), Math.cos(turnAfloat));
      const split = settling
        ? smoothstep(420, 980, run) * (i < 8 ? -10 : 67)
        : 0;
      const spacing =
        m.side + split + (1 - folded) * 2 * Math.sin(age * 0.28 + m.phase);
      this.pos.x +=
        Math.cos(course) * spacing + folded * 2.5 * Math.sin(swimPhase);
      this.pos.z +=
        Math.sin(course) * spacing +
        (settling
          ? smoothstep(530, 1100, run) * (i < 8 ? 155 : 0) +
            smoothstep(800, length - 60, run) * m.delay * 3.3
          : 0) +
        folded * 2.5 * Math.cos(swimPhase);
      const lift = this.wind.lift(this.pos.x, this.pos.y, this.pos.z);
      const beat = age * m.rate * Math.PI * 2 + m.phase;
      const glide = smoothstep(
        0.42,
        0.87,
        Math.sin(age * 0.69 + m.phase * 0.6) + lift * 0.23,
      );
      this.pos.y +=
        (1 - folded) * (m.high + Math.sin(beat) * 0.4 + lift * 2) -
        folded * 0.6;
      const turn = Math.atan2(
        this.tangent.z * this.front.x - this.tangent.x * this.front.z,
        this.tangent.dot(this.front),
      );
      this.birds.setBird(
        i,
        this.pos,
        heading,
        Math.max(-0.48, Math.min(0.48, turn * 3)),
        Math.asin(this.tangent.y) * (1 - folded),
        beat,
        1 - glide,
        folded,
        m.size,
        m.grey,
      );
      if (this.wakes) {
        const contact = 1 - smoothstep(0.95, 2.1, this.pos.y);
        const skim = Math.min(1, (length - run) / 30);
        this.wakes.set(i, this.pos, heading, contact, skim);
        onSurface ||= contact > 0;
      }
      if (!i) bounds.center.copy(this.pos);
      radiusSq = Math.max(radiusSq, bounds.center.distanceToSquared(this.pos));
      if (i === 8) this.caller.copy(this.pos);
    }
    bounds.radius = Math.sqrt(radiusSq) + 9;
    this.birds.commit();
    this.wakes?.commit(onSurface);
  }
}
