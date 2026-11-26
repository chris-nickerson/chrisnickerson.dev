import * as T from "three";
/** March the sea-level contour of the actual mesh and give the edge a soft moving wash. */
export function shoreline(
  geometry: T.PlaneGeometry,
  detailCenter: { value: T.Vector2 },
  detailRadius: { value: number },
  detail = false,
) {
  const a = geometry.getAttribute("position"),
    nx = geometry.parameters.widthSegments!,
    nz = geometry.parameters.heightSegments!;
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  let count = 0;
  const point = (i: number) => new T.Vector3(a.getX(i), a.getY(i), a.getZ(i));
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      const i = z * (nx + 1) + x;
      const aboveWater = a.getY(i) > 0;
      if (
        a.getY(i + 1) > 0 === aboveWater &&
        a.getY(i + nx + 2) > 0 === aboveWater &&
        a.getY(i + nx + 1) > 0 === aboveWater
      )
        continue;
      const points = [
          point(i),
          point(i + 1),
          point(i + nx + 2),
          point(i + nx + 1),
        ],
        cross: T.Vector3[] = [];
      for (let k = 0; k < 4; k++) {
        const p = points[k],
          q = points[(k + 1) % 4];
        if (p.y > 0 !== q.y > 0) {
          const t = -p.y / (q.y - p.y);
          cross.push(p.clone().lerp(q, t));
        }
      }
      for (let k = 0; k + 1 < cross.length; k += 2) {
        const p = cross[k],
          q = cross[k + 1],
          d = q.clone().sub(p),
          side = new T.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(4.5);
        for (const [v, s] of [
          [p, -1],
          [p, 1],
          [q, -1],
          [q, 1],
        ] as [T.Vector3, number][]) {
          positions.push(v.x + side.x * s, 0.48, v.z + side.z * s);
          uv.push(s, 0);
        }
        const n = count * 4;
        indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
        count++;
      }
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  const m = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDetailCenter: detailCenter,
      uDetailRadius: detailRadius,
      uIsDetail: { value: detail ? 1 : 0 },
    },
    vertexShader: `varying vec3 vWorld;varying float vSide;void main(){vWorld=position;vSide=uv.x;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime;uniform vec2 uDetailCenter;uniform float uDetailRadius;uniform float uIsDetail;varying vec3 vWorld;varying float vSide;void main(){float region=max(abs(vWorld.x-uDetailCenter.x),abs(vWorld.z-uDetailCenter.y));if((uIsDetail<.5&&region<uDetailRadius)||(uIsDetail>.5&&region>=uDetailRadius))discard;float edge=1.-smoothstep(.2,1.,abs(vSide));float tide=.6+.4*sin(vWorld.x*.055+vWorld.z*.09-uTime*.7);float broken=smoothstep(-.55,.7,sin(vWorld.x*.17+sin(vWorld.z*.11)*2.)*sin(vWorld.z*.13));vec3 col=mix(vec3(.20,.40,.35),vec3(.66,.76,.65),tide);gl_FragColor=vec4(col,edge*broken*.24);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
  });
  return new T.Mesh(g, m);
}
