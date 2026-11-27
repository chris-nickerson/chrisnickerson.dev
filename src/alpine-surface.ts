import * as T from "three";
import { stormOpening } from "./atmosphere";
import { noiseGLSL, slopeNormalGLSL } from "./shaders";
import { seededRandom } from "./terrain";

export function graniteRelief() {
  const size = 256;
  const grains = 12;
  const random = seededRandom(731);
  const sites = Array.from({ length: grains * grains }, () => ({
    x: 0.15 + random() * 0.7,
    y: 0.15 + random() * 0.7,
    tiltX: random() - 0.5,
    tiltY: random() - 0.5,
    tint: random(),
  }));
  const data = new Uint8Array(size * size * 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      const px =
        u * grains +
        0.29 * Math.sin(2 * Math.PI * (v * 2 + u)) +
        0.07 * Math.sin(2 * Math.PI * (v * 8 - u * 3));
      const py =
        v * grains +
        0.25 * Math.sin(2 * Math.PI * (u * 2 - v)) +
        0.06 * Math.sin(2 * Math.PI * (u * 11 + v * 4));
      const ix = Math.floor(px),
        iy = Math.floor(py);
      let nearest = Infinity,
        second = Infinity,
        plane = 0,
        tint = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const cx = ix + i,
            cy = iy + j;
          const s =
            sites[((cy + grains) % grains) * grains + ((cx + grains) % grains)];
          const dx = px - cx - s.x,
            dy = py - cy - s.y;
          const distance = dx * dx + dy * dy;
          if (distance < nearest) {
            second = nearest;
            nearest = distance;
            plane = s.tiltX * dx + s.tiltY * dy;
            tint = s.tint;
          } else second = Math.min(second, distance);
        }
      }
      const lip = T.MathUtils.smoothstep(second - nearest, 0, 0.2);
      const i = (y * size + x) * 2;
      data[i] = Math.round(
        255 *
          T.MathUtils.clamp(
            0.26 + 0.22 * lip + 0.17 * tint + 0.54 * plane,
            0,
            1,
          ),
      );
      data[i + 1] = Math.round(255 * (0.15 + 0.52 * tint + 0.33 * lip));
    }
  }
  const map = new T.DataTexture(data, size, size, T.RGFormat);
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.generateMipmaps = true;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.magFilter = T.LinearFilter;
  map.needsUpdate = true;
  return map;
}

export function cirqueShelter(
  positions: T.BufferAttribute | T.InterleavedBufferAttribute,
  width: number,
  size: number,
) {
  const data = new Uint8Array(width * width).fill(128);
  const cell = size / (width - 1);
  const near = Math.max(1, Math.round(85 / cell));
  const far = Math.round(280 / cell);
  for (let z = far; z < width - far; z++) {
    for (let x = far; x < width - far; x++) {
      const i = z * width + x;
      const h = positions.getY(i);
      const bowl = (r: number) =>
        ((positions.getY(i - r) +
          positions.getY(i + r) +
          positions.getY(i - r * width) +
          positions.getY(i + r * width)) *
          0.25 -
          h) /
        (r * cell);
      data[i] = Math.round(
        255 *
          T.MathUtils.clamp(0.48 + 1.6 * bowl(near) + 0.85 * bowl(far), 0, 1),
      );
    }
  }
  const map = new T.DataTexture(data, width, width, T.RedFormat);
  map.minFilter = map.magFilter = T.LinearFilter;
  map.unpackAlignment = 1;
  map.needsUpdate = true;
  return map;
}

const worldVaryings = "varying vec3 vWorldPos, vWorldNormal;\n";

