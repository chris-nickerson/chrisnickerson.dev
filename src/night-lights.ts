import * as T from "three";

const warm = [1, 0.48, 0.13];
const tints = {
  lamp: warm,
  shore: warm,
  marker: [0.19, 0.68, 0.57],
  beacon: [1, 0.8, 0.45],
};
type Fixture = keyof typeof tints;

export function tagWindow(geometry: T.BufferGeometry, x: number, z: number) {
  const n = Math.sin(x * 13.73 + z * 7.51) * 4371.37;
  const values = new Float32Array(geometry.getAttribute("position").count).fill(
    n - Math.floor(n),
  );
  geometry.setAttribute("room", new T.BufferAttribute(values, 1));
}

function litWindows(glass: T.MeshStandardMaterial, night: T.IUniform<boolean>) {
  const lit = glass.clone();
  lit.onBeforeCompile = (shader) => {
    shader.uniforms.uStationNight = night;
    shader.vertexShader =
      "attribute float room; varying vec3 vPane;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vPane = vec3(uv, room);",
      );
    shader.fragmentShader =
      "uniform bool uStationNight; varying vec3 vPane;\n" +
      shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
      if (uStationNight) {
        float room = vPane.z;
        vec2 pane = vPane.xy;
        float blind = 1. - smoothstep(.76 + .2 * room, .80 + .2 * room, pane.y);
        float lamp = exp(-3. * length((pane - vec2(.24 + .46 * room,.65)) * vec2(.8,1.3)));
        vec3 interior = mix(vec3(.72,.23,.052),vec3(1.,.64,.28),room);
        float occupied = room < .19 ? .12 : .85 + room;
        totalEmissiveRadiance =
          interior * occupied * (.55 + 2.2 * lamp) * (.28 + .72 * blind);
      }`,
      );
  };
  return lit;
}

function litSurface(
  material: T.MeshStandardMaterial,
  lamps: T.Vector4[],
  night: T.IUniform<boolean>,
) {
  const lit = material.clone();
  const baseKey = material.customProgramCacheKey();
  const count = lamps.length;
  lit.customProgramCacheKey = () => baseKey + ":local-lamps:" + count;
  lit.onBeforeCompile = (shader, renderer) => {
    material.onBeforeCompile(shader, renderer);
    shader.uniforms.uLocalLights = { value: lamps };
    shader.uniforms.uStationNight = night;
    shader.vertexShader =
      "varying vec3 vSite, vSiteNormal;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vSite = position; vSiteNormal = normal;",
      );
    shader.fragmentShader =
      `uniform bool uStationNight; uniform vec4 uLocalLights[${count}]; varying vec3 vSite, vSiteNormal;\n` +
      shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
      if (uStationNight) {
        vec3 siteNormal=normalize(vSiteNormal);
        float illumination=0.;
        for(int i=0;i<${count};i++){
          vec3 ray=uLocalLights[i].xyz-vSite;
          float d2=max(dot(ray,ray),.01);
          illumination+=uLocalLights[i].w*max(dot(siteNormal,ray)*inversesqrt(d2),0.)/(2.+d2);
        }
        totalEmissiveRadiance += vec3(1.,.49,.17) * diffuseColor.rgb * illumination;
      }`,
      );
  };
  return lit;
}

function beaconBeam(direction: T.IUniform<T.Vector3>) {
  const beam = new T.Mesh(
    new T.PlaneGeometry(1, 1),
    new T.ShaderMaterial({
      uniforms: { uDirection: direction },
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
      forceSinglePass: true,
      vertexShader: `uniform vec3 uDirection; varying vec2 vBeam;
      void main(){ vec3 origin=modelMatrix[3].xyz;
        vec3 side=normalize(cross(uDirection,normalize(cameraPosition-origin))+vec3(0.,.0001,0.));
        vec3 point=origin+uDirection*(6.+uv.x*570.)+side*((uv.y-.5)*(2.2+uv.x*72.));
        vBeam=uv; gl_Position=projectionMatrix*viewMatrix*vec4(point,1.); }`,
      fragmentShader: `varying vec2 vBeam;
      void main(){float side=abs(vBeam.y*2.-1.);
        float air=exp(-side*side*7.)*(1.-smoothstep(.04,1.,vBeam.x))*exp(-2.3*vBeam.x);
        gl_FragColor=vec4(vec3(1.,.71,.38),.21*air);}`,
    }),
  );
  beam.geometry.boundingSphere = new T.Sphere(new T.Vector3(), 590);
  return beam;
}

