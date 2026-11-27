import * as T from "three";
import { seededRandom } from "./terrain";

export function createWaveSlopeTexture() {
  const size = 128;
  const samples = new Float32Array(size * size * 4);
  const cos = Float32Array.from({ length: size }, (_, i) =>
    Math.cos((2 * Math.PI * i) / size),
  );
  const random = seededRandom(7301);
  for (const band of [0, 2]) {
    for (let i = 0; i < 40; i++) {
      const angle = (random() - 0.5) * 2.5;
      const frequency = 2 + random() ** 1.6 * 15;
      const kx = Math.round(frequency * Math.cos(angle));
      const ky = Math.round(frequency * Math.sin(angle));
      const phase = Math.floor(random() * size);
      const weight = (0.75 + random() * 0.5) / Math.hypot(kx, ky);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const slope = cos[(kx * x + ky * y + phase) & (size - 1)] * weight;
          const offset = (y * size + x) * 4 + band;
          samples[offset] += kx * slope;
          samples[offset + 1] += ky * slope;
        }
      }
    }
  }
  const pixels = Uint8Array.from(samples, (s) =>
    Math.round(T.MathUtils.clamp(128 + s * 12, 0, 255)),
  );
  const texture = new T.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
