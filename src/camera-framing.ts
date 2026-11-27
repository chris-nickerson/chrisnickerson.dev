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

  constructor(private readonly camera: PerspectiveCamera) {}

  arrival(
    position: Vector3,
    {
      arrival,
      landmark,
      orbit,
      tilt,
      ease,
    }: {
      arrival: Arrival;
      landmark: Vector3;
      orbit: number;
      tilt: number;
      ease: number;
    },
  ) {
    const { eye, aim } = this;
    const portrait = this.camera.aspect < 0.8;
    if (arrival.stage === "approach") {
      eye.set(portrait ? -12 : -63, portrait ? 35 : 27, portrait ? 190 : 105);
      aim.set(0, portrait ? 6 : 2, portrait ? -90 : -150);
    } else {
      const place = places[arrival.place];
      const waterSide = Math.sign(place.berth.x - place.x);
      eye.set(
        waterSide * (portrait ? 133 : 79),
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
    this.apply(ease);
  }

  follow(
    position: Vector3,
    {
      heading,
      assisted,
      tilt,
      surfaceMix,
      mapMix,
      rainRunActive,
      height,
      ease,
    }: {
      heading: number;
      assisted?: boolean;
      tilt: number;
      surfaceMix: number;
      mapMix: number;
      rainRunActive: boolean;
      height: number;
      ease: number;
    },
  ) {
    const { eye, aim, offset } = this;
    const portrait = this.camera.aspect < 0.8;
    const scenic = !portrait && height >= 700 && assisted && !rainRunActive;
    if (scenic) eye.set(-46, 15 + tilt * 120, 110);
    else
      eye.set(
        portrait ? -12 : -66,
        (rainRunActive ? 100 : 34) + tilt * 120,
        portrait ? (rainRunActive ? 220 : 180) : rainRunActive ? 150 : 120,
      );
    eye.lerp(
      offset.set(portrait ? -10 : -52, 38 + tilt * 100, portrait ? 185 : 125),
      surfaceMix,
    );
    eye.applyAxisAngle(vertical, -heading).add(position);
    eye.y = Math.max(eye.y, terrainHeight(eye.x, eye.z) + 25);
    if (scenic) aim.set(15, 28, -180);
    else
      aim.set(
        portrait && !rainRunActive ? -12 * (1 - surfaceMix) : 0,
        rainRunActive ? -80 : portrait ? (height < 700 ? -110 : -45) : 10,
        -180,
      );
    aim.lerp(
      offset.set(0, 6, -35),
      Math.max(surfaceMix, clamp((tilt - 0.12) / 0.35, 0, 1)),
    );
    aim.applyAxisAngle(vertical, -heading).add(position);
    eye.lerp(offset.set(position.x + 1100, 3600, position.z + 2300), mapMix);
    aim.lerp(offset.set(position.x + 300, 0, position.z - 200), mapMix);
    this.apply(ease);
  }

  private apply(ease: number) {
    this.camera.position.lerp(this.eye, ease);
    this.target.lerp(this.aim, ease);
    this.camera.lookAt(this.target);
  }
}
