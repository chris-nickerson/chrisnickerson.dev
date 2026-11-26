export const WORLD_SIZE = 15000;
export function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
export function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function hash(x: number, y: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function noise(x: number, y: number) {
  const i = Math.floor(x),
    j = Math.floor(y);
  let u = x - i,
    v = y - j;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  const a = hash(i, j),
    b = hash(i + 1, j),
    c = hash(i, j + 1),
    d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, z: number, octaves = 5) {
  let v = 0,
    a = 0.5;
  for (let i = 0; i < octaves; i++) {
    v += noise(x, z) * a;
    x = x * 2.03 + 12.7;
    z = z * 2.03 + 4.3;
    a *= 0.5;
  }
  return v;
}
export function riverCenter(z: number) {
  return Math.sin(z * 0.00043) * 690 + Math.sin(z * 0.00103) * 210;
}
const summits = [
  [-2700, -2400, 2200, 1550],
  [2700, -3600, 3100, 1650],
  [-3600, 2200, 1500, 1650],
  [3600, 1300, 1750, 1600],
  [-2600, -6800, 2600, 1900],
  [3900, -7000, 2700, 1650],
  [-5200, -800, 1700, 1800],
  [6100, -2000, 2100, 1900],
].map(([x, z, height, radius]) => ({
  x,
  z,
  logHeight: Math.log(height),
  radiusSquared: radius * radius,
}));
function mountainRelief(x: number, z: number) {
  let maxLogHeight = -Infinity;
  for (const summit of summits)
    maxLogHeight = Math.max(
      maxLogHeight,
      summit.logHeight -
        ((x - summit.x) ** 2 + (z - summit.z) ** 2) / summit.radiusSquared,
    );
  const mass = Math.exp(maxLogHeight);
  let ridge = 0,
    a = 0.5,
    fx = x * 0.0009 + 8.2,
    fz = z * 0.0009 - 14.3;
  for (let i = 0; i < 6; i++) {
    ridge += a * (1 - Math.abs(noise(fx, fz) * 2 - 1));
    fx = fx * 2.07 + 3.1;
    fz = fz * 2.07 + 7.4;
    a *= 0.5;
  }
  return 140 + mass * (0.5 + ridge * 0.65);
}

/** One shared height function drives geometry, collisions, trees, and the hydrology. */
export function terrainHeight(x: number, z: number) {
  const warp = (fbm(x * 0.0006 + 40, z * 0.0006 + 30, 3) - 0.4) * 260;
  const d = Math.abs(x - riverCenter(z) + warp);
  const basin = 650 + 320 * Math.exp(-(((z + 1600) / 1800) ** 2));
  const shoulder = smoothstep(basin, basin + 1750, d);
  const mountain = shoulder === 0 ? 0 : shoulder * mountainRelief(x, z);
  const detailWeight = smoothstep(basin - 80, basin + 500, d);
  const detail =
    detailWeight === 0
      ? 0
      : (fbm(x * 0.004, z * 0.004, 5) - 0.42) * 160 * detailWeight;
  const valley = mountain + detail - 38;
  const peninsula =
    Math.exp(-((x + 1100) ** 2 + (z - 1200) ** 2) / 400000) * 190;
  const island =
    Math.exp(-((x + 720) ** 2 / (290 * 290) + (z + 1450) ** 2 / (680 * 680))) *
    155;
  return valley + peninsula * smoothstep(300, 650, d) + island;
}
export function seededRandom(seed = 1234) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample the actual indexed PlaneGeometry triangles, whose rotated rows run from -Z to +Z. */
export function terrainMeshHeight(
  x: number,
  z: number,
  segments: number,
  heightAt: (index: number) => number,
) {
  const step = WORLD_SIZE / segments;
  const u = clamp((x + WORLD_SIZE / 2) / step, 0, segments - 0.000001);
  const v = clamp((z + WORLD_SIZE / 2) / step, 0, segments - 0.000001);
  const ix = Math.floor(u),
    iz = Math.floor(v),
    fx = u - ix,
    fz = v - iz;
  const k = iz * (segments + 1) + ix;
  const a = heightAt(k),
    b = heightAt(k + segments + 1),
    c = heightAt(k + segments + 2),
    d = heightAt(k + 1);
  return fx + fz < 1
    ? a * (1 - fx - fz) + b * fz + d * fx
    : b * (1 - fx) + d * (1 - fz) + c * (fx + fz - 1);
}
