import * as T from "three";
import { buoyancy } from "./float-contact";
import { clamp } from "./terrain";
import type { Flight } from "./flight";
import { places, type PlaceId } from "./places";

export type ArrivalEntry = "fly-in" | "quick";

/** Guided six-degree glideslope, flare, and a spring/damper float-water contact model. */
export class Arrival {
  readonly place: PlaceId;
  readonly target: T.Vector3;
  stage: "approach" | "water" | "moored" = "approach";
  elapsed = 0;
  constructor(id: PlaceId, flight: Flight, entry: ArrivalEntry) {
    const quick = entry === "quick";
    this.place = id;
    this.target = places[id].berth.clone();
    flight.onWater = quick;
    flight.throttle = quick ? 0 : 0.35;
    flight.takingOff = false;
    flight.assisted = true;
    flight.heading = 0;
    flight.bank = 0;
    flight.pitch = 0;
    flight.quaternion.identity();
    flight.position
      .copy(this.target)
      // Begin on short final: keep the flare, skip the long transit.
      .add(new T.Vector3(0, quick ? 4 : 15, quick ? 25 : 190));
    flight.velocity.set(0, quick ? 0 : -3, quick ? -5 : -30);
    flight.speed = flight.velocity.length();
    if (quick) this.stage = "water";
  }
  step(dt: number, f: Flight) {
    this.elapsed += dt;
    f.sampleWind();
    f.elapsed += dt;
    const remaining = f.position.z - this.target.z;
    if (this.stage === "approach") {
      const desiredSpeed = clamp(20 + remaining * 0.032, 23, 40),
        airspeed = Math.max(1, -f.velocity.z);
      const glideY = this.target.y + Math.max(0, remaining - 100) * 0.115;
      const desiredVY = clamp((glideY - f.position.y) * 0.75, -7.5, 2);
      // Closed-loop thrust/trim guidance, with acceleration-limited flare near the surface.
      f.velocity.z += clamp(-(desiredSpeed - airspeed) * 1.6, -3, 3) * dt;
      f.velocity.y += clamp((desiredVY - f.velocity.y) * 2.0, -2.0, 2.5) * dt;
      f.velocity.x +=
        clamp(
          (this.target.x - f.position.x) * 0.4 - f.velocity.x * 1.5,
          -4,
          4,
        ) * dt;
      f.pitch =
        remaining < 155
          ? Math.max(0.04, -f.velocity.y * 0.012)
          : Math.atan2(f.velocity.y, airspeed);
      f.position.addScaledVector(f.velocity, dt);
      if (f.position.y <= this.target.y + 0.6 && remaining < 150) {
        this.stage = "water";
        f.onWater = true;
        f.throttle = 0;
        f.velocity.y = Math.max(-2, f.velocity.y);
      }
    } else {
      buoyancy(f.position, f.velocity, this.elapsed, dt, f.exposure);
      const goalZ = this.target.z;
      const desiredSpeed = -clamp((f.position.z - goalZ) * 0.13, -2, 5);
      f.velocity.z += (desiredSpeed - f.velocity.z) * Math.min(1, dt * 0.8);
      f.velocity.x *= Math.exp(-dt * 2);
      f.position.addScaledVector(f.velocity, dt);
      f.pitch +=
        (Math.sin(this.elapsed * 0.9) * 0.006 - f.pitch) *
        Math.min(1, dt * 1.2);
      if (Math.abs(f.position.z - goalZ) < 2 && Math.abs(f.velocity.z) < 0.5)
        this.stage = "moored";
    }
    f.speed = f.velocity.length();
    f.quaternion.setFromEuler(new T.Euler(f.pitch, 0, 0, "YXZ"));
    f.distance += f.speed * dt;
  }
}
