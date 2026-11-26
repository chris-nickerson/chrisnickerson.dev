import * as T from "three";
import { terrainHeight, clamp } from "./terrain";
/** Trace headwaters down the actual continuous terrain gradient, then build flowing ribbons. */
export function createRivers(scene: T.Scene) {
  const sources = [
    [1900, -2900],
    [2300, -2100],
    [3700, -2700],
    [-2100, -1900],
    [-3200, -1500],
    [-3300, 1700],
    [2500, 900],
    [3400, 2200],
    [-2800, -6000],
    [2900, -5800],
  ];
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: { uTime: { value: 0 }, uFlow: { value: 0 } },
    vertexShader: `varying vec2 vUv;varying vec3 vWorld;void main(){vUv=uv;vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
    fragmentShader: `uniform float uTime;uniform float uFlow;varying vec2 vUv;varying vec3 vWorld;void main(){float edge=smoothstep(0.,.2,vUv.x)*(1.-smoothstep(.8,1.,vUv.x));float foam=pow(.5+.5*sin(vUv.y*.12-uTime*3.+sin(vUv.x*22.)),5.);vec3 c=mix(vec3(.13,.41,.43),vec3(.78,.88,.82),foam*.6);float d=length(cameraPosition-vWorld);c=mix(c,vec3(.43,.60,.65),1.-exp(-d*.00005));gl_FragColor=vec4(c,edge*(.7+uFlow*.25)*(1.-smoothstep(600.,1100.,vWorld.y)));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
  });
  const ends: T.Vector3[] = [];
  for (const [sx, sz] of sources) {
    const path: T.Vector3[] = [];
    let x = sx,
      z = sz,
      lastX = 0,
      lastZ = 0,
      distance = 0;
    const positions: number[] = [],
      uv: number[] = [],
      indices: number[] = [];
    for (let k = 0; k < 1000; k++) {
      const h = terrainHeight(x, z);
      if (h < 1) break;
      path.push(new T.Vector3(x, h + 1.6, z));
      const eps = 10,
        gx = terrainHeight(x + eps, z) - terrainHeight(x - eps, z),
        gz = terrainHeight(x, z + eps) - terrainHeight(x, z - eps);
      const len = Math.hypot(gx, gz);
      if (len < 0.01) break;
      const dx = (-gx / len) * 0.78 + lastX * 0.22,
        dz = (-gz / len) * 0.78 + lastZ * 0.22;
      lastX = dx;
      lastZ = dz;
      const nx = x + dx * 16,
        nz = z + dz * 16;
      if (terrainHeight(nx, nz) > h + 0.2) break;
      x = nx;
      z = nz;
    }
    if (path.length < 4) continue;
    for (let i = 0; i < path.length; i++) {
      const p = path[i],
        next = path[Math.min(i + 1, path.length - 1)],
        prev = path[Math.max(0, i - 1)];
      const tangent = next.clone().sub(prev).normalize();
      const side = new T.Vector3(-tangent.z, 0, tangent.x).normalize();
      const width = 3.5 + Math.sqrt(i) * 0.48;
      for (let s = 0; s < 2; s++) {
        const v = p.clone().addScaledVector(side, (s - 0.5) * width * 2);
        v.y = Math.max(terrainHeight(v.x, v.z) + 1.5, p.y - 0.6);
        positions.push(v.x, v.y, v.z);
        uv.push(s, distance);
      }
      if (i > 0) {
        const a = i * 2;
        indices.push(a - 2, a, a - 1, a - 1, a, a + 1);
        distance += p.distanceTo(prev);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    const mesh = new T.Mesh(geometry, material);
    scene.add(mesh);
    ends.push(path[path.length - 1]);
  }
  return {
    update: (time: number, moisture: number) => {
      material.uniforms.uTime.value = time;
      material.uniforms.uFlow.value = clamp(moisture / 5000, 0, 1);
    },
    count: ends.length,
  };
}