const declarations = `
uniform sampler2D uLandscape, uShelter, uGranite, uCanopy, uMoisture;
uniform vec3 uSun;
uniform vec2 uDetailCenter;
uniform float uLandTime, uDetailRadius, uIsDetail, uSurvey, uWorldSize;
${stormOpening}
${noiseGLSL}
${slopeNormalGLSL}
float resolved(float footprint){return 1.-smoothstep(.3,.8,footprint);}
float surfaceNoise(vec2 p){
  float footprint=max(length(dFdx(p)),length(dFdy(p)));
  return footprint<.8?mix(.5,noise2(p),resolved(footprint)):.5;
}
vec2 noiseGradient(vec2 p){
  vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f),du=6.*f*(1.-f);
  float a=hash21(i),b=hash21(i+vec2(1.,0.)),c=hash21(i+vec2(0.,1.)),d=hash21(i+vec2(1.,1.));
  return du*vec2(mix(b-a,d-c,u.y),mix(c-a,d-b,u.x));
}
vec2 surfaceSlope(vec2 p,int octaves){
  vec2 dx=dFdx(p),dy=dFdy(p),slope=vec2(0.);float a=1.;
  for(int i=0;i<octaves;i++){
    float footprint=max(length(dx),length(dy));
    if(footprint>=.8)break;
    vec2 gradient=noiseGradient(p);
    slope+=vec2(dot(gradient,dx),dot(gradient,dy))*a*resolved(footprint);
    p=p*2.03+vec2(13.4,7.9);dx*=2.03;dy*=2.03;a*=.5;
  }
  return slope;
}
`;

const color = `
  vec3 p = vWorldPos;
  vec3 face = normalize(vWorldNormal);
  float steep = 1. - max(face.y, 0.);
  vec2 uv = p.xz / uWorldSize + .5;
  vec3 woodland = texture2D(uLandscape, uv).rgb;
  float shelterWidth = float(textureSize(uShelter, 0).x);
  float shelter = texture2D(uShelter, (uv*(shelterWidth-1.)+.5)/shelterWidth).r;
  float grain = surfaceNoise(p.xz*.11 + p.y*.033);
  float bed = noise2(p.xz * .0019);
  float scree = fbm2(p.xz*.014 + vec2(p.y*.004,0.));
  float cut = noise2(vec2(p.x*.008 + p.z*.011, p.y*.0017) + 1.8*bed);
  float joint = abs(cut - .50);
  float split = 1. - smoothstep(.018, .095, joint);
  float seam = p.y*.038 + p.x*.004 - p.z*.006 + bed*8. + scree*2.;
  float stratum = .5+.5*sin(seam);
  float ledge = smoothstep(.66,.96,stratum) * (1.-smoothstep(.42,1.3,fwidth(seam)));
  vec3 projection = pow(abs(face),vec3(4.));
  projection /= max(dot(projection,vec3(1.)),.001);
  vec3 tile = p * .0028 + (bed-.5)*.63;
  vec2 plates = texture2D(uGranite,tile.zy*vec2(1.45,.42)).rg * projection.x
              + texture2D(uGranite,tile.xz*vec2(1.,.86)+.37).rg * projection.y
              + texture2D(uGranite,tile.xy*vec2(1.2,.49)-.17).rg * projection.z;
  float mineral = smoothstep(.30,.72,scree*.7 + bed*.3);
  vec3 granite = mix(vec3(.052,.067,.077), vec3(.28,.244,.201), mineral);
  granite *= (.52 + .55*plates.g + .25*grain + .30*ledge) * (1. - .41*split);

  float peat = smoothstep(.30,.65,bed*.62+scree*.38);
  vec3 grass = mix(vec3(.067,.099,.043),vec3(.162,.134,.059),peat);
  grass = mix(grass,vec3(.019,.058,.047),smoothstep(.13,.75,woodland.g)*.91);
  grass *= .65 + .58*scree + .18*grain;
  float escarpment = steep*.96 + .20*mineral + .16*(1.-shelter) +
                     .20*smoothstep(320.,1100.,p.y);
  float exposedRock = smoothstep(.245,.39,escarpment + (plates.g-.58)*.10 - woodland.g*.12);
  float rockRelief = 2.8*plates.r + 1.3*stratum - 1.3*split;
  vec3 ground = mix(grass, granite, exposedRock);
  vec3 wet = texture2D(uMoisture,uv).rgb;
  ground = mix(ground,vec3(.10,.27,.065),wet.g*.88*(1.-exposedRock));
  ground *= 1.-wet.r*.19;

  float accumulation = (p.y-1270.)*.00084 + (shelter-.48)*1.22 -
                       steep*.94 + face.z*.13 + (scree-.48)*.44;
  float snow = smoothstep(-.045,.055,accumulation) *
               (1.-smoothstep(.42,.71,steep+(split-.4)*.115));
  vec3 firn = mix(vec3(.40,.59,.68),vec3(.88,.93,.95),
                  smoothstep(.05,.42,accumulation)*.68 + grain*.20);
  ground = mix(ground,firn,snow);

  float rockCoverage = exposedRock * (1.-snow);
  float littoral = (1.-smoothstep(2.,15.,p.y))*(.42+.26*scree);
  ground = mix(ground,vec3(.114,.121,.104),littoral);
  float clearing = sunlightAt(p,uSun,uLandTime) * (1.-woodland.r*.76);
  ground *= mix(vec3(.55,.68,.86),vec3(1.40,1.12,.88),clearing);
  float underTrees = texture2D(uCanopy, uv).r * (1.-woodland.r*.5);
  ground *= mix(vec3(1.),vec3(.28,.39,.46),underTrees);
  float gray = dot(ground,vec3(.21,.72,.07));
  ground = mix(ground,vec3(gray*.76,gray*.91,gray*.83),uSurvey*.65);
  diffuseColor.rgb = mix(ground,vec3(.10,.46,.22),uSurvey*clamp(wet.r+wet.b,0.,1.)*.9);
`;

