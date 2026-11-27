import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { terrainHeight } from "./terrain";
import { createNightLights, tagWindow } from "./night-lights";
export type PlaceId = "memory" | "workshop" | "dock";
export const places = {
  memory: {
    x: -292,
    z: 1800,
    berth: new T.Vector3(-153, 6.6, 1828),
    color: 0x899e8e,
  },
  workshop: {
    x: 752,
    z: -1280,
    berth: new T.Vector3(636, 6.6, -1252),
    color: 0x965846,
  },
  dock: {
    x: -1030,
    z: -1420,
    berth: new T.Vector3(-1115, 6.6, -1392),
    color: 0xc4bcaa,
  },
} satisfies Record<
  PlaceId,
  {
    x: number;
    z: number;
    berth: T.Vector3;
    color: number;
  }
>;

export function createPlaces(scene: T.Scene) {
  const roots: Record<string, T.Group> = {};
  const rotors: T.Group[] = [];
  const lighting = createNightLights(scene);
  for (const [id, p] of Object.entries(places)) {
    const root = new T.Group();
    roots[id] = root;
    // Keep the porch and the landward end of its gangway above the bank.
    root.position.set(
      p.x,
      Math.max(3, terrainHeight(p.x, p.z), terrainHeight(p.x, p.z + 28)),
      p.z,
    );
    scene.add(root);
    const station = lighting.station(root);
    let greenhouse: T.MeshPhysicalMaterial | undefined;
    const buckets = new Map<T.MeshStandardMaterial, T.BufferGeometry[]>();
    const wood = new T.MeshStandardMaterial({
        color: 0x736044,
        roughness: 0.9,
      }),
      wall = new T.MeshStandardMaterial({ color: p.color, roughness: 0.8 }),
      roof = new T.MeshStandardMaterial({
        color: 0x435654,
        roughness: 0.55,
        metalness: 0.3,
      }),
      frame = new T.MeshStandardMaterial({ color: 0xc7ccbb, roughness: 0.65 }),
      glass = new T.MeshStandardMaterial({
        color: 0x38595a,
        emissive: 0xb98d5e,
        emissiveIntensity: 0.08,
        roughness: 0.26,
        metalness: 0.45,
      }),
      lantern = glass.clone(),
      light = new T.MeshStandardMaterial({
        color: 0xffd49a,
        emissive: 0xffc175,
        emissiveIntensity: 0.6,
        roughness: 0.2,
      });
    wood.onBeforeCompile = (shader) => {
      shader.vertexShader = "varying vec3 vTimber;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vTimber=position;",
      );
      shader.fragmentShader = "varying vec3 vTimber;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\n diffuseColor.rgb *= .82+.18*sin(vTimber.y*35.+sin(vTimber.x*.7)*2.+vTimber.z*4.);",
      );
    };
    wall.onBeforeCompile = (shader) => {
      shader.vertexShader = "varying vec3 vBoard;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vBoard=position;",
      );
      shader.fragmentShader = "varying vec3 vBoard;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float seam=1.-smoothstep(.02,.045,abs(fract(vBoard.y*.65)-.5));
        diffuseColor.rgb *= 1.-seam*.15;
      `,
      );
    };
    function part(
      g: T.BufferGeometry,
      m: T.MeshStandardMaterial,
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
      rz = 0,
    ) {
      const o = new T.Object3D();
      o.position.set(x, y, z);
      o.rotation.set(rx, ry, rz);
      o.updateMatrix();
      if (m === glass) tagWindow(g, x, z);
      g.applyMatrix4(o.matrix);
      if (!buckets.has(m)) buckets.set(m, []);
      buckets.get(m)!.push(g);
    }
    function box(
      w: number,
      h: number,
      d: number,
      m: T.MeshStandardMaterial,
      x: number,
      y: number,
      z: number,
      ry = 0,
    ) {
      part(new T.BoxGeometry(w, h, d), m, x, y, z, 0, ry);
    }
    function beam(
      a: number[],
      b: number[],
      r: number,
      m: T.MeshStandardMaterial,
    ) {
      const v = new T.Vector3(...a),
        q = new T.Vector3(...b),
        delta = q.clone().sub(v),
        g = new T.CylinderGeometry(r, r, delta.length(), 6),
        o = new T.Object3D();
      o.position.copy(v.add(q).multiplyScalar(0.5));
      o.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        delta.normalize(),
      );
      o.updateMatrix();
      g.applyMatrix4(o.matrix);
      if (!buckets.has(m)) buckets.set(m, []);
      buckets.get(m)!.push(g);
    }
    function ground(x: number, z: number) {
      return (
        terrainHeight(root.position.x + x, root.position.z + z) -
        root.position.y
      );
    }
    function deck(
      width: number,
      depth: number,
      x: number,
      z: number,
      top: number,
    ) {
      box(width, 1.1, depth, wood, x, top - 0.55, z);
      for (const dx of [-width / 2 + 1, 0, width / 2 - 1]) {
        for (const dz of [-depth / 2 + 1, depth / 2 - 1]) {
          const px = x + dx,
            pz = z + dz;
          if (ground(px, pz) < top - 1)
            beam([px, ground(px, pz) - 1, pz], [px, top - 0.6, pz], 0.56, wood);
        }
      }
    }
    function cabin(x: number, z: number, w: number, d: number, h: number) {
      box(w, h, d, wall, x, h / 2 + 3, z);
      box(w + 4, 2, d + 4, wood, x, 2, z);
      const pitch = 0.42;
      const rise = Math.tan(pitch) * w * 0.5;
      for (const side of [-1, 1]) {
        part(
          new T.BoxGeometry((w * 0.5) / Math.cos(pitch) + 2, 1, d + 4),
          roof,
          x + side * w * 0.25,
          h + 3 + rise * 0.5,
          z,
          0,
          0,
          -side * pitch,
        );
      }
      for (const side of [-1, 1]) {
        const g = new T.BufferGeometry();
        g.setAttribute(
          "position",
          new T.Float32BufferAttribute(
            [-w / 2, h + 3, 0, w / 2, h + 3, 0, 0, h + 3 + rise, 0],
            3,
          ),
        );
        g.setAttribute(
          "uv",
          new T.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2),
        );
        g.setIndex(side === 1 ? [0, 1, 2] : [2, 1, 0]);
        g.computeVertexNormals();
        part(g, wall, x, 0, z + (side * d) / 2);
      }
      for (const a of [-1, 1])
        for (const b of [-1, 1]) {
          const px = x + a * w * 0.44,
            pz = z + b * d * 0.43;
          beam(
            [px, terrainHeight(p.x + px, p.z + pz) - root.position.y - 1, pz],
            [px, 3, pz],
            0.7,
            wood,
          );
        }
      // Pale casings frame recessed glazing on both the gable and water side.
      const wy = h * 0.56 + 3,
        wh = h * 0.44;
      for (const sign of [-1, 1]) {
        const wx = x + sign * w * 0.3,
          front = z + d / 2,
          ww = w * 0.17;
        box(ww + 0.8, wh + 0.8, 0.48, frame, wx, wy, front + 0.2);
        box(ww, wh, 0.3, glass, wx, wy, front + 0.49);
        box(0.28, wh, 0.32, frame, wx, wy, front + 0.56);
        box(ww, 0.24, 0.32, frame, wx, wy + wh * 0.12, front + 0.56);
        for (const row of [-1, 0, 1]) {
          const sx = x + sign * (w / 2 + 0.24),
            sz = z + row * d * 0.29,
            sw = d * 0.19;
          box(0.48, wh + 0.8, sw + 0.8, frame, sx, wy, sz);
          box(0.32, wh, sw, glass, sx + sign * 0.29, wy, sz);
          box(0.36, wh, 0.32, frame, sx + sign * 0.37, wy, sz);
          box(0.36, 0.24, sw, frame, sx + sign * 0.37, wy + wh * 0.12, sz);
        }
        box(0.55, h + 0.15, 0.55, frame, x + (sign * w) / 2, 3 + h / 2, front);
      }
      box(5, h * 0.7, 0.8, wood, x, h * 0.35 + 3, z + d / 2 + 0.7);
      for (const side of [-1, 1])
        part(
          new T.CylinderGeometry(0.65, 0.8, 9, 8),
          wood,
          x + side * w * 0.45,
          -1.5,
          z + d * 0.42,
        );
    }
    if (id === "memory") {
      cabin(-8, -8, 42, 30, 15);
      cabin(-30, -43, 24, 22, 12);
      // An inhabited glass growing room, connected to the archive house.
      deck(29, 35, 30, -12, 4);
      greenhouse = new T.MeshPhysicalMaterial({
        color: 0xb1cfc2,
        roughness: 0.18,
        metalness: 0.08,
        transparent: true,
        opacity: 0.32,
        side: T.DoubleSide,
        depthWrite: false,
      });
      for (const x of [23, 38]) station.lamp(x, 13.6, -3.9, 7);
      const green = new T.MeshStandardMaterial({
        color: 0x587e39,
        roughness: 1,
      });
      const shell = new T.BufferGeometry();
      shell.setAttribute(
        "position",
        new T.Float32BufferAttribute(
          [
            18, 4, 5, 18, 24, -12, 18, 4, -29, 43, 4, 5, 43, 24, -12, 43, 4,
            -29,
          ],
          3,
        ),
      );
      shell.setAttribute(
        "uv",
        new T.Float32BufferAttribute(
          [0, 0, 0.5, 1, 1, 0, 0, 0, 0.5, 1, 1, 0],
          2,
        ),
      );
      shell.setIndex([0, 1, 3, 3, 1, 4, 1, 2, 4, 4, 2, 5, 0, 2, 1, 3, 4, 5]);
      shell.computeVertexNormals();
      part(shell, greenhouse, 0, 0, 0);
      for (let x = 22; x <= 39; x += 5)
        for (const z of [-21, -12, -3]) {
          box(3.5, 1.1, 5, wood, x, 5, z);
          part(new T.IcosahedronGeometry(2.0, 1), green, x, 6.8, z);
        }

      for (let x = 18; x <= 43; x += 5) {
        beam([x, 4, 5], [x, 24, -12], 0.35, frame);
        beam([x, 24, -12], [x, 4, -29], 0.35, frame);
      }
      beam([18, 24, -12], [43, 24, -12], 0.4, frame);
      // A fine ridge cap and glazing bars pick out the greenhouse in the trees.
      for (const slope of [-1, 1])
        beam(
          [18, 14, -12 + slope * 8.5],
          [43, 14, -12 + slope * 8.5],
          0.22,
          frame,
        );
      // A slender wind rotor makes the landmark legible from the air.
      beam([-45, ground(-45, 20) - 1, 20], [-45, 59, 20], 0.8, frame);
      const rotor = new T.Group();
      rotor.position.set(-45, 56, 20);
      root.add(rotor);
      rotors.push(rotor);
      for (let j = 0; j < 3; j++) {
        const blade = new T.Mesh(new T.BoxGeometry(1.5, 19, 0.45), frame);
        blade.position.set(Math.sin(j * 2.094) * 9, Math.cos(j * 2.094) * 9, 0);
        blade.rotation.z = -j * 2.094;
        rotor.add(blade);
      }
    } else if (id === "workshop") {
      cabin(0, 0, 46, 40, 17);
      cabin(8, -39, 22, 25, 12);
      deck(70, 58, 2, 8, 2.5);
      for (const x of [-29, 29]) beam([x, 2, 35], [x, 29, 35], 0.8, frame);
      beam([-29, 29, 35], [29, 29, 35], 0.85, frame);
      for (const x of [-22, 22]) station.lamp(x, 28, 35, 9);
      beam([10, 29, 35], [10, 12, 35], 0.3, wood);
      deck(14, 14, -31, -15, 2.5);
      part(new T.CylinderGeometry(5, 5, 9, 24), roof, -31, 7, -15);
      part(new T.ConeGeometry(5.3, 2.2, 24), frame, -31, 12.6, -15);
      for (const y of [3.5, 7.2, 10.8])
        part(new T.CylinderGeometry(5.1, 5.1, 0.26, 24), frame, -31, y, -15);
      // The open boat shed and its overhead hoist face the landing.
      box(22, 13, 0.65, roof, 0, 9, 21);
      for (const x of [-11.5, 11.5]) box(1.2, 14, 1.3, frame, x, 9.5, 21.5);
      box(24, 1.2, 1.5, frame, 0, 16.5, 21.5);
      part(
        new T.TorusGeometry(1.0, 0.25, 6, 14, Math.PI * 1.65),
        frame,
        10.6,
        11.4,
        35,
      );
      for (let j = 0; j < 3; j++) {
        const x = 17 + j * 5;
        part(new T.CylinderGeometry(1.65, 1.65, 4.5, 14), wall, x, 4.9, 26);
        for (const y of [3.7, 6.2])
          part(new T.CylinderGeometry(1.72, 1.72, 0.3, 14), frame, x, y, 26);
      }
    } else {
      cabin(0, -8, 25, 23, 13);
      cabin(-4, -34, 14, 18, 9);
      // Small lighthouse: the contact place has a distinct silhouette without becoming a monument.
      const foundation = new T.MeshStandardMaterial({
        color: 0x777a6d,
        roughness: 0.97,
      });
      const footing =
        Math.min(
          ground(-32, -27),
          ground(-22, -37),
          ground(-22, -17),
          ground(-12, -27),
          0,
        ) - 2;
      part(
        new T.CylinderGeometry(8.9, 10, 1 - footing, 20),
        foundation,
        -22,
        (1 + footing) / 2,
        -27,
      );
      part(new T.CylinderGeometry(6, 8, 40, 16), frame, -22, 20, -27);
      part(new T.CylinderGeometry(7.5, 7.5, 4, 16), roof, -22, 41, -27);
      part(new T.CylinderGeometry(5.5, 5.5, 7, 16), lantern, -22, 46, -27);
      part(new T.ConeGeometry(8, 5, 16), roof, -22, 52, -27);
      part(new T.CylinderGeometry(6.95, 7.2, 5, 16), roof, -22, 25, -27);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6,
          b = ((i + 1) * Math.PI) / 6;
        const x = -22 + Math.cos(a) * 7,
          z = -27 + Math.sin(a) * 7;
        beam([x, 43, z], [x, 45.5, z], 0.18, frame);
        beam(
          [x, 45.5, z],
          [-22 + Math.cos(b) * 7, 45.5, -27 + Math.sin(b) * 7],
          0.18,
          frame,
        );
        if (i % 2 === 0)
          beam(
            [-22 + Math.cos(a) * 5.6, 43, -27 + Math.sin(a) * 5.6],
            [-22 + Math.cos(a) * 5.6, 49, -27 + Math.sin(a) * 5.6],
            0.25,
            roof,
          );
      }
      part(new T.CylinderGeometry(5.58, 5.58, 1.4, 16), light, -22, 46.5, -27);
      station.lamp(-22, 46.5, -27, 19, "beacon");
    }
    if (id !== "workshop") deck(49, 27, 0, 17, 2.5);
    // A porch bench, stacked firewood, and small lanterns give the visit a human scale.
    for (const x of [-15, -6]) {
      box(7, 0.5, 2.4, wood, x, 4.8, 15);
      box(7, 2, 0.4, wood, x, 6.1, 14);
      for (const side of [-1, 1])
        box(0.5, 2.7, 2, roof, x + side * 2.6, 3.6, 15);
    }
    for (let j = 0; j < 9; j++)
      part(
        new T.CylinderGeometry(0.55, 0.55, 3.8, 8),
        wood,
        14 + (j % 3) * 1.2,
        3 + Math.floor(j / 3) * 1.1,
        17,
        Math.PI / 2,
      );
    const shoreSide = Math.sign(p.x - p.berth.x);
    for (const x of [-22, 22]) {
      beam([x, 1, 16], [x, 7, 16], 0.16, roof);
      box(0.8, 1.3, 0.8, light, x, 7, 16);
      station.lamp(
        x,
        7,
        16,
        6.3,
        Math.sign(x) === -shoreSide ? "shore" : "lamp",
      );
      box(1.4, 0.2, 1.4, roof, x, 7.8, 16);
    }
    // The berth is the centre of the aircraft. The pontoon runs parallel to
    // its floats, with a low, unobstructed boarding edge under the wing.
    const deckY = 1.15 - root.position.y;
    const faceX = p.berth.x - p.x + shoreSide * 7.3;
    const dockZ = p.berth.z - p.z;
    const dockWidth = 8,
      dockLength = 31;
    const dockX = faceX + (shoreSide * dockWidth) / 2;
    for (const end of [-1, 1])
      station.lamp(
        dockX + shoreSide * 3.3,
        deckY + 0.47,
        dockZ + end * 14.4,
        5.7,
        "marker",
      );
    box(dockWidth, 1.1, dockLength, roof, dockX, deckY - 0.85, dockZ);
    for (let i = 0; i < 32; i++)
      box(
        dockWidth,
        0.5,
        dockLength / 32 - 0.035,
        wood,
        dockX,
        deckY,
        dockZ + ((i - 15.5) * dockLength) / 32,
      );
    for (const dz of [-11, 0, 11]) {
      part(
        new T.CylinderGeometry(0.45, 0.45, 1.2, 12),
        roof,
        faceX - shoreSide * 0.35,
        deckY - 0.43,
        dockZ + dz,
      );
      const cleatX = faceX + shoreSide * 0.9;
      box(0.4, 0.45, 0.65, frame, cleatX, deckY + 0.45, dockZ + dz);
      box(0.46, 0.3, 1.65, frame, cleatX, deckY + 0.78, dockZ + dz);
    }

    const start = new T.Vector3(
      -shoreSide * (id === "workshop" ? 33 : 24.5),
      2.25,
      28,
    );
    const end = new T.Vector3(faceX + shoreSide * dockWidth, deckY, dockZ);
    const run = end.x - start.x;
    const count = Math.ceil(Math.abs(run) / 1.5);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      box(
        Math.abs(run) / count - 0.03,
        0.55,
        5.4,
        wood,
        start.x + run * t,
        start.y + (end.y - start.y) * t,
        start.z + (end.z - start.z) * t,
      );
    }
    for (const dz of [-2.35, 2.35]) {
      const z = start.z + dz;
      beam([start.x, start.y - 0.38, z], [end.x, end.y - 0.38, z], 0.35, wood);
      const bays = Math.ceil(Math.abs(run) / 11);
      for (let i = 0; i <= bays; i++) {
        const t = i / bays,
          x = start.x + run * t,
          y = start.y + (end.y - start.y) * t;
        const bed = terrainHeight(p.x + x, p.z + z) - root.position.y;
        beam([x, Math.min(y - 1, bed - 1), z], [x, y + 1.9, z], 0.32, wood);
        if (dz < 0 && (i % 2 === 0 || i === bays))
          station.lamp(x, y + 2.22, z, 5.3);
      }
      beam([start.x, start.y + 1.9, z], [end.x, end.y + 1.9, z], 0.17, frame);
    }
    for (const [m, geometries] of buckets) {
      const geometry = mergeGeometries(geometries);
      let material = m;
      if (m === glass) material = lighting.windows(m);
      else if (m === lantern)
        lighting.emissive(m, new T.Color(0.93, 0.54, 0.19), 1);
      else if (m === light) lighting.emissive(m, new T.Color(0xffcf88), 2.7);
      else if (m === greenhouse)
        lighting.emissive(m, new T.Color(0xe2ae70), 0.13);
      else material = station.surface(m);
      const mesh = new T.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
  lighting.finish();
  return {
    roots,
    setNight: lighting.setNight,
    update: (time: number, aircraft: T.Vector3) => {
      rotors.forEach((r) => (r.rotation.z = time * 0.65));
      lighting.update(time, aircraft);
    },
  };
}
