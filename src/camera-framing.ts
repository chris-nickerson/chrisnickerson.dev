import { PerspectiveCamera, Vector3 } from "three";
import { clamp, terrainHeight } from "./terrain";
import type { Arrival } from "./arrival";
import { places } from "./places";

const vertical = new Vector3(0, 1, 0);

export class CameraFraming {
  private readonly eye = new Vector3();
  private readonly aim = new Vector3();
  private readonly target = new Vector3();
  private readonly offset = new Vector3();

  arrival(
    camera: PerspectiveCamera,
    position: Vector3,
    arrival: Arrival,
    landmark: Vector3,
    orbit: number,
    tilt: number,
    ease: number,
  ) {
    const { eye, aim } = this;
    const portrait = camera.aspect < 0.8;
    if (arrival.stage === "approach") {
      eye.set(portrait ? -12 : -63, portrait ? 35 : 27, portrait ? 190 : 105);
      aim.set(0, portrait ? 6 : 2, portrait ? -90 : -150);
    } else {
      const place = places[arrival.place];
      const side = Math.sign(place.x - place.berth.x);
      eye.set(
        -side * (portrait ? 133 : 79),
        portrait ? 43 : 29,
        portrait ? 55 : 89,
      );
      aim
        .copy(landmark)
        .sub(position)
        .multiplyScalar(portrait ? 0.42 : 0.34);
      aim.y += portrait ? -5 : 9;
    }
    eye.applyAxisAngle(vertical, orbit).add(position);
    eye.y = Math.max(eye.y + tilt * 90, terrainHeight(eye.x, eye.z) + 10);
    aim.applyAxisAngle(vertical, orbit).add(position);
    this.apply(camera, ease);
  }

  follow(
    camera: PerspectiveCamera,
    position: Vector3,
    angle: number,
    tilt: number,
    surface: number,
    map: number,
    tending: boolean,
    height: number,
    ease: number,
  ) {
    const { eye, aim, offset } = this;
    const portrait = camera.aspect < 0.8;
    eye.set(
      portrait ? -12 : -66,
      (tending ? 100 : 34) + tilt * 120,
      portrait ? (tending ? 220 : 180) : tending ? 150 : 120,
    );
    eye.lerp(
      offset.set(portrait ? -10 : -52, 38 + tilt * 100, portrait ? 185 : 125),
      surface,
    );
    eye.applyAxisAngle(vertical, -angle).add(position);
    eye.y = Math.max(eye.y, terrainHeight(eye.x, eye.z) + 25);
    aim.set(
      portrait && !tending ? -12 * (1 - surface) : 0,
      tending ? -80 : portrait ? (height < 700 ? -110 : -45) : 10,
      -180,
    );
    aim.lerp(
      offset.set(0, 6, -35),
      Math.max(surface, clamp((tilt - 0.12) / 0.35, 0, 1)),
    );
    aim.applyAxisAngle(vertical, -angle).add(position);
    eye.lerp(offset.set(position.x + 1100, 3600, position.z + 2300), map);
    aim.lerp(offset.set(position.x + 300, 0, position.z - 200), map);
    this.apply(camera, ease);
  }

  private apply(camera: PerspectiveCamera, ease: number) {
    camera.position.lerp(this.eye, ease);
    this.target.lerp(this.aim, ease);
    camera.lookAt(this.target);
  }
}
