import * as T from "three";
import { terrainHeight, seededRandom, fbm } from "./terrain";
import { places } from "./places";

/** Shore stones and bent reeds: limited to the places where someone can actually see them. */
export function createShoreDetail(scene: T.Scene) {
  const random = seededRandom(71);
  type Placement = { x: number; y: number; z: number; s: number };
  const sites = Object.values(places).map((place) => {
    const stones: Placement[] = [],
      reeds: Placement[] = [];
    for (let i = 0; i < 9000; i++) {
      const x = place.x + (random() - 0.5) * 650,
        z = place.z + (random() - 0.5) * 650,
        y = terrainHeight(x, z);
      if (
        y > -3 &&
        y < 6 &&
        random() < Math.pow(fbm(x * 0.016, z * 0.016, 3), 3) * 1.8
      )
        stones.push({ x, y, z, s: 0.45 + Math.pow(random(), 2) * 4.2 });
      else if (y > 1 && y < 12 && random() > 0.7)
        reeds.push({ x, y, z, s: 1.3 + random() * 2.5 });
    }
    return { stones, reeds };
  });
  const rockGeo = new T.IcosahedronGeometry(1, 2),
    a = rockGeo.getAttribute("position");
  for (let i = 0; i < a.count; i++) {
    const v = new T.Vector3().fromBufferAttribute(a, i);
    const f = 1 + Math.sin(v.x * 11 + v.z * 7) * 0.12;
    a.setXYZ(i, v.x * f, v.y * 0.65 * f, v.z * f);
  }
  rockGeo.computeVertexNormals();
  const rockMaterial = new T.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.83,
  });
  const d = new T.Object3D(),
    c = new T.Color();
  for (const { stones } of sites) {
    const rocks = new T.InstancedMesh(rockGeo, rockMaterial, stones.length);
    stones.forEach((p, i) => {
      d.position.set(p.x, p.y - p.s * 0.28, p.z);
      d.scale.set(
        p.s,
        p.s * (0.7 + random() * 0.4),
        p.s * (1 + random() * 0.5),
      );
      d.rotation.set(0, random() * 6.28, 0);
      d.updateMatrix();
      rocks.setMatrixAt(i, d.matrix);
      c.setHSL(0.1 + random() * 0.04, 0.09, 0.18 + random() * 0.13);
      rocks.setColorAt(i, c);
    });
    rocks.castShadow = rocks.receiveShadow = true;
    scene.add(rocks);
  }
  const positions: number[] = [],
    indices: number[] = [];
  for (let j = 0; j < 5; j++) {
    const angle = j * 2.4,
      w = 0.035,
      h = 0.75 + random() * 0.5,
      dx = Math.cos(angle),
      dz = Math.sin(angle),
      base = positions.length / 3;
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      for (const side of [-1, 1])
        positions.push(
          dx * t * t * 0.35 + dz * w * (1 - t) * side,
          t * h,
          dz * t * t * 0.35 - dx * w * (1 - t) * side,
        );
      if (k > 0) {
        const n = base + k * 2;
        indices.push(n - 2, n, n - 1, n - 1, n, n + 1);
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const reedMaterial = new T.MeshStandardMaterial({
    color: 0x788355,
    side: T.DoubleSide,
    roughness: 1,
  });
  for (const { reeds } of sites) {
    const grass = new T.InstancedMesh(g, reedMaterial, reeds.length);
    reeds.forEach((p, i) => {
      d.position.set(p.x, p.y, p.z);
      d.scale.setScalar(p.s);
      d.rotation.y = random() * 6.28;
      d.updateMatrix();
      grass.setMatrixAt(i, d.matrix);
    });
    scene.add(grass);
  }
}
