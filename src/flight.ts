import { Vector3, Quaternion, Euler } from "three";
import type { ValleyWind } from "./valley-wind";
import { FLOAT_HEIGHT, buoyancy } from "./float-contact";
import { clamp, riverCenter, terrainHeight } from "./terrain";
export interface FlightInput {
  roll: number;
  pitch: number;
  throttle: number;
}
const UP = new Vector3(0, 1, 0);
/** Above this power the floats plane. `setThrottle` below it abandons a takeoff run. */
const PLANING_POWER = 0.7;
// Sea level is height 0, so terrain below it measures water depth.
const LANDING_DEPTH = 0.7;
const TAXI_DEPTH = 0.4;
export class Flight {
  position = new Vector3(-900, 1080, 3400);
  velocity = new Vector3(0, 0, -53);
  quaternion = new Quaternion();
  heading = 0;
  bank = 0;
  pitch = 0;
  speed = 53;
  throttle = 0.65;
  distance = 0;
  elapsed = 0;
  onWater = false;
  waterTime = 0;
  landingCount = 0;
  touchdownSink = 0;
  touchdownSpeed = 0;
  takingOff = false;
  shoreBlocked = false;
  private takeoffTrim = 0;
  private routeIndex = -1;
  private route = Array.from({ length: 240 }, (_, i) => {
    const t = (i / 240) * Math.PI * 2,
      z = Math.cos(t) * 4000;
    return new Vector3(riverCenter(z) - 850 - Math.sin(t) * 450, 0, z);
  });
  assisted = true;
  lastRecovery = -100;
  wind = new Vector3();
  private forward = new Vector3();
  private lift = new Vector3();
  private force = new Vector3();
  private euler = new Euler(0, 0, 0, "YXZ");
  valley?: ValleyWind;
  exposure = 0.2;
  risingAir = 0;
  private inletStart?: number;
  private inletAltitude = 108;
  enterInlet(start = [30, 108, 2750]) {
    this.reset();
    this.position.set(start[0], start[1], start[2]);
    this.inletAltitude = start[1];
    this.inletStart = this.elapsed;
  }
  enterManualApproach(berth: Vector3, shoreX: number) {
    this.reset();
    this.assisted = false;
    this.throttle = 0.42;
    const offshoreOffsetX = Math.sign(berth.x - shoreX) * 130;
    this.position.set(berth.x + offshoreOffsetX, berth.y + 78, berth.z + 710);
    this.velocity.set(0, -3, -40);
    this.speed = 40;
    this.pitch = -0.07;
    this.quaternion.setFromEuler(this.euler.set(this.pitch, 0, 0));
  }
  sampleWind() {
    if (!this.valley) return;
    const { x, y, z } = this.position;
    this.exposure = this.valley.exposure(x, z);
    this.risingAir = this.valley.lift(x, y, z);
    const speed = this.valley.speed * (0.25 + this.exposure * 0.75);
    this.wind.set(
      this.valley.east * speed,
      this.risingAir,
      this.valley.south * speed,
    );
  }
  step(dt: number, input: FlightInput) {
    this.elapsed += dt;
    if (this.valley) this.sampleWind();
    else
      this.wind.set(
        Math.sin(this.elapsed * 0.071) * 2.2,
        Math.sin(this.elapsed * 0.19) * 0.45,
        Math.cos(this.elapsed * 0.09) * 1.3,
      );
    this.throttle = clamp(this.throttle + input.throttle * dt * 0.23, 0, 1);
    if (this.onWater) {
      this.stepWater(dt, input);
      return;
    }
    let roll = input.roll,
      pitch = input.pitch;
    if (this.takeoffTrim > 0) {
      this.takeoffTrim -= dt;
      if (input.pitch < -0.2) this.takeoffTrim = 0;
      else pitch = Math.max(pitch, 0.45);
    }
    if (this.assisted) {
      if (this.routeIndex < 0) {
        let best = Infinity;
        this.route.forEach((p, i) => {
          const d = (p.x - this.position.x) ** 2 + (p.z - this.position.z) ** 2;
          if (d < best) {
            best = d;
            this.routeIndex = i;
          }
        });
      }
      let best = Infinity,
        nextIndex = this.routeIndex;
      for (let j = -3; j <= 5; j++) {
        const i = (this.routeIndex + j + 240) % 240,
          p = this.route[i],
          d = (p.x - this.position.x) ** 2 + (p.z - this.position.z) ** 2;
        if (d < best) {
          best = d;
          nextIndex = i;
        }
      }
      this.routeIndex = nextIndex;
      const target = this.route[(this.routeIndex + 8) % 240];
      const opening =
        this.inletStart !== undefined && this.elapsed - this.inletStart < 31;
      const desired = opening
        ? 0.025
        : Math.atan2(target.x - this.position.x, this.position.z - target.z);
      let error = desired - this.heading;
      error = Math.atan2(Math.sin(error), Math.cos(error));
      roll = clamp(error * 1.7, -0.8, 0.8);
      const ahead = terrainHeight(
        this.position.x + Math.sin(this.heading) * 350,
        this.position.z - Math.cos(this.heading) * 350,
      );
      const altitude =
        (opening
          ? Math.max(this.inletAltitude, ahead + 45)
          : Math.max(920, ahead + 300)) +
        Math.sin(this.elapsed * 0.035) * 32;
      pitch = clamp(
        (altitude - this.position.y) * 0.003 - this.velocity.y * 0.035,
        -0.35,
        0.4,
      );
    }

    this.bank += (-roll * 0.82 - this.bank) * Math.min(1, dt * 2.6);
    this.pitch += (pitch * 0.28 - this.pitch) * Math.min(1, dt * 1.6);
    const airspeed = Math.max(
      18,
      this.velocity.clone().sub(this.wind).length(),
    );
    // Coordinated turn: centripetal acceleration from the banked lift vector.
    this.heading += ((-Math.tan(this.bank) * 9.81) / airspeed) * dt;
    this.euler.set(this.pitch, -this.heading, this.bank);
    this.quaternion.setFromEuler(this.euler);
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    this.lift.copy(UP).applyQuaternion(this.quaternion);
    const liftAcceleration =
      9.81 *
      ((airspeed * airspeed) / (53 * 53)) *
      clamp(1 + this.pitch * 1.3, 0.45, 1.5);
    this.force.copy(this.forward).multiplyScalar(this.throttle * 11.0);
    this.force.addScaledVector(this.velocity, -0.00255 * airspeed);
    this.force.addScaledVector(this.lift, liftAcceleration);
    this.force.y -= 9.81;
    // Rudder coordination and an accessible pitch response, not six-DOF CFD.
    const desiredV = this.forward.clone().multiplyScalar(airspeed);
    this.force.x += (desiredV.x - this.velocity.x) * 0.75;
    this.force.z += (desiredV.z - this.velocity.z) * 0.75;
    this.force.y += (this.forward.y * airspeed - this.velocity.y) * 0.6;
    this.velocity.addScaledVector(this.force, dt);
    this.velocity.y = clamp(this.velocity.y, -35, 35);
    this.position
      .addScaledVector(this.velocity, dt)
      .addScaledVector(this.wind, dt);
    const ground = terrainHeight(this.position.x, this.position.z);
    // Only a pilot lands. Automatic flight holds the floor below, even over water.
    if (!this.assisted && this.floatsReachWater(ground)) this.touchDown();
    else if (ground >= -LANDING_DEPTH || this.assisted) {
      const floor = Math.max(12, ground + 20);
      if (this.position.y < floor) {
        this.position.y = floor;
        this.velocity.y = Math.max(8, this.velocity.y);
        this.lastRecovery = this.elapsed;
      }
    }
    this.position.y = Math.min(2700, this.position.y);
    if (Math.abs(this.position.x) > 6800 || Math.abs(this.position.z) > 6800)
      this.reset();
    this.speed = this.velocity.length();
    this.distance += this.speed * dt;
  }
  private floatsReachWater(ground: number) {
    // The floats sit 4.3 m either side of the centreline, so a banked or
    // pitched aircraft touches before its centre comes down to float height.
    const contactHeight =
      FLOAT_HEIGHT +
      Math.abs(Math.sin(this.bank)) * 4.3 +
      Math.abs(Math.sin(this.pitch)) * 5.5;
    return (
      ground < -LANDING_DEPTH &&
      this.position.y <= contactHeight &&
      // liftOff leaves the water climbing at 3 m/s. A climbing aircraft is not recaptured.
      this.velocity.y < 1
    );
  }
  private touchDown() {
    this.onWater = true;
    this.waterTime = 0;
    this.landingCount++;
    this.touchdownSink = Math.max(0, -this.velocity.y);
    this.touchdownSpeed = this.speed;
    this.velocity.y = Math.max(-2, this.velocity.y);
    this.position.y = Math.max(FLOAT_HEIGHT - 0.8, this.position.y);
    this.throttle = 0; // Idle on contact, then let the pilot taxi or power up.
    this.takingOff = false;
  }
  private liftOff() {
    this.onWater = false;
    // A requested takeoff holds the nose up for the climb-out.
    this.takeoffTrim = this.takingOff ? 7 : 0;
    this.takingOff = false;
    this.velocity.y = 3;
    this.pitch = 0.16;
    this.position.y = FLOAT_HEIGHT + 0.8;
  }
  requestTakeoff() {
    if (!this.onWater) return;
    this.takingOff = true;
    this.throttle = 1;
  }
  setThrottle(throttle: number) {
    this.throttle = throttle;
    if (throttle < PLANING_POWER) this.takingOff = false;
  }
  private stepWater(dt: number, input: FlightInput) {
    this.waterTime += dt;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    // The same stick becomes a water rudder; bank and pitch settle onto the floats.
    this.heading += input.roll * (0.12 + Math.min(speed, 18) * 0.014) * dt;
    const dx = Math.sin(this.heading),
      dz = -Math.cos(this.heading);
    const lateral =
      this.velocity.x * Math.cos(this.heading) +
      this.velocity.z * Math.sin(this.heading);
    const planing = this.throttle > PLANING_POWER;
    const drag = planing ? 0.025 + speed * 0.0026 : 0.1 + speed * 0.007;
    this.velocity.x +=
      (dx * this.throttle * 11 -
        this.velocity.x * drag -
        lateral * Math.cos(this.heading) * 1.5) *
      dt;
    this.velocity.z +=
      (dz * this.throttle * 11 -
        this.velocity.z * drag -
        lateral * Math.sin(this.heading) * 1.5) *
      dt;
    buoyancy(this.position, this.velocity, this.elapsed, dt, this.exposure);
    const nx = this.position.x + this.velocity.x * dt,
      nz = this.position.z + this.velocity.z * dt;
    this.shoreBlocked = [
      [0, 0],
      [dx * 10, dz * 10],
      [Math.cos(this.heading) * 5, Math.sin(this.heading) * 5],
      [-Math.cos(this.heading) * 5, -Math.sin(this.heading) * 5],
    ].some(([x, z]) => terrainHeight(nx + x, nz + z) > -TAXI_DEPTH);
    if (this.shoreBlocked) {
      this.velocity.x *= Math.exp(-dt * 14);
      this.velocity.z *= Math.exp(-dt * 14);
    } else {
      this.position.x = nx;
      this.position.z = nz;
    }
    this.position.y += this.velocity.y * dt;
    this.bank +=
      (Math.sin(this.elapsed * 1.28 + this.position.z * 0.04) *
        (0.002 + this.exposure * 0.023) -
        this.bank) *
      Math.min(1, dt * 3);
    const rotate =
      (this.takingOff || input.pitch > 0.25) && this.throttle > 0.72;
    const trim =
      rotate && speed > 26
        ? 0.1
        : Math.sin(this.elapsed * 0.9) * 0.006 +
          Math.min(speed / 50, 1) * 0.025;
    this.pitch += (trim - this.pitch) * Math.min(1, dt * 2);
    if (rotate && speed > 39 && !this.shoreBlocked) this.liftOff();
    this.euler.set(this.pitch, -this.heading, this.bank);
    this.quaternion.setFromEuler(this.euler);
    this.speed = this.velocity.length();
    this.distance += this.speed * dt;
  }
  reset() {
    this.inletStart = undefined;
    this.onWater = false;
    this.waterTime = 0;
    this.takingOff = false;
    this.shoreBlocked = false;
    this.takeoffTrim = 0;
    this.routeIndex = -1;
    this.position.set(-900, 1080, 3400);
    this.velocity.set(0, 0, -53);
    this.speed = 53;
    this.quaternion.identity();
    this.heading = 0;
    this.bank = 0;
    this.pitch = 0;
    this.throttle = 0.65;
    this.assisted = true;
  }
}
