import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { landscapeMap } from "../src/landscape";
import { Migration, inletRoute } from "../src/migration";
import { Flight } from "../src/flight";
import { terrainHeight } from "../src/terrain";
import { flightSeed } from "../src/valley-wind";

const sun = new Vector3(-0.78, 0.38, -0.36).normalize();
test("a review seed survives reload, including zero, and ordinary visits draw a fresh day", () => {
  assert.equal(
    flightSeed("?seed=0", () => 0.9),
    0,
  );
  assert.equal(
    flightSeed("?seed=42", () => 0.1),
    42,
  );
  assert.equal(
    flightSeed("?seed=bogus", () => 0.5),
    2 ** 31,
  );
  assert.notEqual(
    flightSeed("", () => 0.1),
    flightSeed("", () => 0.5),
  );
});
test("the same terrain shelters the landing water and produces rising air on its windward slope", () => {
  const { wind } = landscapeMap(sun, 42);
  assert.ok(wind.exposure(-180, 1700) < 0.1);
  assert.ok(wind.exposure(350, 1700) > 0.9);
  const f = new Flight();
  f.valley = wind;
  f.position.set(1720, 150, 1750);
  f.sampleWind();
  assert.ok(f.wind.y > 1.25);
  assert.equal(f.wind.y, wind.lift(1720, 150, 1750));
  f.position.y = 900;
  f.sampleWind();
  assert.equal(f.wind.y, 0);
});
test("each family remains in the same world location at different render rates and quality levels", () => {
  for (const seed of [42, 43, 44]) {
    const { wind } = landscapeMap(sun, seed);
    const full = new Migration(wind, false),
      small = new Migration(wind, true);
    const { start } = inletRoute(seed);
    full.update(8);
    assert.ok(
      Math.abs(full.caller.y - start[1]) < 70,
      "encounter is within the opening altitude band",
    );
    for (const t of [9, 14, 21, 59, 91, 187, 314]) {
      full.update(t - 0.5);
      full.update(t);
      small.update(t);
      assert.deepEqual(full.caller.toArray(), small.caller.toArray());
      const matrices = full.birds.mesh.instanceMatrix.array;
      assert.deepEqual(
        matrices.slice(0, small.birds.mesh.count * 16),
        small.birds.mesh.instanceMatrix.array,
      );
      for (let j = 0; j < matrices.length; j += 16) {
        const [x, y, z] = matrices.slice(j + 12, j + 15);
        assert.ok(y > Math.max(0.2, terrainHeight(x, z)));
      }
    }
  }
});
test("settled swans rest on navigable water and paddle clear of their neighbours", () => {
  const m = new Migration(landscapeMap(sun, 42).wind, false);
  for (let t = 85; t < 240; t += 2) {
    m.update(t);
    const poses = m.birds.mesh.instanceMatrix.array;
    for (let j = 0; j < poses.length; j += 16) {
      const [x, y, z] = poses.slice(j + 12, j + 15);
      assert.ok(y < 1 && terrainHeight(x, z) < -2);
      for (let k = 0; k < j; k += 16)
        assert.ok(Math.hypot(poses[k + 12] - x, poses[k + 14] - z) > 5);
    }
  }
});
