import * as T from "three";

/** Low surface ribbons grow behind the feet as a swan skims to a stop. */
export class SwanWakes {
  readonly mesh: T.InstancedMesh;
  private readonly pose = new T.Object3D();
  private readonly strength: T.InstancedBufferAttribute;
  constructor(count: number) {
    const geometry = new T.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, 0.5);
    this.strength = new T.InstancedBufferAttribute(
      new Float32Array(count),
      1,
    ).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute("wash", this.strength);
    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      vertexShader: `
        attribute float wash; varying float vWash; varying vec2 vUv;
        void main(){vWash=wash;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}
      `,
      fragmentShader: `
        varying float vWash; varying vec2 vUv;
        void main(){
          float behind=1.-vUv.y;
          float line=abs(abs(vUv.x-.5)-(.045+.43*behind));
          float edge=max(.018,fwidth(line));
          float ripple=(1.-smoothstep(.008,.008+edge,line))*(1.-behind)*vWash;
          gl_FragColor=vec4(.65,.79,.76,ripple);
        }`,
    });
    this.mesh = new T.InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = "Swan foot wakes";
  }
  set(
    index: number,
    p: T.Vector3,
    heading: number,
    folded: number,
    speed: number,
  ) {
    this.pose.position.set(p.x, 0.32, p.z);
    this.pose.rotation.y = -heading;
    this.pose.scale.set(7 + speed * 5, 1, 6 + speed * 21);
    this.pose.updateMatrix();
    this.mesh.setMatrixAt(index, this.pose.matrix);
    this.strength.setX(index, folded * (0.12 + 0.62 * speed));
  }
  commit(visible: boolean) {
    this.mesh.visible = visible;
    if (visible) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.strength.needsUpdate = true;
    }
  }
}
