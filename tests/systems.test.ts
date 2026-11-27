import test from "node:test";
import assert from "node:assert/strict";
import { Flight } from "../src/flight";
import { Watershed, GRID } from "../src/hydrology";
import { terrainHeight, riverCenter } from "../src/terrain";

test("the terrain is repeatable, bounded, and the inlet is under water", () => {
  for (let z = -6000; z <= 6000; z += 500) {
    assert.ok(
      Math.min(
        ...[-500, 0, 500].map((offset) =>
          terrainHeight(riverCenter(z) + offset, z),
        ),
      ) < 0,
    );
    for (let x = -6000; x <= 6000; x += 500) {
      const h = terrainHeight(x, z);
      assert.ok(Number.isFinite(h) && h > -200 && h < 3500);
      assert.equal(h, terrainHeight(x, z));
    }
  }
});
test("surface flux and infiltration conserve water including sea discharge and evaporation", () => {
  const w = new Watershed();
  w.deposit(-1400, 500, 100);
  w.deposit(1500, -900, 80);
  for (let step = 0; step < 300; step++) w.step(0.2);
  const sum = (a: Float32Array) => a.reduce((total, v) => total + v, 0);
  const accounted =
    sum(w.surface) + sum(w.moisture) + w.seaDischarge + w.evaporated;
  assert.ok(
    Math.abs(accounted - w.delivered) < 0.002,
    `${accounted} / ${w.delivered}`,
  );
  assert.ok(w.moisture.some((v) => v > 0));
  assert.ok(w.vegetation.some((v) => v > 0));
  assert.ok(w.surface.every((v) => v >= 0));
});
test("water follows a slope and does not climb it", () => {
  const w = new Watershed();
  for (let z = 0; z < GRID; z++)
    for (let x = 0; x < GRID; x++) w.heights[z * GRID + x] = 100 + x * 10;
  const i = 64 * GRID + 64;
  w.surface[i] = 5;
  w.step(0.2);
  assert.ok(w.surface[i - 1] > 0);
  assert.equal(w.surface[i + 1], 0);
});
test("water at the grid perimeter can infiltrate land and discharge into the sea without wrapping rows", () => {
  const w = new Watershed();
  w.heights.fill(100);
  const coast = GRID;
  w.heights[coast + 1] = -1;
  w.surface[coast] = 10;
  w.step(0.2);
  assert.ok(w.moisture[coast] > 0);
  assert.ok(w.surface[coast + 1] > 0);
  assert.equal(w.surface[coast - 1], 0);
  w.step(0.2);
  assert.ok(w.seaDischarge > 0);
});
test("persistence rejects corrupt and oversized values, roundtrips valid moisture", () => {
  const w = new Watershed();
  w.deposit(-1300, 500, 100);
  for (let i = 0; i < 30; i++) w.step(0.2);
  const restored = new Watershed();
  assert.equal(
    restored.restore(JSON.parse(JSON.stringify(w.snapshot()))),
    true,
  );
  assert.equal(restored.delivered, w.delivered);
  assert.equal(restored.wateredCells, w.wateredCells);
  assert.equal(
    restored.restore({ version: 1, moisture: [NaN], delivered: 4 }),
    false,
  );
  assert.equal(
    restored.restore({
      ...w.snapshot(),
      moisture: Array(GRID * GRID).fill(-1),
    }),
    false,
  );
  assert.equal(restored.restore({ ...w.snapshot(), version: 2 }), false);
});
test("automatic flight remains finite and above the shared terrain for ten simulated minutes", () => {
  const f = new Flight();
  f.position.x = -270;
  let previous = f.position.clone();
  for (let i = 0; i < 60 * 600; i++) {
    f.step(1 / 60, { roll: 0, pitch: 0, throttle: 0 });
    assert.ok(
      f.position.distanceTo(previous) < 10,
      "autopilot must not teleport at the end of the valley",
    );
    previous.copy(f.position);
    if (i % 60 === 0) {
      assert.ok(f.position.toArray().every(Number.isFinite));
      assert.ok(
        f.position.y >=
          Math.max(12, terrainHeight(f.position.x, f.position.z) + 19.9),
      );
      assert.ok(f.speed > 15 && f.speed < 150, `${f.speed}`);
    }
  }
});
test("banking changes heading and aerodynamic velocity without direct position teleportation", () => {
  const f = new Flight();
  f.assisted = false;
  const start = f.position.clone();
  for (let i = 0; i < 180; i++)
    f.step(1 / 60, { roll: 1, pitch: 0, throttle: 0 });
  assert.ok(f.heading > 0);
  assert.ok(f.bank < 0);
  assert.ok(f.velocity.x > 0);
  assert.ok(f.position.distanceTo(start) < 250);
});

