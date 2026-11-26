import type { Vector3 } from "three";
/** Float displacement and damped heave, shared by guided and manual landings. */
export const FLOAT_HEIGHT = 6.6;
export function buoyancy(
  position: Vector3,
  velocity: Vector3,
  time: number,
  dt: number,
  exposure = 0.2,
) {
  const surface =
    FLOAT_HEIGHT +
    (0.025 + exposure * 0.32) * Math.sin(time * 1.7 + position.x * 0.06);
  velocity.y += ((surface - position.y) * 8 - velocity.y * 4) * dt;
  // A forgiving deep-impact limit prevents tunnelling and violent rebound.
  if (position.y < FLOAT_HEIGHT - 1.1) {
    position.y = FLOAT_HEIGHT - 1.1;
    velocity.y = Math.max(0, velocity.y);
  }
}
