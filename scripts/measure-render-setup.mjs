import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? ".");
const load = (path) => import(pathToFileURL(resolve(root, path)).href);
const T = await load("node_modules/three/build/three.module.js");
const { terrainHeight } = await load("src/terrain.ts");
const { terrainTiles } = await load("src/render-geometry.ts");
const { shoreline } = await load("src/shore.ts");
const { Watershed } = await load("src/hydrology.ts");
const { Runoff } = await load("src/weather.ts");

const grid = new T.PlaneGeometry(15000, 15000, 640, 640);
grid.rotateX(-Math.PI / 2);
const vertices = grid.getAttribute("position");
for (let i = 0; i < vertices.count; i++)
  vertices.setY(i, terrainHeight(vertices.getX(i), vertices.getZ(i)));
grid.computeVertexNormals();

function measure(build) {
  const samples = [];
  let result;
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    result = build();
    if (i >= 3) samples.push(performance.now() - start);
  }
  return { result, medianMs: samples.sort((a, b) => a - b)[3] };
}

function geometryHash(geometries) {
  const hash = createHash("sha256");
  for (const geometry of geometries)
    for (const attribute of [
      geometry.index,
      ...Object.values(geometry.attributes),
    ])
      hash.update(attribute.array);
  return hash.digest("hex");
}

const center = { value: new T.Vector2() },
  radius = { value: 0 };
const coast = measure(() => shoreline(grid, center, radius));
const material = new T.MeshBasicMaterial();
const tiles = measure(() => terrainTiles(grid, material, 80));
const geometries = tiles.result.children.map((mesh) => mesh.geometry);
const indexArrays = new Set(geometries.map((g) => g.index.array));
const water = new Watershed();
water.surface.fill(1);
const runoff = new Runoff(new T.Scene());
const wet = measure(() => runoff.update(water, 0, 0));
console.log(
  JSON.stringify(
    {
      shoreline: {
        medianMs: coast.medianMs,
        hash: geometryHash([coast.result.geometry]),
      },
      tiles: {
        medianMs: tiles.medianMs,
        hash: geometryHash(geometries),
        indexBytes: [...indexArrays].reduce((n, a) => n + a.byteLength, 0),
      },
      wetRunoff: {
        medianMs: wet.medianMs,
        visibleVertices: runoff.mesh.geometry.drawRange.count,
      },
    },
    null,
    2,
  ),
);