test("guided arrivals reach water safely and settle onto their float displacement", async () => {
  const { Arrival } = await import("../src/arrival");
  for (const id of ["memory", "workshop", "dock"] as const) {
    const f = new Flight(),
      a = new Arrival(id, f, "fly-in");
    let landed = false;
    for (let i = 0; i < 60 * 100; i++) {
      a.step(1 / 60, f);
      assert.ok(f.position.toArray().every(Number.isFinite));
      assert.ok(f.position.y > 5.5);
      if (a.stage !== "approach" && !landed) {
        assert.ok(
          a.elapsed < 6,
          `${id}: guided touchdown must not make visitors wait`,
        );
        assert.ok(
          f.velocity.y > -2,
          `${id}: shortened approach must retain a gentle flare`,
        );
        landed = true;
      }
    }
    assert.ok(landed, `${id} did not land`);
    assert.ok(Math.abs(f.position.y - 6.6) < 0.3);
    assert.ok(f.speed < 0.5);
    assert.equal(a.stage, "moored");
    assert.equal(f.throttle, 0);
  }
});

test("the guided landing lanes clear the terrain and pier, and park beside a boarding deck", async () => {
  const { Scene, Raycaster, Vector3 } = await import("three");
  const { createPlaces, places } = await import("../src/places");
  const scene = new Scene();
  const { roots } = createPlaces(scene);
  scene.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));

  for (const [id, place] of Object.entries(places)) {
    const { x, z } = place.berth;
    const shore = Math.sign(place.x - x);
    function dockTop(dx: number, dz: number) {
      ray.ray.origin.set(x + dx, 100, z + dz);
      return ray.intersectObject(roots[id])[0]?.point.y ?? -Infinity;
    }
    // The scaled biplane has a 44 m wingspan and a 10.9 m outer float width.
    for (let dz = -14; dz <= 204; dz += 3) {
      for (let dx = -22; dx <= 22; dx += 2)
        assert.ok(
          terrainHeight(x + dx, z + dz) < -1,
          id + " crosses the shore",
        );
      for (const dx of [-5.5, -4.3, 0, 4.3, 5.5])
        assert.ok(dockTop(dx, dz) < 0, id + " pier overlaps the floats");
      for (let dx = 7; dx <= 22; dx++)
        assert.ok(
          dockTop(dx * shore, dz) < 4.4,
          id + " pier reaches the lower wing",
        );
    }
    for (const dz of [-8, 0, 8]) {
      const deck = dockTop(shore * 9, dz);
      assert.ok(
        deck > 0.5 && deck < 2,
        id + " has no boarding deck beside the floats",
      );
    }
  }
});

test("detail boundaries interpolate the actual terrain mesh orientation and triangle diagonal", async () => {
  const {
    PlaneGeometry,
    Raycaster,
    Vector3,
    Mesh,
    MeshBasicMaterial,
    DoubleSide,
  } = await import("three");
  const { terrainMeshHeight, WORLD_SIZE } = await import("../src/terrain");
  const n = 16,
    g = new PlaneGeometry(WORLD_SIZE, WORLD_SIZE, n, n);
  g.rotateX(-Math.PI / 2);
  const positions = g.getAttribute("position");
  for (let i = 0; i < positions.count; i++)
    positions.setY(i, terrainHeight(positions.getX(i), positions.getZ(i)));
  const mesh = new Mesh(g, new MeshBasicMaterial({ side: DoubleSide }));
  mesh.updateMatrixWorld();
  for (const [x, z] of [
    [130, 2300],
    [-950, 1833],
    [1117, -2673],
    [-700, -1300],
  ]) {
    const hit = new Raycaster(
      new Vector3(x, 5000, z),
      new Vector3(0, -1, 0),
    ).intersectObject(mesh)[0];
    const sample = terrainMeshHeight(x, z, n, (i) => positions.getY(i));
    assert.ok(hit);
    assert.ok(
      Math.abs(hit.point.y - sample) < 0.001,
      `${x},${z}: triangle ${hit.point.y}, sample ${sample}`,
    );
  }
});

test("crossing the world boundary reports a cut and restores assisted flight", () => {
  const flight = new Flight();
  flight.assisted = false;
  flight.position.x = 6801;
  const input = { roll: 0, pitch: 0, throttle: 0 };
  assert.equal(flight.step(1 / 60, input), "boundary-reset");
  assert.equal(flight.assisted, true);
  assert.equal(flight.step(1 / 60, input), undefined);
});

test("coastal flow is symmetric across the sea cell regardless of scan direction", () => {
  const water = new Watershed();
  water.heights.fill(1000);
  const center = GRID * 64 + 64;
  water.heights[center] = -1;
  water.surface[center] = 4;
  for (const side of [-1, 1]) {
    water.heights[center + side] = 10;
    water.surface[center + side] = 20;
    water.heights[center + 2 * side] = 1;
  }
  water.step(0.2);
  assert.ok(water.surface[center - 2] > 0);
  assert.equal(water.surface[center - 2], water.surface[center + 2]);
});
