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
