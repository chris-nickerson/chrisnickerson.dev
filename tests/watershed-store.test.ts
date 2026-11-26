import assert from "node:assert/strict";
import test from "node:test";
import { Watershed } from "../src/hydrology";
import { WatershedStore } from "../src/watershed-store";

test("a stale tab cannot save over newer progress or resurrect a reset", () => {
  let saved: string | null = null;
  const storage = () => ({
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  });
  const a = new WatershedStore(storage),
    b = new WatershedStore(storage);
  const old = new Watershed(),
    current = new Watershed();
  a.refresh(old);
  b.refresh(current);
  current.deposit(0, 0, 10);
  b.save(current);
  a.save(old);
  const loaded = new Watershed();
  new WatershedStore(storage).refresh(loaded);
  assert.equal(loaded.delivered, 10);
  old.clear();
  a.save(old, "reset");
  current.deposit(0, 0, 3);
  b.save(current);
  new WatershedStore(storage).refresh(loaded);
  assert.equal(loaded.delivered, 0);
  assert.equal(current.delivered, 0);
  current.deposit(0, 0, 4);
  b.save(current);
  new WatershedStore(storage).refresh(loaded);
  assert.equal(loaded.delivered, 4);
});

for (const corrupt of ["{", "null", "{}", '{"version":1,"delivered":-1}'])
  test(`corrupt data can be replaced: ${corrupt}`, () => {
    let saved = corrupt;
    const store = new WatershedStore(() => ({
      getItem: () => saved,
      setItem: (_key, data) => {
        saved = data;
      },
    }));
    const watershed = new Watershed();
    store.refresh(watershed);
    assert.equal(store.available, true);
    store.save(watershed);
    assert.equal(JSON.parse(saved).version, 1);
  });

test("an unreadable save version preserves the live flight and the foreign snapshot", () => {
  let stored: string | null = null;
  const store = new WatershedStore(() => ({
    getItem: () => stored,
    setItem: (_key, value) => {
      stored = value;
    },
  }));
  const watershed = new Watershed();
  watershed.deposit(0, 0, 5);
  stored = '{"version":2}';
  store.refresh(watershed);
  store.save(watershed);
  assert.equal(watershed.delivered, 5);
  assert.equal(store.available, false);
  assert.equal(stored, '{"version":2}');
  stored = null;
  store.refresh(watershed);
  assert.equal(store.available, true);
  assert.equal(watershed.delivered, 0);
});

test("evaporation in a passive tab cannot roll back watering in the active tab", () => {
  let saved: string | null = null;
  const storage = () => ({
    getItem: () => saved,
    setItem: (_key: string, data: string) => {
      saved = data;
    },
  });
  const active = new Watershed(),
    passive = new Watershed();
  const writer = new WatershedStore(storage),
    observer = new WatershedStore(storage);
  active.deposit(0, 0, 20);
  active.moisture[0] = 20;
  writer.save(active);
  observer.refresh(passive);
  const original = saved;
  active.deposit(0, 0, 4);
  passive.step(5);
  observer.save(passive);
  assert.equal(saved, original);
  writer.save(active);
  observer.refresh(passive);
  assert.equal(passive.delivered, 24);
});

test("a focused flight persists evaporation even without depositing more water", () => {
  const original = new Watershed();
  original.moisture[0] = 20;
  let saved = JSON.stringify(original.snapshot());
  const storage = () => ({
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  });
  const store = new WatershedStore(storage, () => true);
  const active = new Watershed();
  store.refresh(active);
  active.step(5);
  store.save(active);
  const next = new Watershed();
  new WatershedStore(storage).refresh(next);
  assert.ok(next.moisture[0] < 20);
  assert.ok(Math.abs(next.moisture[0] - active.moisture[0]) < 0.001);
});

test("the outgoing window flushes its final soil change even after losing focus", () => {
  const basin = new Watershed();
  basin.moisture[0] = 10;
  let saved = JSON.stringify(basin.snapshot());
  const store = new WatershedStore(
    () => ({
      getItem: () => saved,
      setItem: (_key, value) => {
        saved = value;
      },
    }),
    () => false,
  );
  store.refresh(basin);
  basin.step(5);
  store.save(basin, "blur");
  assert.ok(JSON.parse(saved).moisture[0] < 10);
  saved = '{"version":2}';
  store.save(basin, "blur");
  assert.equal(saved, '{"version":2}');
  basin.clear();
  store.save(basin, "reset");
  assert.equal(JSON.parse(saved).version, 1);
  assert.equal(JSON.parse(saved).delivered, 0);
});
