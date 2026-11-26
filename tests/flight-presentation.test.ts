import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3, Euler } from "three";
import { FlightPresentation } from "../src/flight-presentation";
function pose() {
  return {
    position: new Vector3(),
    quaternion: new Quaternion(),
    heading: 0,
    bank: 0,
    pitch: 0,
  };
}
for (const hz of [60, 90, 120, 144, 165])
  test(`constant flight has even visible motion at ${hz} Hz without changing physics`, () => {
    const state = pose(),
      view = new FlightPresentation();
    view.reset(state);
    let accumulator = 0,
      ticks = 0;
    const positions: number[] = [];
    for (let i = 0; i < hz * 2; i++) {
      accumulator += 1 / hz;
      while (accumulator >= 1 / 60) {
        view.beforeStep(state);
        state.position.z -= 60 / 60;
        ticks++;
        accumulator -= 1 / 60;
      }
      view.sample(state, accumulator * 60);
      positions.push(view.position.z);
    }
    for (let i = 3; i < positions.length; i++)
      assert.ok(Math.abs(positions[i - 1] - positions[i] - 60 / hz) < 1e-9);
    assert.equal(state.position.z, -ticks);
  });
test("heading wrap and orientation interpolate by the short arc; relocation discards history", () => {
  const state = pose(),
    view = new FlightPresentation();
  state.heading = Math.PI - 0.01;
  state.quaternion.setFromEuler(new Euler(0, state.heading, 0));
  view.reset(state);
  view.beforeStep(state);
  state.heading = -Math.PI + 0.01;
  state.quaternion.setFromEuler(new Euler(0, state.heading, 0));
  view.sample(state, 0.5);
  assert.ok(Math.abs(view.heading - Math.PI) < 1e-10);
  assert.ok(
    view.quaternion.angleTo(
      new Quaternion().setFromEuler(new Euler(0, Math.PI, 0)),
    ) < 1e-6,
  );
  state.position.set(5000, 8, -3000);
  view.reset(state);
  view.sample(state, 0.1);
  assert.deepEqual(view.position.toArray(), state.position.toArray());
});
