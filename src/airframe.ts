import * as T from "three";
import { slopeNormalGLSL } from "./shaders";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function createAirframe(name: string) {
  const root = new T.Group();
  root.name = name;
  const enamel = new T.MeshPhysicalMaterial({
    color: 0xb63d26,
    roughness: 0.39,
    metalness: 0.045,
    clearcoat: 0.72,
    clearcoatRoughness: 0.21,
  });
  const cream = new T.MeshStandardMaterial({
    color: 0xe8dfc5,
    roughness: 0.72,
  });
  const petrol = new T.MeshStandardMaterial({
    color: 0x183d43,
    roughness: 0.37,
    metalness: 0.32,
  });
  const metal = new T.MeshStandardMaterial({
    color: 0xbac6c5,
    roughness: 0.3,
    metalness: 0.82,
  });
  const brass = new T.MeshStandardMaterial({
    color: 0xc0a478,
    roughness: 0.34,
    metalness: 0.75,
  });
  const black = new T.MeshStandardMaterial({
    color: 0x16232a,
    roughness: 0.65,
  });
  const leather = new T.MeshStandardMaterial({
    color: 0x62392a,
    roughness: 0.78,
  });
  const wood = new T.MeshStandardMaterial({
    color: 0x84502d,
    roughness: 0.43,
    metalness: 0.05,
  });
  wood.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec3 vWood;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n vWood=position;",
    );
    shader.fragmentShader = "varying vec3 vWood;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float grain=sin(vWood.x*55.+sin(vWood.y*3.)*.7);diffuseColor.rgb*=.94+.06*grain;
    `,
    );
  };
  function mesh(
    g: T.BufferGeometry,
    m: T.Material,
    x = 0,
    y = 0,
    z = 0,
    parent: T.Object3D = root,
  ) {
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function rod(
    a: number[],
    b: number[],
    r = 0.035,
    m: T.Material = metal,
    parent: T.Object3D = root,
  ) {
    const p = new T.Vector3(...a),
      q = new T.Vector3(...b),
      d = q.clone().sub(p);
    const o = mesh(
      new T.CylinderGeometry(r, r, d.length(), 8),
      m,
      0,
      0,
      0,
      parent,
    );
    o.position.copy(p.add(q).multiplyScalar(0.5));
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return o;
  }
  function tube(
    points: T.Vector3[],
    radius: number,
    m: T.Material,
    closed = false,
    parent: T.Object3D = root,
  ) {
    return mesh(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points, closed),
        Math.max(16, points.length * 3),
        radius,
        6,
        closed,
      ),
      m,
      0,
      0,
      0,
      parent,
    );
  }
  function ellipsoid(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    m: T.Material,
    parent: T.Object3D = root,
  ) {
    const small = Math.max(sx, sy, sz) < 0.15;
    const o = mesh(
      new T.SphereGeometry(1, small ? 8 : 20, small ? 6 : 12),
      m,
      x,
      y,
      z,
      parent,
    );
    o.scale.set(sx, sy, sz);
    return o;
  }
  const fabric = cream.clone();
  fabric.color.setHex(0xeadbb8);
  fabric.roughness = 0.49;
  fabric.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec2 vFabric;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n vFabric=uv;",
    );
    shader.fragmentShader =
      `
      varying vec2 vFabric;
      float fabricBand(float x, float from, float to, float feather) {
        return smoothstep(from-feather,from+feather,x) - smoothstep(to-feather,to+feather,x);
      }
      ${slopeNormalGLSL}
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float x = abs(vFabric.x), t = vFabric.y;
      float bow = sin(t * 3.14159);
      float spar = 1.-smoothstep(.018,.048,abs(t-.30));
      float spanPhase = vFabric.x * .64;
      float underTape = abs(fract(spanPhase)-.5);
      float detailFade = 1.-smoothstep(.10,.62,fwidth(spanPhase));
      float tape = (1.-smoothstep(.012,.039,underTape))*detailFade;
      float feather = max(.012, .5*fwidth(vFabric.x));
      float paint = fabricBand(x,8.74,10.37,feather);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.43,.035,.016),paint);
      float line = fabricBand(x,8.562,8.638,feather) + fabricBand(x,10.48,10.52,feather);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.012,.045,.05),clamp(line,0.,1.));
      diffuseColor.rgb *= 1. - .11*tape*bow;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      float camber = .073 * cos(spanPhase*6.283185) * bow;
      normal = slopeNormal(normal, -vViewPosition,
        detailFade*vec2(dFdx(camber),dFdy(camber)));`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_physical_pars_fragment>",
      `#include <lights_physical_pars_fragment>
      float openFabric;
      void lightFabric(IncidentLight light, vec3 position, vec3 n, vec3 viewDir,
        vec3 coatNormal, PhysicalMaterial material, inout ReflectedLight reflected) {
        RE_Direct(light, position, n, viewDir, coatNormal, material, reflected);
        float wrap = clamp(.36-dot(n, light.direction), 0., 1.);
        float forward = pow(max(0., dot(-light.direction, viewDir)), 3.);
        reflected.directDiffuse += light.color * vec3(.37,.23,.087) *
          wrap * (.13+.87*forward) * openFabric;
      }
      #undef RE_Direct
      #define RE_Direct lightFabric`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      `openFabric = (1.-.65*tape)*(1.-.38*spar)*(1.-.96*clamp(paint+line,0.,1.));
      #include <lights_fragment_begin>`,
    );
  };
  const ailerons: T.Group[] = [];
  // Closed airfoil rings, with a rounded outer planform and a thin trailing edge.
  function wing(
    span: number,
    chord: number,
    y: number,
    z: number,
    mat: T.Material = fabric,
  ) {
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [],
      nx = span > 10 ? 72 : 32,
      np = span > 10 ? 40 : 24;
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx - 0.5) * span,
        tip = T.MathUtils.smoothstep(Math.abs(x), span * 0.38, span * 0.5);
      const c = chord * Math.sqrt(Math.max(0.012, 1 - tip * tip));
      for (let j = 0; j <= np; j++) {
        const a = (j / np) * Math.PI * 2,
          t = (1 - Math.cos(a)) * 0.5;
        const thick =
          5 *
          0.1 *
          c *
          (0.2969 * Math.sqrt(t) -
            0.126 * t -
            0.3516 * t * t +
            0.2843 * t * t * t -
            0.1036 * t * t * t * t);
        const camber = 0.032 * c * Math.sin(Math.PI * t);
        pos.push(
          x,
          y + Math.sign(Math.sin(a)) * thick + camber + Math.abs(x) * 0.014,
          z + (t - 0.5) * c + tip * 0.15,
        );
        uv.push(x, t);
      }
    }
    const controls =
      span > 10
        ? [
            { start: 9, end: 20, side: -1, indices: [] as number[] },
            { start: 52, end: 63, side: 1, indices: [] as number[] },
          ]
        : [];
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < np; j++) {
        const a = i * (np + 1) + j,
          b = a + np + 1;
        const control = controls.find(
          (c) => i >= c.start && i < c.end && j >= 14 && j < 26,
        );
        (control ? control.indices : idx).push(a, a + 1, b, b, a + 1, b + 1);
      }
    for (const i of [0, nx])
      for (let j = 1; j < np - 1; j++) {
        const a = i * (np + 1);
        if (i === 0) idx.push(a, a + j + 1, a + j);
        else idx.push(a, a + j, a + j + 1);
      }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    for (const control of controls) {
      // Both sides of the hinge are closed; the moving skin uses the exact airfoil samples.
      for (let i = control.start; i < control.end; i++) {
        const a = i * (np + 1) + 14,
          b = a + np + 1;
        control.indices.push(a, b, a + 12, b, b + 12, a + 12);
        idx.push(a, a + 12, b, b, a + 12, b + 12);
      }
      for (const i of [control.start, control.end]) {
        const a = i * (np + 1) + 14;
        for (let j = 1; j < 11; j++) {
          if (i === control.start) control.indices.push(a, a + j + 1, a + j);
          else control.indices.push(a, a + j, a + j + 1);
        }
      }
      const group = new T.Group();
      const centerX = ((control.start + control.end) / (2 * nx) - 0.5) * span;
      const t = (1 - Math.cos((14 / np) * Math.PI * 2)) * 0.5;
      group.position.set(
        centerX,
        y + Math.abs(centerX) * 0.014 + 0.032 * chord * Math.sin(Math.PI * t),
        z + (t - 0.5) * chord,
      );
      group.userData.side = control.side;
      root.add(group);
      const panel = new T.BufferGeometry();
      panel.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      panel.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      panel.setAttribute("normal", g.getAttribute("normal").clone());
      panel.setIndex(control.indices);
      panel.computeVertexNormals();
      panel.translate(
        -group.position.x,
        -group.position.y,
        -group.position.z + 0.012,
      );
      mesh(panel, mat, 0, 0, 0, group);
      ailerons.push(group);
    }
    g.setIndex(idx);
    return mesh(g, mat);
  }
  function addFloats() {
    for (const side of [-1, 1]) {
      rod([side * 1, -0.5, -1.9], [side * 2.15, -2.7, -1.45], 0.095, metal);
      rod([side * 0.7, -0.4, 1.25], [side * 2.15, -2.7, 1.25], 0.085, metal);
      rod([side * 2.15, -2.7, -1.45], [side * 0.7, -0.4, 1.25], 0.03, petrol);
    }
    rod([-2.15, -2.68, -1.45], [2.15, -2.68, -1.45], 0.065, metal);
    rod([-2.15, -2.68, 1.25], [2.15, -2.68, 1.25], 0.065, metal);
    // Chine-sided float hulls with a genuine step, upswept bow and tapered stern.
    const floatMetal = new T.MeshStandardMaterial({
      color: 0xc5cbc8,
      roughness: 0.31,
      metalness: 0.72,
    });
    floatMetal.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "varying float vPanel;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n vPanel=uv.y*6.5;",
        );
      shader.fragmentShader =
        "varying float vPanel;\n" +
        shader.fragmentShader.replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
        float edge = abs(fract(vPanel+.5)-.5);
        float join = 1.-smoothstep(.007,.007+max(.007,fwidth(vPanel)),edge);
        float resolved = 1.-smoothstep(.08,.4,fwidth(vPanel));
        diffuseColor.rgb *= 1.-.22*join*resolved;
        roughnessFactor += (.035*cos(floor(vPanel)*3.)+.16*join)*resolved;`,
        );
    };
    for (const side of [-1, 1]) {
      const sections = [
        [-4.45, 0.025, 0.28],
        [-4.0, 0.26, 0.16],
        [-3.25, 0.49, 0.02],
        [-1.5, 0.57, 0],
        [0.45, 0.57, 0],
        [0.52, 0.56, 0.2],
        [2.5, 0.4, 0.25],
        [3.8, 0.12, 0.33],
        [4.05, 0.025, 0.34],
      ];
      const cross = [
        [0, 0.31],
        [0.82, 0.28],
        [1, 0.04],
        [0.75, -0.22],
        [0, -0.5],
        [-0.75, -0.22],
        [-1, 0.04],
        [-0.82, 0.28],
      ];
      const pos: number[] = [],
        idx: number[] = [],
        uv: number[] = [];
      for (const [z, w, lift] of sections)
        for (let k = 0; k < cross.length; k++) {
          const [x, y] = cross[k];
          pos.push(
            side * 2.15 + x * w,
            -3.05 +
              0.39 * (1 - T.MathUtils.smoothstep(z, -4.45, -3.8)) +
              (y + (y < 0 ? lift : lift * 0.4)) *
                T.MathUtils.smoothstep(z, -4.45, -3.8),
            z,
          );
          uv.push(k / 8, (z + 4.45) / 8.5);
        }
      for (let j = 0; j < sections.length - 1; j++)
        for (let k = 0; k < 8; k++) {
          const a = j * 8 + k,
            b = j * 8 + ((k + 1) % 8);
          idx.push(a, a + 8, b, b, a + 8, b + 8);
        }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      mesh(g, floatMetal);
      const edge = sections.map(
        ([z, w, lift]) =>
          new T.Vector3(side * 2.15 + w * 0.85, -2.77 + lift * 0.4, z),
      );
      tube(edge, 0.022, petrol);
      const inner = sections.map(
        ([z, w, lift]) =>
          new T.Vector3(side * 2.15 - w * 0.85, -2.77 + lift * 0.4, z),
      );
      tube(inner, 0.022, petrol);
      mesh(
        new T.BoxGeometry(0.56, 0.025, 3.9),
        petrol,
        side * 2.15,
        -2.72,
        -0.45,
      );
      for (const z of [-1.45, 1.25])
        mesh(new T.BoxGeometry(0.44, 0.075, 0.4), metal, side * 2.15, -2.68, z);
      for (const z of [-2.65, 2.7]) {
        const eye = mesh(
          new T.TorusGeometry(0.09, 0.019, 6, 12),
          brass,
          side * 2.15,
          -2.66,
          z,
        );
        eye.rotation.y = Math.PI / 2;
      }
      for (const z of [-2.2, -1.2, -0.2, 0.8])
        rod(
          [side * 2.15 - 0.24, -2.7, z],
          [side * 2.15 + 0.24, -2.7, z],
          0.014,
          metal,
        );
    }
  }
  const propellers: T.Group[] = [];
  const blurMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: { uBlur: { value: 0 } },
    vertexShader:
      "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader:
      "varying vec2 vUv;uniform float uBlur;void main(){float r=length(vUv-.5)*2.;float band=smoothstep(.16,.32,r)*(1.-smoothstep(.88,1.,r));float grain=.7+.3*sin(r*90.);gl_FragColor=vec4(.66,.48,.29,band*grain*uBlur);}",
  });
  function addPropeller(
    x: number,
    y: number,
    z: number,
    scale = 1,
    blades = 2,
    bladeMaterial: T.Material = wood,
    hubMaterial: T.Material = enamel,
  ) {
    // Sculpted laminated timber blades; the radial veil represents exposure blur.
    const propeller = new T.Group();
    propeller.position.set(x, y, z);
    propeller.scale.setScalar(scale);
    propellers.push(propeller);
    root.add(propeller);
    const bladeShape = new T.Shape();
    bladeShape.moveTo(-0.13, 0.12);
    bladeShape.bezierCurveTo(-0.36, 0.7, -0.34, 1.65, -0.1, 2.35);
    bladeShape.bezierCurveTo(0.03, 2.55, 0.24, 2.33, 0.27, 2.12);
    bladeShape.bezierCurveTo(0.31, 1.4, 0.17, 0.64, 0.13, 0.12);
    bladeShape.closePath();
    const bladeGeo = new T.ExtrudeGeometry(bladeShape, {
      depth: 0.065,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.025,
      curveSegments: 24,
    });
    for (let i = 0; i < blades; i++) {
      const blade = mesh(bladeGeo, bladeMaterial, 0, 0, 0, propeller);
      blade.rotation.z = (i / blades) * Math.PI * 2;
      blade.rotation.y = 0.1;
    }
    const spinner = mesh(
      new T.ConeGeometry(0.27, 0.48, 32),
      hubMaterial,
      0,
      0,
      -0.23,
      propeller,
    );
    spinner.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ellipsoid(
        Math.sin(a) * 0.19,
        Math.cos(a) * 0.19,
        -0.06,
        0.028,
        0.028,
        0.035,
        brass,
        propeller,
      );
    }
    const disc = mesh(
      new T.CircleGeometry(2.48, 64),
      blurMaterial,
      0,
      0,
      -0.07,
      propeller,
    );
    disc.castShadow = false;
  }
  function finish(elevator: T.Group, rudders: T.Group[]) {
    // Functional spray manifold retains the original nozzle locations.
    rod([-5, -0.8, 1], [5, -0.8, 1], 0.055, metal);
    for (let x = -5; x <= 5; x++) rod([x, -0.8, 1], [x, -1.1, 1], 0.055, brass);
    // Stationary hardware is baked into one mesh per material, including all fasteners.
    const batches = new Map<T.Material, T.BufferGeometry[]>();
    for (const child of [...root.children]) {
      if (!(child instanceof T.Mesh)) continue;
      const material = child.material as T.Material;
      if (material.transparent) continue;
      child.updateMatrix();
      const g = (
        child.geometry.index
          ? child.geometry.toNonIndexed()
          : child.geometry.clone()
      ).applyMatrix4(child.matrix);
      if (!batches.has(material)) batches.set(material, []);
      batches.get(material)!.push(g);
      root.remove(child);
      child.geometry.dispose();
    }
    for (const [material, geometries] of batches) {
      const g = mergeGeometries(geometries);
      mesh(g, material);
      geometries.forEach((g) => g.dispose());
    }
    root.scale.setScalar(2);
    let propSpeed = 78;
    function update(
      dt: number,
      state: {
        bank: number;
        pitch: number;
        steer: number;
        throttle: number;
        onWater: boolean;
      },
    ) {
      const rpm =
        state.onWater && state.throttle < 0.01 ? 0 : 28 + state.throttle * 105;
      propSpeed = T.MathUtils.damp(propSpeed, rpm, 3.5, dt);
      for (const propeller of propellers)
        propeller.rotation.z += dt * propSpeed;
      blurMaterial.uniforms.uBlur.value = Math.min(0.12, propSpeed * 0.001);
      ailerons.forEach((a) => {
        const target =
          -a.userData.side *
          T.MathUtils.clamp(state.bank * 0.2 + state.steer * 0.08, -0.19, 0.19);
        a.rotation.x = T.MathUtils.damp(a.rotation.x, target, 8, dt);
      });
      elevator.rotation.x = T.MathUtils.damp(
        elevator.rotation.x,
        -state.pitch * 0.6,
        8,
        dt,
      );
      for (const rudder of rudders)
        rudder.rotation.y = T.MathUtils.damp(
          rudder.rotation.y,
          state.onWater ? state.steer * 0.28 : -state.bank * 0.12,
          8,
          dt,
        );
    }
    return { root, propeller: propellers[0], update };
  }
  return {
    root,
    mesh,
    rod,
    tube,
    ellipsoid,
    wing,
    addFloats,
    addPropeller,
    finish,
    enamel,
    cream,
    petrol,
    metal,
    brass,
    black,
    leather,
    wood,
  };
}
export type Airframe = ReturnType<typeof createAirframe>;
