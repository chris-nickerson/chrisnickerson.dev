import * as T from "three";
import { createWaveSlopeTexture } from "./wave-slopes";
import { createHeadwall } from "./headwall";
import { inletMoon, inletSun, stormOpening } from "./atmosphere";
import {
  fbm,
  seededRandom,
  terrainHeight,
  terrainMeshHeight,
  WORLD_SIZE,
  riverCenter,
} from "./terrain";
import { GRID, Watershed } from "./hydrology";
import { canopyFootprints, createCanopy, createNearCanopy } from "./forest";
import { terrainTiles } from "./render-geometry";
import { createShoreDetail } from "./shore-detail";
import { landscapeMap, forestCover } from "./landscape";
import {
  cirqueShelter,
  graniteRelief,
  shadeAlpineSurface,
} from "./alpine-surface";
import { shoreline } from "./shore";
import { places } from "./places";
import { createInletSky } from "./inlet-sky";
import { waterFragment, waterVertex } from "./shaders";

export function createWorld(
  scene: T.Scene,
  low: boolean,
  hydrology: Watershed,
  seed: number,
) {
  const sun = inletSun;
  scene.add(createHeadwall(sun, low));
  scene.fog = new T.FogExp2(0x9ba8af, 0.000024);
  const { map: landscape, wind } = landscapeMap(sun, seed);
  const hemi = new T.HemisphereLight(0xc1d5e8, 0x42574c, 1.02);
  hemi.position.set(-0.62, 1, 0.25);
  scene.add(hemi);
  const sunlight = new T.DirectionalLight(0xffd39a, 3.7);
  sunlight.position.copy(sun).multiplyScalar(3500);
  scene.add(sunlight);
  scene.add(sunlight.target);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sunlight.shadow.camera, {
    left: -450,
    right: 450,
    top: 450,
    bottom: -450,
    near: 10,
    far: 4500,
  });
  sunlight.shadow.bias = -0.0001;
  sunlight.shadow.normalBias = 0.35;
  sunlight.shadow.radius = 2;
  const sky = createInletSky();
  const night = sky.material.uniforms.uNight;
  let keyLight = sun;
  scene.add(sky);
  const moisture = new T.DataTexture(
    hydrology.pixels,
    GRID,
    GRID,
    T.RGBAFormat,
  );
  moisture.minFilter = T.LinearFilter;
  moisture.magFilter = T.LinearFilter;
  moisture.needsUpdate = true;
  const landTime = { value: 0 };
  const survey = { value: 0 },
    detailCenter = { value: new T.Vector2() },
    detailRadius = { value: 0 };
  const rockTexture = graniteRelief();
  const material = new T.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.14,
  });
  material.onBeforeCompile = (shader) =>
    shadeAlpineSurface(shader, {
      uLandscape: { value: landscape },
      uSun: { value: sun },
      uLandTime: landTime,
      uDetailCenter: detailCenter,
      uDetailRadius: detailRadius,
      uIsDetail: { value: 0 },
      uCanopy: { value: canopyShade },
      uGranite: { value: rockTexture },
      uShelter: { value: shelter },
      uMoisture: { value: moisture },
      uSurvey: survey,
      uWorldSize: { value: WORLD_SIZE },
    });
  // Coarse and focused ground differ only by a uniform; share their compiled program.
  material.customProgramCacheKey = () => "filtered-terrain-v1";
  const geometry = new T.PlaneGeometry(
    WORLD_SIZE,
    WORLD_SIZE,
    low ? 300 : 640,
    low ? 300 : 640,
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++)
    positions.setY(i, terrainHeight(positions.getX(i), positions.getZ(i)));
  const shelter = cirqueShelter(
    positions,
    geometry.parameters.widthSegments + 1,
    WORLD_SIZE,
  );
  geometry.computeVertexNormals();
  const terrain = terrainTiles(geometry, material, low ? 50 : 80);
  scene.add(terrain);
  const coast = shoreline(geometry, detailCenter, detailRadius);
  scene.add(coast);
  // Far ranges continue beyond the simulation domain, making the inlet feel enclosed in a continent.
  const farGeo = new T.PlaneGeometry(42000, 42000, 170, 170);
  farGeo.rotateX(-Math.PI / 2);
  const fp = farGeo.getAttribute("position");
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i),
      z = fp.getZ(i),
      r = Math.max(Math.abs(x), Math.abs(z));
    const fade = T.MathUtils.smoothstep(r, 7300, 11500);
    const channel = T.MathUtils.smoothstep(
      Math.abs(x - riverCenter(z)),
      500,
      2600,
    );
    fp.setY(
      i,
      -150 +
        fade * channel * (300 + fbm(x * 0.00035 + 50, z * 0.00035 + 20) * 3000),
    );
  }
  farGeo.computeVertexNormals();
  const far = new T.Mesh(farGeo, material);
  scene.add(far);
  // Spatial batches let every camera (including reflections and shadows) reject unseen forest.
  const random = seededRandom(937);
  const treeCount = low ? 22000 : 82000;
  const locations: { x: number; y: number; z: number; h: number; r: number }[] =
    [];
  for (let i = 0; i < treeCount * 10 && locations.length < treeCount; i++) {
    const x = (random() - 0.5) * 11500,
      z = (random() - 0.5) * 12500,
      y = terrainHeight(x, z);
    if (y < 12 || y > 1050) continue;
    if (
      Object.values(places).some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < 9500)
    )
      continue;
    const slope =
      Math.abs(terrainHeight(x + 12, z) - y) +
      Math.abs(terrainHeight(x, z + 12) - y);
    if (random() > forestCover(x, z, y, slope / 17)) continue;
    locations.push({ x, y, z, h: 18 + random() * 23, r: 5 + random() * 6.5 });
  }
  const canopyShade = canopyFootprints(locations, sun);
  const { geometry: canopy, texture: treeTexture } = createCanopy();
  const treeMaterial = new T.MeshBasicMaterial({
    color: 0xffffff,
    map: treeTexture,
    alphaTest: 0.36,
    alphaToCoverage: !low,
    side: T.DoubleSide,
  });

  treeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uLandscape = { value: landscape };
    shader.uniforms.uSun = { value: sun };
    shader.uniforms.uLandTime = landTime;
    shader.vertexShader =
      stormOpening +
      "\nuniform float uLandTime;uniform vec3 uSun;varying float vBranchLight, vClearing;varying vec3 vTreeWorld;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\n vMapUv.x=(vMapUv.x+mod(float(gl_InstanceID),3.))/3.;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      mat4 treeWorld = modelMatrix*instanceMatrix;
      vTreeWorld = (treeWorld*vec4(position,1.)).xyz;
      vec2 radius = mat3(treeWorld)[0].xz;
      vec2 branch = (mat3(treeWorld)*vec3(position.x,0.,position.z)).xz / max(length(radius),.001);
      vBranchLight = dot(branch,uSun.xz);
      vClearing = sunlightAt(vTreeWorld,uSun,uLandTime);`,
    );
    shader.fragmentShader =
      "uniform sampler2D uLandscape;varying float vBranchLight, vClearing;varying vec3 vTreeWorld;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float shelter = texture2D(uLandscape,vTreeWorld.xz/15000.+.5).r;
      float crown = smoothstep(.08,.91,vMapUv.y);
      float lit = smoothstep(-.28,.55,vBranchLight + crown*.32) * (1.-shelter*.86)*(.50+.50*vClearing);
      diffuseColor.rgb *= mix(vec3(.28,.44,.49),vec3(1.45,1.22,.77),lit)*(.49+.52*crown);`,
    );
  };

  const treeDepth = new T.MeshDepthMaterial({
    map: treeTexture,
    alphaTest: 0.36,
    depthPacking: T.RGBADepthPacking,
  });
  treeDepth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\n vMapUv.x=(vMapUv.x+mod(float(gl_InstanceID),3.))/3.;",
    );
  };
  const dummy = new T.Object3D(),
    color = new T.Color();
  const cells = new Map<string, typeof locations>();
  for (const tree of locations) {
    const key = `${Math.floor(tree.x / 600)},${Math.floor(tree.z / 600)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(tree);
  }
  const forest: T.InstancedMesh[] = [];
  const forestLODs: T.LOD[] = [];
  const { geometry: nearCanopy, texture: branchTexture } = createNearCanopy();
  const nearMaterial = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    map: branchTexture,
    alphaTest: 0.22,
    alphaToCoverage: !low,
    side: T.DoubleSide,
  });
  const nearDepth = new T.MeshDepthMaterial({
    map: branchTexture,
    alphaTest: 0.22,
    depthPacking: T.RGBADepthPacking,
    side: T.DoubleSide,
  });
  for (const trees of cells.values()) {
    const foliage = new T.InstancedMesh(canopy, treeMaterial, trees.length);
    foliage.castShadow = true;
    foliage.customDepthMaterial = treeDepth;
    trees.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.scale.set(t.r, t.h, t.r);
      dummy.rotation.y = random() * 6.28;
      dummy.updateMatrix();
      foliage.setMatrixAt(i, dummy.matrix);
      const shade = 0.85 + random() * 0.4;
      const glade =
        0.5 +
        0.5 * Math.sin(t.x * 0.019 + Math.sin(t.z * 0.008) * 3 + t.z * 0.011);
      color.setRGB(
        (0.72 + 0.29 * glade) * shade,
        (0.9 + 0.12 * glade) * shade,
        (1.02 - 0.14 * glade) * shade,
      );
      foliage.setColorAt(i, color);
    });
    foliage.computeBoundingSphere();
    const near = new T.InstancedMesh(nearCanopy, nearMaterial, trees.length);
    near.instanceMatrix = foliage.instanceMatrix;
    near.instanceColor = foliage.instanceColor;
    near.castShadow = true;
    near.customDepthMaterial = nearDepth;
    near.receiveShadow = true;
    near.computeBoundingSphere();
    const lod = new T.LOD();
    lod.position.copy(foliage.boundingSphere!.center);
    foliage.position.copy(lod.position).negate();
    near.position.copy(foliage.position);
    foliage.updateMatrix();
    near.updateMatrix();
    foliage.matrixAutoUpdate = near.matrixAutoUpdate = false;
    lod.addLevel(near, 0);
    lod.addLevel(foliage, low ? 600 : 850, 0.12);
    scene.add(lod);
    forestLODs.push(lod);
    forest.push(foliage, near);
  }
  // Dormant saplings respond to the soil reservoir, including remembered moisture.
  const sprouts: {
    x: number;
    y: number;
    z: number;
    h: number;
    r: number;
    cell: number;
  }[] = [];
  for (let i = 0; i < 15000; i++) {
    const x = (random() - 0.5) * 11000,
      z = (random() - 0.5) * 11500,
      y = terrainHeight(x, z);
    if (
      y > 8 &&
      y < 650 &&
      !Object.values(places).some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < 9500)
    )
      sprouts.push({
        x,
        y,
        z,
        h: 8 + random() * 13,
        r: 3 + random() * 4,
        cell: hydrology.index(x, z),
      });
  }
  const youngForest = new T.InstancedMesh(
    canopy,
    new T.MeshBasicMaterial({
      color: 0xadc88a,
      map: treeTexture,
      alphaTest: 0.42,
      side: T.DoubleSide,
    }),
    sprouts.length,
  );
  (youngForest.material as T.MeshBasicMaterial).onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\n vMapUv.x=(vMapUv.x+mod(float(gl_InstanceID),3.))/3.;",
    );
  };
  youngForest.instanceMatrix.setUsage(T.DynamicDrawUsage);
  youngForest.frustumCulled = false;
  scene.add(youngForest);
  youngForest.count = 0;
  let lastGrowth = -100;
  function updateGrowth(time: number, force = false) {
    if (!force && time - lastGrowth < 0.5) return;
    lastGrowth = time;
    let active = 0;
    sprouts.forEach((s) => {
      const growth = hydrology.vegetation[s.cell];
      if (growth < 0.005) return;
      dummy.position.set(s.x, s.y, s.z);
      dummy.scale.set(s.r * growth, s.h * growth, s.r * growth);
      dummy.updateMatrix();
      youngForest.setMatrixAt(active++, dummy.matrix);
    });
    youngForest.count = active;
    youngForest.instanceMatrix.needsUpdate = true;
  }
  let patch: T.Group | undefined, patchCoast: T.Mesh | undefined;
  const patchMaterial = material.clone();
  patchMaterial.customProgramCacheKey = material.customProgramCacheKey;
  patchMaterial.onBeforeCompile = (shader, renderer) => {
    material.onBeforeCompile(shader, renderer);
    shader.uniforms.uIsDetail.value = 1;
  };
  function focus(x?: number, z?: number) {
    if (patchCoast) {
      scene.remove(patchCoast);
      patchCoast.geometry.dispose();
      (patchCoast.material as T.Material).dispose();
      patchCoast = undefined;
    }
    if (patch) {
      scene.remove(patch);
      for (const tile of patch.children as T.Mesh[]) tile.geometry.dispose();
      patch = undefined;
    }
    if (x === undefined || z === undefined) {
      detailRadius.value = 0;
      return;
    }
    const size = 820,
      segments = low ? 180 : 340;
    const g = new T.PlaneGeometry(size, size, segments, segments);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0, z);
    const a = g.getAttribute("position");
    const count = low ? 300 : 640;
    const coarse = (x: number, z: number) =>
      terrainMeshHeight(x, z, count, (i) => positions.getY(i));
    for (let i = 0; i < a.count; i++) {
      const xx = a.getX(i),
        zz = a.getZ(i),
        edge = T.MathUtils.smoothstep(
          Math.max(Math.abs(xx - x), Math.abs(zz - z)),
          size * 0.38,
          size * 0.5,
        );
      a.setY(i, T.MathUtils.lerp(terrainHeight(xx, zz), coarse(xx, zz), edge));
    }
    g.computeVertexNormals();
    if (low) {
      patch = terrainTiles(g, patchMaterial, segments / 4);
    } else {
      const ground = new T.Mesh(g, patchMaterial);
      ground.receiveShadow = true;
      patch = new T.Group().add(ground);
    }
    scene.add(patch);
    patchCoast = shoreline(g, detailCenter, detailRadius, true);
    scene.add(patchCoast);
    detailCenter.value.set(x, z);
    detailRadius.value = size * 0.5 - 0.2;
  }
  createShoreDetail(scene);
  const reflection = new T.WebGLRenderTarget(
    low ? 512 : 1024,
    low ? 256 : 512,
    { type: T.HalfFloatType },
  );
  const waterMat = new T.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    lights: true,
    uniforms: {
      ...T.UniformsUtils.clone(T.UniformsLib.lights),
      uWaves: { value: createWaveSlopeTexture() },
      uLandscape: { value: landscape },
      uWindAxis: { value: new T.Vector2(wind.east, wind.south) },
      uTime: { value: 0 },
      uNight: night,
      uMoon: { value: inletMoon },
      uReflection: { value: reflection.texture },
      uSun: { value: sun },
      uTextureMatrix: { value: new T.Matrix4() },
      uReflectReady: { value: 0 },
      uWake: { value: new T.Vector4() },
      uWakeHeading: { value: 0 },
    },
  });
  const water = new T.Mesh(new T.PlaneGeometry(40000, 40000), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.2;
  water.receiveShadow = true;
  scene.add(water);
  const reflectionFog = new T.FogExp2(0xb7b1aa, 0.000094);
  const reflectedCamera = new T.PerspectiveCamera();
  const texMatrix = new T.Matrix4();
  const clipPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  const clipVec = new T.Vector4();
  const q = new T.Vector4();
  const reflectDirection = new T.Vector3(),
    reflectTarget = new T.Vector3();
  const reflectPlane = new T.Plane();
  function reflect(renderer: T.WebGLRenderer, camera: T.PerspectiveCamera) {
    reflectedCamera.copy(camera);
    reflectedCamera.position.y = -camera.position.y;
    const direction = reflectDirection;
    camera.getWorldDirection(direction);
    direction.y = -direction.y;
    reflectedCamera.up.set(0, -1, 0);
    reflectedCamera.lookAt(
      reflectTarget.copy(reflectedCamera.position).add(direction),
    );
    reflectedCamera.updateMatrixWorld();
    // Oblique near plane prevents submerged terrain reflecting above the surface.
    const plane = reflectPlane
      .copy(clipPlane)
      .applyMatrix4(reflectedCamera.matrixWorldInverse);
    clipVec.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const proj = reflectedCamera.projectionMatrix;
    const e = proj.elements;
    q.set(
      (Math.sign(clipVec.x) + e[8]) / e[0],
      (Math.sign(clipVec.y) + e[9]) / e[5],
      -1,
      (1 + e[10]) / e[14],
    );
    clipVec.multiplyScalar(2 / clipVec.dot(q));
    e[2] = clipVec.x;
    e[6] = clipVec.y;
    e[10] = clipVec.z + 1 - 0.002;
    e[14] = clipVec.w;
    texMatrix
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(reflectedCamera.projectionMatrix)
      .multiply(reflectedCamera.matrixWorldInverse);
    waterMat.uniforms.uTextureMatrix.value.copy(texMatrix);
    const previous = renderer.getRenderTarget();
    water.visible = false;
    renderer.setRenderTarget(reflection);
    const directFog = scene.fog;
    scene.fog = reflectionFog;
    try {
      renderer.render(scene, reflectedCamera);
    } finally {
      scene.fog = directFog;
      renderer.setRenderTarget(previous);
      water.visible = true;
    }
    waterMat.uniforms.uReflectReady.value = 1;
  }
  function update(time: number, view = 0) {
    landTime.value = time;
    survey.value = view;
    updateGrowth(time, hydrology.dirty);
    coast.material.uniforms.uTime.value = time;
    if (patchCoast)
      (patchCoast.material as T.ShaderMaterial).uniforms.uTime.value = time;
    sky.material.uniforms.uTime.value = time;
    waterMat.uniforms.uTime.value = time;
    if (hydrology.dirty) {
      moisture.needsUpdate = true;
      hydrology.dirty = false;
    }
  }
  return {
    terrain,
    wind,
    water,
    sky,
    update,
    reflect,
    focus,
    setWake: (
      x: number,
      z: number,
      speed: number,
      active: boolean,
      heading: number,
    ) => {
      waterMat.uniforms.uWake.value.set(x, z, speed, active ? 1 : 0);
      waterMat.uniforms.uWakeHeading.value = heading;
    },
    treeCount: locations.length,
    resizeReflection: (width: number, height: number) => {
      const scale = Math.min(0.65, 1024 / width, 768 / height);
      reflection.setSize(
        Math.max(128, Math.round(width * scale)),
        Math.max(128, Math.round(height * scale)),
      );
    },
    sunlight,
    setNight: (isNight: boolean) => {
      night.value = Number(isNight);
      keyLight = isNight ? inletMoon : sun;
      sunlight.color.setHex(isNight ? 0xbad1ff : 0xffd39a);
      sunlight.intensity = isNight ? 1.75 : 3.7;
      hemi.intensity = isNight ? 0.57 : 1.02;
      (scene.fog as T.FogExp2).color.setHex(isNight ? 0x495b77 : 0x9ba8af);
      reflectionFog.color.setHex(isNight ? 0x4d5c75 : 0xb7b1aa);
    },
    updateSun: (p: T.Vector3) => {
      sunlight.target.position.copy(p);
      sunlight.target.position.y = terrainHeight(p.x, p.z) + 30;
      sunlight.position
        .copy(sunlight.target.position)
        .addScaledVector(keyLight, 2400);
    },
    setLowPower: (value: boolean) => {
      for (const lod of forestLODs)
        lod.levels[1].distance = value ? 0 : low ? 600 : 850;
      for (const foliage of forest)
        foliage.count = value
          ? Math.ceil(
              foliage.instanceMatrix.count *
                Math.min(1, 22000 / locations.length),
            )
          : foliage.instanceMatrix.count;
    },
  };
}