function lampGlow(
  origins: number[],
  colors: number[],
  lampParameters: number[],
  direction: T.IUniform<T.Vector3>,
) {
  const quad = new T.PlaneGeometry(2, 2);
  const geometry = new T.InstancedBufferGeometry();
  geometry.setAttribute("position", quad.getAttribute("position"));
  geometry.setIndex(quad.index);
  geometry.setAttribute(
    "aOrigin",
    new T.InstancedBufferAttribute(new Float32Array(origins), 3),
  );
  geometry.setAttribute(
    "aTint",
    new T.InstancedBufferAttribute(new Float32Array(colors), 3),
  );
  geometry.setAttribute(
    "aLamp",
    new T.InstancedBufferAttribute(new Float32Array(lampParameters), 2),
  );
  geometry.instanceCount = origins.length / 3;
  const glow = new T.Mesh(
    geometry,
    new T.ShaderMaterial({
      uniforms: { uDirection: direction },
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexShader: `attribute vec3 aOrigin,aTint; attribute vec2 aLamp; uniform vec3 uDirection;
      varying vec2 vGlow; varying vec3 vTint;
      void main(){vec4 center=viewMatrix*vec4(aOrigin,1.); vec3 sight=cameraPosition-aOrigin;
        float radius=max(aLamp.x,min(-center.z*.002,9.));
        float alignment=.65+1.8*pow(max(0.,dot(normalize(sight),uDirection)),26.);
        vTint=aTint*exp(-length(sight)*.00028)*min(1.,aLamp.x/radius)*mix(1.,alignment,aLamp.y);
        vGlow=position.xy; center.xy+=vGlow*radius; gl_Position=projectionMatrix*center;}`,
      fragmentShader: `varying vec2 vGlow; varying vec3 vTint;
      void main(){float d=dot(vGlow,vGlow);
        float core=exp(-d*155.);float glow=exp(-d*7.)*(1.-smoothstep(.4,1.,d));
        gl_FragColor=vec4(vTint*(core*7.+glow*.06),1.);}`,
    }),
  );
  glow.frustumCulled = false;
  return glow;
}

export function createNightLights(scene: T.Scene) {
  const origins: number[] = [],
    colors: number[] = [],
    lampParameters: number[] = [];
  const night = { value: false };
  const emissiveFixtures: {
    material: T.MeshStandardMaterial;
    day: T.Color;
    dayIntensity: number;
    lit: T.Color;
    nightIntensity: number;
  }[] = [];
  const porches: T.Vector3[] = [];
  const shoreLight = new T.PointLight(0xffa462, 0, 60, 2);
  const lights = new T.Group();
  // Three includes point and spot light counts in built-in shader keys. Zero intensity keeps those programs warm.
  scene.add(shoreLight, lights);
  lights.visible = false;
  const direction = { value: new T.Vector3() };
  const reducedMotion = globalThis.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  );

  function station(root: T.Group) {
    const localLamps: T.Vector4[] = [];
    function lamp(
      x: number,
      y: number,
      z: number,
      radius: number,
      kind: Fixture = "lamp",
    ) {
      const position = new T.Vector3(x, y, z).add(root.position);
      origins.push(position.x, position.y, position.z);
      colors.push(...tints[kind]);
      lampParameters.push(radius, Number(kind === "beacon"));
      if (kind === "shore") porches.push(position);
      if (kind === "lamp")
        localLamps.push(
          new T.Vector4(x, y, z, Math.min(180, radius * radius * 1.6)),
        );
      if (kind === "beacon") {
        const beam = beaconBeam(direction);
        beam.position.copy(position);
        lights.add(beam);
      }
    }
    return {
      lamp,
      surface: (material: T.MeshStandardMaterial) =>
        litSurface(material, localLamps, night),
    };
  }

  return {
    station,
    finish() {
      lights.add(lampGlow(origins, colors, lampParameters, direction));
    },
    windows: (glass: T.MeshStandardMaterial) => litWindows(glass, night),
    emissive(
      material: T.MeshStandardMaterial,
      lit: T.Color,
      nightIntensity: number,
    ) {
      emissiveFixtures.push({
        material,
        lit,
        nightIntensity,
        day: material.emissive.clone(),
        dayIntensity: material.emissiveIntensity,
      });
    },
    setNight(enabled: boolean) {
      night.value = enabled;
      lights.visible = enabled;
      shoreLight.intensity = enabled ? 1000 : 0;
      for (const fixture of emissiveFixtures) {
        fixture.material.emissive.copy(enabled ? fixture.lit : fixture.day);
        fixture.material.emissiveIntensity = enabled
          ? fixture.nightIntensity
          : fixture.dayIntensity;
      }
    },
    update(time: number, aircraft: T.Vector3) {
      if (!lights.visible) return;
      let nearest = porches[0];
      for (const porch of porches)
        if (
          porch.distanceToSquared(aircraft) <
          nearest.distanceToSquared(aircraft)
        )
          nearest = porch;
      shoreLight.position.copy(nearest);
      const bearing = 0.38 + (reducedMotion?.matches ? 0 : time * 0.22);
      direction.value
        .set(-Math.cos(bearing), -0.012, Math.sin(bearing))
        .normalize();
    },
  };
}
