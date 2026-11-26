import * as T from "three";
import type { Airframe } from "./airframe";

type Point = [number, number, number];
type Station = [
  z: number,
  halfWidth: number,
  halfHeight: number,
  centerY: number,
];

/** A loft through transverse body stations. The paint coordinates follow the skin. */
function hullGeometry(stations: Station[], fullness: number) {
  const skin = new T.BufferGeometry();
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const section = new T.CatmullRomCurve3(
    stations.map(([z, w, h]) => new T.Vector3(w, h, z)),
  );
  const spine = new T.CatmullRomCurve3(
    stations.map(([z, , , y]) => new T.Vector3(0, y, z)),
  );
  const rows = (stations.length - 1) * 6,
    sides = 48;
  for (let row = 0; row <= rows; row++) {
    const p = section.getPoint(row / rows),
      center = spine.getPoint(row / rows);
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2,
        x = Math.sin(angle),
        y = Math.cos(angle);
      const height = Math.sign(y) * Math.abs(y) ** fullness;
      positions.push(
        Math.max(0.001, p.x) * Math.sign(x) * Math.abs(x) ** fullness,
        center.y + height * Math.max(0.001, p.y),
        p.z,
      );
      uv.push(p.z, height);
      if (row < rows && i < sides) {
        const a = row * (sides + 1) + i,
          b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  skin.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  skin.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  skin.setIndex(indices);
  skin.computeVertexNormals();
  return skin;
}

function paintBands(
  base: T.MeshPhysicalMaterial,
  field: number,
  stripe: number,
  marking?: T.CanvasTexture,
) {
  const m = base.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.fieldColor = { value: new T.Color(field) };
    shader.uniforms.stripeColor = { value: new T.Color(stripe) };
    shader.vertexShader =
      "varying vec2 vPaint;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvPaint=uv;",
      );
    if (marking) shader.uniforms.lettering = { value: marking };
    const mask = marking
      ? "float d=abs(vPaint.x)-8.35; float edge=max(fwidth(d),.018);"
      : "float d=vPaint.y-(.16+.24*smoothstep(.0,5.,vPaint.x)); float edge=max(fwidth(d),.009);";
    shader.fragmentShader =
      (marking ? "uniform sampler2D lettering;\n" : "") +
      "uniform vec3 fieldColor,stripeColor; varying vec2 vPaint;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\n" +
          mask +
          "diffuseColor.rgb=mix(diffuseColor.rgb,fieldColor,smoothstep(-edge,edge,d)); diffuseColor.rgb=mix(diffuseColor.rgb,stripeColor,1.-smoothstep(.035,.035+edge,abs(d+.12)));" +
          (marking
            ? "vec4 ink=texture2D(lettering,vec2((vPaint.x-4.25)/3.55,(.74-vPaint.y)/.48));diffuseColor.rgb=mix(diffuseColor.rgb,ink.rgb,ink.a);"
            : ""),
      );
  };
  m.customProgramCacheKey = () => (marking ? "wing-bands" : "hull-bands");
  return m;
}

