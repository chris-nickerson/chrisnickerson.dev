import { Vector3 } from "three";

export const inletSun = new Vector3(-0.14, 0.17, -1).normalize();

export const inletMoon = new Vector3(-0.065, 0.245, -1).normalize();

export const stormOpening = `
float sunlightAt(vec3 point, vec3 sun, float time) {
  vec2 ground = point.xz - point.y * sun.xz / sun.y;
  float edge = ground.x - .27 * ground.y - 630.
             + 270. * sin(ground.y * .00064 + time * .0018);
  float opening = 1. - smoothstep(240., 1420., abs(edge));
  float fringe = 1. - smoothstep(80., 410., abs(edge + 1620.));
  return min(1., opening + .48 * fringe);
}
`;
