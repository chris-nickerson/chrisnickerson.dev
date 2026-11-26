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
  a.save(old, true);
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

test("malformed JSON does not disable saving a replacement", () => {
  let saved = "{";
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
