import assert from "node:assert/strict";
import test from "node:test";
import { AdaptiveQuality } from "../src/adaptive-quality";

for (const timer of [true, false]) {
  test(`adaptive resolution recovers after sustained headroom (GPU timer: ${timer})`, () => {
    const quality = new AdaptiveQuality();
    function window(seconds: number, ratio: number) {
      for (let i = 0; i < Math.ceil(8.1 / seconds); i++)
        quality.record(seconds);
      return quality.nextRatio(ratio, 1, () =>
        timer ? { medianMs: 5, p95Ms: 7 } : null,
      );
    }
    const low = window(0.03, 1);
    assert.ok(low < 1);
    assert.equal(window(1 / 60, low), low);
    assert.equal(window(1 / 60, low), low);
    assert.ok(window(1 / 60, low) > low);
    window(1 / 60, low);
    window(1 / 60, low);
    quality.reset();
    assert.equal(window(1 / 60, low), low);
  });
}

test("adaptive resolution stays within the available pixel ratios at fractional zoom", () => {
  const quality = new AdaptiveQuality();
  const base = 0.8375;
  function sample(ms: number, current: number) {
    for (let i = 0; i < 520; i++) quality.record(ms / 1000);
    return quality.nextRatio(current, base, () => ({ medianMs: 5, p95Ms: 7 }));
  }
  assert.equal(sample(30, base), 0.8);
  assert.equal(sample(30, 0.8), 0.8);
  assert.equal(sample(16, 0.8), 0.8);
  assert.equal(sample(16, 0.8), 0.8);
  assert.equal(sample(16, 0.8), base);
});

test("without GPU timings recovery stays below a ratio that missed its frame budget", () => {
  const quality = new AdaptiveQuality();
  function sample(ms: number, ratio: number) {
    for (let i = 0; i < 520; i++) quality.record(ms / 1000);
    return quality.nextRatio(ratio, 1, () => null);
  }
  const lower = sample(30, 1);
  let recovered = lower;
  for (let n = 0; n < 24; n++) recovered = sample(16, recovered);
  assert.ok(recovered > lower && recovered < 1);
  assert.equal(sample(16, recovered), recovered);
});
