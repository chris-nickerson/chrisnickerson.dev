import * as T from "three";
import type { Flight } from "./flight";
/** A bounded surface-only spray buffer. This never adds water to the irrigation solver. */
export class SurfaceSpray {
  private positions = new Float32Array(420 * 3);
  private velocities = new Float32Array(420 * 3);
  private life = new Float32Array(420);
  private cursor = 0;
  private clock = 0;
  private wasWet = false;
  readonly mesh: T.Points;
  constructor(scene: T.Scene) {
    this.positions.fill(-10000);
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(this.positions, 3));
    this.mesh = new T.Points(
      g,
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader:
          "varying float vFade;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(280./(-p.z),1.,5.);vFade=clamp(1.-(-p.z)/550.,0.,1.);gl_Position=projectionMatrix*p;}",
        fragmentShader:
          "varying float vFade;void main(){float a=1.-smoothstep(.05,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(.82,.91,.88,a*.5*vFade);}",
      }),
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(dt: number, f: Flight, wet: boolean) {
    if (wet && !this.wasWet) this.clock += 100;
    this.wasWet = wet;
    if (wet && f.speed > 2) this.clock += dt * Math.min(110, f.speed * 4);
    const c = Math.cos(f.heading),
      s = Math.sin(f.heading);
    while (this.clock >= 1) {
      this.clock--;
      const i = this.cursor++ % 420,
        j = i * 3,
        side = Math.random() > 0.5 ? 1 : -1;
      this.positions[j] = f.position.x + side * c * 4.3;
      this.positions[j + 1] = 0.6;
      this.positions[j + 2] = f.position.z + side * s * 4.3;
      this.velocities[j] =
        f.velocity.x * 0.35 + side * c * (2 + Math.random() * 4);
      this.velocities[j + 1] =
        1 + Math.random() * Math.min(9, 2 + f.speed * 0.18);
      this.velocities[j + 2] =
        f.velocity.z * 0.35 + side * s * (2 + Math.random() * 4);
      this.life[i] = 1.1;
    }
    for (let i = 0; i < 420; i++)
      if (this.life[i] > 0) {
        const j = i * 3;
        this.life[i] -= dt;
        this.velocities[j + 1] -= 9.81 * dt;
        for (let k = 0; k < 3; k++)
          this.positions[j + k] += this.velocities[j + k] * dt;
        if (this.positions[j + 1] < 0 || this.life[i] <= 0) {
          this.life[i] = 0;
          this.positions[j + 1] = -10000;
        }
      }
    this.mesh.geometry.getAttribute("position").needsUpdate = true;
  }
}
