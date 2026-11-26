import test from "node:test";
import assert from "node:assert/strict";
import { Flight } from "../src/flight";
import { places } from "../src/places";
import { terrainHeight } from "../src/terrain";
const idle = { roll: 0, pitch: 0, throttle: 0 };
function approach(heading = 0, sink = -3) {
  const f = new Flight();
  f.assisted = false;
  f.heading = heading;
  f.position.set(0, 15, 0);
  f.velocity.set(Math.sin(heading) * 40, sink, -Math.cos(heading) * 40);
  f.throttle = 0.42;
  return f;
}
test("manual approaches touch the floats from any heading and settle without the altitude bounce", () => {
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const f = approach(heading);
    let touched = false;
    for (let i = 0; i < 60 * 40; i++) {
      f.step(1 / 60, idle);
      if (f.onWater) touched = true;
      if (touched) {
        assert.equal(f.onWater, true);
        assert.ok(f.position.y < 8);
        assert.ok(f.position.y > 5.4);
        assert.ok(f.velocity.y < 2);
      }
    }
    assert.ok(touched);
    assert.equal(f.landingCount, 1);
    assert.equal(f.throttle, 0);
    assert.ok(f.speed < 0.5);
    assert.ok(Math.abs(f.position.y - 6.6) < 0.15);
  }
});
test("a steep descent is caught without tunnelling or a launch back into the air", () => {
  const f = approach(0, -25);
  f.position.y = 8;
  for (let i = 0; i < 240; i++) {
    f.step(1 / 60, { ...idle, pitch: -1 });
    assert.ok(f.position.y > 5.4);
  }
  assert.equal(f.onWater, true);
  assert.equal(f.landingCount, 1);
  assert.ok(f.touchdownSink > 15);
  assert.ok(Math.abs(f.position.y - 6.6) < 0.2);
});
test("a takeoff accelerates on water, rotates, and climbs continuously without repositioning", () => {
  const f = approach();
  for (let i = 0; i < 1200; i++) f.step(1 / 60, idle);
  assert.equal(f.onWater, true);
  f.requestTakeoff();
  let prior = f.position.clone(),
    airborne = false;
  for (let i = 0; i < 1200; i++) {
    f.step(1 / 60, idle);
    assert.ok(f.position.distanceTo(prior) < 2);
    prior.copy(f.position);
    if (!f.onWater) airborne = true;
    if (airborne)
      assert.equal(
        f.onWater,
        false,
        "takeoff must not fall back onto its floats",
      );
  }
  assert.ok(airborne);
  assert.ok(f.position.y > 40);
  assert.equal(f.landingCount, 1);
});
test("water taxi responds to steering and keeps the floats out of a bank", () => {
  const f = approach();
  f.onWater = true;
  f.position.y = 6.6;
  f.throttle = 0.3;
  f.velocity.set(0, 0, -4);
  for (let i = 0; i < 180; i++) f.step(1 / 60, { ...idle, roll: 1 });
  assert.ok(f.heading > 0.4);
  assert.ok(f.velocity.x > 0);
  let edge = 0;
  for (let x = 0; x < 2000; x += 2)
    if (terrainHeight(x, 0) > -0.4) {
      edge = x;
      break;
    }
  assert.ok(edge > 0);
  f.position.set(edge - 15, 6.6, 0);
  f.heading = Math.PI / 2;
  f.velocity.set(8, 0, 0);
  f.throttle = 0.5;
  for (let i = 0; i < 300; i++) f.step(1 / 60, idle);
  assert.equal(f.shoreBlocked, true);
  assert.ok(terrainHeight(f.position.x, f.position.z) < 0);
  assert.ok(f.position.y < 7);
});

test("manual destination approaches leave a clear float-width water run beside the berths", () => {
  for (const [id, place] of Object.entries(places)) {
    const flight = new Flight();
    flight.enterManualApproach(place.berth, place.x);
    assert.equal(flight.assisted, false);
    assert.equal(flight.heading, 0);
    assert.ok(flight.velocity.z < 0 && flight.velocity.y < 0);
    assert.ok(flight.position.y > place.berth.y);
    assert.ok(flight.position.z > place.berth.z);
    for (let z = flight.position.z; z > place.berth.z - 450; z -= 5)
      for (const dx of [-10, 0, 10])
        assert.ok(
          terrainHeight(flight.position.x + dx, z) < -1,
          `${id}: shallow approach at ${z}`,
        );
  }
});
