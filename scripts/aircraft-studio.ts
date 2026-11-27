import * as T from "three";
import { createAircraft } from "../src/aircraft";
import { inletSun } from "../src/atmosphere";
import { bakeInletEnvironment } from "../src/inlet-sky";
import { isAircraftId } from "../src/fleet";
const params = new URLSearchParams(location.search);
const catalog = params.has("catalog");
const scene = new T.Scene(),
  camera = new T.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 30000);
const renderer = new T.WebGLRenderer({
  antialias: true,
  alpha: catalog,
  preserveDrawingBuffer: catalog,
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x9bafb2, catalog ? 0 : 1);
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
document.body.style.margin = "0";
document.body.append(renderer.domElement);
const deck = await new T.TextureLoader().loadAsync(
  new URL("../src/storm-sky.webp", import.meta.url).href,
);
scene.environment = bakeInletEnvironment(renderer, deck).texture;
scene.environmentIntensity = 0.8;
const fill = new T.HemisphereLight(0xc1d5e8, 0x42574c, 1.2);
fill.position.set(-0.62, 1, 0.25);
scene.add(fill);
const light = new T.DirectionalLight(0xffd39a, 3.7);
light.position.copy(inletSun).multiplyScalar(80);
light.castShadow = true;
Object.assign(light.shadow.camera, {
  left: -35,
  right: 35,
  top: 35,
  bottom: -35,
  near: 1,
  far: 200,
});
light.shadow.mapSize.set(2048, 2048);
light.shadow.normalBias = 0.03;
light.shadow.intensity = 0.55;
scene.add(light);
if (!catalog) {
  const floor = new T.Mesh(
    new T.PlaneGeometry(2000, 2000),
    new T.MeshStandardMaterial({ color: 0x819da0, roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -7.4;
  floor.receiveShadow = true;
  scene.add(floor);
}
const model = params.get("model");
const aircraft = createAircraft(isAircraftId(model) ? model : "survey");
scene.add(aircraft.root);
const views = {
  front: [36, 22, -44, 0, -0.6, 0],
  rear: [-34, 20, 43, 0, -0.5, 0],
  profile: [48, 7, 0, 0, -0.5, 0],
  cockpit: [8, 9, 10, 0, 1, 1],
  floats: [19, 0, -20, 0, -5, -1],
};
function view(name: string) {
  const p = views[name as keyof typeof views];
  camera.position.set(p[0], p[1], p[2]);
  if (innerWidth < 600) camera.position.multiplyScalar(2.5);
  camera.lookAt(p[3], p[4], p[5]);
  renderer.render(scene, camera);
}
function stats() {
  let meshes = 0,
    triangles = 0;
  aircraft.root.traverse((o) => {
    if ((o as T.Mesh).isMesh) {
      meshes++;
      const g = (o as T.Mesh).geometry;
      triangles += (g.index?.count ?? g.getAttribute("position").count) / 3;
    }
  });
  return {
    meshes,
    triangles,
    drawCalls: renderer.info.render.calls,
    bounds: new T.Box3()
      .setFromObject(aircraft.root)
      .min.toArray()
      .concat(new T.Box3().setFromObject(aircraft.root).max.toArray()),
  };
}
(window as any).studio = { view, stats };
view("front");
if (catalog) {
  const camera = new T.OrthographicCamera(
    -25,
    25,
    (25 * innerHeight) / innerWidth,
    (-25 * innerHeight) / innerWidth,
    0.1,
    300,
  );
  camera.position.set(34, 18, -52);
  camera.lookAt(0, -0.3, 0);
  aircraft.propeller.rotation.z = 0.53;
  renderer.render(scene, camera);
}
