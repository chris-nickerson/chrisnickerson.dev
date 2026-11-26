import test from "node:test";
import assert from "node:assert/strict";
import { Scene, Vector3 } from "three";
import { RainRun, groves } from "../src/rainrun";
import { WaterRelease, predictWaterImpact } from "../src/water-release";
import { Flight } from "../src/flight";
import { seededRandom, terrainHeight } from "../src/terrain";

test("rain run only credits water that reaches the active land target", () => {
  const run = new RainRun(),
    f = new Flight();
  run.start(f, 0, true);
  run.deposit(0, 0, 1000);
  assert.equal(run.progress, 0);
  run.deposit(groves[1].x, groves[1].z, 1000);
  assert.equal(run.progress, 0);
  run.deposit(groves[0].x, groves[0].z, 90);
  assert.equal(run.progress, 0.5);
  run.start(f, 0);
  assert.equal(run.progress, 0.5, "retry retains useful water");
  run.deposit(groves[0].x, groves[0].z, 90);
  assert.equal(run.complete, true);
  run.stop();
  run.deposit(groves[0].x, groves[0].z, 900);
  assert.equal(run.delivered[0], 180);
  run.start(f, 0, true);
  assert.equal(run.progress, 0);
});
test("every rain approach is clear of terrain and offers a usable water window", () => {
  for (let i = 0; i < groves.length; i++) {
    const f = new Flight(),
      run = new RainRun();
    run.start(f, i, true);
    let aimed = 0;
    for (let j = 0; j < 30 * 60; j++) {
      f.step(1 / 60, { roll: 0, pitch: 0, throttle: 0 });
      run.update(f);
      if (run.aimed) aimed++;
      assert.ok(f.position.y > terrainHeight(f.position.x, f.position.z));
    }
    assert.ok(
      aimed > 100,
      `grove ${i} needs over 1.6 s of release opportunity, got ${aimed / 60}`,
    );
    assert.equal(run.missed, true);
  }
});
test("ballistic aiming reaches terrain and changes with wind and height", () => {
  const p = new Vector3(-900, 230, 3000),
    v = new Vector3(0, 0, -53);
  const calm = predictWaterImpact(p, v, new Vector3());
  const cross = predictWaterImpact(p, v, new Vector3(15, 0, 0));
  assert.ok(cross.x > calm.x + 10);
  assert.ok(calm.z < p.z - 50);
  assert.ok(Math.abs(calm.y - terrainHeight(calm.x, calm.z) - 2) < 0.01);
  const high = predictWaterImpact(
    p.clone().add(new Vector3(0, 150, 0)),
    v,
    new Vector3(),
  );
  assert.ok(high.z < calm.z);
});
test("released water lands where the aiming mark predicts", (t) => {
  const random = seededRandom(7);
  t.mock.method(Math, "random", random);
  const wind = new Vector3(6, 0, -3),
    f = new Flight();
  f.position.set(groves[0].x, 260, groves[0].z + 420);
  f.velocity.set(4, -1, -53);
  const predicted = predictWaterImpact(f.position, f.velocity, wind);
  const landed: [number, number][] = [];
  const water = new WaterRelease(new Scene(), (x, z) => landed.push([x, z]));
  for (let i = 0; i < 60; i++) water.emit(1 / 60, f);
  for (let i = 0; i < 60 * 25; i++) water.update(1 / 60, wind);
  assert.equal(landed.length, 230);
  const mean = (axis: 0 | 1) =>
    landed.reduce((sum, p) => sum + p[axis], 0) / landed.length;
  assert.ok(
    Math.abs(mean(0) - predicted.x) < 2,
    `x off by ${mean(0) - predicted.x}`,
  );
  assert.ok(
    Math.abs(mean(1) - predicted.z) < 2,
    `z off by ${mean(1) - predicted.z}`,
  );
  assert.ok(
    Math.hypot(predicted.x - f.position.x, predicted.z - f.position.z) > 100,
    "the water must travel, or agreement proves nothing",
  );
});
