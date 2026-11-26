import * as T from "three";
import type { Flight } from "./flight";
import { terrainHeight } from "./terrain";

// The falling drops and the aiming mark share these numbers. A test holds the
// mark to where the drops land.
const NOZZLE = { y: -2.2, z: 3 };
const CARRIED_VELOCITY = 0.65;
const SINK = 5;
const SINK_SPREAD = 3;
const WIND_DRAG = 0.15;
const GRAVITY = 9.81;
const DROPS = 2800;
const DROPS_PER_SECOND = 230;
const HIDDEN = -100000;

const surface = (x: number, z: number) => Math.max(0, terrainHeight(x, z));

/** Where water released now would land. Places the aiming mark two metres above that point. */
export function predictWaterImpact(
  position: T.Vector3,
  velocity: T.Vector3,
  wind: T.Vector3,
) {
  const p = position.clone();
  p.y += NOZZLE.y;
  p.z += NOZZLE.z;
  const v = velocity.clone().multiplyScalar(CARRIED_VELOCITY);
  v.y = -(SINK + SINK_SPREAD / 2);
  const dt = 1 / 30;
  for (let i = 0; i < 600; i++) {
    v.x += (wind.x - v.x) * WIND_DRAG * dt;
    v.z += (wind.z - v.z) * WIND_DRAG * dt;
    v.y -= GRAVITY * dt;
    p.addScaledVector(v, dt);
    const ground = surface(p.x, p.z);
    if (p.y <= ground) {
      p.y = ground + 2;
      return p;
    }
  }
  return p;
}

/** A bounded buffer of ballistic drops. A drop that reaches the ground or the sea reports where. */
export class WaterRelease {
  private positions = new Float32Array(DROPS * 3).fill(HIDDEN);
  private velocities = new Float32Array(DROPS * 3);
  private life = new Float32Array(DROPS);
  private cursor = 0;
  private emission = 0;
  readonly mesh: T.Points;
  constructor(
    scene: T.Scene,
    private onImpact: (x: number, z: number) => void,
  ) {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(this.positions, 3));
    this.mesh = new T.Points(
      g,
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: `varying float vFade;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(280./(-p.z),.65,2.5);vFade=1.-smoothstep(220.,750.,-p.z);gl_Position=projectionMatrix*p;}`,
        fragmentShader: `varying float vFade;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(.83,.94,.91,(1.-smoothstep(.05,.5,d))*.25*vFade);}`,
      }),
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  emit(dt: number, f: Flight) {
    this.emission += dt * DROPS_PER_SECOND;
    while (this.emission >= 1) {
      this.emission--;
      const i = this.cursor++ % DROPS,
        j = i * 3;
      const p = new T.Vector3((Math.random() - 0.5) * 20, NOZZLE.y, NOZZLE.z)
        .applyQuaternion(f.quaternion)
        .add(f.position);
      this.positions[j] = p.x;
      this.positions[j + 1] = p.y;
      this.positions[j + 2] = p.z;
      this.velocities[j] =
        f.velocity.x * CARRIED_VELOCITY + (Math.random() - 0.5) * 4;
      this.velocities[j + 1] = -SINK - Math.random() * SINK_SPREAD;
      this.velocities[j + 2] =
        f.velocity.z * CARRIED_VELOCITY + (Math.random() - 0.5) * 4;
      this.life[i] = 20;
    }
  }
  update(dt: number, wind: T.Vector3) {
    for (let i = 0; i < DROPS; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3;
      this.life[i] -= dt;
      this.velocities[j] += (wind.x - this.velocities[j]) * WIND_DRAG * dt;
      this.velocities[j + 1] -= GRAVITY * dt;
      this.velocities[j + 2] +=
        (wind.z - this.velocities[j + 2]) * WIND_DRAG * dt;
      this.positions[j] += this.velocities[j] * dt;
      this.positions[j + 1] += this.velocities[j + 1] * dt;
      this.positions[j + 2] += this.velocities[j + 2] * dt;
      const x = this.positions[j],
        z = this.positions[j + 2];
      if (this.positions[j + 1] < surface(x, z)) {
        this.onImpact(x, z);
        this.life[i] = 0;
      }
      if (this.life[i] <= 0) this.positions[j + 1] = HIDDEN;
    }
    this.mesh.geometry.getAttribute("position").needsUpdate = true;
  }
  clear() {
    this.life.fill(0);
    this.positions.fill(HIDDEN);
  }
}