export function buildMonoplane(a: Airframe, id: "alder" | "marlin") {
  const twin = id === "marlin";
  const { root, mesh, wing, ellipsoid, rod, metal, black, cream, enamel } = a;
  const color = twin ? 0x164877 : 0x195244;
  const accent = twin ? 0xf6aa39 : 0xd5aa61;
  enamel.color.setHex(color);
  const trim = new T.MeshStandardMaterial({
    color: accent,
    metalness: 0.32,
    roughness: 0.36,
  });
  const cockpitFrame = cream.clone();
  cockpitFrame.side = T.DoubleSide;
  const glazing = new T.MeshPhysicalMaterial({
    color: 0x25454d,
    metalness: 0.28,
    roughness: 0.13,
    clearcoat: 1,
    side: T.DoubleSide,
  });
  // Opaque smoked glass keeps the cabin reflections legible at chase-camera distance.
  function panel(points: Point[], material: T.Material) {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(points.flat(), 3));
    g.setAttribute(
      "uv",
      new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
    );
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    mesh(g, material);
  }
  const stations: Station[] = twin
    ? [
        [-5.55, 0.015, 0.018, -0.06],
        [-4.95, 0.58, 0.53, -0.07],
        [-3.55, 0.99, 0.84, -0.06],
        [-1.55, 1.18, 0.93, -0.06],
        [1, 1.1, 0.89, 0.02],
        [3, 0.77, 0.63, 0.18],
        [4.95, 0.35, 0.33, 0.32],
        [6.1, 0.03, 0.07, 0.41],
      ]
    : [
        [-3.58, 0.86, 0.83, 0.02],
        [-2.76, 1.02, 0.95, 0.04],
        [-1.15, 1.1, 0.91, 0.02],
        [1.18, 1.04, 0.85, 0.03],
        [2.55, 0.76, 0.65, 0.15],
        [4.35, 0.39, 0.4, 0.33],
        [5.92, 0.035, 0.08, 0.46],
      ];
  mesh(
    hullGeometry(stations, twin ? 0.88 : 0.72),
    paintBands(enamel, twin ? 0xd7dfe0 : 0xf0e3c7, accent),
  );
  // The windscreen, quarter lights, sliding windows and roof share exact frame vertices.
  const cabin = twin
    ? [
        [-3.52, 0.84, 0.56, 0.27, 0.94],
        [-2.15, 1.03, 0.85, 0.34, 1.64],
        [-0.82, 1.13, 0.94, 0.39, 1.77],
        [0.38, 1.1, 0.92, 0.42, 1.72],
        [1.61, 0.98, 0.79, 0.45, 1.47],
        [2.65, 0.77, 0.58, 0.48, 1.01],
      ]
    : [
        [-2.36, 0.99, 0.83, 0.35, 0.83],
        [-1.59, 1.06, 0.89, 0.34, 1.69],
        [-0.32, 1.08, 0.91, 0.32, 1.8],
        [0.99, 1.04, 0.89, 0.34, 1.79],
        [1.94, 0.92, 0.77, 0.43, 1.54],
        [2.64, 0.73, 0.55, 0.48, 1.02],
      ];
  for (let i = 0; i < cabin.length - 1; i++) {
    const [z, w, r, b, h] = cabin[i],
      [zz, ww, rr, bb, hh] = cabin[i + 1];
    for (const side of [-1, 1]) {
      const sill: Point = [side * w, b, z],
        head: Point = [side * r, h, z];
      const nextHead: Point = [side * rr, hh, zz],
        nextSill: Point = [side * ww, bb, zz];
      panel([sill, head, nextHead, nextSill], glazing);
      rod(sill, head, 0.038, cockpitFrame);
      rod(sill, nextSill, 0.045, cockpitFrame);
      rod(head, nextHead, 0.041, cockpitFrame);
      if (i === cabin.length - 2) rod(nextHead, nextSill, 0.038, cockpitFrame);
      if (i === 1 || i === 2) {
        rod(
          [side * (w + 0.025), b - 0.055, z + 0.22],
          [side * (w + 0.025), b - 0.055, z + 0.44],
          0.029,
          metal,
        );
      }
      const ridge: Point = [0, h + 0.1, z],
        nextRidge: Point = [0, hh + 0.1, zz];
      panel(
        [head, ridge, nextRidge, nextHead],
        i === 0 || i === 4 ? glazing : cockpitFrame,
      );
      if (i === 0 || i === 4) {
        rod(head, ridge, 0.037, cockpitFrame);
        rod(nextHead, nextRidge, 0.037, cockpitFrame);
        if (side === 1) rod(ridge, nextRidge, 0.035, cockpitFrame);
      }
    }
  }
  // Sloped fore and aft fairings close the glazing against the rounded hull.
  for (const [index, reach] of [
    [0, -0.52],
    [cabin.length - 1, 0.48],
  ]) {
    const [z, width, roof, base, height] = cabin[index];
    for (const side of [-1, 1]) {
      const sill: Point = [side * width, base, z];
      const head: Point = [side * roof, height, z];
      const foot: Point = [side * roof * 0.78, base + 0.03, z + reach];
      const crest: Point = [0, height + 0.1, z];
      panel(
        [sill, head, foot, [side * width * 0.85, base - 0.12, z + reach]],
        cockpitFrame,
      );
      panel([head, crest, [0, height - 0.23, z + reach], foot], cockpitFrame);
    }
  }
  const wingY = twin ? -0.08 : 1.79,
    wingZ = twin ? -0.45 : -0.61;
  const stencil = document.createElement("canvas");
  stencil.width = 512;
  stencil.height = 192;
  const ink = stencil.getContext("2d")!;
  ink.font = "600 112px Helvetica, Arial, sans-serif";
  ink.textBaseline = "middle";
  ink.textAlign = "center";
  ink.fillStyle = twin ? "#ede4c8" : "#224c40";
  ink.fillText(twin ? "MT–03" : "AC–02", 256, 96);
  const marking = new T.CanvasTexture(stencil);
  marking.colorSpace = T.SRGBColorSpace;
  const wingPaint = paintBands(
    enamel,
    twin ? accent : color,
    twin ? 0xe4ded0 : accent,
    marking,
  );
  wingPaint.color.setHex(twin ? 0x225b85 : 0xe9dfc9);
  wing(twin ? 21.6 : 21, twin ? 3.38 : 2.88, wingY, wingZ, wingPaint);
  for (const side of [-1, 1]) {
    const tip = side * (twin ? 10.71 : 10.42);
    ellipsoid(
      tip,
      wingY + 0.16,
      wingZ,
      0.12,
      0.085,
      0.16,
      new T.MeshStandardMaterial({
        color: side < 0 ? 0xca422a : 0x25855c,
        emissive: side < 0 ? 0x641008 : 0x08452c,
      }),
    );
    rod([side * 0.8, -0.48, 0.7], [side * 3.95, -0.8, 1], 0.038, metal);
    if (!twin) {
      for (const z of [-1.48, 0.25])
        rod(
          [side * 0.88, -0.57, 0.12],
          [side * 6.55, wingY + 0.08, z],
          0.072,
          metal,
        );
      rod([side * 0.78, -0.52, -0.42], [side * 1.7, -1.76, -0.42], 0.06, metal);
      mesh(
        new T.BoxGeometry(0.58, 0.09, 1.18),
        black,
        side * 1.67,
        -1.76,
        -0.18,
      );
    }
  }
  function engine(
    x: number,
    y: number,
    front: number,
    radius: number,
    end: number,
  ) {
    const length = end - front;
    const nacelle: Station[] = [
      [front, radius * 0.87, radius * 0.87, 0],
      [front + 0.13, radius, radius, 0],
      [front + length * 0.29, radius * 0.98, radius * 0.98, 0],
      [front + length * 0.66, radius * 0.83, radius * 0.82, 0.03],
      [
        end,
        radius * (twin ? 0.035 : 0.85),
        radius * (twin ? 0.05 : 0.85),
        0.06,
      ],
    ];
    mesh(hullGeometry(nacelle, 1), twin ? metal : enamel, x, y);
    const face = mesh(
      new T.CircleGeometry(radius * 0.89, 40),
      black,
      x,
      y,
      front - 0.013,
    );
    face.rotation.y = Math.PI;
    for (const [depth, r] of [
      [0.015, 0.89],
      [0.11, 1],
      [length * 0.28, 0.992],
    ]) {
      mesh(
        new T.TorusGeometry(radius * r, 0.032, 6, 48),
        twin ? enamel : metal,
        x,
        y,
        front + depth,
      );
    }
    for (let i = 0; i < 9; i++) {
      const angle = (i * 2 * Math.PI) / 9,
        dx = Math.sin(angle),
        dy = Math.cos(angle);
      rod(
        [x + radius * 0.32 * dx, y + radius * 0.32 * dy, front - 0.035],
        [x + radius * 0.76 * dx, y + radius * 0.76 * dy, front - 0.035],
        radius * 0.095,
        metal,
      );
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const vent = ellipsoid(
          x + side * radius * 0.974,
          y,
          front + 0.24 + i * 0.1,
          0.025,
          0.18 * radius,
          0.034,
          black,
        );
        vent.rotation.x = -0.32;
      }
      rod(
        [x + side * radius * 0.62, y - radius * 0.55, front + length * 0.37],
        [x + side * radius * 0.8, y - radius * 0.86, front + length * 0.47],
        0.09,
        black,
      );
    }
    a.addPropeller(
      x,
      y,
      front - 0.19,
      twin ? 0.77 : 0.98,
      3,
      black,
      twin ? trim : metal,
    );
  }
  if (twin) {
    for (const side of [-1, 1]) engine(side * 3.32, 0.16, -3.24, 0.71, 1.62);
  } else engine(0, 0.04, -4.55, 0.98, -2.75);

  const tailY = twin ? 0.52 : 0.55;
  wing(twin ? 7.8 : 6.7, 1.62, tailY, 4.92, twin ? metal : cream);
  const elevator = new T.Group();
  elevator.position.set(0, tailY + 0.07, 5.52);
  root.add(elevator);
  ellipsoid(0, 0, 0.12, twin ? 3.52 : 2.94, 0.069, 0.35, enamel, elevator);
  const rudders: T.Group[] = [];
  // Separate fixed fins, contrasting crowns and hinged rudders.
  function finPiece(points: number[][], x: number, mat: T.Material) {
    const shape = new T.Shape(points.map(([z, y]) => new T.Vector2(z, y)));
    const g = new T.ExtrudeGeometry(shape, {
      depth: 0.096,
      bevelEnabled: true,
      bevelThickness: 0.028,
      bevelSize: 0.045,
      bevelSegments: 3,
    });
    g.rotateY(-Math.PI / 2);
    mesh(g, mat, x + 0.048, 0, 0);
  }
  for (const x of twin ? [-2.38, 2.38] : [0]) {
    const h = twin ? 2.24 : 2.87,
      crown = h - 0.32,
      hinge = 5.61;
    finPiece(
      [
        [3.53, tailY],
        [4.24, tailY + 0.44],
        [5.02, crown],
        [hinge, crown],
        [hinge, tailY],
      ],
      x,
      enamel,
    );
    finPiece(
      [
        [5.02, crown],
        [5.15, h - 0.1],
        [5.31, h],
        [hinge, h],
        [hinge, crown],
      ],
      x,
      trim,
    );
    const rudder = new T.Group();
    rudder.position.set(x, tailY, hinge);
    root.add(rudder);
    const shape = new T.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0, h - tailY);
    shape.quadraticCurveTo(0.44, h - tailY, 0.46, h - tailY - 0.38);
    shape.lineTo(0.41, 0.31);
    shape.quadraticCurveTo(0.39, 0, 0.12, 0);
    shape.closePath();
    const g = new T.ExtrudeGeometry(shape, {
      depth: 0.078,
      bevelThickness: 0.025,
      bevelSize: 0.026,
      bevelSegments: 2,
    });
    g.rotateY(-Math.PI / 2);
    mesh(g, twin ? metal : cream, 0.039, 0, 0.075, rudder);
    rudders.push(rudder);
  }
  return a.finish(elevator, rudders);
}
