import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { Watershed, GRID } from "../src/hydrology";
import { shoreline } from "../src/shore";
import { Runoff } from "../src/weather";
import { cirqueShelter } from "../src/alpine-surface";
import { canopyFootprints } from "../src/forest";
import { WORLD_SIZE } from "../src/terrain";
import { terrainTiles } from "../src/render-geometry";

test("spatial terrain tiles preserve every source triangle and border normal, including partial tiles", () => {
  const source = new T.PlaneGeometry(37, 23, 7, 5);
  source.rotateX(-Math.PI / 2);
  const positions = source.getAttribute("position");
  for (let i = 0; i < positions.count; i++)
    positions.setY(
      i,
      Math.sin(positions.getX(i)) * Math.cos(positions.getZ(i)) * 4,
    );
  source.computeVertexNormals();
  const group = terrainTiles(source, new T.MeshBasicMaterial(), 3);
  const triangles = (geometry: T.BufferGeometry) => {
    const result: string[] = [],
      index = geometry.index!;
    const p = geometry.getAttribute("position"),
      n = geometry.getAttribute("normal");
    for (let i = 0; i < index.count; i += 3) {
      const triangle = [];
      for (let j = 0; j < 3; j++) {
        const k = index.getX(i + j);
        triangle.push(
          [
            p.getX(k),
            p.getY(k),
            p.getZ(k),
            n.getX(k),
            n.getY(k),
            n.getZ(k),
          ].join(","),
        );
      }
      result.push(triangle.join("|"));
    }
    return result;
  };
  assert.deepEqual(
    group.children
      .flatMap((mesh) => triangles((mesh as T.Mesh).geometry))
      .sort(),
    triangles(source).sort(),
  );
  for (const child of group.children) {
    const mesh = child as T.Mesh,
      sphere = mesh.geometry.boundingSphere!;
    const points = mesh.geometry.getAttribute("position");
    for (let i = 0; i < points.count; i++)
      assert.ok(
        sphere.center.distanceTo(
          new T.Vector3().fromBufferAttribute(points, i),
        ) <=
          sphere.radius + 1e-6,
        "culling bounds must contain every vertex",
      );
  }
});

test("interpolated atmosphere rays reconstruct the same world positions as depth unprojection", () => {
  for (const [fov, aspect] of [
    [49, 1.6],
    [62, 390 / 844],
  ]) {
    const camera = new T.PerspectiveCamera(fov, aspect, 1, 35000);
    camera.position.set(-900, 1080, 3400);
    camera.lookAt(250, 300, -1200);
    camera.updateMatrixWorld();
    for (const x of [-0.95, 0, 0.8])
      for (const y of [-0.8, 0.1, 0.9])
        for (const depth of [0.1, 0.99, 0.9998, 1]) {
          const expected = new T.Vector3(x, y, depth * 2 - 1).unproject(camera);
          const ray = new T.Vector4(x, y, 1, 1).applyMatrix4(
            camera.projectionMatrixInverse,
          );
          const linearDepth =
            (camera.near * camera.far) /
            (camera.far - depth * (camera.far - camera.near));
          const reconstructed = new T.Vector3(ray.x, ray.y, ray.z)
            .applyMatrix3(new T.Matrix3().setFromMatrix4(camera.matrixWorld))
            .multiplyScalar(linearDepth)
            .add(camera.position);
          assert.ok(expected.distanceTo(reconstructed) < 1e-5);
        }
  }
});

test("shore foam follows a crossing at any corner and skips fully dry or submerged cells", () => {
  const grid = new T.PlaneGeometry(10, 10);
  grid.rotateX(-Math.PI / 2);
  const heights = grid.getAttribute("position");
  for (let mask = 0; mask < 16; mask++) {
    for (let i = 0; i < 4; i++) heights.setY(i, mask & (1 << i) ? 1 : -1);
    const coast = shoreline(grid, { value: new T.Vector2() }, { value: 0 });
    const expected =
      mask === 0 || mask === 15 ? 0 : mask === 6 || mask === 9 ? 12 : 6;
    assert.equal(coast.geometry.index!.count, expected);
  }
});

test("runoff uploads the visible channels after they dry, change strength, or reappear", () => {
  const water = new Watershed();
  const runoff = new Runoff(new T.Scene());
  const [first, second] = [GRID + 2, GRID * 2 + 6];
  water.heights.fill(0);
  water.heights[first] = water.heights[second] = 10;
  const geometry = runoff.mesh.geometry;
  const position = geometry.getAttribute("position") as T.BufferAttribute;
  const strength = geometry.getAttribute("strength") as T.BufferAttribute;
  const positions = () => geometry.getAttribute("position").array;
  water.surface[first] = water.surface[second] = 1;
  runoff.update(water);
  assert.equal(geometry.drawRange.count, 16);
  const secondPath = positions().slice(24, 48);
  const previousVersion = position.version;
  const previousStrengthVersion = strength.version;
  water.surface[first] = 0;
  water.surface[second] = 4;
  runoff.update(water);
  assert.equal(geometry.drawRange.count, 8);
  assert.ok(position.version > previousVersion);
  assert.ok(strength.version > previousStrengthVersion);
  assert.deepEqual(position.updateRanges, [{ start: 0, count: 24 }]);
  assert.deepEqual(strength.updateRanges, [{ start: 0, count: 8 }]);
  assert.deepEqual(positions().slice(0, 24), secondPath);
  assert.equal(geometry.getAttribute("strength").getX(0), Math.fround(0.6));
  const wetVersions = [position.version, strength.version];
  water.surface[second] = 0;
  runoff.update(water);
  assert.equal(runoff.mesh.visible, false);
  assert.deepEqual([position.version, strength.version], wetVersions);
  water.surface[first] = water.surface[second] = 1;
  runoff.update(water);
  assert.equal(runoff.mesh.visible, true);
  assert.equal(geometry.drawRange.count, 16);
  assert.deepEqual(position.updateRanges, [{ start: 0, count: 48 }]);
  assert.deepEqual(positions().slice(24, 48), secondPath);
});

test("snow shelter locates hollows and exposed ridges at their world coordinates", () => {
  const terrain = new T.PlaneGeometry(1600, 1600, 16, 16);
  terrain.rotateX(-Math.PI / 2);
  const vertices = terrain.getAttribute("position");
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      z = vertices.getZ(i);
    if (x === 0 && Math.abs(z) === 300) vertices.setY(i, z);
  }
  const shelter = cirqueShelter(vertices, 17, 1600);
  const sample = (x: number, z: number) =>
    shelter.image.data[(z / 100 + 8) * 17 + x / 100 + 8];
  assert.ok(sample(0, -300) > sample(300, 0) + 100);
  assert.ok(sample(0, 300) < sample(300, 0) - 100);
});

test("a tree's ground shadow extends away from the sun with no wrap at the map edge", () => {
  const tree = { x: -WORLD_SIZE / 2 + 12, z: 0, h: 55, r: 7 };
  const awayFromEdge = canopyFootprints(
    [tree],
    new T.Vector3(-1, 0.2, 0).normalize(),
  );
  const acrossEdge = canopyFootprints(
    [tree],
    new T.Vector3(1, 0.2, 0).normalize(),
  );
  const { width, height } = awayFromEdge.image;
  const row = (height / 2) * width;
  assert.ok(awayFromEdge.image.data[row + 5] > 0);
  assert.equal(acrossEdge.image.data[row + 5], 0);
  assert.equal(acrossEdge.image.data[row - 1], 0);
});
