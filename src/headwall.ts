import * as T from "three";
import { fbm, noise, smoothstep, WORLD_SIZE } from "./terrain";
import { noiseGLSL } from "./shaders";

const summits = [
  [-8100, -12700, 3110, 4650, 4600, -0.31],
  [-4880, -14500, 3940, 4200, 5350, 0.27],
  [-2750, -11200, 2190, 3000, 3500, -0.12],
  [-1350, -14300, 2890, 3350, 4700, -0.38],
  [620, -13900, 4200, 2960, 4600, 0.37],
  [1250, -14600, 3480, 2750, 4200, -0.26],
  [2450, -13700, 2930, 3400, 4600, -0.34],
  [4860, -11300, 2390, 3000, 3250, -0.32],
  [7150, -14400, 4000, 4800, 5300, 0.17],
];

function headwall(x: number, z: number) {
  const rift = fbm(x * 0.00055 + 13, z * 0.0006 - 12, 4);
  const warpX = 1340 * (rift - 0.45);
  const warpZ = 1150 * (fbm(x * 0.00061 + 71, z * 0.00048 + 37, 4) - 0.46);
  let elevation = -85;
  for (const [px, pz, summit, width, depth, tilt] of summits) {
    const v = (z + warpZ - pz) / depth;
    const u = (x + warpX - px) / width + v * tilt;
    const east = u > 0 ? 1.1 * u : -0.79 * u;
    const shoulder = Math.max(
      east + Math.abs(v) * 0.41,
      Math.abs(u - 0.62 * v) * 0.68 + Math.abs(v) * 0.57,
    );
    elevation = Math.max(elevation, summit * (1 - shoulder));
  }
  const crags = fbm(x * 0.0025, z * 0.0014, 4);
  const gullies = Math.abs(
    noise(x * 0.0011 + z * 0.00046 + rift, z * 0.00052) - 0.49,
  );
  elevation +=
    (crags - 0.46) * 760 - 280 * (1 - smoothstep(0.012, 0.22, gullies));
  const saddle = Math.abs(x + 1920 + 0.13 * (z + 13300) + 0.34 * warpX);
  elevation -= (1 - smoothstep(80, 1480, saddle)) * 1220;
  const upstream = smoothstep(-9060, -13950, z);
  const center = -270 + 345 * Math.sin(z * 0.00102) + 190 * upstream;
  const radius = 195 + 690 * upstream;
  const cross = Math.abs(x - center) / radius;
  const cirque =
    (1 - smoothstep(0.65, 1.75, cross)) * (1 - smoothstep(-13550, -14700, z));
  const floor =
    150 + 1460 * Math.pow(upstream, 1.3) + 95 * cross * cross + crags * 55;
  elevation -= cirque * Math.max(0, elevation - floor);
  const edge = smoothstep(-WORLD_SIZE / 2, -9400, z);
  const ice =
    (1 - smoothstep(0.65, 0.98, cross)) *
    smoothstep(-9250, -9840, z + 85 * crags);
  return {
    elevation: -85 + Math.max(0, elevation + 85) * edge,
    ice: ice * cirque * (1 - smoothstep(-13150, -14000, z)),
    cross,
  };
}

export function createHeadwall(sun: T.Vector3, low: boolean) {
  const geometry = new T.PlaneGeometry(
    24000,
    10200,
    low ? 168 : 280,
    low ? 78 : 124,
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -WORLD_SIZE / 2 - 5100);
  const points = geometry.getAttribute("position");
  const glacier = new Float32Array(points.count * 2);
  for (let i = 0; i < points.count; i++) {
    const { elevation, ice, cross } = headwall(points.getX(i), points.getZ(i));
    points.setY(i, elevation);
    glacier[2 * i] = ice;
    glacier[2 * i + 1] = cross;
  }
  geometry.setAttribute("glacier", new T.BufferAttribute(glacier, 2));
  geometry.computeVertexNormals();
  const material = new T.ShaderMaterial({
    fog: true,
    uniforms: T.UniformsUtils.merge([
      T.UniformsLib.fog,
      { uSun: { value: sun } },
    ]),
    vertexShader: `
      #include <fog_pars_vertex>
      attribute vec2 glacier;
      varying vec2 vGlacier;
      varying vec3 vPosition, vNormal;
      void main() {
        vPosition = position;
        vGlacier = glacier;
        vNormal = normal;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      varying vec2 vGlacier;
      varying vec3 vPosition, vNormal;
      uniform vec3 uSun;
      ${noiseGLSL}
      void main() {
        vec3 p = vPosition, n = normalize(vNormal);
        vec2 bedding = vec2(p.x*.0035+p.z*.0007, p.y*.0026);
        float crag = noise2(bedding) + .40*noise2(bedding*2.6) + .17*noise2(bedding*6.7);
        float flute = noise2(vec2(p.x*.014 + p.y*.004 + crag*2.1, p.y*.002+p.z*.0006));
        float ledge = sin(p.y*.026 + p.x*.0034 + crag*3.);
        float strata = smoothstep(.54,.94,ledge) * smoothstep(.32,.65,flute);
        float snowline = smoothstep(930.,2350.,p.y+crag*420.);
        float deposit = n.y + .28*(crag-.70) + .20*(flute-.5) - .21*n.x + .09*strata;
        float snow = snowline*smoothstep(.63,.78,deposit);
        float key = dot(n,uSun) + .15*(flute-.5);
        float sun = smoothstep(.03,.44,key);
        vec3 rock = mix(vec3(.095,.135,.19), vec3(.57,.375,.24),sun);
        rock *= .68 + crag*.24 + flute*.17 + strata*.16;
        vec3 snowColor = mix(vec3(.27,.43,.66),vec3(1.32,1.07,.79),sun);
        vec3 color = mix(rock,snowColor,snow);
        float folds = p.z*.018 + 4.*vGlacier.y*vGlacier.y + 1.9*crag;
        float crease = (1.-smoothstep(.03,.32,abs(sin(folds))))*(1.-smoothstep(.4,1.5,fwidth(folds)));
        float moraine = 1.-smoothstep(.04,.17,abs(vGlacier.y-.53+.09*crag));
        vec3 ice = mix(vec3(.24,.45,.54),vec3(.45,.61,.67),smoothstep(.36,.91,crag));
        color = mix(color,ice*(1.-.18*crease-.28*moraine),vGlacier.x);
        gl_FragColor = vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  return new T.Mesh(geometry, material);
}
