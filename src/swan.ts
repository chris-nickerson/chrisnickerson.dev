import * as T from "three";

type Point = [number, number, number];
// A cross section through the body, moving from bill to tail.
type Section = [
  z: number,
  y: number,
  width: number,
  depth: number,
  color: number,
];

function swanGeometry() {
  const positions: number[] = [],
    swimming: number[] = [],
    colors: number[] = [];
  const wings: number[] = [],
    indices: number[] = [];
  const color = new T.Color();
  function vertex(flying: Point, afloat: Point, tint: number, wing = 0) {
    positions.push(...flying);
    swimming.push(...afloat);
    color.setHex(tint);
    colors.push(color.r, color.g, color.b);
    wings.push(wing);
  }
  // Connect successive rings. Reversing the port wing preserves outward normals.
  function stitch(start: number, sides: number, reverse = false) {
    for (let i = 0; i < sides; i++) {
      const a = start + i,
        b = start + ((i + 1) % sides);
      if (reverse) indices.push(a, b + sides, b, a, a + sides, b + sides);
      else indices.push(a, b, b + sides, a, b + sides, a + sides);
    }
  }
  const ivory = 0xf8f5e9,
    breast = 0xeae7df,
    mantle = 0xf1eee3;
  const body: Section[] = [
    [-3.6, 0.13, 0.015, 0.013, 0x242a2c],
    [-3.48, 0.14, 0.13, 0.062, 0x252a2b],
    [-3.2, 0.17, 0.16, 0.12, 0x292c2a],
    [-3.16, 0.18, 0.18, 0.16, ivory],
    [-2.99, 0.21, 0.23, 0.215, ivory],
    [-2.76, 0.19, 0.17, 0.17, ivory],
    [-2.54, 0.13, 0.13, 0.135, ivory],
    [-2.14, 0.08, 0.15, 0.15, ivory],
    [-1.68, 0.09, 0.17, 0.175, ivory],
    [-1.27, 0.12, 0.23, 0.23, breast],
    [-1.02, 0.09, 0.36, 0.33, breast],
    [-0.65, 0.02, 0.53, 0.47, breast],
    [-0.03, 0, 0.6, 0.52, mantle],
    [0.66, 0.01, 0.49, 0.42, mantle],
    [1.25, 0.12, 0.29, 0.22, mantle],
    [1.75, 0.23, 0.035, 0.025, 0xdedbd3],
  ];
  const neckAfloat = [
    [-1.95, 1.76],
    [-1.83, 1.8],
    [-1.55, 1.9],
    [-1.51, 1.91],
    [-1.32, 1.96],
    [-1.14, 1.89],
    [-1.06, 1.67],
    [-1.13, 1.34],
    [-1.29, 1.0],
    [-1.31, 0.66],
    [-1.13, 0.34],
  ];
  const waterBody: Section[] = body.map(([z, y, w, d, t], i) => [
    neckAfloat[i]?.[0] ?? z,
    neckAfloat[i]?.[1] ?? y,
    w,
    d,
    t,
  ]);
  function surface(sections: Section[], i: number, angle: number): Point {
    const [z, y, width, depth] = sections[i];
    const before = sections[Math.max(0, i - 1)],
      after = sections[Math.min(sections.length - 1, i + 1)];
    const dy = after[1] - before[1],
      dz = after[0] - before[0],
      length = Math.hypot(dy, dz);
    const offset = (Math.sin(angle) * depth) / length;
    return [width * Math.cos(angle), y + dz * offset, z - dy * offset];
  }
  const sides = 12;
  for (let i = 0; i < body.length; i++) {
    const start = positions.length / 3;
    for (let j = 0; j < sides; j++) {
      const a = (j * Math.PI * 2) / sides;
      const eye = i === 3 && (j === 0 || j === sides / 2);
      vertex(
        surface(body, i, a),
        surface(waterBody, i, a),
        eye ? 0x272a2a : body[i][4],
      );
    }
    if (i > 0) stitch(start - sides, sides);
  }

  // Spanwise sections of the coverts and the individual flight feathers.
  // Each section describes its leading and trailing edge at a given span.
  type WingSection = [
    span: number,
    leading: number,
    trailing: number,
    height: number,
    thickness: number,
  ];
  function panel(side: number, sections: WingSection[], tint: number) {
    const ring = 8;
    for (let i = 0; i < sections.length; i++) {
      const [span, leading, trailing, y, thickness] = sections[i];
      const start = positions.length / 3;
      for (let j = 0; j < ring; j++) {
        const angle = (j * 2 * Math.PI) / ring,
          chord = (1 - Math.cos(angle)) * 0.5;
        const z = T.MathUtils.lerp(leading, trailing, chord);
        const h = y + thickness * Math.sin(angle) - chord * chord * 0.09;
        // On water the wrist comes forward against the shoulder, while the
        // primaries sweep back down the flank and meet above the tail.
        const arm = Math.min(1, span / 2.45),
          hand = Math.max(0, (span - 2.45) / 2.42);
        const foldedX =
          0.31 + 0.29 * arm - 0.34 * hand + 0.09 * Math.sin(chord * Math.PI);
        const foldedY =
          0.22 +
          0.13 * arm -
          0.08 * hand +
          0.24 * chord +
          thickness * Math.sin(angle);
        const foldedZ = -0.55 - 0.16 * arm + 1.82 * hand + 0.58 * z;
        vertex(
          [side * span, h, z],
          [side * foldedX, foldedY, foldedZ],
          tint,
          side,
        );
      }
      if (i > 0) stitch(start - ring, ring, side < 0);
    }
  }
  for (const side of [-1, 1]) {
    panel(
      side,
      [
        [0.24, -0.65, 0.91, 0.19, 0.19],
        [0.87, -0.8, 1.03, 0.26, 0.19],
        [1.62, -0.86, 1.12, 0.31, 0.155],
        [2.4, -0.76, 0.98, 0.32, 0.13],
        [3.18, -0.47, 0.72, 0.29, 0.1],
        [3.84, -0.17, 0.51, 0.23, 0.061],
        [4.33, 0.18, 0.3, 0.15, 0.02],
      ],
      ivory,
    );
    for (let feather = 0; feather < 6; feather++) {
      const t = feather / 5;
      const span = 4.83 - 0.89 * t;
      const tip = 0.5 + 0.64 * t;
      panel(
        side,
        [
          [2.63, -0.51 + 0.95 * t, -0.12 + 0.96 * t, 0.29 - 0.072 * t, 0.043],
          [span - 0.58, tip - 0.45, tip + 0.02, 0.21 - 0.07 * t, 0.052],
          [span - 0.15, tip - 0.12, tip + 0.085, 0.16 - 0.07 * t, 0.034],
          [span, tip + 0.013, tip + 0.025, 0.145 - 0.07 * t, 0.009],
        ],
        feather % 2 ? 0xe5e2d8 : 0xeeeae0,
      );
    }
    // Dark webbed feet trail against the tail in flight, tuck below the body afloat.
    const start = positions.length / 3;
    const foot: Point[] = [
      [0.18, -0.3, 0.32],
      [0.28, -0.32, 1.12],
      [0.38, -0.3, 1.44],
      [0.24, -0.32, 1.38],
      [0.17, -0.29, 1.46],
    ];
    for (const [x, y, z] of foot)
      vertex([side * x, y, z], [side * x, y - 0.2, z * 0.65], 0x353732);
    indices.push(
      start,
      start + 1,
      start + 2,
      start,
      start + 2,
      start + 3,
      start,
      start + 3,
      start + 4,
    );
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("swimming", new T.Float32BufferAttribute(swimming, 3));
  geometry.setAttribute("wingSide", new T.Float32BufferAttribute(wings, 1));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Swimming changes the neck silhouette enough to warrant its own normals.
  const water = new T.BufferGeometry();
  water.setAttribute("position", geometry.getAttribute("swimming"));
  water.setIndex(geometry.index);
  water.computeVertexNormals();
  geometry.setAttribute("swimNormal", water.getAttribute("normal"));
  return geometry;
}

export class SwanFlock {
  readonly mesh: T.InstancedMesh;
  private readonly motion: T.InstancedBufferAttribute;
  private readonly transform = new T.Object3D();
  private readonly color = new T.Color();
  constructor(count: number) {
    const geometry = swanGeometry();
    this.motion = new T.InstancedBufferAttribute(
      new Float32Array(count * 3),
      3,
    ).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute("stroke", this.motion);
    const plumage = new T.MeshLambertMaterial({
      vertexColors: true,
      side: T.DoubleSide,
    });
    plumage.onBeforeCompile = (shader) => {
      // Cool reflected fill keeps white underwings legible above dark water.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vec3(.10,.13,.15);",
      );
      shader.vertexShader =
        `
        attribute vec3 stroke, swimming, swimNormal;
        attribute float wingSide;
        vec2 bend(vec2 v, float a) { float c=cos(a), s=sin(a); return vec2(c*v.x-s*v.y,s*v.x+c*v.y); }
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <beginnormal_vertex>",
          `
        float spread = 1.0-stroke.z;
        float phase = stroke.x;
        float shoulder = wingSide*(.07+stroke.y*(.07+.67*sin(phase)))*spread;
        float wrist = wingSide*(-.10+stroke.y*(-.18+.43*sin(phase-1.03)))*spread;
        float hand = smoothstep(2.05,2.78,abs(position.x));
        vec3 objectNormal = normalize(mix(normal,swimNormal,stroke.z));
        objectNormal.xy = bend(objectNormal.xy, shoulder+wrist*hand);
      `,
        )
        .replace(
          "#include <begin_vertex>",
          `
        vec3 transformed = mix(position, swimming, stroke.z);
        if (wingSide != 0.0) {
          vec2 joint = vec2(2.43*wingSide,.32);
          vec2 root = vec2(.30*wingSide,.19);
          transformed.xy = joint+bend(transformed.xy-joint,wrist*hand);
          transformed.xy = root+bend(transformed.xy-root,shoulder);
        }
      `,
        );
    };
    this.mesh = new T.InstancedMesh(geometry, plumage, count);
    this.mesh.name = "Trumpeter swans";
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.transform.rotation.order = "YXZ";
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, this.color);
  }
  setBird(
    index: number,
    position: T.Vector3,
    heading: number,
    bank: number,
    pitch: number,
    phase: number,
    amplitude: number,
    folded: number,
    size = 1,
    juvenile = 0,
  ) {
    this.transform.position.copy(position);
    this.transform.rotation.set(pitch, -heading, bank, "YXZ");
    this.transform.scale.setScalar(size);
    this.transform.updateMatrix();
    this.mesh.setMatrixAt(index, this.transform.matrix);
    this.motion.setXYZ(index, phase, amplitude, folded);
    this.color.setRGB(
      1 - 0.52 * juvenile,
      1 - 0.54 * juvenile,
      1 - 0.54 * juvenile,
    );
    this.mesh.setColorAt(index, this.color);
  }
  commit() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.motion.needsUpdate = true;
  }
}
