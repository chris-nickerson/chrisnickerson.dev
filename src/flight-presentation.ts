import { Quaternion, Vector3, MathUtils } from "three";
interface Pose {
  position: Vector3;
  quaternion: Quaternion;
  heading: number;
  bank: number;
  pitch: number;
}
/** One fixed tick of visual latency keeps arbitrary display rates smooth without extrapolating contact. */
export class FlightPresentation implements Pose {
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  heading = 0;
  bank = 0;
  pitch = 0;
  private readonly previousPosition = new Vector3();
  private readonly previousQuaternion = new Quaternion();
  private previousHeading = 0;
  private previousBank = 0;
  private previousPitch = 0;
  beforeStep(pose: Pose) {
    this.previousPosition.copy(pose.position);
    this.previousQuaternion.copy(pose.quaternion);
    this.previousHeading = pose.heading;
    this.previousBank = pose.bank;
    this.previousPitch = pose.pitch;
  }
  reset(pose: Pose) {
    this.beforeStep(pose);
    this.sample(pose, 1);
  }
  sample(pose: Pose, alpha: number) {
    const t = MathUtils.clamp(alpha, 0, 1);
    this.position.lerpVectors(this.previousPosition, pose.position, t);
    this.quaternion.slerpQuaternions(
      this.previousQuaternion,
      pose.quaternion,
      t,
    );
    const turn = Math.atan2(
      Math.sin(pose.heading - this.previousHeading),
      Math.cos(pose.heading - this.previousHeading),
    );
    this.heading = this.previousHeading + turn * t;
    this.bank = MathUtils.lerp(this.previousBank, pose.bank, t);
    this.pitch = MathUtils.lerp(this.previousPitch, pose.pitch, t);
  }
}
