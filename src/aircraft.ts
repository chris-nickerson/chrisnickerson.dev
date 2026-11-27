import * as T from "three";
import { createAirframe } from "./airframe";
import { buildMonoplane } from "./monoplanes";
import { fleet, type AircraftId } from "./fleet";

export function createAircraft(id: AircraftId = "survey") {
  const airframe = createAirframe(fleet[id].name);
  airframe.addFloats();
  if (id !== "survey") return buildMonoplane(airframe, id);
  const {
    root,
    mesh,
    rod,
    tube,
    ellipsoid,
    wing,
    enamel,
    cream,
    petrol,
    metal,
    black,
    leather,
    wood,
  } = airframe;
  // Longitudinal cross sections, with a real cut-out in the upper fuselage.
  const profile = new T.CatmullRomCurve3([
    new T.Vector3(0.73, 0.75, -4.4),
    new T.Vector3(0.98, 0.99, -3.15),
    new T.Vector3(1.04, 1.03, -1.4),
    new T.Vector3(0.88, 0.95, 0.6),
    new T.Vector3(0.69, 0.76, 2.0),
    new T.Vector3(0.39, 0.48, 3.8),
    new T.Vector3(0.16, 0.24, 5.6),
    new T.Vector3(0.045, 0.08, 6.15),
  ]);
  const bodyPos: number[] = [],
    bodyUV: number[] = [],
    bodyIndex: number[] = [];
  const nz = 100,
    nr = 64;
  for (let j = 0; j <= nz; j++) {
    const p = profile.getPoint(j / nz);
    for (let i = 0; i <= nr; i++) {
      const angle = (i / nr) * Math.PI * 2;
      bodyPos.push(
        Math.sin(angle) * p.x,
        Math.cos(angle) * p.y * (Math.cos(angle) < 0 ? 0.86 : 1) + 0.035,
        p.z,
      );
      bodyUV.push(i / nr, p.z);
    }
  }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nr; i++) {
      const a = j * (nr + 1) + i,
        b = a + nr + 1;
      const x = (bodyPos[a * 3] + bodyPos[(b + 1) * 3]) * 0.5;
      const y = (bodyPos[a * 3 + 1] + bodyPos[(b + 1) * 3 + 1]) * 0.5;
      const z = (bodyPos[a * 3 + 2] + bodyPos[(b + 1) * 3 + 2]) * 0.5;
      if (y > 0.4 && (x / 0.6) ** 2 + ((z - 0.96) / 1.07) ** 2 < 1) continue;
      bodyIndex.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const bodyGeo = new T.BufferGeometry();
  bodyGeo.setAttribute("position", new T.Float32BufferAttribute(bodyPos, 3));
  bodyGeo.setAttribute("uv", new T.Float32BufferAttribute(bodyUV, 2));
  bodyGeo.setIndex(bodyIndex);
  bodyGeo.computeVertexNormals();
  const bodyPaint = enamel.clone();
  bodyPaint.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec2 vHull;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n vHull=uv;",
    );
    shader.fragmentShader = "varying vec2 vHull;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float a=cos(vHull.x*6.283185);float sweep=.18+.10*sin((vHull.y+1.)*.55);float side=abs(a-sweep);
      float band=1.-smoothstep(.10,.13,side);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.014,.048,.056),band);
      float pin=(1.-smoothstep(.015,.028,abs(side-.14)));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.71,.52),pin);
    `,
    );
  };
  mesh(bodyGeo, bodyPaint);
  // Rolled aluminium cowling with a recessed radial engine and inspection fasteners.
  const cowlPoints = [
    new T.Vector2(0.78, -4.64),
    new T.Vector2(0.94, -4.58),
    new T.Vector2(1.005, -4.42),
    new T.Vector2(1.015, -3.55),
    new T.Vector2(0.98, -3.32),
  ];
  const cowl = mesh(new T.LatheGeometry(cowlPoints, 64), metal);
  cowl.rotation.x = Math.PI / 2;
  const opening = mesh(new T.CircleGeometry(0.8, 48), black, 0, 0, -4.65);
  opening.rotation.y = Math.PI;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2,
      x = Math.sin(a),
      y = Math.cos(a);
    const cylinder = mesh(
      new T.CylinderGeometry(0.16, 0.18, 0.43, 10),
      black,
      x * 0.55,
      y * 0.55,
      -4.68,
    );
    cylinder.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      new T.Vector3(x, y, 0),
    );
    for (let fin = 0; fin < 4; fin++) {
      const ring = mesh(
        new T.TorusGeometry(0.18, 0.014, 4, 12),
        metal,
        x * (0.42 + fin * 0.065),
        y * (0.42 + fin * 0.065),
        -4.68,
      );
      ring.quaternion.setFromUnitVectors(
        new T.Vector3(0, 0, 1),
        new T.Vector3(x, y, 0),
      );
    }
  }
  for (const z of [-4.4, -3.48])
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      ellipsoid(
        Math.sin(a) * 1.017,
        Math.cos(a) * 1.017,
        z,
        0.028,
        0.028,
        0.028,
        metal,
      );
    }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const vent = mesh(
        new T.BoxGeometry(0.014, 0.25, 0.075),
        petrol,
        side * 1.015,
        -0.08,
        -3.5 + i * 0.14,
      );
      vent.rotation.x = -0.2;
    }
    rod([side * 0.7, -0.6, -3.1], [side * 0.87, -1.05, -2.4], 0.11, metal);
  }
  wing(22, 3.3, 2.12, -1.1);
  wing(20.5, 3.05, -0.56, -0.35);
  for (const side of [-1, 1]) {
    for (const z of [-2.1, 0.38]) {
      const strut = rod(
        [side * 7.55, -0.42, z + 0.48],
        [side * 7.8, 2.23, z],
        0.085,
        petrol,
      );
      strut.scale.z = 0.65;
      for (const [x, y, zz] of [
        [side * 7.55, -0.42, z + 0.48],
        [side * 7.8, 2.23, z],
      ])
        ellipsoid(x, y, zz, 0.13, 0.05, 0.18, metal);
    }
    rod([side * 7.55, -0.42, -1.62], [side * 7.8, 2.23, 0.38], 0.017, metal);
    rod([side * 7.55, -0.42, 0.86], [side * 7.8, 2.23, -2.1], 0.017, metal);
    rod([side * 0.65, 0.65, -2], [side * 1.7, 2.12, -2.05], 0.065, petrol);
    rod([side * 0.7, 0.72, -0.1], [side * 1.7, 2.12, 0.2], 0.065, petrol);
  }
  // Elliptical tailplane and a swept, bevelled fin rather than flattened spheres.
  wing(7.3, 1.65, 0.12, 5.05, cream);
  const finShape = new T.Shape();
  finShape.moveTo(-1.1, 0);
  finShape.bezierCurveTo(-0.6, 0.3, -0.4, 2.25, 0.35, 2.35);
  finShape.bezierCurveTo(1.05, 2.45, 1.18, 1.4, 1.1, 0.1);
  finShape.quadraticCurveTo(0, -0.05, -1.1, 0);
  const finGeo = new T.ExtrudeGeometry(finShape, {
    depth: 0.095,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.045,
    bevelThickness: 0.035,
    curveSegments: 24,
  });
  finGeo.rotateY(-Math.PI / 2);
  finGeo.translate(0.0475, 0.1, 4.85);
  mesh(finGeo, enamel);
  const finStripe = [
    new T.Vector3(0.125, 0.42, 4.2),
    new T.Vector3(0.125, 0.9, 4.4),
    new T.Vector3(0.125, 1.5, 4.69),
    new T.Vector3(0.125, 2.0, 4.96),
  ];
  tube(finStripe, 0.038, cream);
  tube(
    finStripe.map((p) => new T.Vector3(-p.x, p.y, p.z)),
    0.038,
    cream,
  );
  const elevator = new T.Group();
  elevator.position.set(0, 0.19, 5.62);
  root.add(elevator);
  const ev = ellipsoid(0, 0, 0.25, 3.1, 0.065, 0.39, cream, elevator);
  ev.name = "Elevator";
  const rudder = new T.Group();
  rudder.position.set(0, 0.55, 5.85);
  root.add(rudder);
  ellipsoid(0, 0.55, 0.2, 0.07, 0.87, 0.4, enamel, rudder);
  for (const side of [-1, 1])
    rod([0, 1.75, 5.25], [side * 2.9, 0.18, 5.15], 0.016, metal);
  // Recessed cockpit tub, leather coaming, seat, harness and an original gauge panel.
  const cockpitPoints: T.Vector3[] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2,
      x = Math.cos(a) * 0.575,
      z = 0.96 + Math.sin(a) * 1.04;
    let lo = 0,
      hi = 1;
    for (let step = 0; step < 16; step++) {
      const mid = (lo + hi) * 0.5;
      if (profile.getPoint(mid).z < z) lo = mid;
      else hi = mid;
    }
    const section = profile.getPoint((lo + hi) * 0.5);
    cockpitPoints.push(
      new T.Vector3(
        x,
        0.05 + section.y * Math.sqrt(Math.max(0, 1 - (x / section.x) ** 2)),
        z,
      ),
    );
  }
  tube(cockpitPoints, 0.095, leather, true);
  const liningPositions: number[] = [],
    liningIndices: number[] = [];
  cockpitPoints.forEach((p, i) => {
    liningPositions.push(
      p.x * 0.99,
      p.y - 0.025,
      p.z,
      p.x * 0.84,
      0.48,
      0.96 + (p.z - 0.96) * 0.87,
    );
    const a = i * 2,
      b = ((i + 1) % cockpitPoints.length) * 2;
    liningIndices.push(a, b, a + 1, b, b + 1, a + 1);
  });
  const lining = new T.BufferGeometry();
  lining.setAttribute(
    "position",
    new T.Float32BufferAttribute(liningPositions, 3),
  );
  lining.setAttribute(
    "uv",
    new T.Float32BufferAttribute(
      new Float32Array((liningPositions.length / 3) * 2),
      2,
    ),
  );
  lining.setIndex(liningIndices);
  lining.computeVertexNormals();
  mesh(lining, black);
  const tub = mesh(
    new T.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    black,
    0,
    0.78,
    0.96,
  );
  tub.scale.set(0.59, 0.48, 1.04);
  tub.material.side = T.DoubleSide;
  ellipsoid(0, 0.52, 1.34, 0.42, 0.1, 0.39, leather);
  const seat = ellipsoid(0, 0.82, 1.68, 0.43, 0.42, 0.11, leather);
  seat.rotation.x = -0.12;
  for (const x of [-0.23, 0.23]) {
    const belt = mesh(
      new T.BoxGeometry(0.075, 0.025, 0.67),
      cream,
      x,
      0.65,
      1.22,
    );
    belt.rotation.x = -0.32;
  }
  mesh(new T.BoxGeometry(0.14, 0.035, 0.11), metal, 0, 0.64, 1.14);
  rod([0, 0.4, 0.68], [0, 0.83, 0.58], 0.024, metal);
  ellipsoid(0, 0.85, 0.58, 0.075, 0.04, 0.035, black);
  const instruments = document.createElement("canvas");
  instruments.width = 512;
  instruments.height = 256;
  const ctx = instruments.getContext("2d")!;
  ctx.fillStyle = "#1a292b";
  ctx.fillRect(0, 0, 512, 256);
  for (const [x, y, r] of [
    [112, 105, 62],
    [256, 95, 70],
    [400, 105, 62],
    [180, 211, 22],
    [330, 211, 22],
  ]) {
    ctx.fillStyle = "#b1b6aa";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#101d22";
    ctx.beginPath();
    ctx.arc(x, y, r - 5, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.strokeStyle = "#ddd8b9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(a) * (r - 11), y + Math.cos(a) * (r - 11));
      ctx.lineTo(x + Math.sin(a) * (r - 17), y + Math.cos(a) * (r - 17));
      ctx.stroke();
    }
    ctx.strokeStyle = "#e7b37b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - r * 0.35, y - r * 0.49);
    ctx.stroke();
  }
  const gaugeTexture = new T.CanvasTexture(instruments);
  gaugeTexture.colorSpace = T.SRGBColorSpace;
  const dash = mesh(
    new T.PlaneGeometry(0.92, 0.46),
    new T.MeshStandardMaterial({ map: gaugeTexture, roughness: 0.85 }),
    0,
    0.77,
    0.03,
  );
  dash.rotation.x = -0.2;
  tube(
    [
      new T.Vector3(-0.49, 0.58, 0.015),
      new T.Vector3(-0.45, 1.03, 0.015),
      new T.Vector3(0.45, 1.03, 0.015),
      new T.Vector3(0.49, 0.58, 0.015),
    ],
    0.025,
    wood,
  );
  const glass = new T.MeshPhysicalMaterial({
    color: 0xc3dfdf,
    roughness: 0.09,
    metalness: 0.08,
    clearcoat: 1,
    transparent: true,
    opacity: 0.28,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const screenPos: number[] = [],
    screenUV: number[] = [],
    screenIdx: number[] = [],
    top: T.Vector3[] = [],
    base: T.Vector3[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32 - 0.5) * Math.PI,
      s = Math.sin(a),
      c = Math.cos(a);
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      screenPos.push(
        0.63 * s,
        0.96 - 0.18 * Math.abs(s) + t * 0.58 * c,
        -0.15 - 0.32 * c * (1 - t * 0.45),
      );
      screenUV.push(i / 32, t);
    }
    top.push(
      new T.Vector3(
        0.63 * s,
        0.96 - 0.18 * Math.abs(s) + 0.58 * c,
        -0.15 - 0.32 * c * 0.55,
      ),
    );
    base.push(
      new T.Vector3(0.63 * s, 0.96 - 0.18 * Math.abs(s), -0.15 - 0.32 * c),
    );
  }
  for (let i = 0; i < 32; i++)
    for (let j = 0; j < 8; j++) {
      const a = i * 9 + j,
        b = a + 9;
      screenIdx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const sg = new T.BufferGeometry();
  sg.setAttribute("position", new T.Float32BufferAttribute(screenPos, 3));
  sg.setAttribute("uv", new T.Float32BufferAttribute(screenUV, 2));
  sg.setIndex(screenIdx);
  sg.computeVertexNormals();
  const windscreen = mesh(sg, glass);
  windscreen.castShadow = false;
  tube(top, 0.019, metal);
  tube(base, 0.024, metal);
  airframe.addPropeller(0, 0, -4.83);
  return airframe.finish(elevator, [rudder]);
}