const normal = `
#ifndef ALPINE_GEOMETRIC_NORMALS
  vec2 microSlope = surfaceSlope(vWorldPos.xz*.045+vWorldPos.y*.012, 5)*1.75
                  + surfaceSlope(vWorldPos.xz*.21, 1)*.35;
  float sampleWidth = max(length(dFdx(vWorldPos)), length(dFdy(vWorldPos)));
  microSlope += rockCoverage * (1.-smoothstep(4.,16.,sampleWidth)) *
                vec2(dFdx(rockRelief), dFdy(rockRelief));
  normal = slopeNormal(normal, -vViewPosition, microSlope);
#endif
`;

export type AlpineUniforms = Record<
  | "uLandscape"
  | "uShelter"
  | "uGranite"
  | "uCanopy"
  | "uMoisture"
  | "uSun"
  | "uDetailCenter"
  | "uLandTime"
  | "uDetailRadius"
  | "uIsDetail"
  | "uSurvey"
  | "uWorldSize",
  T.IUniform
>;

/** Replaces a standard material's colour and normal with the terrain surface. */
export function shadeAlpineSurface(
  shader: T.WebGLProgramParametersWithUniforms,
  uniforms: AlpineUniforms,
) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader =
    worldVaryings +
    shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvWorldPos=(modelMatrix*vec4(transformed,1.)).xyz;vWorldNormal=normalize(mat3(modelMatrix)*normal);",
    );
  shader.fragmentShader =
    worldVaryings +
    declarations +
    shader.fragmentShader
      .replace("#include <color_fragment>", color)
      .replace("#include <normal_fragment_maps>", normal)
      .replace(
        "#include <opaque_fragment>",
        `
  float patchRegion = max(abs(p.x-uDetailCenter.x), abs(p.z-uDetailCenter.y));
  if ((uIsDetail < .5 && patchRegion < uDetailRadius) ||
      (uIsDetail > .5 && patchRegion >= uDetailRadius)) discard;
  #include <opaque_fragment>
`,
      );
}
