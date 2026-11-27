import * as T from "three";
import { inletSun } from "./atmosphere";
import { seededRandom, clamp, terrainHeight, hash } from "./terrain";
import { Watershed, GRID } from "./hydrology";

/** Raymarched, light-absorbing 3D cloud volumes. Every density sample comes from generated noise. */
export function createWeather(scene: T.Scene, low: boolean) {
  const random = seededRandom(442);
  const n = 48,
    data = new Uint8Array(n * n * n);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(random() * 255);
  const noise = new T.Data3DTexture(data, n, n, n);
  noise.format = T.RedFormat;
  noise.minFilter = T.LinearFilter;
  noise.magFilter = T.LinearFilter;
  noise.wrapS = noise.wrapT = noise.wrapR = T.RepeatWrapping;
  noise.unpackAlignment = 1;
  noise.needsUpdate = true;
  const vertex = `varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  const fragment = `precision highp sampler3D;uniform mat4 projectionMatrix;uniform mat4 modelMatrix;uniform sampler2D uDepth;uniform vec2 uResolution;uniform mat4 uProjectionInverse;uniform mat4 uCameraWorld;uniform sampler3D uNoise;uniform mat4 uInverse;uniform float uTime;uniform float uStrength;uniform vec3 uLightRay;varying vec3 vLocal;
 float density(vec3 p){
  vec3 q=p*vec3(2.5,2.,2.5)+vec3(uTime*.004,0.,uTime*.001);
  float f=texture(uNoise,q*.12).r*.57+texture(uNoise,q*.29+4.).r*.28+texture(uNoise,q*.67+8.).r*.15;
  float a=length((p-vec3(-.17,-.05,.04))*vec3(3.4,3.2,3.2));
  float b=length((p-vec3(.08,.07,-.04))*vec3(3.1,2.8,3.1));
  float c=length((p-vec3(.27,-.06,.03))*vec3(4.5,4.2,3.9));
  float lobe=min(a,min(b,c));
  float edge=1.-smoothstep(.50,1.12,lobe+(.5-f)*1.1);
  float feather=(1.-smoothstep(.39,.5,abs(p.x)))*(1.-smoothstep(.39,.5,abs(p.y)))*(1.-smoothstep(.39,.5,abs(p.z)));
  return smoothstep(.36,.66,f)*edge*feather*uStrength;
 }
 void main(){
  vec3 ro=(uInverse*vec4(cameraPosition,1.)).xyz,rd=normalize(vLocal-ro);vec3 inv=1./rd;vec3 a=(-.5-ro)*inv,b=(.5-ro)*inv;vec3 mn=min(a,b),mx=max(a,b);float entry=max(max(mn.x,mn.y),mn.z),exitT=min(min(mx.x,mx.y),mx.z);entry=max(0.,entry);
  vec2 screenUV=gl_FragCoord.xy/uResolution;float opaqueDepth=texture2D(uDepth,screenUV).r;
  vec4 vp=uProjectionInverse*vec4(screenUV*2.-1.,opaqueDepth*2.-1.,1.);vp/=vp.w;
  vec3 opaqueLocal=(uInverse*uCameraWorld*vp).xyz;float opaqueT=dot(opaqueLocal-ro,rd);exitT=min(exitT,opaqueT);
  if(exitT<entry)discard;
  float stepSize=(exitT-entry)/float(STEPS);float t=entry+stepSize*.5;vec4 acc=vec4(0.);
  for(int i=0;i<STEPS;i++){
   vec3 p=ro+rd*t;float d=density(p);
   if(d>.008){float shade=density(p+.13*uLightRay)*.65+density(p+.27*uLightRay)*.35;float light=exp(-shade*4.5);vec3 c=mix(vec3(.19,.23,.32),vec3(1.07,.82,.60),light);float alpha=1.-exp(-d*stepSize*10.);acc.rgb+=(1.-acc.a)*alpha*c;acc.a+=(1.-acc.a)*alpha;if(acc.a>.98)break;}
   t+=stepSize;
  }
  if(acc.a<.005)discard;gl_FragColor=vec4(acc.rgb/max(acc.a,.001),acc.a);

 }`;
  const clouds: T.Mesh[] = [];
  const placements = [
    [-2720, 1160, -2160, 3250, 480, 1530],
    [2350, 1640, -3370, 3300, 550, 1840],
    [-1800, 950, -5200, 2100, 650, 1800],
    [3900, 950, 1400, 2300, 650, 1800],
    [-4200, 1130, 1700, 2000, 700, 1700],
    [800, 1650, -6700, 3400, 650, 1900],
  ];
  for (const [x, y, z, sx, sy, sz] of placements) {
    const mat = new T.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uLightRay: {
          value: new T.Vector3(
            inletSun.x / sx,
            inletSun.y / sy,
            inletSun.z / sz,
          ).normalize(),
        },
        uNoise: { value: noise },
        uInverse: { value: new T.Matrix4() },
        uTime: { value: 0 },
        uStrength: { value: 1 },
        uDepth: { value: null },
        uResolution: { value: new T.Vector2() },
        uProjectionInverse: { value: new T.Matrix4() },
        uCameraWorld: { value: new T.Matrix4() },
      },
      defines: { STEPS: low ? 28 : 48 },
      side: T.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const cloud = new T.Mesh(new T.BoxGeometry(1, 1, 1), mat);
    cloud.position.set(x, y, z);
    cloud.scale.set(sx, sy, sz);
    cloud.updateMatrixWorld();
    mat.uniforms.uInverse.value.copy(cloud.matrixWorld).invert();
    cloud.layers.set(1);
    scene.add(cloud);
    clouds.push(cloud);
  }
  let rain = 0;
  function update(time: number, storm: number) {
    rain += (storm - rain) * 0.012;
    clouds.forEach((c, i) => {
      const m = c.material as T.ShaderMaterial;
      m.uniforms.uTime.value = time + i * 100;
      m.uniforms.uStrength.value = 0.76 + rain * 0.8;
    });
  }
  function prepare(
    depth: T.DepthTexture,
    camera: T.PerspectiveCamera,
    width: number,
    height: number,
  ) {
    for (const c of clouds) {
      const u = (c.material as T.ShaderMaterial).uniforms;
      u.uDepth.value = depth;
      u.uResolution.value.set(width, height);
      u.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
      u.uCameraWorld.value.copy(camera.matrixWorld);
    }
  }
  return { update, clouds, prepare };
}

/** Visible runoff is derived from the same reservoir and height grid as infiltration. */
export class Runoff {
  private geometry = new T.BufferGeometry<{
    position: T.BufferAttribute;
    strength: T.BufferAttribute;
  }>();
  private channelAtSlot = new Uint32Array(GRID * GRID);
  private points = new Float32Array(GRID * GRID * 6 * 4);
  private strengths = new Float32Array(GRID * GRID * 2 * 4);
  private uniforms = { uTime: { value: 0 }, uSurvey: { value: 0 } };
  readonly mesh: T.LineSegments;
  constructor(scene: T.Scene) {
    this.geometry.setAttribute(
      "position",
      new T.BufferAttribute(this.points, 3).setUsage(T.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      "strength",
      new T.BufferAttribute(this.strengths, 1).setUsage(T.DynamicDrawUsage),
    );
    this.mesh = new T.LineSegments(
      this.geometry,
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: `attribute float strength;varying float vStrength;varying vec3 vP;void main(){vStrength=strength;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform float uTime;uniform float uSurvey;varying float vStrength;varying vec3 vP;void main(){float pulse=.7+.3*sin(vP.x*.04+vP.z*.04+uTime*4.);gl_FragColor=vec4(mix(vec3(.7,.9,.85),vec3(.48,.95,.8),uSurvey),vStrength*pulse*(.3+uSurvey*.6));}`,
        uniforms: this.uniforms,
      }),
    );
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  private writeChannel(slot: number, i: number, low: number) {
    const node = (j: number) => ({
      x: ((j % GRID) / (GRID - 1) - 0.5) * 15000 + (hash(j, 3) - 0.5) * 54,
      z:
        (Math.floor(j / GRID) / (GRID - 1) - 0.5) * 15000 +
        (hash(j, 7) - 0.5) * 54,
    });
    const a = node(i),
      b = node(low),
      mx = (a.x + b.x) / 2 + (hash(i, 11) - 0.5) * 38,
      mz = (a.z + b.z) / 2 + (hash(i, 13) - 0.5) * 38;
    const at = (t: number) => ({
      x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * b.x,
      z: (1 - t) * (1 - t) * a.z + 2 * (1 - t) * t * mz + t * t * b.z,
    });
    for (let s = 0; s < 4; s++) {
      const p = at(s / 4),
        q = at((s + 1) / 4),
        j = slot * 24 + s * 6;
      this.points[j] = p.x;
      this.points[j + 1] = Math.max(2, terrainHeight(p.x, p.z) + 3);
      this.points[j + 2] = p.z;
      this.points[j + 3] = q.x;
      this.points[j + 4] = Math.max(2, terrainHeight(q.x, q.z) + 3);
      this.points[j + 5] = q.z;
    }
  }
  update(w: Watershed) {
    let count = 0;
    for (let z = 1; z < GRID - 1; z++)
      for (let x = 1; x < GRID - 1; x++) {
        const i = z * GRID + x;
        if (w.heights[i] < 0 || w.surface[i] + w.moisture[i] < 0.025) continue;
        let low = i;
        for (const j of [i - 1, i + 1, i - GRID, i + GRID])
          if (w.heights[j] < w.heights[low]) low = j;
        if (low === i) continue;
        const channel = i * w.heights.length + low;
        if (this.channelAtSlot[count] !== channel) {
          this.writeChannel(count, i, low);
          this.channelAtSlot[count] = channel;
        }
        const strength = clamp((w.surface[i] + w.moisture[i]) * 0.15, 0.05, 1);
        this.strengths.fill(strength, count * 8, (count + 1) * 8);
        count++;
      }
    const vertexCount = count * 8;
    this.geometry.setDrawRange(0, vertexCount);
    this.mesh.visible = count > 0;
    if (!count) return;
    for (const attribute of Object.values(this.geometry.attributes)) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, vertexCount * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }
  animate(time: number, survey: number) {
    this.uniforms.uTime.value = time;
    this.uniforms.uSurvey.value = survey;
  }
}
